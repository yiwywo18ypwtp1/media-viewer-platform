"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ProcessingEvent, RealtimeEvent } from "@/server/realtime";

type LiveProcessing = Pick<ProcessingEvent, "state" | "progress" | "error">;

const ProjectEventsContext = createContext<Record<string, LiveProcessing>>({});

// One EventSource per page, shared through context. (One per asset card would
// open N connections.) The cards stay Server Components; only the small
// processing badge inside them reads from here.
export function ProjectEvents({ projectId, children }: { projectId: string; children: ReactNode }) {
  const router = useRouter();
  // Only versions currently being processed. Once one finishes, the server
  // render (with its new poster, duration...) is the source of truth again.
  const [processing, setProcessing] = useState<Record<string, LiveProcessing>>({});
  const [live, setLive] = useState(true);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const source = new EventSource(`/api/events?projectId=${encodeURIComponent(projectId)}`);

    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as RealtimeEvent;
      if (event.type !== "processing") return;

      if (event.state === "ready" || event.state === "failed") {
        setProcessing((prev) => {
          const next = { ...prev };
          delete next[event.versionId];
          return next;
        });
        setAnnouncement(event.state === "ready" ? "A version finished processing." : "A version failed to process.");
        router.refresh();
      } else {
        setProcessing((prev) => ({ ...prev, [event.versionId]: event }));
      }
    };
    source.addEventListener("status", (message: MessageEvent<string>) => {
      setLive((JSON.parse(message.data) as { live: boolean }).live);
    });
    // EventSource reconnects on its own; we only reflect the state.
    source.onerror = () => setLive(false);

    return () => source.close();
  }, [projectId, router]);

  return (
    <ProjectEventsContext value={processing}>
      {!live && (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Live updates are paused. Reconnecting… (reload the page to see the latest state)
        </p>
      )}
      {children}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </ProjectEventsContext>
  );
}

export function useLiveProcessing(versionId: string): LiveProcessing | undefined {
  return useContext(ProjectEventsContext)[versionId];
}
