import { index, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { event } from "./event";
import { user } from "./identity";

export const eventFavorite = pgTable(
  "event_favorite",
  {
    id,
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    unique("event_favorite_user_event_uq").on(t.userId, t.eventId),
    index("event_favorite_event_id_idx").on(t.eventId),
  ],
);
