export const FRAMEWORK_IDS = ["nist-csf-2.0", "iso-27001-2022", "cis-v8.1", "soc2-tsc-2017"] as const;

export type FrameworkId = (typeof FRAMEWORK_IDS)[number];

export type CatalogGroup = {
  id: string;
  label: string;
  parent?: string;
};

export type CatalogItem = {
  id: string;
  group: string;
  label: string;
};

export type Catalog = {
  schemaVersion: 1;
  framework: FrameworkId;
  name: string;
  version: string;
  publisher: string;
  /** retrieved is null when no source file was downloaded (ISO: IDs from numbering only). */
  source: { title: string; url: string; retrieved: string | null };
  license: { name: string; url?: string; note: string };
  labelType: "official-text" | "own-label";
  labelStatus: "final" | "draft-pending-review";
  notes: string[];
  expectedCount: number;
  groups: CatalogGroup[];
  items: CatalogItem[];
};
