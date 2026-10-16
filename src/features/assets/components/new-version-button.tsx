"use client";

import { useRef } from "react";
import { ALLOWED_MIME_TYPES } from "@/features/uploads/schema";
import { useUploads } from "@/features/uploads/use-uploads";

// Compact uploader for one asset: picks a single file and uploads it as the
// asset's next version. Reuses the same upload engine as the main uploader.
export function NewVersionButton(props: { projectId: string; assetId: string; kind: "video" | "image" }) {
  const uploads = useUploads({ projectId: props.projectId, assetId: props.assetId });
  const inputRef = useRef<HTMLInputElement>(null);
  const current = uploads.items.at(-1);
  const status = current?.snapshot.status;
  const busy = status === "queued" || status === "uploading" || status === "completing" || status === "paused";

  const accept = Object.entries(ALLOWED_MIME_TYPES)
    .filter(([, kind]) => kind === props.kind)
    .map(([mime]) => mime)
    .join(",");

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      {!busy && (
        <button type="button" className="underline" onClick={() => inputRef.current?.click()}>
          New version
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        aria-label="Upload a new version"
        onChange={(event) => {
          // Picking the file of an interrupted version upload carries it on (resume).
          uploads.addFiles([...(event.target.files ?? [])].slice(0, 1).map((file) => ({ file, folderPath: [] })));
          event.target.value = "";
        }}
      />
      {busy && current && (
        <span className="tabular-nums text-neutral-500">
          {status === "completing"
            ? "Verifying…"
            : `Uploading ${Math.floor((current.snapshot.uploadedBytes / current.snapshot.totalBytes) * 100)}%`}
        </span>
      )}
      {status === "error" && current && (
        <>
          <span className="text-red-600" title={current.snapshot.error}>
            Upload failed
          </span>
          <button type="button" className="underline" onClick={() => uploads.retry(current.id)}>
            Retry
          </button>
        </>
      )}
      {uploads.rejected[0] && <span className="text-red-600">{uploads.rejected[0]}</span>}
      <span aria-live="polite" className="sr-only">
        {uploads.announcement}
      </span>
    </span>
  );
}
