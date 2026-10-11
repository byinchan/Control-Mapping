// Checks on report narrative text, whoever wrote it (template, AI or analyst). Pure functions.
// Number and reference problems block approval; claim words only warn.
import { allowedNumbers, type Facts } from "./facts.ts";

export type Flag = { quote: string; message: string };
/** `fields`: recommendation owner and effort problems (empty for text sections). */
export type SectionCheck = { numbers: Flag[]; references: Flag[]; claims: Flag[]; fields: Flag[] };

// Text that contains digits but is not a figure: framework names, versions, IDs, dates, list numbering.
const NOT_FIGURES: RegExp[] = [
  /\bNIST CSF 2\.0\b/g,
  /\bCSF 2\.0\b/g,
  /\bISO\/IEC 27001(?::2022)?\b/g,
  /\bISO 27001(?::2022)?\b/g,
  /\b27001(?::2022)?\b/g,
  /\bCIS Controls v8\.1\b/g,
  /\bv8\.1\b/g,
  /\bSOC 2\b/g,
  /\b[CA]\d{3}\b/g, // control IDs (C001, A001)
  /\b(?:GV|ID|PR|DE|RS|RC)\.[A-Z]{2}-\d{2}\b/g, // NIST subcategories
  /\bA\.\d{1,2}\.\d{1,2}\b/g, // ISO Annex A
  /\b(?:CC\d|A1|C1|PI1|P\d)\.\d{1,2}\b/g, // SOC 2 criteria
  /\b(?:CIS|[Ss]afeguards?)\s+\d{1,2}\.\d{1,2}(?:\s*(?:,|and|to|-|–)\s*\d{1,2}\.\d{1,2})*/g, // CIS safeguards
  /\b20\d{2}(?:-\d{2}-\d{2})?\b/g, // years and dates
  /^\s*\d+[.)]\s/gm, // list numbering
];

const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const NUMBER_TOKEN = new RegExp(`(\\d+(?:\\.\\d+)?)(\\s*(?:%|per ?cent))?|\\b(${Object.keys(WORDS).join("|")})\\b`, "gi");

/** Phrases that tie a figure to a specific count in the facts pack. */
function keyedCounts(f: Facts): { phrase: RegExp; label: string; count: number; percent: string | null }[] {
  return [
    { phrase: /fully aligned/, label: "Fully Aligned", count: f.statusCounts["Fully Aligned"], percent: f.statusPercents["Fully Aligned"] },
    { phrase: /partially aligned/, label: "Partially Aligned", count: f.statusCounts["Partially Aligned"], percent: f.statusPercents["Partially Aligned"] },
    { phrase: /gap identified/, label: "Gap Identified", count: f.statusCounts["Gap Identified"], percent: f.statusPercents["Gap Identified"] },
    { phrase: /awaiting review/, label: "awaiting review", count: f.awaitingReview, percent: null },
    { phrase: /not scorable/, label: "Not scorable", count: f.notScorable, percent: null },
    { phrase: /limited (?:framework )?coverage/, label: "with limited framework coverage", count: f.limitedCoverage, percent: null },
    // The posture line's "3 controls have gaps": the same controls as the gaps table.
    { phrase: /\b(?:ha(?:ve|s) (?:a )?gaps?|with (?:a )?gaps?)\b/, label: "with gaps", count: f.gaps.length, percent: null },
    { phrase: /confirmed controls?/, label: "confirmed controls", count: f.confirmed, percent: null },
  ];
}

const sentenceAfter = (text: string, from: number) => {
  const rest = text.slice(from);
  const end = rest.search(/[.!?;\n](\s|$)/);
  return (end === -1 ? rest : rest.slice(0, end)).slice(0, 90).toLowerCase();
};

// Approximate quantities stand in for a figure the code computed, so they are flagged like a wrong number.
// "most" counts only as a quantity ("most controls", "most of the"), not as in "the most urgent gap"; "quarter" only
// as a share ("a quarter of"), not as a period ("each quarter"); "third-party" is not a fraction.
const FRACTION_WORDS =
  /\b(?:half|halves|(?:a|one|two)[- ]thirds?(?![- ]part)|thirds? of|(?:a|one|three)[- ]quarters? of|majority|minority|most(?= (?:of\b|controls?\b|frameworks?\b|requirements?\b|gaps?\b|mappings?\b|ratings?\b)))\b/gi;

