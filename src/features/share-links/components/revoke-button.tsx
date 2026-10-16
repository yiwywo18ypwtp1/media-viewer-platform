"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/i18n/client";

export function RevokeButton({ linkId }: { linkId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (!window.confirm(t.share.confirmRevoke)) return;
    setPending(true);
    const response = await fetch(`/api/share-links/${linkId}`, { method: "DELETE" }).catch(() => null);
    setPending(false);
    if (!response?.ok) return setError(t.share.revokeFailed);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="underline disabled:opacity-50" disabled={pending} onClick={() => void revoke()}>
        {t.share.revoke}
      </button>
      {error && <span role="alert" className="text-red-600">{error}</span>}
    </>
  );
}
