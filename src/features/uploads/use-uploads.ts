"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MAX_FILE_SIZE, MAX_FILES_PER_BATCH, isAllowedMimeType } from "./schema";
import { FileUpload, type UploadSnapshot } from "./upload-file";

export type UploadItem = { id: string; name: string; snapshot: UploadSnapshot };

// React glue around FileUpload: keeps a snapshot per file in state and runs
// the queue. Files go one at a time, each with 4 parallel parts: bandwidth is
// the bottleneck, so more parallel files wouldn't finish the batch sooner.
export function useUploads(target: { projectId: string; assetId?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  // The FileUpload instances themselves aren't state: they're mutable objects
  // that report changes through onChange. Map order = queue order.
  const uploads = useRef(new Map<string, FileUpload>());

  function startNextIfIdle() {
    const all = [...uploads.current.values()];
    if (all.some((upload) => upload.isActive)) return;
    void all.find((upload) => upload.snapshot().status === "queued")?.start();
  }

  function addFiles(files: File[]) {
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      if (accepted.length >= MAX_FILES_PER_BATCH) {
        problems.push(`${file.name}: only ${MAX_FILES_PER_BATCH} files at a time.`);
      } else if (!isAllowedMimeType(file.type)) {
        // Also catches dropped folders, which arrive as entries with no type.
        problems.push(`${file.name}: unsupported file type.`);
      } else if (file.size === 0 || file.size > MAX_FILE_SIZE) {
        problems.push(`${file.name}: files must be between 1 byte and 5 GB.`);
      } else {
        accepted.push(file);
      }
    }
    setRejected(problems);

    for (const file of accepted) {
      const id = crypto.randomUUID();
      const upload = new FileUpload(file, target, (snapshot) => {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, snapshot } : item)));
        if (snapshot.status === "done") {
          setAnnouncement(`${file.name} uploaded.`);
          router.refresh(); // re-render the server-side asset list
        } else if (snapshot.status === "error") {
          setAnnouncement(`${file.name} failed: ${snapshot.error}`);
        }
        if (!upload.isActive) startNextIfIdle();
      });
      uploads.current.set(id, upload);
      setItems((prev) => [...prev, { id, name: file.name, snapshot: upload.snapshot() }]);
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

  // Closing the tab mid-upload loses it (resume after reload is Advanced), so ask first.
  useEffect(() => {
    if (!hasUnfinished) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnfinished]);

  // Leaving the page inside the app unmounts the uploader: cancel what's left
  // rather than letting invisible uploads keep running.
  useEffect(() => {
    const current = uploads.current;
    return () => {
      for (const upload of current.values()) void upload.cancel();
    };
  }, []);

  return {
    items,
    rejected,
    announcement,
    addFiles,
    dismissFinished,
    pause: (id: string) => command(id, (upload) => upload.pause()),
    resume: (id: string) => command(id, (upload) => upload.resume()),
    retry: (id: string) => command(id, (upload) => upload.retry()),
    cancel: (id: string) => command(id, (upload) => void upload.cancel()),
  };
}
