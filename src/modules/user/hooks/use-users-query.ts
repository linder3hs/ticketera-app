"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { USERS_PAGE_SIZES } from "@/modules/user/user.schema";
import type { UsersQuery } from "@/modules/user/user.types";

/** URL for `query` with `changes` applied. Defaults stay out of the URL; any change other than `page` goes back to page 1. */
export function buildUsersHref(pathname: string, query: UsersQuery, changes: Partial<UsersQuery>): string {
  const next = { ...query, page: 1, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.role) params.set("role", next.role);
  if (next.status) params.set("status", next.status);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.pageSize !== USERS_PAGE_SIZES[0]) params.set("pageSize", String(next.pageSize));
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/** Writes the users list filters and page to the URL; the server page re-renders with the new results. */
export function useUsersQuery(query: UsersQuery) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function go(changes: Partial<UsersQuery>, mode: "replace" | "push" = "replace") {
    startTransition(() => router[mode](buildUsersHref(pathname, query, changes), { scroll: false }));
  }

  return {
    isPending,
    setSearch: (q: string) => go({ q }),
    setRole: (role: UsersQuery["role"]) => go({ role }),
    setStatus: (status: UsersQuery["status"]) => go({ status }),
    setPageSize: (pageSize: number) => go({ pageSize }),
    setPage: (page: number) => go({ page }, "push"),
    clear: () => go({ q: "", role: undefined, status: undefined }),
  };
}
