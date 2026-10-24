import "server-only";

import { randomUUID } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { COVER_MAX_BYTES, type COVER_CONTENT_TYPES } from "@/modules/event/event-write.schema";
import type { CoverUpload } from "@/modules/event/event-write.types";

type CoverContentType = (typeof COVER_CONTENT_TYPES)[number];

const EXTENSIONS: Record<CoverContentType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const UPLOAD_TTL_SECONDS = 300;

let client: S3Client | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/**
 * Presigned POST for a new cover at `covers/<uuid>.<ext>`: S3 itself rejects
 * another content type or a file over `COVER_MAX_BYTES`. Credentials and region
 * come from the SDK chain (`AWS_PROFILE` locally, the instance role on EC2;
 * `AWS_REGION`). CloudFront serves `/covers/*` from the bucket at `COVERS_BASE_URL`.
 */
export async function createCoverUpload(contentType: CoverContentType): Promise<CoverUpload> {
  const name = `${randomUUID()}.${EXTENSIONS[contentType]}`;
  client ??= new S3Client({});
  const { url, fields } = await createPresignedPost(client, {
    Bucket: requireEnv("S3_COVERS_BUCKET"),
    Key: `covers/${name}`,
    Conditions: [
      ["content-length-range", 1, COVER_MAX_BYTES],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: { "Content-Type": contentType },
    Expires: UPLOAD_TTL_SECONDS,
  });
  return { url, fields, publicUrl: `${requireEnv("COVERS_BASE_URL")}/${name}` };
}
