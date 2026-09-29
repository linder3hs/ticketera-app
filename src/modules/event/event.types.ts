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

export type PriceRangeKey = "under-50" | "50-150" | "150-300" | "over-300";

export type EventSort = "date" | "price";

/** Search page filters; empty values mean "no filter". */
export interface EventSearchFilters {
  q: string;
  /** Category ids (`cat-conciertos`…). */
  categories: string[];
  cities: string[];
  /** "YYYY-MM". */
  month: string | null;
  price: PriceRangeKey | null;
  /** "YYYY-MM-DD": events on or after this day. */
  from: string | null;
  sort: EventSort;
}

export interface EventCategory {
  id: string;
  label: string;
  icon: string;
}
