import { z } from "zod";

/** Input of `setEventFavoriteAction`. The user always comes from the session, never from here. */
export const setFavoriteSchema = z.object({
  eventId: z.uuid(),
  favorite: z.boolean(),
});

export type SetFavoriteInput = z.infer<typeof setFavoriteSchema>;
