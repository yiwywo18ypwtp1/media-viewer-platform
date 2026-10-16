import type { Metadata } from "next";
import { listComments, listMarkers } from "@/features/comments/server";
import { getPlaybackUrls } from "@/features/player/playback";
import { GuestReview } from "@/features/share-links/components/guest-review";
import { PasswordForm } from "@/features/share-links/components/password-form";
import { GUEST_URL_TTL_SECONDS } from "@/features/share-links/link-state";
import { getShareAccess, sharePath } from "@/features/share-links/server";
import { getEnv } from "@/server/env";

// Link previews (Open Graph) show the poster, but only for links without a
// password; a protected link previews as a plain title.
export async function generateMetadata({ params }: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await params;
  const access = await getShareAccess(token);
  if (!access) return { title: "Link unavailable · Media Review Hub", robots: { index: false } };
  const isPublic = access.link.passwordHash === null;
  const title = isPublic ? `${access.asset.name} · Media Review Hub` : "Shared with you · Media Review Hub";
  return {
    title,
    robots: { index: false },
    openGraph: {
      title,
      images: isPublic && access.version.posterKey ? [`${getEnv().APP_URL}${sharePath(token)}/og`] : undefined,
    },
  };
}

export default async function SharePage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const access = await getShareAccess(token);

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <p className="text-sm font-semibold tracking-wide text-neutral-500">Media Review Hub</p>
      {children}
    </main>
  );

  // Unknown, revoked and expired links look the same: nothing to learn here.
  if (!access) {
    return shell(
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">This link isn’t available</h1>
        <p className="text-sm text-neutral-500">It may have expired or been turned off. Ask the person who shared it for a new one.</p>
      </div>,
    );
  }

  if (!access.unlocked) {
    return shell(
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">This link is protected</h1>
        <PasswordForm token={token} />
      </div>,
    );
  }

  const { asset, version, link } = access;
  if (version.processingState !== "ready") {
    return shell(
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{asset.name}</h1>
        <p className="text-sm text-neutral-500">This version is still being prepared. Check back in a few minutes.</p>
      </div>,
    );
  }

  const [urls, page, markers] = await Promise.all([
    getPlaybackUrls(asset.id, version.id, { hlsBase: `${sharePath(token)}/hls`, ttlSeconds: GUEST_URL_TTL_SECONDS }),
    listComments(version.id, null),
    listMarkers(version.id),
  ]);

  return shell(
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{asset.name}</h1>
          <p className="text-xs text-neutral-500">Version {version.number}</p>
        </div>
        {link.allowDownload && (
          <a href={`${sharePath(token)}/download`} className="text-sm underline">
            Download original
          </a>
        )}
      </div>
      <GuestReview
        token={token}
        video={urls?.hlsUrl || urls?.videoUrl ? { urls: urls!, fps: version.fps, durationMs: version.durationMs ?? 0 } : null}
        media={
          // eslint-disable-next-line @next/next/no-img-element -- presigned URL, already resized by the worker
          <img src={urls?.imageUrl ?? undefined} alt={asset.name} className="max-h-[70vh] w-full rounded-md bg-neutral-100 object-contain dark:bg-neutral-900" />
        }
        comments={page.comments}
        markers={markers}
        allowComments={link.allowComments}
      />
    </>,
  );
}
