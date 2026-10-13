import { z } from "zod";

import { ORDER_CODE_ALPHABET } from "@/modules/booking/checkout.utils";

/** An order code as `generateOrderCode` makes it: `TK-` + 8 characters of the alphabet. */
export const orderCodeSchema = z.string().regex(new RegExp(`^TK-[${ORDER_CODE_ALPHABET}]{8}$`));

/** Input of `getMyOrderAction`: only the code, the owner always comes from the session. */
export const getMyOrderSchema = z.object({ code: orderCodeSchema });
