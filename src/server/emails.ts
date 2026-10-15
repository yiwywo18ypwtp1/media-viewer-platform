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

export function invitationEmail(input: {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  url: string;
}): EmailJob {
  return {
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.workspaceName}`,
    text: [
      `${input.inviterName} invited you to join "${input.workspaceName}" on Media Review Hub as ${input.role}.`,
      "",
      "Accept the invitation (you can create an account from the same link):",
      input.url,
      "",
      "The link expires in 7 days.",
    ].join("\n"),
  };
}

export function mentionEmail(input: { to: string; authorName: string; assetName: string; excerpt: string; url: string }): EmailJob {
  return {
    to: input.to,
    subject: `${input.authorName} mentioned you on ${input.assetName}`,
    text: [`${input.authorName} mentioned you in a comment on "${input.assetName}":`, "", input.excerpt, "", input.url].join("\n"),
  };
}
