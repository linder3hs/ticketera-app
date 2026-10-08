export interface Event {
  id: string;
  /** Key of the public URL `/events/<slug>`; the event's identity is `id`. */
  slug: string;
  title: string;
  category: string;
  /** Cover URL; `""` means "no cover" (cards and the carousel show a placeholder). */
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
  /** `""` means "no doors time announced" (events created from the panel don't have one). */
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
  /** Category ids, i.e. slugs (`conciertos`…). */
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
  /** The category's slug (`conciertos`…), used in `?categoria=<slug>`. */
  id: string;
  label: string;
  icon: string;
}
