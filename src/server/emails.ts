import type { EmailJob } from "./jobs";

// Plain-text templates. Pure functions so both web and worker can render them.

export function passwordResetEmail(input: { to: string; name: string; url: string }): EmailJob {
  return {
    to: input.to,
    subject: "Reset your Media Review Hub password",
    text: [
      `Hi ${input.name},`,
      "",
      "Someone (hopefully you) asked to reset your password. Open this link to choose a new one:",
      input.url,
      "",
      "The link works once and expires in 30 minutes. If you didn't ask for it, ignore this email.",
    ].join("\n"),
  };
}
