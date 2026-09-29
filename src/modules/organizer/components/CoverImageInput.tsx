"use client";

import { useState, type DragEvent } from "react";
import { ImagePlus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface CoverImageInputProps {
  /** Data URL of the chosen image, or "". */
  value: string;
  onChange: (value: string) => void;
}

const ACCEPTED = ["image/jpeg", "image/png"];
/** Covers are resized so they fit comfortably in localStorage. */
const MAX_WIDTH = 1000;

/** Reads an image file and returns it as a JPEG data URL at most MAX_WIDTH wide. */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_WIDTH / image.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    image.src = url;
  });
}

/** Cover picker: drop an image or choose one (JPG/PNG), with a preview. */
export function CoverImageInput({ value, onChange }: CoverImageInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Usa una imagen JPG o PNG.");
      return;
    }
    try {
      onChange(await resizeImage(file));
      setError(null);
    } catch {
      setError("No se pudo leer la imagen. Prueba con otra.");
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  if (value) {
    return (
      <div className="flex flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
        <img src={value} alt="Portada elegida" className="aspect-video w-full rounded-2xl object-cover" />
        <button
          type="button"
          onClick={() => onChange("")}
          className="flex h-11 w-fit cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-zinc-300 px-3.5 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Quitar imagen
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-5 py-10 text-center transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          isDragging ? "border-primary bg-indigo-50" : "border-zinc-300 bg-zinc-50 hover:border-zinc-400",
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-primary">
          <ImagePlus className="size-6" aria-hidden="true" />
        </span>
        <span className="text-[15px] font-semibold">Arrastra una imagen o haz clic para subirla</span>
        <span className="text-[13px] text-muted-foreground">JPG o PNG, horizontal (16:9)</span>
        <input
          type="file"
          accept={ACCEPTED.join(",")}
          aria-describedby={error ? "cover-error" : undefined}
          onChange={(event) => void handleFile(event.target.files?.[0])}
          className="sr-only"
        />
      </label>
      {error && (
        <p id="cover-error" role="alert" className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
