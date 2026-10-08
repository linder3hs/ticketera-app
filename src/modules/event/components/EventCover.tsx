import Image from "next/image";
import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface EventCoverProps {
  /** Cover URL; `""` means "no cover" and renders the placeholder. */
  src: string;
  alt: string;
  sizes: string;
  /** Preloads the image; use it only for the above-the-fold (LCP) cover. */
  priority?: boolean;
  /** Merged into the image or the placeholder (e.g. to change its colors). */
  className?: string;
}

/**
 * Event cover that fills its `relative` container: the image, or an icon
 * placeholder when there is no cover. Shown `unoptimized` because covers may
 * come from any https host, not just those in `next.config.ts`.
 */
export function EventCover({ src, alt, sizes, priority = false, className }: EventCoverProps) {
  if (src === "") {
    return (
      <span
        aria-hidden="true"
        className={cn("absolute inset-0 flex items-center justify-center bg-zinc-200 text-zinc-400", className)}
      >
        <ImageIcon className="size-[min(40%,3rem)]" />
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      // `priority` is deprecated in Next 16 in favor of `preload`.
      preload={priority}
      unoptimized
      className={cn("object-cover", className)}
    />
  );
}
