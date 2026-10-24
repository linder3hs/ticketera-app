"use client";

import { useMutation } from "@tanstack/react-query";

import { createCoverUploadAction } from "@/modules/event/actions";
import { COVER_MAX_BYTES } from "@/modules/event/event-write.schema";
import { unwrap } from "@/modules/event/hooks/use-event-mutations";

/** Uploads `file` straight to S3 through a presigned POST and resolves to its public URL. */
export async function uploadCoverMutation(file: File): Promise<string> {
  // S3 enforces the limit too; checking here first gives a clear message.
  if (file.size > COVER_MAX_BYTES) throw new Error("La imagen pesa más de 5 MB.");

  const { url, fields, publicUrl } = unwrap(await createCoverUploadAction({ contentType: file.type }));
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  body.append("file", file); // S3 ignores every field after the file

  const response = await fetch(url, { method: "POST", body });
  if (!response.ok) throw new Error("No pudimos subir la imagen. Intenta de nuevo.");
  return publicUrl;
}

export const useCoverUpload = () => useMutation({ mutationFn: uploadCoverMutation });
