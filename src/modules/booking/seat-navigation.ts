import type { SeatRow } from "@/modules/booking/booking.types";

export type SeatDirection = "left" | "right" | "up" | "down";

const isFree = (status: string) => status !== "occupied";

/** First seat that can be picked (front row first), for the map's tab stop. */
export function getFirstFreeSeatId(rows: SeatRow[]): string | null {
  for (const row of rows) {
    const seat = row.seats.find((item) => isFree(item.status));
    if (seat) return seat.id;
  }
  return null;
}

/**
 * The seat an arrow key moves to from `seatId`, skipping occupied seats:
 * left/right along the row, up/down to the closest free seat (by x) of the
 * nearest row that has one. `null` when there's nowhere to go.
 */
export function getNextSeatId(rows: SeatRow[], seatId: string, direction: SeatDirection): string | null {
  const rowIndex = rows.findIndex((row) => row.seats.some((seat) => seat.id === seatId));
  if (rowIndex === -1) return null;
  const row = rows[rowIndex];
  const seatIndex = row.seats.findIndex((seat) => seat.id === seatId);

  if (direction === "left" || direction === "right") {
    const step = direction === "right" ? 1 : -1;
    for (let i = seatIndex + step; i >= 0 && i < row.seats.length; i += step) {
      if (isFree(row.seats[i].status)) return row.seats[i].id;
    }
    return null;
  }

  const current = row.seats[seatIndex];
  const step = direction === "down" ? 1 : -1;
  for (let r = rowIndex + step; r >= 0 && r < rows.length; r += step) {
    const free = rows[r].seats.filter((seat) => isFree(seat.status));
    if (free.length === 0) continue;
    return free.reduce((best, seat) => (Math.abs(seat.x - current.x) < Math.abs(best.x - current.x) ? seat : best)).id;
  }
  return null;
}
