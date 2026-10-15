// Realtime events, published to Redis by whoever changes something (the worker
// for processing) and fanned out to browsers over SSE by web (/api/events).
// Env-free: imported by both processes.

export function projectChannel(projectId: string) {
  return `events:project:${projectId}`;
}

export type ProcessingEvent = {
  type: "processing";
  assetId: string;
  versionId: string;
  state: "pending" | "running" | "ready" | "failed";
  progress: number;
  error: string | null;
};

export type RealtimeEvent = ProcessingEvent;
