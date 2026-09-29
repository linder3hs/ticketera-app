import { cn } from "@/lib/utils";

export const QR_SIZE = 21;
const SIZE = QR_SIZE;
const CORNERS = [
  [0, 0],
  [0, SIZE - 7],
  [SIZE - 7, 0],
];

/** 21×21 cells (row by row): three finder squares plus seeded pseudo-random modules. */
export function buildQrCells(seed: number): boolean[] {
  let state = seed % 233280;
  const random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };

  const cells: boolean[] = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      let isOn: boolean | null = null;
      for (const [top, left] of CORNERS) {
        const dr = row - top;
        const dc = col - left;
        if (dr >= -1 && dr <= 7 && dc >= -1 && dc <= 7) {
          const isInside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const isRing = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const isCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          isOn = isInside && (isRing || isCore);
        }
      }
      cells.push(isOn ?? random() > 0.52);
    }
  }
  return cells;
}

interface QrPatternProps {
  /** Same seed, same pattern (safe for server rendering). */
  seed: number;
  className?: string;
}

/** Decorative QR-looking pattern. Not a scannable code. */
export function QrPattern({ seed, className }: QrPatternProps) {
  const cells = buildQrCells(seed);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" shapeRendering="crispEdges" className={cn("block", className)}>
      <rect width={SIZE} height={SIZE} fill="#fff" />
      {cells.map((isOn, index) =>
        isOn ? (
          <rect key={index} x={index % SIZE} y={Math.floor(index / SIZE)} width={1} height={1} fill="#18181B" />
        ) : null,
      )}
    </svg>
  );
}
