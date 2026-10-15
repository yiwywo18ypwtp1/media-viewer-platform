import { Redis } from "ioredis";
import { getEnv } from "./env";
import { logger } from "./logger";

// One Redis subscriber connection per web process, shared by every open SSE
// stream. (A subscriber per stream would mean one Redis connection per open
// browser tab.) Messages are fanned out to listeners in memory.
//
// No "server-only" import: instrumentation-node.ts uses closeAllStreams().

export type StreamListener = {
  onMessage: (message: string) => void;
  // false while Redis is unreachable: the UI shows "live updates paused".
  onStatus: (live: boolean) => void;
  // The process is shutting down: end the stream so the server can exit.
  onClose: () => void;
};

type Hub = {
  subscriber: Redis;
  channels: Map<string, Set<StreamListener>>;
  live: boolean;
  shuttingDown: boolean;
};

const globalForHub = globalThis as unknown as { eventHub?: Hub };

function getHub(): Hub {
  if (globalForHub.eventHub) return globalForHub.eventHub;

  // Default options on purpose: commands queue while disconnected, and ioredis
  // re-subscribes to every channel after reconnecting.
  const subscriber = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
  const hub: Hub = { subscriber, channels: new Map(), live: false, shuttingDown: false };

  const setLive = (live: boolean) => {
    if (hub.live === live) return;
    hub.live = live;
    for (const listeners of hub.channels.values()) listeners.forEach((listener) => listener.onStatus(live));
  };
  subscriber.on("ready", () => setLive(true));
  subscriber.on("close", () => setLive(false));
  subscriber.on("error", (error) => logger.warn({ err: error }, "event hub redis error"));
  subscriber.on("message", (channel: string, message: string) => {
    hub.channels.get(channel)?.forEach((listener) => listener.onMessage(message));
  });

  globalForHub.eventHub = hub;
  return hub;
}

// Called on startup so the subscriber is already connected when the first
// browser opens a stream (otherwise it would briefly report "not live").
export function connectEventHub() {
  getHub();
}

export function isLive() {
  return getHub().live;
}

export function isShuttingDown() {
  return globalForHub.eventHub?.shuttingDown ?? false;
}

export function subscribe(channel: string, listener: StreamListener): () => void {
  const hub = getHub();
  let listeners = hub.channels.get(channel);
  if (!listeners) {
    listeners = new Set();
    hub.channels.set(channel, listeners);
    // Not awaited: while Redis is down this queues, and the stream stays open.
    hub.subscriber.subscribe(channel).catch((error) => logger.warn({ err: error, channel }, "subscribe failed"));
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && hub.channels.get(channel) === listeners) {
      hub.channels.delete(channel);
      hub.subscriber.unsubscribe(channel).catch(() => {});
    }
  };
}

// On SIGTERM. Also flags the hub: a browser may reconnect over a still-open
// keep-alive socket, and that new stream must not keep the server alive either.
export function closeAllStreams() {
  const hub = globalForHub.eventHub;
  if (!hub) return;
  hub.shuttingDown = true;
  for (const listeners of hub.channels.values()) [...listeners].forEach((listener) => listener.onClose());
}
