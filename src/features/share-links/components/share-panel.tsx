import { LocalTime } from "@/components/local-time";
import type { ShareLinkSummary } from "../schema";
import { CreateShareLinkForm } from "./create-share-link-form";
import { RevokeButton } from "./revoke-button";

type Props = { assetId: string; links: ShareLinkSummary[]; versions: { id: string; number: number }[] };

const STATE_TEXT = { active: "Active", revoked: "Revoked", expired: "Expired" } as const;

// Server Component: the asset's share links (editors and owners only). The
// URLs themselves aren't here: the server only has their hashes.
export function SharePanel({ assetId, links, versions }: Props) {
  return (
    <section aria-label="Share links" className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <h2 className="font-semibold">Share links</h2>
      {links.length > 0 && (
        <ul className="flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${link.state !== "active" ? "text-neutral-500" : ""}`}>
              <span className="font-medium">{STATE_TEXT[link.state]}</span>
              <span>{link.versionNumber ? `v${link.versionNumber}` : "latest version"}</span>
              {link.hasPassword && <span>password</span>}
              {link.allowComments && <span>comments</span>}
              {link.allowDownload && <span>download</span>}
              {link.expiresAt && (
                <span>
                  {link.state === "expired" ? "expired " : "until "}
                  <LocalTime value={new Date(link.expiresAt)} />
                </span>
              )}
              <span className="text-neutral-500">by {link.createdBy}</span>
              {link.state === "active" && <RevokeButton linkId={link.id} />}
            </li>
          ))}
        </ul>
      )}
      <CreateShareLinkForm assetId={assetId} versions={versions} />
    </section>
  );
}
