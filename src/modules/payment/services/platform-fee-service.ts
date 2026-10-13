import { eq } from "drizzle-orm";

import { db } from "@/db";
import { platformSetting } from "@/db/schema";
import { platformFeePercentSchema } from "@/modules/payment/payment.schema";

const PLATFORM_FEE_KEY = "platform_fee_percent";

/**
 * Platform fee percentage (10 = 10 %) stored in `platform_setting`. There is no default in code:
 * a missing or invalid row throws, so no order is created with a made-up fee.
 */
export async function getPlatformFeePercent(): Promise<number> {
  const [row] = await db
    .select({ value: platformSetting.value })
    .from(platformSetting)
    .where(eq(platformSetting.key, PLATFORM_FEE_KEY))
    .limit(1);
  const parsed = platformFeePercentSchema.safeParse(row?.value);
  if (!parsed.success) throw new Error(`platform_setting "${PLATFORM_FEE_KEY}" is missing or invalid.`);
  return parsed.data;
}

/** Saves the fee percentage and who changed it. Only new orders use it: existing ones keep their stored `platform_fee_cents`. */
export async function setPlatformFeePercent(percent: number, updatedBy: string): Promise<void> {
  await db
    .insert(platformSetting)
    .values({ key: PLATFORM_FEE_KEY, value: percent, updatedBy })
    .onConflictDoUpdate({ target: platformSetting.key, set: { value: percent, updatedBy } });
}
