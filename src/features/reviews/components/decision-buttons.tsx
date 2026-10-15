"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, FormMessage } from "@/components/form";
import type { DecisionValue } from "../rules";

// POST with an Idempotency-Key made once per click. If the network drops,
// the request is retried with the *same* key: if the first attempt actually
// reached the server, the retry returns its result instead of deciding twice.
async function postDecision(requestId: string, body: object, key: string, retries = 1): Promise<Response> {
  try {
    return await fetch(`/api/review-requests/${requestId}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return postDecision(requestId, body, key, retries - 1);
  }
}

export function DecisionButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<DecisionValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: DecisionValue) {
    setPending(decision);
    setError(null);
    try {
      const response = await postDecision(requestId, { decision, note: note || undefined }, crypto.randomUUID());
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "Couldn't save your decision.");
      }
    } catch {
      setError("You're offline. Try again.");
    } finally {
      setPending(null);
      // Success, or "someone settled it first": either way show the current state.
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Note for the requester (optional)"
        placeholder="Note (optional)"
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
      />
      <div className="flex gap-2">
        <Button type="button" disabled={pending !== null} onClick={() => void decide("approve")} className="bg-green-700 px-3 py-1 hover:bg-green-600">
          {pending === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button
          type="button"
          disabled={pending !== null}
          onClick={() => void decide("request_changes")}
          className="bg-amber-600 px-3 py-1 hover:bg-amber-500"
        >
          {pending === "request_changes" ? "Sending…" : "Request changes"}
        </Button>
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}
