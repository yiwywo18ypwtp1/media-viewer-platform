import { getProjectAccess } from "@/features/workspaces/queries";
import { ApiError, errorResponse, requireApiUser } from "@/server/api";
import { isLive, isShuttingDown, subscribe } from "@/server/event-hub";
import { projectChannel } from "@/server/realtime";

export const dynamic = "force-dynamic";

const PING_INTERVAL_MS = 15_000;

// GET /api/events?projectId=... -> Server-Sent Events for one project:
// processing progress now; comments and review decisions later.
// SSE rather than WebSockets: the traffic is server -> browser only, it's plain
// HTTP (cookies, proxies) and EventSource reconnects by itself.
export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const access = await getProjectAccess(user.id, new URL(request.url).searchParams.get("projectId"));
    if (!access) throw new ApiError(404, "not_found", "Project not found.");

    // Shutting down: tell the browser to retry in 3 s and drop this socket, so
    // it reconnects to a fresh process. (Not a 503: EventSource gives up for
    // good on a non-200 response.)
    if (isShuttingDown()) {
      return new Response("retry: 3000\n\n", {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "close" },
      });
    }

    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const send = (text: string) => {
          if (!closed) controller.enqueue(encoder.encode(text));
        };
        const close = () => {
          if (closed) return;
          closed = true;
          cleanup();
          controller.close();
        };

        send("retry: 3000\n\n"); // EventSource reconnect delay
        send(`event: status\ndata: ${JSON.stringify({ live: isLive() })}\n\n`);

        const unsubscribe = subscribe(projectChannel(access.project.id), {
          onMessage: (message) => send(`data: ${message}\n\n`),
          onStatus: (live) => send(`event: status\ndata: ${JSON.stringify({ live })}\n\n`),
          onClose: close,
        });
        // SSE comment lines: keep proxies from closing an idle connection.
        const ping = setInterval(() => send(": ping\n\n"), PING_INTERVAL_MS);

        cleanup = () => {
          clearInterval(ping);
          unsubscribe();
        };
        request.signal.addEventListener("abort", close);
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        // no-transform: stops response compression from buffering the stream.
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
