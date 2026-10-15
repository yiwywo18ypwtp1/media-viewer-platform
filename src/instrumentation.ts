// Runs once when the Next.js server starts, before it accepts requests.
// Node-only code lives in a separate file so it isn't bundled for Edge.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
