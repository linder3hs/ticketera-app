import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { createCoverUpload } from "@/modules/event/services/cover-upload-service";

vi.mock("server-only", () => ({}));
vi.mock("@aws-sdk/s3-presigned-post", () => ({ createPresignedPost: vi.fn() }));

describe("createCoverUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("S3_COVERS_BUCKET", "covers-bucket");
    vi.stubEnv("COVERS_BASE_URL", "https://cdn.test/covers");
    vi.mocked(createPresignedPost).mockResolvedValue({ url: "https://s3.test", fields: { key: "k" } });
  });

  it("signs a POST for covers/<uuid>.<ext> that S3 limits to the type and 5 MB", async () => {
    const upload = await createCoverUpload("image/webp");

    const params = vi.mocked(createPresignedPost).mock.calls[0][1];
    expect(params.Bucket).toBe("covers-bucket");
    expect(params.Key).toMatch(/^covers\/[0-9a-f-]{36}\.webp$/);
    expect(params.Conditions).toEqual([
      ["content-length-range", 1, 5 * 1024 * 1024],
      ["eq", "$Content-Type", "image/webp"],
    ]);
    expect(params.Fields).toEqual({ "Content-Type": "image/webp" });
    expect(upload).toEqual({ url: "https://s3.test", fields: { key: "k" }, publicUrl: `https://cdn.test/${params.Key}` });
  });

  it("fails when the bucket is not configured", async () => {
    vi.stubEnv("S3_COVERS_BUCKET", "");

    await expect(createCoverUpload("image/png")).rejects.toThrow("S3_COVERS_BUCKET is not set.");
    expect(createPresignedPost).not.toHaveBeenCalled();
  });
});
