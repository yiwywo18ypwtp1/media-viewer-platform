import { LocalTime } from "@/components/local-time";
import { getI18n } from "@/i18n/server";
import type { ShareLinkSummary } from "../schema";
import { CreateShareLinkForm } from "./create-share-link-form";
import { RevokeButton } from "./revoke-button";

type Props = { assetId: string; links: ShareLinkSummary[]; versions: { id: string; number: number }[] };


// Server Component: the asset's share links (editors and owners only). The
// URLs themselves aren't here: the server only has their hashes.
export async function SharePanel({ assetId, links, versions }: Props) {
  const { t } = await getI18n();
  return (
    <section aria-label={t.share.region} className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <h2 className="font-semibold">{t.share.region}</h2>
      {links.length > 0 && (
        <ul className="flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${link.state !== "active" ? "text-neutral-500" : ""}`}>
              <span className="font-medium">{t.share.states[link.state]}</span>
              <span>{link.versionNumber ? `v${link.versionNumber}` : t.share.latestVersion}</span>
              {link.hasPassword && <span>{t.share.hasPassword}</span>}
              {link.allowComments && <span>{t.share.comments}</span>}
              {link.allowDownload && <span>{t.share.download}</span>}
              {link.expiresAt && (
                <span>
                  {link.state === "expired" ? t.share.expiredOn : t.share.until}
                  <LocalTime value={new Date(link.expiresAt)} />
                </span>
              )}
              <span className="text-neutral-500">{t.share.by(link.createdBy)}</span>
              {link.state === "active" && <RevokeButton linkId={link.id} />}
            </li>
          ))}
        </ul>
      )}
      <CreateShareLinkForm assetId={assetId} versions={versions} />
    </section>
  );
}
