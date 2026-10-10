// CI gate: checks every committed catalog and the v1 sample IDs. Run: npm run validate:catalogs
import { readFileSync } from "node:fs";
import { buildIdIndex, isValidId } from "../lib/catalog/ids.ts";
import { FRAMEWORK_IDS, type Catalog, type FrameworkId } from "../lib/catalog/types.ts";
import { validateCatalog, validateV1Ids, type V1Document } from "../lib/catalog/validate.ts";

const FILES: Record<FrameworkId, string> = {
  "nist-csf-2.0": "reference/nist-csf-2.0.json",
  "iso-27001-2022": "reference/iso-27001-2022.json",
  "cis-v8.1": "reference/cis-controls-v8.1.json",
  "soc2-tsc-2017": "reference/soc2-tsc-2017.json",
};

const errors: string[] = [];
const catalogs: Catalog[] = [];
for (const framework of FRAMEWORK_IDS) {
  const data: unknown = JSON.parse(readFileSync(FILES[framework], "utf8"));
  const problems = validateCatalog(data, framework);
  errors.push(...problems);
  if (problems.length === 0) {
    const catalog = data as Catalog;
    catalogs.push(catalog);
    console.log(`ok  ${framework}: ${catalog.items.length} ids (${catalog.labelType}, ${catalog.labelStatus})`);
  }
}

if (catalogs.length === FRAMEWORK_IDS.length) {
  const index = buildIdIndex(catalogs);
  const v1: V1Document = JSON.parse(readFileSync("data/v1-controls.json", "utf8"));
  const v1Errors = validateV1Ids(index, v1);
  errors.push(...v1Errors);
  if (v1Errors.length === 0) console.log(`ok  v1 sample: every ID in ${v1.controls.length} controls is in the catalogs`);

  const { corrections }: { corrections: { control: string; framework: FrameworkId; corrected: string[] }[] } = JSON.parse(
    readFileSync("data/sample-corrections.json", "utf8"),
  );
  const correctionErrors = corrections.flatMap((c) =>
    c.corrected.filter((id) => !isValidId(index, c.framework, id)).map((id) => `${c.control}: corrected ${c.framework} id ${id} is not in the catalog`),
  );
  errors.push(...correctionErrors);
  if (correctionErrors.length === 0) console.log(`ok  sample corrections: ${corrections.length} corrections, every ID is in the catalogs`);
}

if (errors.length > 0) {
  for (const e of errors) console.error(`ERR ${e}`);
  process.exit(1);
}