export function checkNumbers(text: string, f: Facts): Flag[] {
  let cleaned = text;
  for (const re of NOT_FIGURES) cleaned = cleaned.replace(re, (m) => " ".repeat(m.length));
  const allowed = allowedNumbers(f);
  const keyed = keyedCounts(f);
  const flags: Flag[] = [];

  // Fractions first, then blank them out so "two" in "two-thirds" is not read again as a count.
  for (const m of cleaned.matchAll(FRACTION_WORDS)) {
    flags.push({ quote: m[0], message: "an approximate share; state the figure from the results instead" });
  }
  cleaned = cleaned.replace(FRACTION_WORDS, (m) => " ".repeat(m.length));

  for (const m of cleaned.matchAll(NUMBER_TOKEN)) {
    const raw = m[0].trim();
    const value = m[1] !== undefined ? Number(m[1]) : WORDS[m[3].toLowerCase()];
    const isPercent = Boolean(m[2]);
    let context = sentenceAfter(cleaned, (m.index ?? 0) + m[0].length);
    // "8 of 14 confirmed controls are Fully Aligned": the 8 belongs to the status, not to "confirmed".
    const ofForm = /^\s*(?:out )?of\s+\S+/.exec(context);
    if (ofForm) context = context.slice(ofForm[0].length);

    // Only whole-number counts and percentages are tied to a status or count phrase. Decimals such as
    // scores and thresholds ("0.9 or higher") must simply be figures the code computed.
    const isCount = isPercent || Number.isInteger(value);
    // A figure in brackets right after a phrase belongs to that phrase: "2 are Fully Aligned (33%)".
    const before = cleaned.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0).toLowerCase();
    const bracketed = isCount && /\(\s*$/.test(before) ? keyed.find((k) => new RegExp(`(?:${k.phrase.source})\\s*\\(\\s*$`).test(before)) : undefined;
    const hit = !isCount
      ? undefined
      : bracketed
        ? { k: bracketed, at: 0 }
        : keyed
            .map((k) => ({ k, at: context.search(k.phrase) }))
            .filter((x) => x.at >= 0 && !(ofForm && x.k.label === "confirmed controls"))
            .sort((a, b) => a.at - b.at)[0];

    if (hit && isPercent && hit.k.percent !== null) {
      if (`${value}%` !== hit.k.percent) flags.push({ quote: `${raw} ${hit.k.label}`, message: `code says ${hit.k.percent}` });
    } else if (hit && !isPercent) {
      if (value !== hit.k.count) flags.push({ quote: `${raw} ${hit.k.label}`, message: `code says ${hit.k.count}` });
    } else if (!allowed.has(value)) {
      flags.push({ quote: raw, message: "not a figure computed by code; remove it or use a figure from the results" });
    }
  }
  return flags;
}

export function checkReferences(text: string, f: Facts): Flag[] {
  const known = new Set(f.controls.map((c) => c.id));
  return [...new Set(text.match(/\b[CA]\d{3}\b/g) ?? [])]
    .filter((id) => !known.has(id))
    .map((id) => ({ quote: id, message: "not a confirmed control in this report" }));
}

// Wording that would claim more than alignment of a control description.
const CLAIM_WORDS = /\b(implemented|implementation|effective(?:ly|ness)?|compliant|compliance|certified|certification|secured?|audit[- ]ready|fully protected|guarantee[sd]?)\b/gi;
const NEGATION = /\b(not|no|never|without|cannot|n't)\b|n't\b/i;

export function checkClaims(text: string): Flag[] {
  const flags: Flag[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    for (const m of sentence.matchAll(CLAIM_WORDS)) {
      // Deliberate negations ("does not show that controls are effective") are fine.
      if (NEGATION.test(sentence.slice(0, m.index))) continue;
      flags.push({
        quote: m[0],
        message: `may claim more than alignment: "${sentence.trim().slice(0, 120)}". This report only shows how controls, as described, align to frameworks.`,
      });
    }
  }
  return flags;
}

export function checkSection(text: string, f: Facts): SectionCheck {
  return { numbers: checkNumbers(text, f), references: checkReferences(text, f), claims: checkClaims(text), fields: [] };
}

export const EFFORTS = ["Low", "Medium", "High"] as const;
/** The only owner a recommendation may name besides the owners in the confirmed results. */
export const OWNER_TO_ASSIGN = "Control owner (to assign)";

/** The facts pack's spelling of an owner (trimmed, any case), or null when it is not one of them. */
export function matchOwner(owner: string, f: Facts): string | null {
  const key = owner.trim().toLowerCase();
  if (key === OWNER_TO_ASSIGN.toLowerCase()) return OWNER_TO_ASSIGN;
  return f.owners.find((o) => o.toLowerCase() === key) ?? null;
}

/**
 * Checks structured recommendations: text and rationale go through the same number, reference and claim checks; the
 * owner must be an owner from the confirmed results (or "Control owner (to assign)") and effort Low, Medium or High.
 */
export function checkRecommendations(items: readonly { text: string; owner: string; effort: string; rationale: string }[], f: Facts): SectionCheck {
  const out: SectionCheck = { numbers: [], references: [], claims: [], fields: [] };
  items.forEach((r, i) => {
    const c = checkSection(`${r.text}\n${r.rationale}`, f);
    out.numbers.push(...c.numbers);
    out.references.push(...c.references);
    out.claims.push(...c.claims);
    if (!matchOwner(r.owner, f)) {
      const allowed = [...f.owners, OWNER_TO_ASSIGN].join("; ");
      out.fields.push({ quote: r.owner.trim() || "(empty)", message: `recommendation ${i + 1}: owner must be one of the owners in the results: ${allowed}` });
    }
    if (!EFFORTS.some((e) => e.toLowerCase() === r.effort.trim().toLowerCase())) {
      out.fields.push({ quote: r.effort.trim() || "(empty)", message: `recommendation ${i + 1}: effort must be Low, Medium or High` });
    }
  });
  return out;
}

/** True when the section has nothing that blocks approval (claim warnings never block). */
export const sectionBlocks = (c: SectionCheck) => c.numbers.length + c.references.length + c.fields.length > 0;
