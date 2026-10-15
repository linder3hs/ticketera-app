import { QR_QUIET_ZONE, buildQrMatrix } from "@/lib/qr";
import { cn } from "@/lib/utils";

interface QrCodeProps {
  /** Text encoded as-is. */
  value: string;
  /** Accessible description of the code. */
  label: string;
  className?: string;
}

/** Scannable QR as an SVG: white background, 4-module quiet zone, dark modules in one path. */
export function QrCode({ value, label, className }: QrCodeProps) {
  const matrix = buildQrMatrix(value);
  const total = matrix.length + QR_QUIET_ZONE * 2;

  // One "M x y h<run>v1h-<run>z" per horizontal run of dark modules.
  let path = "";
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      path += `M${start + QR_QUIET_ZONE} ${y + QR_QUIET_ZONE}h${x - start}v1h-${x - start}z`;
    }
  });

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={cn("block", className)}
    >
      <rect width={total} height={total} fill="#fff" />
      <path d={path} fill="#18181B" />
    </svg>
  );
}
