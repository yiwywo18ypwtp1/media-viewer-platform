import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getProjectAccess } from "@/features/workspaces/queries";
import { isUuid } from "@/lib/ids";
import { getDb } from "@/server/db";
import { presignGetUrl } from "@/server/s3";
import { assets, assetVersions, users } from "@/server/schema";
import type { ListParams } from "./list-params";

// listAssets/listVersions expect the caller to have checked access already
// (getProjectAccess / getAssetAccess); they only shape data.

export type AssetListItem = Awaited<ReturnType<typeof listAssets>>[number];

export async function listAssets(projectId: string, params: ListParams) {
  const db = getDb();

  // Latest version per asset in one query: DISTINCT ON keeps the first row per
  // asset_id in the given order (highest number first). Limited to this
  // project's assets so Postgres doesn't scan every version in the system.
  const latest = db
    .selectDistinctOn([assetVersions.assetId], {
      id: assetVersions.id,
      assetId: assetVersions.assetId,
      number: assetVersions.number,
      processingState: assetVersions.processingState,
      processingProgress: assetVersions.processingProgress,
      processingError: assetVersions.processingError,
      posterKey: assetVersions.posterKey,
      size: assetVersions.originalSize,
      durationMs: assetVersions.durationMs,
    })
    .from(assetVersions)
    .where(
      inArray(
        assetVersions.assetId,
        db.select({ id: assets.id }).from(assets).where(eq(assets.projectId, projectId)),
      ),
    )
    .orderBy(assetVersions.assetId, desc(assetVersions.number))
    .as("latest");

  const sortColumn = {
    updated: assets.updatedAt,
    created: assets.createdAt,
    name: sql`lower(${assets.name})`,
  }[params.sort];

  const rows = await db
    .select({
      id: assets.id,
      name: assets.name,
      kind: assets.kind,
      status: assets.status,
      createdAt: assets.createdAt,
      updatedAt: assets.updatedAt,
      latest: {
        id: latest.id,
        number: latest.number,
        processingState: latest.processingState,
        processingProgress: latest.processingProgress,
        processingError: latest.processingError,
        posterKey: latest.posterKey,
        size: latest.size,
        durationMs: latest.durationMs,
      },
    })
    .from(assets)
    .innerJoin(latest, eq(latest.assetId, assets.id))
    .where(and(eq(assets.projectId, projectId), params.status === "all" ? undefined : eq(assets.status, params.status)))
    // id as tie-breaker keeps the order stable between reloads.
    .orderBy(params.dir === "asc" ? asc(sortColumn) : desc(sortColumn), asc(assets.id));

  // Posters are private objects; the page gets short-lived URLs for them.
  return Promise.all(
    rows.map(async ({ latest, ...asset }) => {
      const { posterKey, ...version } = latest;
      return { ...asset, latest: version, posterUrl: posterKey ? await presignGetUrl(posterKey) : null };
    }),
  );
}

// --- Asset page ---

// Access to one asset = access to its project (same rule, same 404 on failure).
export async function getAssetAccess(userId: string, assetId: unknown) {
  if (!isUuid(assetId)) return null;
  const [asset] = await getDb()
    .select({ id: assets.id, name: assets.name, kind: assets.kind, status: assets.status, projectId: assets.projectId })
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(1);
  if (!asset) return null;
  const access = await getProjectAccess(userId, asset.projectId);
  return access && { ...access, asset };
}

export type AssetVersion = Awaited<ReturnType<typeof listVersions>>[number];

// The version stack, newest first. Storage keys stay on the server: the page
// gets short-lived URLs for them (see player/playback.ts).
export async function listVersions(assetId: string) {
  return getDb()
    .select({
      id: assetVersions.id,
      number: assetVersions.number,
      createdAt: assetVersions.createdAt,
      uploadedBy: users.name,
      size: assetVersions.originalSize,
      mime: assetVersions.originalMime,
      processingState: assetVersions.processingState,
      processingProgress: assetVersions.processingProgress,
      processingError: assetVersions.processingError,
      width: assetVersions.width,
      height: assetVersions.height,
      fps: assetVersions.fps,
      durationMs: assetVersions.durationMs,
    })
    .from(assetVersions)
    .innerJoin(users, eq(users.id, assetVersions.uploadedBy))
    .where(eq(assetVersions.assetId, assetId))
    .orderBy(desc(assetVersions.number));
}
