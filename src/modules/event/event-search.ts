import type {
  Event,
  EventCategory,
  EventSearchFilters,
  EventSort,
  PriceRangeKey,
} from "@/modules/event/event.types";

/**
 * Price ranges shared by the hero search form and the search filters.
 * `min` is exclusive and `max` inclusive. Mock: `priceFrom` is compared as a
 * plain number, whatever the event's currency.
 */
export const PRICE_RANGES: { key: PriceRangeKey; label: string; min: number; max: number }[] = [
  { key: "under-50", label: "Hasta S/ 50", min: -Infinity, max: 50 },
  { key: "50-150", label: "S/ 50 – 150", min: 50, max: 150 },
  { key: "150-300", label: "S/ 150 – 300", min: 150, max: 300 },
  { key: "over-300", label: "Más de S/ 300", min: 300, max: Infinity },
];

export const SORT_OPTIONS: { key: EventSort; label: string }[] = [
  { key: "date", label: "Fecha" },
  { key: "price", label: "Precio más bajo" },
];

export const EMPTY_FILTERS: EventSearchFilters = {
  q: "",
  categories: [],
  cities: [],
  month: null,
  price: null,
  from: null,
  sort: "date",
};

/** URL keys, in Spanish like the landing's existing `?categoria=`. */
const PARAM = {
  q: "q",
  categories: "categoria",
  cities: "ciudad",
  month: "mes",
  price: "precio",
  from: "desde",
  sort: "orden",
} as const;

type RawSearchParams = Record<string, string | string[] | undefined>;

function all(params: RawSearchParams, key: string): string[] {
  const value = params[key];
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function first(params: RawSearchParams, key: string): string {
  return all(params, key)[0] ?? "";
}

/** Reads filters from Next's `searchParams`; invalid values are dropped. */
export function parseSearchParams(params: RawSearchParams): EventSearchFilters {
  const month = first(params, PARAM.month);
  const price = first(params, PARAM.price);
  const from = first(params, PARAM.from);
  const sort = first(params, PARAM.sort);

  return {
    q: first(params, PARAM.q),
    categories: all(params, PARAM.categories),
    cities: all(params, PARAM.cities),
    month: /^\d{4}-\d{2}$/.test(month) ? month : null,
    price: PRICE_RANGES.some((range) => range.key === price) ? (price as PriceRangeKey) : null,
    from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null,
    sort: sort === "price" ? "price" : "date",
  };
}

/** The URL query for `filters`, leaving out empty and default values. */
export function toSearchParams(filters: EventSearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set(PARAM.q, filters.q.trim());
  filters.categories.forEach((id) => params.append(PARAM.categories, id));
  filters.cities.forEach((city) => params.append(PARAM.cities, city));
  if (filters.month) params.set(PARAM.month, filters.month);
  if (filters.price) params.set(PARAM.price, filters.price);
  if (filters.from) params.set(PARAM.from, filters.from);
  if (filters.sort !== "date") params.set(PARAM.sort, filters.sort);
  return params;
}

/** `/events` with the query for `filters`. */
export function toSearchHref(filters: EventSearchFilters): string {
  const query = toSearchParams(filters).toString();
  return query ? `/events?${query}` : "/events";
}

/** Lowercase without accents, so "Bogotá" matches "bogota". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Events matching every active facet (AND between facets, OR within the
 * categories or cities picked).
 */
export function filterEvents(
  events: Event[],
  filters: EventSearchFilters,
  categories: EventCategory[],
): Event[] {
  const query = normalize(filters.q.trim());
  const labels = new Set(
    categories.filter((category) => filters.categories.includes(category.id)).map((category) => category.label),
  );
  const range = PRICE_RANGES.find((item) => item.key === filters.price);

  return events.filter(
    (event) =>
      (!query || normalize(`${event.title} ${event.venue} ${event.city}`).includes(query)) &&
      (filters.categories.length === 0 || labels.has(event.category)) &&
      (filters.cities.length === 0 || filters.cities.includes(event.city)) &&
      (!filters.month || event.date.startsWith(filters.month)) &&
      (!range || (event.priceFrom > range.min && event.priceFrom <= range.max)) &&
      (!filters.from || event.date >= filters.from),
  );
}

export function sortEvents(events: Event[], sort: EventSort): Event[] {
  return [...events].sort((a, b) =>
    sort === "price" ? a.priceFrom - b.priceFrom || a.date.localeCompare(b.date) : a.date.localeCompare(b.date),
  );
}

/** How many events of the whole catalog fall in each category and city. */
export function getFacetCounts(events: Event[], categories: EventCategory[]) {
  const count = (predicate: (event: Event) => boolean) => events.filter(predicate).length;
  const cities = [...new Set(events.map((event) => event.city))];

  return {
    categories: Object.fromEntries(
      categories.map((category) => [category.id, count((event) => event.category === category.label)]),
    ),
    cities: Object.fromEntries(cities.map((city) => [city, count((event) => event.city === city)])),
  };
}

/** Months ("YYYY-MM") that have events, soonest first, with their label. */
export function getMonthOptions(events: Event[]): { key: string; label: string }[] {
  const months = [...new Set(events.map((event) => event.date.slice(0, 7)))].sort();
  return months.map((key) => {
    const label = new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" }).format(
      new Date(`${key}-01`),
    );
    return { key, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
}

/** Human labels of the active filters, each with the filters without it. */
export function getActiveFilterChips(
  filters: EventSearchFilters,
  categories: EventCategory[],
  months: { key: string; label: string }[],
): { key: string; label: string; filters: EventSearchFilters }[] {
  const chips: { key: string; label: string; filters: EventSearchFilters }[] = [];

  if (filters.q.trim()) chips.push({ key: "q", label: `“${filters.q.trim()}”`, filters: { ...filters, q: "" } });
  for (const id of filters.categories) {
    const label = categories.find((category) => category.id === id)?.label ?? id;
    chips.push({
      key: `cat-${id}`,
      label,
      filters: { ...filters, categories: filters.categories.filter((item) => item !== id) },
    });
  }
  for (const city of filters.cities) {
    chips.push({
      key: `city-${city}`,
      label: city,
      filters: { ...filters, cities: filters.cities.filter((item) => item !== city) },
    });
  }
  if (filters.month) {
    const label = months.find((month) => month.key === filters.month)?.label ?? filters.month;
    chips.push({ key: "month", label, filters: { ...filters, month: null } });
  }
  if (filters.price) {
    const label = PRICE_RANGES.find((range) => range.key === filters.price)?.label ?? filters.price;
    chips.push({ key: "price", label, filters: { ...filters, price: null } });
  }
  if (filters.from) {
    const [year, month, day] = filters.from.split("-");
    chips.push({ key: "from", label: `Desde ${day}/${month}/${year}`, filters: { ...filters, from: null } });
  }
  return chips;
}
