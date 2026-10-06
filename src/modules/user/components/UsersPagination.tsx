"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUsersQuery } from "@/modules/user/hooks/use-users-query";
import { USERS_PAGE_SIZES } from "@/modules/user/user.schema";
import type { UsersQuery } from "@/modules/user/user.types";

const WINDOW = 5;
const PAGE_SIZE_ITEMS = Object.fromEntries(USERS_PAGE_SIZES.map((size) => [String(size), String(size)]));
const BUTTON_CLASS = "size-11 cursor-pointer rounded-xl";

/** Up to `WINDOW` consecutive page numbers that include `page`. */
function pageWindow(page: number, pageCount: number): number[] {
  const first = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), pageCount - WINDOW + 1));
  return Array.from({ length: Math.min(WINDOW, pageCount) }, (_, index) => first + index);
}

interface UsersPaginationProps {
  query: UsersQuery;
  total: number;
  page: number;
  pageCount: number;
}

/** Result range, rows-per-page selector and page buttons. */
export function UsersPagination({ query, total, page, pageCount }: UsersPaginationProps) {
  const { setPage, setPageSize } = useUsersQuery(query);
  const from = total === 0 ? 0 : (page - 1) * query.pageSize + 1;
  const to = Math.min(total, page * query.pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-3">
      <p aria-live="polite" className="text-[13px] text-muted-foreground">
        {total === 0 ? "0 resultados" : `Mostrando ${from}–${to} de ${total}`}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="users-page-size" className="text-[13px] text-muted-foreground">
            Filas
          </label>
          <Select
            value={String(query.pageSize)}
            items={PAGE_SIZE_ITEMS}
            onValueChange={(next) => setPageSize(Number(next))}
          >
            <SelectTrigger id="users-page-size" className="h-11 w-[84px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(PAGE_SIZE_ITEMS).map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {pageCount > 1 && (
          <Pagination aria-label="Paginación" className="mx-0 w-auto">
            <PaginationContent className="gap-1.5">
              <PaginationItem>
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Página anterior"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className={BUTTON_CLASS}
                >
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </Button>
              </PaginationItem>
              {pageWindow(page, pageCount).map((number) => (
                <PaginationItem key={number}>
                  <Button
                    type="button"
                    variant={number === page ? "default" : "outline"}
                    aria-label={`Página ${number}`}
                    aria-current={number === page ? "page" : undefined}
                    onClick={() => setPage(number)}
                    className={BUTTON_CLASS}
                  >
                    {number}
                  </Button>
                </PaginationItem>
              ))}
              <PaginationItem>
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Página siguiente"
                  disabled={page >= pageCount}
                  onClick={() => setPage(page + 1)}
                  className={BUTTON_CLASS}
                >
                  <ChevronRight className="size-5" aria-hidden="true" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  );
}
