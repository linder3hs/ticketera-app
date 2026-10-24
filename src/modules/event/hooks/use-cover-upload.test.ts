import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCoverUploadAction } from "@/modules/event/actions";
import { uploadCoverMutation } from "@/modules/event/hooks/use-cover-upload";

vi.mock("@/modules/event/actions", () => ({ createCoverUploadAction: vi.fn() }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const png = (size: number) => new File([new Uint8Array(size)], "cover.png", { type: "image/png" });

describe("uploadCoverMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCoverUploadAction).mockResolvedValue({
      ok: true,
      data: { url: "https://s3.test", fields: { key: "covers/a.png", Policy: "p" }, publicUrl: "https://cdn.test/covers/a.png" },
    });
    fetchMock.mockResolvedValue({ ok: true });
  });

  it("posts the signed fields, then the file, and resolves to the public URL", async () => {
    await expect(uploadCoverMutation(png(10))).resolves.toBe("https://cdn.test/covers/a.png");

    expect(createCoverUploadAction).toHaveBeenCalledWith({ contentType: "image/png" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://s3.test");
    expect([...(init.body as FormData).keys()]).toEqual(["key", "Policy", "file"]);
  });

  it("rejects a file over 5 MB without asking for an upload", async () => {
    await expect(uploadCoverMutation(png(5 * 1024 * 1024 + 1))).rejects.toThrow("La imagen pesa más de 5 MB.");
    expect(createCoverUploadAction).not.toHaveBeenCalled();
  });

  it("throws the action's error", async () => {
    vi.mocked(createCoverUploadAction).mockResolvedValue({ ok: false, error: "Usa una imagen JPG, PNG o WebP." });

    await expect(uploadCoverMutation(png(10))).rejects.toThrow("Usa una imagen JPG, PNG o WebP.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when S3 rejects the upload", async () => {
    fetchMock.mockResolvedValue({ ok: false });

    await expect(uploadCoverMutation(png(10))).rejects.toThrow("No pudimos subir la imagen. Intenta de nuevo.");
  });
});
