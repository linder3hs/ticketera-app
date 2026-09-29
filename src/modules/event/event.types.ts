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

export interface EventCategory {
  id: string;
  label: string;
  icon: string;
}
