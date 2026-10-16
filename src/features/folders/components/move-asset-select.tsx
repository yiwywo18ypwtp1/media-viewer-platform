"use client";

import { useState, useTransition } from "react";
import { moveAsset } from "../actions";

type Props = { assetId: string; folderId: string | null; folders: { id: string; path: string }[] };

// One select that moves the asset as soon as it changes: no form state worth
// React Hook Form, just the action and its pending/error state.
export function MoveAssetSelect({ assetId, folderId, folders }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <label className="flex items-center gap-2 text-xs text-neutral-500">
      Folder
      <select
        value={folderId ?? ""}
        disabled={pending}
        onChange={(event) =>
          startTransition(async () => {
            const result = await moveAsset({ assetId, folderId: event.target.value || null });
            setError(result.ok ? null : result.error.message);
          })
        }
        className="rounded border border-neutral-300 bg-transparent px-1 py-0.5 dark:border-neutral-700"
      >
        <option value="">(top level)</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.path}
          </option>
        ))}
      </select>
      {error && <span role="alert" className="text-red-600">{error}</span>}
    </label>
  );
}
