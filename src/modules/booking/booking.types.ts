/** `general` = standing, sold by quantity; `seated` = numbered seats. */
export type ZoneKind = "general" | "seated";

export type ZoneStatus = "available" | "last-tickets" | "sold-out";

export type SeatStatus = "available" | "occupied";

export interface Seat {
  id: string;
  row: string;
  number: number;
  /** Position of the seat's center in its zone's SVG coordinates. */
  x: number;
  y: number;
  status: SeatStatus;
}

export interface SeatRow {
  label: string;
  seats: Seat[];
}

export interface Zone {
  id: string;
  name: string;
  /** Label for tight spots (mobile zone map). */
  shortName: string;
  price: number;
  currency: string;
  color: string;
  status: ZoneStatus;
  kind: ZoneKind;
  /** Only for `seated` zones. */
  rows?: SeatRow[];
}

export interface VenueMap {
  eventId: string;
  zones: Zone[];
}
