import type { CommentDto } from "../features/comments/schema";

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

// Comments are sent whole, so other viewers can render them without refetching.
export type CommentEvent =
  | { type: "comment"; action: "upserted"; versionId: string; comment: CommentDto }
  | { type: "comment"; action: "deleted"; versionId: string; commentId: string; parentId: string | null };

export type RealtimeEvent = ProcessingEvent | CommentEvent;
