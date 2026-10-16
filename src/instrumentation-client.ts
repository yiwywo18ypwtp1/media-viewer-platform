import { z } from "zod";

// Runs in the browser before the app. zod 4 probes for `new Function` to
// compile faster validators; our CSP forbids eval, so the probe would log a
// violation on every page. Tell zod up front to use its plain validators.
z.config({ jitless: true });
