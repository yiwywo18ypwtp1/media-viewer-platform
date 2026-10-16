import { createHash, randomBytes } from "node:crypto";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createTeam, removeMember, type Team } from "@/test/integration";
import { ApiError } from "@/server/api";
import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { getMediaQueue } from "@/server/queues";
import { getS3 } from "@/server/s3";
import { assetVersions, uploads } from "@/server/schema";
import { completeUpload, createUpload, getUploadState, presignParts } from "./server";

const MiB = 1024 * 1024;
let team: Team;
beforeAll(async () => {
  team = await createTeam();
});

// Sends the parts the way the browser does: PUT to each presigned URL.
async function putParts(uploadId: string, file: Buffer, partSize: number, partNumbers: number[]) {
  const { urls } = await presignParts(team.editor, uploadId, { partNumbers });
  return Promise.all(
    urls.map(async ({ partNumber, url }) => {
      const body = file.subarray((partNumber - 1) * partSize, partNumber * partSize);
      const response = await fetch(url, { method: "PUT", body: new Uint8Array(body) });
      expect(response.status).toBe(200);
      return { partNumber, etag: response.headers.get("etag")! };
    }),
  );
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

describe("multipart upload against MinIO", () => {
  it("uploads parts straight to S3, completes into a version and queues one processing job", async () => {
    const file = randomBytes(20 * MiB); // two parts: 16 MiB + 4 MiB
    const created = await createUpload(team.editor, {
      projectId: team.projectId,
      fileName: "rough-cut.mp4",
      size: file.length,
      mimeType: "video/mp4",
      folderId: null,
      folderPath: [],
    });
    expect(created).toMatchObject({ partSize: 16 * MiB, partCount: 2 });

    const parts = await putParts(created.uploadId, file, created.partSize, [1, 2]);
    // What a reloaded page would see: both parts stored, with their ETags.
    const state = await getUploadState(team.editor, created.uploadId);
    expect(state.parts.map((p) => p.etag).sort()).toEqual(parts.map((p) => p.etag).sort());

    const result = await completeUpload(team.editor, created.uploadId, { parts, sha256: sha256(file) });

    const [version] = await getDb().select().from(assetVersions).where(eq(assetVersions.id, result.versionId));
    expect(version).toMatchObject({ assetId: result.assetId, number: 1, originalSize: file.length, originalChecksum: sha256(file) });
    const head = await getS3().send(new HeadObjectCommand({ Bucket: getEnv().S3_BUCKET, Key: version.originalKey }));
    expect(head.ContentLength).toBe(file.length);
    // jobId = versionId: a second enqueue of the same version is a no-op.
    expect(await getMediaQueue().getJob(result.versionId)).toBeTruthy();

    // A repeated complete (lost response) returns the same version, no duplicate.
    await expect(completeUpload(team.editor, created.uploadId, { parts, sha256: sha256(file) })).resolves.toEqual(result);
    const versions = await getDb().select().from(assetVersions).where(eq(assetVersions.assetId, result.assetId));
    expect(versions).toHaveLength(1);
  });

  it("refuses to complete while parts are missing", async () => {
    const file = randomBytes(20 * MiB);
    const created = await createUpload(team.editor, {
      projectId: team.projectId,
      fileName: "half.mp4",
      size: file.length,
      mimeType: "video/mp4",
      folderId: null,
      folderPath: [],
    });
    const parts = await putParts(created.uploadId, file, created.partSize, [1]);
    await expect(completeUpload(team.editor, created.uploadId, { parts, sha256: sha256(file) })).rejects.toMatchObject({
      status: 400,
      code: "parts_missing",
    });
    const [row] = await getDb().select().from(uploads).where(eq(uploads.id, created.uploadId));
    expect(row.status).toBe("uploading");
  });
});

describe("rights on presigned URLs", () => {
  const input = () => ({
    projectId: team.projectId,
    fileName: "x.mp4",
    size: MiB,
    mimeType: "video/mp4" as const,
    folderId: null,
    folderPath: [],
  });

  it("lets editors upload, not reviewers or viewers", async () => {
    await expect(createUpload(team.reviewer, input())).rejects.toMatchObject({ status: 403 });
    await expect(createUpload(team.viewer, input())).rejects.toMatchObject({ status: 403 });
  });

  it("hides the project from non-members (404, not 403)", async () => {
    const other = await createTeam();
    await expect(createUpload(other.editor, input())).rejects.toMatchObject({ status: 404 });
  });

  it("stops handing out part URLs the moment a member is removed", async () => {
    const leaving = await createTeam();
    const created = await createUpload(leaving.editor, { ...input(), projectId: leaving.projectId });
    await expect(presignParts(leaving.editor, created.uploadId, { partNumbers: [1] })).resolves.toBeTruthy();

    await removeMember(leaving, leaving.editor);
    const refused = await presignParts(leaving.editor, created.uploadId, { partNumbers: [1] }).catch((error) => error);
    expect(refused).toBeInstanceOf(ApiError);
    expect(refused).toMatchObject({ status: 404 });
  });

  it("won't sign parts of someone else's upload", async () => {
    const created = await createUpload(team.editor, input());
    await expect(presignParts(team.owner, created.uploadId, { partNumbers: [1] })).rejects.toMatchObject({ status: 404 });
  });
});
