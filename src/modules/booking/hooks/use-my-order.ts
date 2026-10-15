"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getMyOrderAction } from "@/modules/booking/actions";
import type { ConfirmationView, MyOrder } from "@/modules/booking/order.types";
import { getConfirmationView, getOrderPollInterval, ORDER_POLL_MAX_POLLS } from "@/modules/booking/order.utils";

export const myOrderQueryKey = (code: string) => ["my-order", code] as const;

export async function fetchMyOrder(code: string): Promise<MyOrder | null> {
  const result = await getMyOrderAction({ code });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** Queries answered so far (data or error); the poll cap counts them instead of reading the clock. */
function countPolls(state: { dataUpdateCount: number; errorUpdateCount: number } | undefined): number {
  return state ? state.dataUpdateCount + state.errorUpdateCount : 0;
}

/**
 * The signed-in customer's order, starting from the one the server rendered. While it is still
 * processing it asks again every `ORDER_POLL_INTERVAL_MS`, up to `ORDER_POLL_MAX_POLLS` times. Access is
 * enforced by the server action; the code only picks which of the user's orders.
 */
export function useMyOrder(
  code: string,
  initialOrder: MyOrder,
): { order: MyOrder; view: ConfirmationView; error: Error | null; retry: () => void } {
  const queryClient = useQueryClient();
  const queryKey = myOrderQueryKey(code);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchMyOrder(code),
    initialData: initialOrder,
    refetchInterval: (q) => getOrderPollInterval(q.state.data, countPolls(q.state)),
    // Every answer re-renders, even one equal to the last: the poll count in the view depends on it.
    notifyOnChangeProps: "all",
  });

  const polls = countPolls(queryClient.getQueryState(queryKey));

  // The order can't disappear once the server found it; `?? initialOrder` only satisfies the type.
  const order = query.data ?? initialOrder;
  const view = getConfirmationView(order, polls >= ORDER_POLL_MAX_POLLS);
  const waiting = view === "processing" || view === "timed-out";

  return { order, view, error: waiting ? query.error : null, retry: () => void query.refetch() };
}
