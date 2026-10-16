"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PickedFile } from "./collect-files";
import { isExpired, sentBytes, type ResumeRecord } from "./resume";
import { deleteRecord, listRecords } from "./resume-store";
import { MAX_FILE_SIZE, MAX_FILES_PER_BATCH, isAllowedMimeType } from "./schema";
import { api, FileUpload, type UploadSnapshot, type UploadStatus } from "./upload-file";

export type UploadItem = { id: string; name: string; snapshot: UploadSnapshot };

// An upload an earlier page left unfinished (from IndexedDB).
export type UnfinishedUpload = { key: string; uploadId: string; fileName: string; size: number; sentBytes: number };

// React glue around FileUpload: keeps a snapshot per file in state and runs
// the queue. Files go one at a time, each with 4 parallel parts: bandwidth is
// the bottleneck, so more parallel files wouldn't finish the batch sooner.
export function useUploads(target: { projectId: string; assetId?: string; folderId?: string | null }) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [unfinished, setUnfinished] = useState<UnfinishedUpload[]>([]);
  // The FileUpload instances themselves aren't state: they're mutable objects
  // that report changes through onChange. Map order = queue order.
  const uploads = useRef(new Map<string, FileUpload>());
  const { projectId, assetId } = target;

  // Unfinished uploads for this target, minus the ones running on this page.
  // Re-read whenever an upload changes status (it may have just resumed one).
  async function loadUnfinished() {
    const records = await listRecords().catch((): ResumeRecord[] => []);
    const now = Date.now();
    const running = new Set([...uploads.current.values()].map((u) => u.savedKey));
    const mine: UnfinishedUpload[] = [];
    for (const record of records) {
      if (isExpired(record, now)) {
        void deleteRecord(record.key).catch(() => {});
        continue;
      }
      if (record.projectId !== projectId || record.assetId !== (assetId ?? null)) continue;
      if (running.has(record.key)) continue;
      mine.push({ key: record.key, uploadId: record.uploadId, fileName: record.fileName, size: record.size, sentBytes: sentBytes(record) });
    }
    setUnfinished(mine);
  }

  useEffect(() => {
    // Reads IndexedDB once on mount; setState happens after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUnfinished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, assetId]);

  async function discardUnfinished(entry: UnfinishedUpload) {
    setUnfinished((prev) => prev.filter((u) => u.key !== entry.key));
    await api(`/api/uploads/${entry.uploadId}`, { method: "DELETE" }).catch(() => {});
    await deleteRecord(entry.key).catch(() => {});
  }

  function startNextIfIdle() {
    const all = [...uploads.current.values()];
    if (all.some((upload) => upload.isActive)) return;
    void all.find((upload) => upload.snapshot().status === "queued")?.start();
  }

  function addFiles(picked: PickedFile[]) {
    const problems: string[] = [];
    const accepted: PickedFile[] = [];
    let overLimit = 0;
    for (const entry of picked) {
      const { file } = entry;
      if (!isAllowedMimeType(file.type)) {
        problems.push(`${file.name}: unsupported file type.`);
      } else if (file.size === 0 || file.size > MAX_FILE_SIZE) {
        problems.push(`${file.name}: files must be between 1 byte and 5 GB.`);
      } else if (accepted.length >= MAX_FILES_PER_BATCH) {
        overLimit += 1;
      } else {
        accepted.push(entry);
      }
    }
    // One line for the overflow: a dropped folder can hold hundreds of files.
    if (overLimit > 0) problems.push(`${overLimit} more file(s) skipped: only ${MAX_FILES_PER_BATCH} at a time.`);
    setRejected(problems);

    for (const { file, folderPath } of accepted) {
      const id = crypto.randomUUID();
      let lastStatus: UploadStatus = "queued";
      const upload = new FileUpload(file, { ...target, folderPath }, (snapshot) => {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, snapshot } : item)));
        if (snapshot.status !== lastStatus) {
          lastStatus = snapshot.status;
          void loadUnfinished();
          if (snapshot.status === "uploading" && snapshot.resumedBytes > 0) {
            setAnnouncement(`${file.name}: continuing an earlier upload.`);
          }
        }
        if (snapshot.status === "done") {
          setAnnouncement(`${file.name} uploaded.`);
          router.refresh(); // re-render the server-side asset list
        } else if (snapshot.status === "error") {
          setAnnouncement(`${file.name} failed: ${snapshot.error}`);
        }
        if (!upload.isActive) startNextIfIdle();
      });
      uploads.current.set(id, upload);
      const name = [...folderPath, file.name].join("/");
      setItems((prev) => [...prev, { id, name, snapshot: upload.snapshot() }]);
    }
    startNextIfIdle();
  }

  function command(id: string, run: (upload: FileUpload) => void) {
    const upload = uploads.current.get(id);
    if (!upload) return;
    run(upload);
    startNextIfIdle();
  }

  function dismissFinished() {
    for (const [id, upload] of uploads.current) {
      const { status } = upload.snapshot();
      if (status === "done" || status === "cancelled") uploads.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => uploads.current.has(item.id)));
  }

  const hasUnfinished = items.some((item) =>
    ["queued", "uploading", "paused", "completing"].includes(item.snapshot.status),
  );

  // Closing the tab stops the upload. It can be resumed by picking the file
  // again, but that's easy to miss, so the browser asks first.
  useEffect(() => {
    if (!hasUnfinished) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnfinished]);

  // Leaving the page inside the app unmounts the uploader: stop sending, but
  // keep the uploads resumable (they show up as "unfinished" when you return).
  useEffect(() => {
    const current = uploads.current;
    return () => {
      for (const upload of current.values()) upload.detach();
    };
  }, []);

  return {
    items,
    rejected,
    announcement,
    unfinished,
    addFiles,
    discardUnfinished,
    dismissFinished,
    pause: (id: string) => command(id, (upload) => upload.pause()),
    resume: (id: string) => command(id, (upload) => upload.resume()),
    retry: (id: string) => command(id, (upload) => upload.retry()),
    cancel: (id: string) => command(id, (upload) => void upload.cancel()),
  };
}
