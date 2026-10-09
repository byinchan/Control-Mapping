import type { Catalog, FrameworkId } from "./types.ts";

const DASHES = /[‐-―−]/g;

/**
 * Canonical form of a framework ID as typed by a person or returned by a model:
 * trims, removes inner spaces, unifies dash characters and uppercases letters.
 * NIST single-digit suffixes are zero-padded (PR.AA-3 -> PR.AA-03).
 * It never invents an ID: the result must still be checked with isValidId.
 */
export function normalizeId(framework: FrameworkId, raw: string): string {
  let id = raw.replace(DASHES, "-").replace(/\s+/g, "").toUpperCase();
  if (framework === "nist-csf-2.0") {
    id = id.replace(/^([A-Z]{2}\.[A-Z]{2})-(\d)$/, "$1-0$2");
  }
  return id;
}

export type IdIndex = ReadonlyMap<FrameworkId, ReadonlySet<string>>;

export function buildIdIndex(catalogs: readonly Catalog[]): IdIndex {
  return new Map(catalogs.map((c) => [c.framework, new Set(c.items.map((i) => i.id))]));
}

export function isValidId(index: IdIndex, framework: FrameworkId, id: string): boolean {
  return index.get(framework)?.has(id) ?? false;
}

export type IdValidation = {
  /** Normalized, de-duplicated IDs that exist in the catalog, in input order. */
  valid: string[];
  /** Inputs (as given) that are not in the catalog. */
  dropped: string[];
};

export function validateIds(index: IdIndex, framework: FrameworkId, ids: readonly string[]): IdValidation {
  const valid: string[] = [];
  const dropped: string[] = [];
  for (const raw of ids) {
    const id = normalizeId(framework, raw);
    if (isValidId(index, framework, id)) {
      if (!valid.includes(id)) valid.push(id);
    } else {
      dropped.push(raw);
    }
  }
  return { valid, dropped };
}
