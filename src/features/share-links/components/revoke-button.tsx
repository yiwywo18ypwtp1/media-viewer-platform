"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RevokeButton({ linkId }: { linkId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (!window.confirm("Turn this link off? Anyone using it loses access right away.")) return;
    setPending(true);
    const response = await fetch(`/api/share-links/${linkId}`, { method: "DELETE" }).catch(() => null);
    setPending(false);
    if (!response?.ok) return setError("Couldn't revoke. Try again.");
    router.refresh();
  }

  return (
    <>
      <button type="button" className="underline disabled:opacity-50" disabled={pending} onClick={() => void revoke()}>
        Revoke
      </button>
      {error && <span role="alert" className="text-red-600">{error}</span>}
    </>
  );
}
