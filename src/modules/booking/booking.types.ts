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

/** Outline of a zone in the venue overview (`VenueMap.viewBox` units). */
export interface ZoneShape {
  path: string;
  labelX: number;
  labelY: number;
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
  shape: ZoneShape;
  /** Only for `seated` zones. */
  rows?: SeatRow[];
}

export interface VenueMap {
  eventId: string;
  /** SVG viewBox of the overview; the stage sits at the top. */
  viewBox: string;
  /** Stage rectangle in `viewBox` units. */
  stage: { x: number; y: number; width: number; height: number };
  zones: Zone[];
}

export type PaymentMethod = "card" | "yape" | "cash";

/** One zone of an order: tickets, amount and, for numbered zones, seats. */
export interface OrderLine {
  zoneId: string;
  zoneName: string;
  quantity: number;
  amount: number;
  seats: Seat[];
}

export interface Order {
  /** "TK-" + 5 digits. */
  id: string;
  eventId: string;
  lines: OrderLine[];
  count: number;
  total: number;
  currency: string;
  method: PaymentMethod;
  buyerName: string;
  email: string;
}
