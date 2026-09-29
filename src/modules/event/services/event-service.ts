import type { Event, EventCategory } from "@/modules/event/event.types";

/**
 * Mock in-memory data for the event landing page.
 *
 * Market assumption (validated with the user via the approved spec
 * `docs/specs/event-landing-page.md`): a mix of Peruvian cities (Lima,
 * Arequipa) plus international events (Madrid, Ciudad de México), to
 * reflect both Joinnus (Perú) and Ticketmaster (global) as references.
 *
 * All image URLs point to real photos hosted on images.unsplash.com.
 */
const EVENTS: Event[] = [
  {
    id: "evt-001",
    title: "Bad Bunny — World Tour",
    category: "Conciertos",
    imageUrl:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Multitud con los brazos en alto frente a un escenario iluminado durante un concierto nocturno",
    date: "2026-11-14",
    venue: "Estadio Nacional",
    city: "Lima",
    priceFrom: 250,
    currency: "PEN",
    status: "available",
    featured: true,
  },
  {
    id: "evt-002",
    title: "Festival Vive Latino Lima",
    category: "Festivales",
    imageUrl:
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Confeti cayendo sobre la multitud frente al escenario durante un festival nocturno",
    date: "2026-10-05",
    venue: "Costa Verde",
    city: "Lima",
    priceFrom: 120,
    currency: "PEN",
    status: "last-tickets",
    featured: true,
  },
  {
    id: "evt-003",
    title: "Clásico Peruano: Universitario vs. Alianza Lima",
    category: "Deportes",
    imageUrl:
      "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Vista aérea de un estadio de fútbol lleno de espectadores durante un partido",
    date: "2026-10-20",
    venue: "Estadio Monumental",
    city: "Lima",
    priceFrom: 80,
    currency: "PEN",
    status: "sold-out",
    featured: false,
  },
  {
    id: "evt-004",
    title: "Romeo y Julieta — Obra de Teatro",
    category: "Teatro",
    imageUrl:
      "https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Siluetas de tres actores sobre el escenario frente a un telón rojo",
    date: "2026-11-02",
    venue: "Teatro Municipal de Arequipa",
    city: "Arequipa",
    priceFrom: 60,
    currency: "PEN",
    status: "available",
    featured: true,
  },
  {
    id: "evt-005",
    title: "Feria Familiar de Verano",
    category: "Familiar",
    imageUrl:
      "https://images.unsplash.com/photo-1476234251651-f353703a034d?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Dos niñas compartiendo la lectura de un libro al aire libre durante el atardecer",
    date: "2026-12-01",
    venue: "Parque Selva Alegre",
    city: "Arequipa",
    priceFrom: 40,
    currency: "PEN",
    status: "available",
    featured: true,
  },
  {
    id: "evt-006",
    title: "Coldplay — Music of the Spheres World Tour",
    category: "Conciertos",
    imageUrl:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Silueta de un artista con la mano en alto sobre el escenario entre humo y luces azules y rojas",
    date: "2026-11-28",
    venue: "Estadio Santiago Bernabéu",
    city: "Madrid",
    priceFrom: 300,
    currency: "EUR",
    status: "last-tickets",
    featured: false,
  },
  {
    id: "evt-007",
    title: "NBA Global Games — Exhibición de Básquet",
    category: "Deportes",
    imageUrl:
      "https://images.unsplash.com/photo-1518063319789-7217e6706b04?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Vista desde abajo de un aro de baloncesto con su red en una cancha techada",
    date: "2026-10-12",
    venue: "Arena CDMX",
    city: "Ciudad de México",
    priceFrom: 150,
    currency: "USD",
    status: "available",
    featured: true,
  },
  {
    id: "evt-008",
    title: "Festival Electrónico Ultra Lima",
    category: "Festivales",
    imageUrl:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Multitud con las manos en alto frente a un escenario con luces doradas durante un festival nocturno",
    date: "2026-12-20",
    venue: "Explanada Costa Verde",
    city: "Lima",
    priceFrom: 130,
    currency: "PEN",
    status: "last-tickets",
    featured: false,
  },
  {
    id: "evt-009",
    title: "Concierto Sinfónico de Año Nuevo",
    category: "Conciertos",
    imageUrl:
      "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Músicos de una orquesta tocando el violín durante un concierto",
    date: "2026-12-31",
    venue: "Gran Teatro Nacional",
    city: "Arequipa",
    priceFrom: 95,
    currency: "PEN",
    status: "available",
    featured: false,
  },
  {
    id: "evt-010",
    title: "Circo de las Estrellas",
    category: "Familiar",
    imageUrl:
      "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Niños jugando con una pelota en un parque arbolado",
    date: "2026-11-22",
    venue: "Explanada Jockey Plaza",
    city: "Lima",
    priceFrom: 45,
    currency: "PEN",
    status: "available",
    featured: false,
  },
];

const CATEGORIES: EventCategory[] = [
  { id: "cat-conciertos", label: "Conciertos", icon: "Music" },
  { id: "cat-deportes", label: "Deportes", icon: "Trophy" },
  { id: "cat-teatro", label: "Teatro", icon: "Theater" },
  { id: "cat-festivales", label: "Festivales", icon: "PartyPopper" },
  { id: "cat-familiar", label: "Familiar", icon: "Users" },
  { id: "cat-cine", label: "Cine", icon: "Film" },
  { id: "cat-comedia", label: "Comedia", icon: "Mic2" },
  { id: "cat-arte", label: "Arte y Exposiciones", icon: "Palette" },
];

/**
 * Returns only the events flagged as `featured` (for the landing page
 * carousel).
 */
export async function getFeaturedEvents(): Promise<Event[]> {
  return EVENTS.filter((event) => event.featured);
}

/**
 * Returns the events for the "upcoming events" grid, sorted by date
 * (soonest first). With `categoryId`, only that category's events; an
 * unknown id yields an empty list.
 *
 * Decision: returns the full mock catalog (including the featured ones)
 * rather than excluding featured events. The mock market has only 10
 * events, so excluding featured ones would leave the grid nearly empty;
 * once real data/pagination exists, this can be revisited without
 * changing the function signature.
 */
export async function getUpcomingEvents(categoryId?: string): Promise<Event[]> {
  const label = CATEGORIES.find((category) => category.id === categoryId)?.label;
  const events = categoryId
    ? EVENTS.filter((event) => event.category === label)
    : EVENTS;

  return [...events].sort((a, b) => a.date.localeCompare(b.date));
}

/** Returns the list of event categories shown as filter chips. */
export async function getCategories(): Promise<EventCategory[]> {
  return CATEGORIES;
}
