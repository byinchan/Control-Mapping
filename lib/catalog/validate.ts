import { normalizeId, type IdIndex, isValidId } from "./ids.ts";
import {
  CIS_SAFEGUARDS_PER_CONTROL,
  EXPECTED_COUNTS,
  ID_PATTERNS,
  ISO_CONTROLS_PER_THEME,
  MAX_LABEL_LENGTH,
} from "./rules.ts";
import { FRAMEWORK_IDS, type FrameworkId } from "./types.ts";
import { parseV1Cell } from "./v1.ts";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Checks a parsed catalog file. Returns a list of problems; empty means valid. */
export function validateCatalog(data: unknown, framework: FrameworkId): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(`${framework}: ${msg}`);
  if (!isObject(data)) return [`${framework}: catalog is not an object`];

  if (data.schemaVersion !== 1) err("schemaVersion must be 1");
  if (data.framework !== framework) err(`framework is "${String(data.framework)}"`);
  for (const key of ["name", "version", "publisher"]) if (!isText(data[key])) err(`missing ${key}`);
  const source = data.source;
  if (!isObject(source) || !isText(source.title) || !isText(source.url) || !String(source.url).startsWith("https://")) {
    err("source needs a title and an https url");
  } else if (source.retrieved !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(source.retrieved))) {
    err("source.retrieved must be YYYY-MM-DD or null (no source downloaded)");
  }
  if (!isObject(data.license) || !isText(data.license.name) || !isText(data.license.note)) err("license needs name and note");
  const expectedLabelType = framework === "nist-csf-2.0" ? "official-text" : "own-label";
  if (data.labelType !== expectedLabelType) err(`labelType must be "${expectedLabelType}"`);
  if (data.labelStatus !== "final" && data.labelStatus !== "draft-pending-review") err("invalid labelStatus");
  if (!Array.isArray(data.notes)) err("notes must be an array");
  if (data.expectedCount !== EXPECTED_COUNTS[framework]) err(`expectedCount must be ${EXPECTED_COUNTS[framework]}`);

  if (!Array.isArray(data.groups) || !Array.isArray(data.items)) {
    err("groups and items must be arrays");
    return errors;
  }

  const groupIds = new Set<string>();
  for (const g of data.groups) {
    if (!isObject(g) || !isText(g.id) || !isText(g.label)) {
      err(`malformed group ${JSON.stringify(g)}`);
      continue;
    }
    if (groupIds.has(g.id)) err(`duplicate group ${g.id}`);
    groupIds.add(g.id);
  }
  for (const g of data.groups) {
    if (isObject(g) && g.parent !== undefined && !groupIds.has(String(g.parent))) err(`group ${String(g.id)} has unknown parent`);
  }

  const maxLabel = MAX_LABEL_LENGTH[expectedLabelType];
  const ids = new Set<string>();
  for (const item of data.items) {
    if (!isObject(item) || !isText(item.id) || !isText(item.group) || !isText(item.label)) {
      err(`malformed item ${JSON.stringify(item)}`);
      continue;
    }
    if (ids.has(item.id)) err(`duplicate id ${item.id}`);
    ids.add(item.id);
    if (!ID_PATTERNS[framework].test(item.id)) err(`id ${item.id} does not match the ${framework} pattern`);
    if (normalizeId(framework, item.id) !== item.id) err(`id ${item.id} is not in canonical form`);
    if (!groupIds.has(item.group)) err(`id ${item.id} has unknown group ${item.group}`);
    if (item.label.length > maxLabel) err(`label for ${item.id} is longer than ${maxLabel} characters`);
  }
  if (ids.size !== EXPECTED_COUNTS[framework]) err(`has ${ids.size} ids, expected ${EXPECTED_COUNTS[framework]}`);

  if (framework === "cis-v8.1") {
    CIS_SAFEGUARDS_PER_CONTROL.forEach((count, i) => {
      for (let s = 1; s <= count; s++) if (!ids.has(`${i + 1}.${s}`)) err(`missing safeguard ${i + 1}.${s}`);
    });
  }
  if (framework === "iso-27001-2022") {
    for (const [theme, count] of Object.entries(ISO_CONTROLS_PER_THEME)) {
      for (let n = 1; n <= count; n++) if (!ids.has(`${theme}.${n}`)) err(`missing control ${theme}.${n}`);
    }
  }
  return errors;
}

export type V1Document = {
  controls: { id: string; frameworks: Record<string, { raw: string }> }[];
};

/** Checks that every ID in the v1 sample matrix exists in the catalogs. */
export function validateV1Ids(index: IdIndex, v1: V1Document): string[] {
  const errors: string[] = [];
  for (const control of v1.controls) {
    for (const framework of FRAMEWORK_IDS) {
      const cell = control.frameworks[framework];
      if (!cell) {
        errors.push(`${control.id}: no ${framework} cell`);
        continue;
      }
      try {
        const parsed = parseV1Cell(framework, cell.raw);
        if (parsed.kind === "ids") {
          for (const id of parsed.ids) {
            if (!isValidId(index, framework, id)) errors.push(`${control.id}: ${framework} id ${id} is not in the catalog`);
          }
        }
      } catch (e) {
        errors.push(`${control.id}: ${(e as Error).message}`);
      }
    }
  }
  return errors;
}
