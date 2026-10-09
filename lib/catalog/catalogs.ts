import cis from "../../reference/cis-controls-v8.1.json" with { type: "json" };
import iso from "../../reference/iso-27001-2022.json" with { type: "json" };
import nist from "../../reference/nist-csf-2.0.json" with { type: "json" };
import soc2 from "../../reference/soc2-tsc-2017.json" with { type: "json" };
import { buildIdIndex } from "./ids.ts";
import type { Catalog, FrameworkId } from "./types.ts";

// The committed JSON files are checked against the Catalog shape by
// scripts/validate-catalogs.ts in CI and by tests/catalog.test.ts.
export const CATALOGS = [nist, iso, cis, soc2] as unknown as readonly Catalog[];

export const ID_INDEX = buildIdIndex(CATALOGS);

export function getCatalog(framework: FrameworkId): Catalog {
  const catalog = CATALOGS.find((c) => c.framework === framework);
  if (!catalog) throw new Error(`No catalog for ${framework}`);
  return catalog;
}
