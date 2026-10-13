import { z } from "zod";

/** `platform_setting.platform_fee_percent`: a percentage (10 = 10 %), 0 to 100, decimals allowed. */
export const platformFeePercentSchema = z.number().min(0).max(100);
