import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireShareAccess } from "@/features/share-links/server";
import { ApiError, errorResponse } from "@/server/api";
import { getEnv } from "@/server/env";
import { getPresignS3 } from "@/server/s3";

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// GET /s/:token/download -> 302 to the original file, if the link allows it.
// The URL lives a minute and asks S3 to send it as an attachment.
export async function GET(_request: Request, ctx: RouteContext<"/s/[token]/download">) {
  try {
    const { link, asset, version } = await requireShareAccess((await ctx.params).token);
    if (!link.allowDownload) throw new ApiError(403, "forbidden", "Downloads are off for this link.");
    const fileName = `${asset.name.replace(/[^\w.\- ]+/g, "_")}_v${version.number}.${EXTENSIONS[version.originalMime] ?? "bin"}`;
    const url = await getSignedUrl(
      getPresignS3(),
      new GetObjectCommand({
        Bucket: getEnv().S3_BUCKET,
        Key: version.originalKey,
        ResponseContentDisposition: `attachment; filename="${fileName}"`,
      }),
      { expiresIn: 60 },
    );
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
