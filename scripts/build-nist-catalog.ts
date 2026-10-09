// Builds reference/nist-csf-2.0.json from the NIST CPRT export in reference-sources/
// (git-ignored, local only). Run: npm run build:nist
// CI never runs this; it validates the committed catalog instead.
import { readFileSync, statSync, writeFileSync } from "node:fs";
import type { Catalog, CatalogGroup, CatalogItem } from "../lib/catalog/types.ts";

const SOURCE = "reference-sources/csf-export.json";
const OUT = "reference/nist-csf-2.0.json";

type Element = { element_identifier: string; element_type: string; text?: string; title?: string };

const exportDoc = JSON.parse(readFileSync(SOURCE, "utf8"));
const elements: Element[] = exportDoc.response.elements.elements;
const documents = exportDoc.response.elements.documents;
if (documents[0]?.doc_identifier !== "CSF_2_0_0" || documents[0]?.version !== "2.0") {
  throw new Error(`${SOURCE} is not the NIST CSF 2.0 export`);
}

// Withdrawn CSF 1.1 subcategories appear as "WR-<id>" elements; exclude them.
const withdrawn = new Set(
  elements.filter((e) => e.element_type === "withdraw_reason").map((e) => e.element_identifier.slice(3)),
);

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

// The export repeats some elements (e.g. once with text, once as a bare reference);
// keep the first copy that has text, in document order.
const groups = new Map<string, CatalogGroup>();
const subcategoryText = new Map<string, string | undefined>();
for (const e of elements) {
  const id = e.element_identifier;
  if (e.element_type === "function" && !groups.has(id)) {
    groups.set(id, { id, label: titleCase(e.title ?? id) });
  } else if (e.element_type === "category" && !groups.has(id)) {
    groups.set(id, { id, label: e.title ?? id, parent: id.split(".")[0] });
  } else if (e.element_type === "subcategory" && !withdrawn.has(id)) {
    if (!subcategoryText.get(id)) subcategoryText.set(id, e.text?.trim() || undefined);
  }
}
const FUNCTION_ORDER = ["GV", "ID", "PR", "DE", "RS", "RC"];
const groupOrder = [...groups.keys()];
const items: CatalogItem[] = [...subcategoryText]
  .map(([id, text]) => {
    if (!text) throw new Error(`Active subcategory ${id} has no text`);
    return { id, group: id.split("-")[0], label: text };
  })
  .sort(
    (a, b) =>
      FUNCTION_ORDER.indexOf(a.id.slice(0, 2)) - FUNCTION_ORDER.indexOf(b.id.slice(0, 2)) ||
      groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) ||
      a.id.localeCompare(b.id),
  );

// Withdrawn CSF 1.1 categories have no active subcategories; keep only categories in use.
const usedCategories = new Set(items.map((i) => i.group));
for (const [id, g] of groups) if (g.parent && !usedCategories.has(id)) groups.delete(id);

const catalog: Catalog = {
  schemaVersion: 1,
  framework: "nist-csf-2.0",
  name: "NIST Cybersecurity Framework (CSF) 2.0",
  version: "2.0",
  publisher: "National Institute of Standards and Technology (NIST)",
  source: {
    title: "NIST CSF 2.0 reference data, Cybersecurity and Privacy Reference Tool (CPRT) JSON export",
    url: "https://csrc.nist.gov/projects/cprt/catalog#/cprt/framework/version/CSF_2_0_0",
    retrieved: statSync(SOURCE).mtime.toISOString().slice(0, 10),
  },
  license: {
    name: "U.S. Government work",
    note: "NIST publications are works of the U.S. Government and not subject to copyright in the United States. Attribution: National Institute of Standards and Technology.",
  },
  labelType: "official-text",
  labelStatus: "final",
  notes: [
    "Active CSF 2.0 subcategories only; subcategories withdrawn from CSF 1.1 are excluded.",
    "CSF 2.0 subcategories have no titles, so each label is the NIST outcome statement.",
  ],
  expectedCount: 106,
  groups: [...groups.values()],
  items,
};

writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Wrote ${OUT}: ${groups.size} groups, ${items.length} subcategories`);
