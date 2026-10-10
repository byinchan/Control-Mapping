"use client";

import { useId, useMemo, useState } from "react";
import { getCatalog } from "@/lib/catalog/catalogs.ts";
import type { FrameworkId } from "@/lib/catalog/types.ts";

const MAX_RESULTS = 25;

/** Searchable picker that can only add IDs from the reference catalog. */
export function CatalogPicker({
  framework,
  selected,
  onAdd,
  disabled,
}: {
  framework: FrameworkId;
  selected: string[];
  onAdd: (id: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const catalog = getCatalog(framework);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog.items
      .filter((i) => !selected.includes(i.id) && (i.id.toLowerCase().includes(q) || i.label.toLowerCase().includes(q)))
      .slice(0, MAX_RESULTS);
  }, [catalog, query, selected]);

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${catalog.items.length} catalog IDs or labels…`}
        aria-label={`Search the ${catalog.name} catalog`}
        aria-controls={listId}
        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none disabled:bg-slate-50"
      />
      {query.trim() && (
        <ul id={listId} className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          {results.length === 0 && <li className="px-2 py-1.5 text-slate-500">No catalog match. Only catalog IDs can be added.</li>}
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full gap-2 px-2 py-1.5 text-left hover:bg-slate-100"
                onClick={() => {
                  onAdd(item.id);
                  setQuery("");
                }}
              >
                <span className="shrink-0 font-mono text-xs font-semibold text-slate-900">{item.id}</span>
                <span className="text-slate-600">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
