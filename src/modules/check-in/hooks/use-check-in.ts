"use client";

import { useMutation } from "@tanstack/react-query";

import { checkInTicketAction } from "@/modules/check-in/actions";
import type { CheckInInput } from "@/modules/check-in/check-in.schema";
import type { CheckInOutcome } from "@/modules/check-in/check-in.types";

export async function checkInRequest(input: CheckInInput): Promise<CheckInOutcome> {
  const result = await checkInTicketAction(input);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** Validates a scanned (or typed) ticket code. Access is enforced by the server action. */
export function useCheckIn() {
  return useMutation({ mutationFn: checkInRequest });
}
