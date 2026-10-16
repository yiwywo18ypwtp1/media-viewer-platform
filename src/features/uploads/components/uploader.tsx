"use client";

import { useRef, useState, type DragEvent } from "react";
import { useI18n } from "@/i18n/client";
import { formatBytes, formatDuration } from "@/lib/format";
import { filesFromDrop, filesFromInput } from "../collect-files";
import { ALLOWED_MIME_TYPES, MAX_FILES_PER_BATCH } from "../schema";
import { useUploads, type UploadItem } from "../use-uploads";

type Props = {
  projectId: string;
  // Set to upload new versions of this asset instead of creating new assets.
  assetId?: string;
  // The open folder: new assets land there.
  folderId?: string | null;
};

export function Uploader({ projectId, assetId, folderId }: Props) {
  const uploads = useUploads({ projectId, assetId, folderId });
  const { t } = useI18n();
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
    <section className="flex flex-col gap-3" aria-label={t.uploads.region}>
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
          {t.uploads.dropHere}{" "}
          <button type="button" className="underline" onClick={() => inputRef.current?.click()}>
            {t.uploads.chooseFiles}
          </button>
          {allowFolders && (
            <>
              {` ${t.uploads.or} `}
              <button type="button" className="underline" onClick={() => folderInputRef.current?.click()}>
                {t.uploads.aFolder}
              </button>
            </>
          )}
        </p>
        <p className="text-neutral-500">
          {t.uploads.limits(MAX_FILES_PER_BATCH)}
          {allowFolders && ` ${t.uploads.foldersKept}`}
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
          <p className="font-medium">{t.uploads.unfinished}</p>
          <ul className="flex flex-col gap-1">
            {uploads.unfinished.map((entry) => (
              <li key={entry.key} className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {t.uploads.unfinishedItem(entry.fileName, Math.floor((entry.sentBytes / entry.size) * 100), formatBytes(entry.size))}
                </span>
                <button type="button" className="shrink-0 underline" onClick={() => void uploads.discardUnfinished(entry)}>
                  {t.uploads.discard}
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
          <progress className="h-2 flex-1" value={uploadedBytes} max={totalBytes || 1} aria-label={t.uploads.totalProgress} />
          <span className="tabular-nums text-neutral-500">
            {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
          </span>
          {hasFinished && (
            <button type="button" className="underline" onClick={uploads.dismissFinished}>
              {t.uploads.clearFinished}
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
  const { t, tm } = useI18n();
  const { status, uploadedBytes, totalBytes, bytesPerSecond, etaSeconds, resumedBytes, error } = item.snapshot;
  const percent = totalBytes > 0 ? Math.floor((uploadedBytes / totalBytes) * 100) : 0;

  return (
    <li className="flex flex-col gap-1 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-medium" title={item.name}>
          {item.name}
        </span>
        <span className="flex shrink-0 gap-3">
          {status === "uploading" && <RowButton onClick={() => uploads.pause(item.id)}>{t.uploads.pause}</RowButton>}
          {status === "paused" && <RowButton onClick={() => uploads.resume(item.id)}>{t.uploads.resume}</RowButton>}
          {status === "error" && <RowButton onClick={() => uploads.retry(item.id)}>{t.uploads.retry}</RowButton>}
          {["queued", "uploading", "paused", "error"].includes(status) && (
            <RowButton onClick={() => uploads.cancel(item.id)}>{t.common.cancel}</RowButton>
          )}
        </span>
      </div>
      <progress className="h-1.5 w-full" value={uploadedBytes} max={totalBytes} aria-label={t.uploads.progressOf(item.name)} />
      <div className="flex justify-between gap-3 text-xs text-neutral-500 tabular-nums">
        <span>
          {t.uploads.row(t.uploads.statuses[status], percent, formatBytes(uploadedBytes), formatBytes(totalBytes))}
          {resumedBytes > 0 && status !== "done" && t.uploads.resumedAt(Math.floor((resumedBytes / totalBytes) * 100))}
        </span>
        {status === "uploading" && bytesPerSecond !== null && (
          <span>
            {t.uploads.speed(formatBytes(bytesPerSecond))}
            {etaSeconds !== null && t.uploads.left(formatDuration(etaSeconds))}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{tm(error)}</p>}
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
