"use client";

import { useRef, useState, type DragEvent } from "react";
import { formatBytes, formatDuration } from "@/lib/format";
import { filesFromDrop, filesFromInput } from "../collect-files";
import { ALLOWED_MIME_TYPES, MAX_FILES_PER_BATCH } from "../schema";
import { useUploads, type UploadItem } from "../use-uploads";

const STATUS_LABELS = {
  queued: "Waiting",
  uploading: "Uploading",
  paused: "Paused",
  completing: "Verifying",
  done: "Uploaded",
  error: "Failed",
  cancelled: "Cancelled",
} as const;

type Props = {
  projectId: string;
  // Set to upload new versions of this asset instead of creating new assets.
  assetId?: string;
  // The open folder: new assets land there.
  folderId?: string | null;
};

export function Uploader({ projectId, assetId, folderId }: Props) {
  const uploads = useUploads({ projectId, assetId, folderId });
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // New versions are single files; folders only make sense for new assets.
  const allowFolders = !assetId;

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const picked = await filesFromDrop(event.dataTransfer);
    // A new version takes one file, and folders don't apply.
    uploads.addFiles(allowFolders ? picked : picked.slice(0, 1).map(({ file }) => ({ file, folderPath: [] })));
  }

  const visible = uploads.items.filter((item) => item.snapshot.status !== "cancelled");
  const totalBytes = visible.reduce((sum, item) => sum + item.snapshot.totalBytes, 0);
  const uploadedBytes = visible.reduce((sum, item) => sum + item.snapshot.uploadedBytes, 0);
  const hasFinished = uploads.items.some((item) => ["done", "cancelled"].includes(item.snapshot.status));

  return (
    <section className="flex flex-col gap-3" aria-label="Upload files">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => void onDrop(event)}
        className={`flex flex-col items-center gap-2 rounded-md border-2 border-dashed px-6 py-8 text-center text-sm ${
          dragging ? "border-neutral-900 bg-neutral-50 dark:border-neutral-100 dark:bg-neutral-900" : "border-neutral-300 dark:border-neutral-700"
        }`}
      >
        <p>
          Drop videos or images here, or{" "}
          <button type="button" className="underline" onClick={() => inputRef.current?.click()}>
            choose files
          </button>
          {allowFolders && (
            <>
              {" or "}
              <button type="button" className="underline" onClick={() => folderInputRef.current?.click()}>
                a folder
              </button>
            </>
          )}
        </p>
        <p className="text-neutral-500">
          Up to {MAX_FILES_PER_BATCH} files at a time, 5 GB each. MP4, MOV, WebM, JPEG, PNG, WebP.
          {allowFolders && " Dropped folders keep their structure."}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple={!assetId}
          accept={Object.keys(ALLOWED_MIME_TYPES).join(",")}
          className="hidden"
          onChange={(event) => {
            uploads.addFiles([...(event.target.files ?? [])].map((file) => ({ file, folderPath: [] })));
            event.target.value = ""; // allow picking the same file again
          }}
        />
        {allowFolders && (
          <input
            // webkitdirectory isn't in React's types; every current browser supports it.
            ref={(element) => {
              folderInputRef.current = element;
              element?.setAttribute("webkitdirectory", "");
            }}
            type="file"
            className="hidden"
            onChange={(event) => {
              if (event.target.files) uploads.addFiles(filesFromInput(event.target.files));
              event.target.value = "";
            }}
          />
        )}
      </div>

      {uploads.unfinished.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
          <p className="font-medium">Unfinished uploads. Choose the same file again to continue where it stopped.</p>
          <ul className="flex flex-col gap-1">
            {uploads.unfinished.map((entry) => (
              <li key={entry.key} className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {entry.fileName} · {Math.floor((entry.sentBytes / entry.size) * 100)}% of {formatBytes(entry.size)}
                </span>
                <button type="button" className="shrink-0 underline" onClick={() => void uploads.discardUnfinished(entry)}>
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {uploads.rejected.length > 0 && (
        <ul role="alert" className="text-sm text-red-600">
          {uploads.rejected.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {visible.length > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <progress className="h-2 flex-1" value={uploadedBytes} max={totalBytes || 1} aria-label="Total upload progress" />
          <span className="tabular-nums text-neutral-500">
            {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
          </span>
          {hasFinished && (
            <button type="button" className="underline" onClick={uploads.dismissFinished}>
              Clear finished
            </button>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {visible.map((item) => (
          <UploadRow key={item.id} item={item} uploads={uploads} />
        ))}
      </ul>

      {/* Screen readers hear when a file finishes or fails, not every progress tick. */}
      <p aria-live="polite" className="sr-only">
        {uploads.announcement}
      </p>
    </section>
  );
}

function UploadRow({ item, uploads }: { item: UploadItem; uploads: ReturnType<typeof useUploads> }) {
  const { status, uploadedBytes, totalBytes, bytesPerSecond, etaSeconds, resumedBytes, error } = item.snapshot;
  const percent = totalBytes > 0 ? Math.floor((uploadedBytes / totalBytes) * 100) : 0;

  return (
    <li className="flex flex-col gap-1 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-medium" title={item.name}>
          {item.name}
        </span>
        <span className="flex shrink-0 gap-3">
          {status === "uploading" && <RowButton onClick={() => uploads.pause(item.id)}>Pause</RowButton>}
          {status === "paused" && <RowButton onClick={() => uploads.resume(item.id)}>Resume</RowButton>}
          {status === "error" && <RowButton onClick={() => uploads.retry(item.id)}>Retry</RowButton>}
          {["queued", "uploading", "paused", "error"].includes(status) && (
            <RowButton onClick={() => uploads.cancel(item.id)}>Cancel</RowButton>
          )}
        </span>
      </div>
      <progress className="h-1.5 w-full" value={uploadedBytes} max={totalBytes} aria-label={`${item.name} progress`} />
      <div className="flex justify-between gap-3 text-xs text-neutral-500 tabular-nums">
        <span>
          {STATUS_LABELS[status]} · {percent}% · {formatBytes(uploadedBytes)} of {formatBytes(totalBytes)}
          {resumedBytes > 0 && status !== "done" && ` · resumed at ${Math.floor((resumedBytes / totalBytes) * 100)}%`}
        </span>
        {status === "uploading" && bytesPerSecond !== null && (
          <span>
            {formatBytes(bytesPerSecond)}/s{etaSeconds !== null && ` · ${formatDuration(etaSeconds)} left`}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </li>
  );
}

function RowButton(props: { onClick: () => void; children: string }) {
  return (
    <button type="button" className="underline" onClick={props.onClick}>
      {props.children}
    </button>
  );
}
