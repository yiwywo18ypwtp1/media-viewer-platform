import { createWriteStream, openAsBlob } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { UnrecoverableError, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { TranscribeJob } from "../../src/server/jobs";
import { projectChannel, type TranscriptEvent } from "../../src/server/realtime";
import * as schema from "../../src/server/schema";
import { inSpan, withTraceFrom } from "../../src/server/tracing";
import { ffmpeg } from "../ffmpeg";
import { parseWhisper, toWebVtt } from "../transcript";

// One job = one version's speech as subtitles (bonus). Queued by process-media
// once a video with sound is ready, and only when WHISPER_URL is set.
//
// The audio comes from the 720p MP4 (smaller than the original), as the
// 16 kHz mono WAV Whisper expects. Results: a WebVTT file in S3 for the
// player's subtitle track, and the segments in Postgres for text search.
// Idempotent: the VTT key is fixed and segments are replaced, not added.

const TIMEOUT_MS = 30 * 60 * 1000;

type Deps = {
  db: PostgresJsDatabase<typeof schema>;
  s3: S3Client;
  bucket: string;
  publisher: Redis;
  log: Logger;
  whisperUrl: string;
};

export function createTranscribe({ db, s3, bucket, publisher, log, whisperUrl }: Deps) {
  const { assetVersions, assets, transcriptSegments } = schema;

  return (job: Job<TranscribeJob>) =>
    withTraceFrom(job.data.trace, () => inSpan("transcribe", { "version.id": job.data.versionId }, () => transcribe(job)));

  async function transcribe(job: Job<TranscribeJob>) {
    const { versionId } = job.data;
    const [version] = await db
      .select({ assetId: assets.id, projectId: assets.projectId, mp4Key: assetVersions.mp4Key })
      .from(assetVersions)
      .innerJoin(assets, eq(assets.id, assetVersions.assetId))
      .where(eq(assetVersions.id, versionId))
      .limit(1);
    if (!version?.mp4Key) return log.warn({ jobId: job.id, versionId }, "nothing to transcribe, skipping");
    const jobLog = log.child({ jobId: job.id, versionId, attempt: job.attemptsMade + 1 });

    async function setState(state: TranscriptEvent["state"], fields: Partial<typeof assetVersions.$inferInsert> = {}) {
      await db.update(assetVersions).set({ transcriptState: state, ...fields }).where(eq(assetVersions.id, versionId));
      const event: TranscriptEvent = { type: "transcript", assetId: version.assetId, versionId, state };
      await publisher.publish(projectChannel(version.projectId), JSON.stringify(event)).catch(() => {});
    }

    await setState("running", { transcriptError: null });
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const dir = await mkdtemp(join(tmpdir(), `transcribe-${versionId}-`));
    try {
      const video = join(dir, "720p.mp4");
      const audio = join(dir, "audio.wav");
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: version.mp4Key }), { abortSignal: signal });
      await pipeline(object.Body as Readable, createWriteStream(video), { signal });
      await inSpan("extract audio", {}, () =>
        ffmpeg(["-i", video, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audio], { signal }),
      );

      const form = new FormData();
      // openAsBlob streams from disk: a long recording isn't read into memory.
      form.append("file", await openAsBlob(audio), "audio.wav");
      form.append("response_format", "verbose_json");
      form.append("temperature", "0");
      const response = await inSpan("whisper", {}, () => fetch(`${whisperUrl}/inference`, { method: "POST", body: form, signal }));
      if (!response.ok) throw new Error(`Whisper responded ${response.status}`);
      const { language, segments } = parseWhisper(await response.json());

      const key = `versions/${versionId}/subtitles.vtt`;
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: toWebVtt(segments), ContentType: "text/vtt; charset=utf-8" }),
        { abortSignal: signal },
      );
      // Replace, don't add: a re-run must not duplicate search results.
      await db.transaction(async (tx) => {
        await tx.delete(transcriptSegments).where(eq(transcriptSegments.versionId, versionId));
        for (let i = 0; i < segments.length; i += 500) {
          await tx.insert(transcriptSegments).values(segments.slice(i, i + 500).map((segment) => ({ versionId, ...segment })));
        }
      });
      await setState("ready", { transcriptLanguage: language, transcriptKey: key });
      jobLog.info({ segments: segments.length, language }, "transcript ready");
    } catch (error) {
      const final = error instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await setState(final ? "failed" : "pending", { transcriptError: "Couldn't transcribe the audio." });
      jobLog.warn({ err: error, final }, "transcription failed");
      throw error;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
