"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { ImageIcon, LoaderCircle, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { COVER_CONTENT_TYPES } from "@/modules/event/event-write.schema";
import { useCoverUpload } from "@/modules/event/hooks/use-cover-upload";

interface CoverImageInputProps {
  id: string;
  /** Empty or an `https` image URL. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  /** Id of the element that explains why the field is disabled. */
  reasonId?: string;
}

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Cover field: an `https` image URL with a preview, filled by uploading a file
 * (to S3) or by pasting a link. Shown `unoptimized` so any host works without
 * listing it in `next.config.ts`.
 */
export function CoverImageInput({ id, value, onChange, error, disabled, reasonId }: CoverImageInputProps) {
  const url = value.trim();
  // The URL that failed to load: typing a new one retries.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useCoverUpload();
  const canPreview = isHttpsUrl(url);
  const failed = failedUrl === url;
  const describedBy = [error ? `${id}-error` : null, reasonId, `${id}-hint`].filter(Boolean).join(" ");

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // picking the same file again retries
    if (file) upload.mutate(file, { onSuccess: onChange });
  }

  return (
    <div className="flex flex-col gap-3">
      <FormField id={id} label="URL de la imagen" required={false} error={error}>
        <Input
          id={id}
          name={id}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://…"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => {
            upload.reset();
            onChange(event.target.value);
          }}
          className={FIELD_CLASS}
        />
      </FormField>
      <p id={`${id}-hint`} className="-mt-1 text-[13px] text-muted-foreground">
        Sube una imagen horizontal (16:9) en JPG, PNG o WebP de hasta 5 MB, o pega su enlace https.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept={COVER_CONTENT_TYPES.join(",")} hidden onChange={handleFile} />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || upload.isPending}
          aria-describedby={reasonId}
          onClick={() => fileRef.current?.click()}
        >
          {upload.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
          {upload.isPending ? "Subiendo…" : "Subir imagen"}
        </Button>
        {upload.error && (
          <p role="alert" className="text-[13px] text-destructive">
            {upload.error.message}
          </p>
        )}
      </div>

      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-zinc-100 text-zinc-400">
        {canPreview && !failed ? (
          <Image
            key={url}
            src={url}
            alt="Vista previa de la portada"
            fill
            unoptimized
            sizes="(min-width: 1024px) 720px, 100vw"
            className="object-cover"
            onError={() => setFailedUrl(url)}
          />
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 text-center text-[13px]">
            <ImageIcon className="size-8" aria-hidden="true" />
            {failed ? "No se pudo cargar la imagen. Revisa el enlace." : "La vista previa aparecerá aquí."}
          </span>
        )}
      </div>
    </div>
  );
}
