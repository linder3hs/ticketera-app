export interface Event {
  id: string;
  title: string;
  category: string;
  imageUrl: string;
  imageAlt: string;
  date: string;
  venue: string;
  city: string;
  priceFrom: number;
  currency: string;
  status: "available" | "last-tickets" | "sold-out";
  featured: boolean;
}

/** Fields only the event detail page needs. Times are "HH:mm". */
export interface EventDetail extends Event {
  description: string;
  doorsOpenAt: string;
  startsAt: string;
  minAge: number | null;
  address: string;
}

export interface EventCategory {
  id: string;
  label: string;
  icon: string;
}
