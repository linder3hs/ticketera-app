export type OrganizerEventStatus = "published" | "draft";

export interface OrganizerEvent {
  id: string;
  title: string;
  category: string;
  /** Remote URL or, for events created here, a resized data URL; may be empty. */
  imageUrl: string;
  date: string;
  venue: string;
  city: string;
  sold: number;
  capacity: number;
  priceFrom: number;
  currency: string;
  status: OrganizerEventStatus;
}

export interface TicketTypeInput {
  name: string;
  price: string;
  quantity: string;
}

/** The create-event form, as typed (strings straight from the inputs). */
export interface CreateEventInput {
  name: string;
  category: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  imageUrl: string;
  ticketTypes: TicketTypeInput[];
}
