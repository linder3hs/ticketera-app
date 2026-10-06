"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORGANIZER_STATUS_LABEL, ROLE_LABEL } from "@/modules/user/components/role-labels";
import { useUsersQuery } from "@/modules/user/hooks/use-users-query";
import type { OrganizerStatus, Role, UsersQuery } from "@/modules/user/user.types";

const SEARCH_DELAY_MS = 300;
const ROLE_ITEMS = { all: "Todos los roles", ...ROLE_LABEL };
const STATUS_ITEMS = { all: "Todos", ...ORGANIZER_STATUS_LABEL };
const SELECT_CLASS = "h-11 w-full rounded-xl";

/** Search box and role/status selects; every change goes to the URL. */
export function UsersFilters({ query }: { query: UsersQuery }) {
  const { setSearch, setRole, setStatus, clear } = useUsersQuery(query);
  const [value, setValue] = useState(query.q);
  // Last term the URL is known to hold: a different incoming `q` (e.g. "Limpiar") replaces what is typed,
  // while the echo of our own debounced update leaves it alone so typing is never overwritten.
  const [syncedQ, setSyncedQ] = useState(query.q);
  if (query.q !== syncedQ) {
    setSyncedQ(query.q);
    setValue(query.q);
  }

  useEffect(() => {
    const term = value.trim();
    if (term === syncedQ) return;
    const timer = setTimeout(() => {
      setSyncedQ(term);
      setSearch(term);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value, syncedQ, setSearch]);

  const hasFilters = Boolean(query.q || query.role || query.status);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FormField id="users-search" label="Buscar" required={false} className="min-w-[240px] flex-[1_1_280px]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="users-search"
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Nombre o correo"
            className="h-11 rounded-xl pl-11"
          />
        </div>
      </FormField>

      <FormField id="users-role" label="Rol" required={false} className="min-w-[160px] flex-[0_1_200px]">
        <Select
          value={query.role ?? "all"}
          items={ROLE_ITEMS}
          onValueChange={(next) => setRole(next === "all" ? undefined : (next as Role))}
        >
          <SelectTrigger id="users-role" className={SELECT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ROLE_ITEMS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField id="users-status" label="Estado de organizador" required={false} className="min-w-[160px] flex-[0_1_200px]">
        <Select
          value={query.status ?? "all"}
          items={STATUS_ITEMS}
          onValueChange={(next) => setStatus(next === "all" ? undefined : (next as OrganizerStatus))}
        >
          <SelectTrigger id="users-status" className={SELECT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_ITEMS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {hasFilters && (
        <Button type="button" variant="outline" onClick={clear} className="h-11 cursor-pointer rounded-xl px-4">
          <X className="size-4" aria-hidden="true" />
          Limpiar
        </Button>
      )}
    </div>
  );
}
