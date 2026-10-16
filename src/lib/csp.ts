// The Content-Security-Policy header, built per request by proxy.ts (a fresh
// nonce every time). Pure, so the policy can be read and tested in one place.
//
// Scripts: only ours, and only with this response's nonce. Next adds the
// nonce to its own <script> tags when it sees it in the request's CSP header.
// 'strict-dynamic' lets those scripts load the app's chunks. No
// 'unsafe-inline': an injected <script> or onclick= attribute won't run.
//
// Styles keep 'unsafe-inline': the player positions markers, playhead and
// drawings with style attributes, and those can't carry a nonce. A style
// can't execute code, so it's the scripts rule that stops XSS.

export function contentSecurityPolicy(options: { nonce: string; s3Origin: string; dev: boolean; https: boolean }): string {
  const { nonce, s3Origin, dev } = options;
  const directives = {
    "default-src": ["'self'"],
    // 'wasm-unsafe-eval' lets WebAssembly compile (hash-wasm: the file hash
    // that recognises a file for resuming an upload); it does not allow eval.
    // 'unsafe-eval' only in development: React uses eval there for error stacks.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // Upload hashing runs in a module worker; hls.js starts its worker from a blob.
    "worker-src": ["'self'", "blob:"],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Posters, sprites and previews come from S3 by presigned URL.
    "img-src": ["'self'", "data:", "blob:", s3Origin],
    // MP4 straight from S3; HLS plays through a blob: MediaSource.
    "media-src": ["'self'", "blob:", s3Origin],
    // Upload parts PUT to S3; HLS segments are fetched from S3 after our redirect.
    // (Dev: the hot-reload websocket.)
    "connect-src": ["'self'", s3Origin, ...(dev ? ["ws:"] : [])],
    "font-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  // Only meaningful (and only harmless) when the app itself is on HTTPS.
  if (options.https) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}
