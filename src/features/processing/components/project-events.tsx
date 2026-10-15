"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import type { ProcessingEvent, RealtimeEvent } from "@/server/realtime";

type LiveProcessing = Pick<ProcessingEvent, "state" | "progress" | "error">;
type Listener = (event: RealtimeEvent) => void;

type ProjectEventsValue = {
  processing: Record<string, LiveProcessing>;
  subscribe: (listener: Listener) => () => void;
};

const ProjectEventsContext = createContext<ProjectEventsValue>({ processing: {}, subscribe: () => () => {} });

// One EventSource per page, shared through context. (One per asset card would
// open N connections.) Processing progress is kept here; other events (e.g.
// comments) are handed to whoever subscribed via useProjectEvent.
export function ProjectEvents({ projectId, children }: { projectId: string; children: ReactNode }) {
  const router = useRouter();
  // Only versions currently being processed. Once one finishes, the server
  // render (with its new poster, duration...) is the source of truth again.
  const [processing, setProcessing] = useState<Record<string, LiveProcessing>>({});
  const [live, setLive] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const listeners = useRef(new Set<Listener>());
  // Stable for the provider's lifetime, so subscribers don't re-subscribe.
  const [subscribe] = useState(() => (listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  });

  useEffect(() => {
    const source = new EventSource(`/api/events?projectId=${encodeURIComponent(projectId)}`);

    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as RealtimeEvent;
      listeners.current.forEach((listener) => listener(event));
      // Review changes are rare and touch several parts of the page (status
      // badge, review panel): simplest to re-render from the server.
      if (event.type === "review") return router.refresh();
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
    <ProjectEventsContext value={{ processing, subscribe }}>
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
  return use(ProjectEventsContext).processing[versionId];
}

// Runs `listener` for every realtime event of the page's project.
export function useProjectEvent(listener: Listener) {
  const { subscribe } = use(ProjectEventsContext);
  const onEvent = useEffectEvent(listener);
  useEffect(() => subscribe((event) => onEvent(event)), [subscribe]);
}
