# Changelog and decision log

Decisions, defaults and mapping differences. Bernadette makes the final call on mappings.

## Step 3: Mapping API route and demo mode (2026-10-09)

### Model and API
- **Model: `claude-haiku-5-5` (provisional).** It's the cheapest current Claude model ($0.10 / $0.50 per
  million input / output tokens for prompts up to 100K, per Anthropic's pricing as of 2026-10-09) and
  supports structured outputs. CLAUDE.md asks for testing on the 14 v1 controls before the choice is final.
  That needs the API key (`npm run mapping:samples`). The model name is one setting (`MAPPING_MODEL`,
  default in `lib/mapping/config.ts`).
- **Dependency added: `@anthropic-ai/sdk` 0.131.0 (exact pin).** Anthropic's guidance for TypeScript
  projects is the official SDK rather than raw HTTP: typed errors, retries, timeouts. 0.131.0 was released
  9 days ago and was chosen over 0.133.0 (released today) as a supply-chain precaution. `npm audit`: 0
  vulnerabilities.
- Request settings: structured JSON output (`output_config.format` with a JSON schema whose objects all
  have `additionalProperties: false`), `effort: "low"`, `max_tokens` 4000 (Haiku 5.5 thinks by default and
  thinking counts toward the cap), no temperature (Haiku 5.5 rejects non-default values). The system
  prompt (rules plus all four catalogs, about 7.7K tokens) is identical on every call and marked for
  prompt caching.
- Estimated cost: about $0.001 per control, about $0.015 for the 14 samples. The daily cap of 300 calls
  limits the worst case to about $0.30 per day.

### Guardrails (all in `lib/mapping/`, unit-tested)
- **Model treated as untrusted:** output is checked against the schema at runtime, every ID is re-validated
  against the catalogs, and unknown IDs are removed and reported ("2 suggested IDs were not in the catalog
  and were removed: ..."). Refusals, cut-off answers and non-JSON output are rejected (502), never shown.
- **IDs are free strings in the schema, not an enum** of all ~400 catalog IDs. The prompt lists the catalogs;
  the server is the enforcement point. This keeps the schema small, and real model mistakes (e.g. ISO 2013
  numbering) are caught and shown rather than hidden by constrained decoding.
- **Nothing is silently filled in:** an N/A without a reason, an N/A with IDs, or a rating whose IDs were all
  removed becomes a warning for the analyst. No values are invented.
- **User text is data:** the control is sent as JSON inside `<control_data>`, with `<` and `>` escaped so it
  can't close the block. The system prompt tells the model to ignore instructions inside it.
- **Input caps:** name 120, description 1500, objective 500, activity 800, owner 80 characters (longer
  text is truncated and reported); body ≤ 16 KB (413); exactly one control per request; unknown fields
  rejected; control and bidi-override characters stripped.
- **Output caps:** 12 IDs per framework, rationale 300, N/A reason 200, at most 5 uncertainties and 5
  missing-information items.
- **Limits:** 20 requests per IP per 10 minutes (sliding window; IPs kept only as salted hashes in memory)
  and 300 live calls per UTC day. Both are in-memory per server instance, so they're a basic safeguard
  rather than a guarantee. The real cap is the Anthropic account's prepaid credit with auto-reload off.
- **Logging:** only `{route, requestId, status}`. No control text, model output or error details.
- **Key:** `ANTHROPIC_API_KEY` is read only on the server (`lib/mapping/server.ts`, `lib/mapping/anthropic.ts`).
  It is never returned, logged or prefixed with `NEXT_PUBLIC_`. `.env.example` documents the settings.

### Modes
- `live` (key set): Claude API. `mock` (`MAPPER=mock`): keyword-overlap mock mapper, labelled "not AI" in
  every rationale. It echoes ID-like text from the input, so the removed-ID warning can be reproduced
  without a key (e.g. type "ISO A.9.2.1" into a description).
- **Demo mode** (automatic): when no key is set, the per-IP limit or daily cap is reached, or the API is
  unavailable (billing, auth, rate limit, outage), the route serves the saved output from
  `data/demo-mappings.json`. It does so only for an unchanged PUC sample control. Custom controls get a
  clear 503/429 message. After a billing or auth failure, live calls pause for 10 minutes.
- **`data/demo-mappings.json` currently holds mock output** (labelled `mapper: "mock"`) as a placeholder.
  It will be regenerated from one live run once the key is available, which also gives the static AI
  baseline for showcase 2.

## Step 2: Scoring engine and v1 back-test (2026-10-09)

### Scoring engine
- `lib/scoring/config.ts` is the only place with rating values, thresholds (0.9 / 0.4 / 0.5) and the
  plain-English rule shown in the UI.
- `lib/scoring/score.ts`: `scoreControl`, `statusFor`, `validateRatings` (N/A needs a reason), and
  `summarize` (status counts, "Not scorable" list, controls with any None, per-framework in-scope /
  mapped / rating counts / coverage). Arithmetic is in integer half-points and hundredths, so the
  threshold boundaries are exact.
- Tests: exact boundary cases, worked examples, and all 256 rating combinations checked against
  invariants (N/A never changes the score; upgrading a rating never worsens the status; Fully Aligned
  never has a None).

### Draft v1 ratings: `data/v1-ratings.draft.json` (draft, pending Bernadette)
Drafted by Claude from the v1 control text and mapped IDs only, **not tuned to the v1 statuses**. Every
cell is marked "draft, pending Bernadette" and has a one-line basis. N/A cells keep the v1 reason verbatim.

### Sample mappings corrected (approved by Bernadette, 2026-10-09)
The PUC sample mappings were corrected for four cells. The original v1 files and the v1 transcription
(`data/v1-controls.json`) are unchanged. The corrections live in `data/sample-corrections.json` and are
applied by `lib/sample.ts`, which refuses a correction that no longer matches the v1 IDs it replaces.
| Control | Framework | v1 IDs | Corrected | New draft rating |
|---|---|---|---|---|
| C002 Vulnerability Management | NIST CSF 2.0 | PR.PS-02, ID.IM-04 | PR.PS-02, ID.RA-01 | Partial -> Partial |
| C006 Vendor Due Diligence | SOC 2 | P6.4, P6.5 | CC9.2 | None -> Partial |
| C012 Security Monitoring & SIEM | SOC 2 | CC4.1, CC4.2 | CC7.2 | Partial -> Full |
| C013 Endpoint Protection | SOC 2 | CC6.1, CC6.7 | CC6.8 | None -> Full |

C002 keeps PR.PS-02, adds ID.RA-01 and drops ID.IM-04 (Bernadette's revision). It stays Partial: ID.RA-01 is
covered, but maintaining or replacing software (PR.PS-02) is not described in the control text.
The re-rated cells use the same standard as the rest of the draft and were not tuned to the v1 statuses.
The other Partial cells are Bernadette's to review.

### Limited framework coverage flag (decided for C014)
Thresholds stay at 0.9 / 0.4 / 0.5. A control with exactly one framework in scope gets a "limited
framework coverage" flag (`LIMITED_COVERAGE_MAX_IN_SCOPE = 1` in config). The flag appears next to the
status and in `summarize`. It never changes the score or the status. C014 AI Governance is the only
sample control with the flag.

### Back-test result (for Bernadette to decide; these are not bugs)
6 of 14 match the v1 labels and 8 differ. With the draft ratings, the rule rates all 14 controls Partially
Aligned. The corrections raised three scores (C012, C013 to 0.875; C006 to 0.625) but changed no status.
C002 stays at 0.75. `npm run backtest` prints both tables.
1. **Fully Aligned needs every framework Full.** With four frameworks in scope, one Partial gives
   0.875 < 0.9. All seven v1 "Fully Aligned" controls (C001, C002, C005, C007, C011, C012, C013) have at
   least one Partial in the draft. Four of them (C005, C011, C012, C013) sit at 0.875, one Partial away.
2. **Broad CIS ranges pull ratings down.** v1 maps whole safeguard ranges (e.g. 17.1-17.8, 8.1-8.6 +
   13.7-13.10). A one-line control description rarely covers every safeguard, so CIS is Partial for 8 of
   the 10 controls with CIS IDs (C001 and C002 are Full).
3. **C014 AI Governance (disclosed disagreement):** v1 says Gap Identified. ISO, CIS and SOC 2 are N/A and
   excluded, so NIST alone (Partial, 0.5) gives Partially Aligned, now with the limited framework coverage
   flag.
4. **No control is a Gap under the rule.** Only C010 has a None (ISO A.5.4) and it scores 0.5.
5. **Still noted, unchanged:** C005 and C007 map to NIST ID.IM-04 only.

## Step 1: Reference catalogs and ID validator (2026-10-09)

### Catalogs in `reference/`
| File | IDs | Labels | Status |
|---|---|---|---|
| `nist-csf-2.0.json` | 106 subcategories (6 functions, 22 categories) | NIST outcome statements (public domain) | final |
| `iso-27001-2022.json` | 93 Annex A controls (37 + 8 + 14 + 34) | own paraphrase | draft, pending spot-check |
| `cis-controls-v8.1.json` | 153 safeguards (18 controls) | own short labels | draft, pending spot-check |
| `soc2-tsc-2017.json` | 61 criteria | own short labels | draft, pending spot-check |

- **NIST** is generated by `npm run build:nist` from `reference-sources/csf-export.json` (local only).
  The export repeats some subcategories without text and still lists withdrawn CSF 1.1 subcategories and
  categories. The script keeps the copy with text, drops the 91 withdrawn subcategories, and keeps only
  categories that still have active subcategories.
- **CIS, SOC 2, ISO** are hand-maintained JSON. CIS and SOC 2 IDs were checked one-off against text
  extracted from the PDFs (exact set match: 153 and 61). ISO IDs come from the numbering only.
- **Label wording:** every CIS/SOC 2/ISO label is my own wording, at most 80 characters (enforced).
  No CIS label is identical to a CIS safeguard title. I reworded the 8 labels that were most similar
  to the titles. The remaining closest matches are generic technical terms (e.g. "MFA for administrator
  access", "Threat modelling").
- **Source URLs:** checked on 2026-10-09 by fetching each page and reading its title. The CPRT tool
  (`https://csrc.nist.gov/projects/cprt/catalog`), the CIS v8.1 page and the AICPA 2017 TSC (2022)
  download page all resolve to the expected page. The NIST link was first written with a
  `#/cprt/framework/version/CSF_2_0_0` deep-link fragment. That fragment couldn't be verified (the tool
  is a single-page app), so it was dropped. The ISO page returns 403 to automated requests and is unverified.
- **Retrieval dates (confirmed by Bernadette):** CIS and SOC 2 PDFs 2026-08-03, NIST export 2026-10-09.
  Dates are fixed values, not read from file timestamps. ISO's `retrieved` is `null` because no ISO source
  was downloaded. The first draft had a made-up date there.

### Validator
- `lib/catalog/ids.ts`: `normalizeId` (spacing, dash characters, case, NIST zero-padding),
  `isValidId`, and `validateIds`, which returns valid IDs plus the list of dropped inputs. The API
  route, the picker and CI will all use these.
- `lib/catalog/v1.ts`: `parseV1Cell` expands CIS ranges within one control and keeps N/A reasons.
  Invalid ranges and N/A without a reason throw errors instead of being guessed.
- `lib/catalog/validate.ts` + `npm run validate:catalogs` (CI): shape, unique IDs, per-framework ID
  pattern, canonical form, groups, label length, exact counts held in code (not in the JSON), every CIS
  safeguard per control, every ISO number per theme, and every v1 ID resolves.
- `data/v1-controls.json`: the 14 v1 controls transcribed once from the xlsx, with raw cells verbatim
  and an independently produced parse that the tests compare against.

## Step 0: Scaffold (2026-10-09)

### Source files checked
- NIST CSF 2.0: `csf-export.json` (CPRT export, CSF_2_0_0 v2.0). 106 active subcategories after
  removing the 91 withdrawn v1.1 IDs. Correct version.
- CIS Controls v8.1: `CIS_Controls_Guide_v8.1.2_0325_v2.pdf` (v8.1.2, March 2025). 18 controls,
  153 safeguards. CC BY-NC-ND 4.0. Correct version.
- SOC 2: `Trust-services-criteria.pdf`, the 2017 TSC with Revised Points of Focus (2022), red-lined
  edition. 61 criteria (the P1.0 to P8.0 headings are excluded). Correct version.
- ISO/IEC 27001:2022: no source file. IDs will be generated from the numbering (93), with my own labels
  flagged as draft until they are spot-checked. Approved by Bernadette.

### v1 ID check
Every NIST, CIS and SOC 2 ID in the v1 matrix exists in the current catalogs. No CIS safeguard used in
v1 changed or disappeared in v8.1.

### Dependency versions
Same pins as the first project: react 19.3.0, react-dom 19.3.0, typescript 5.9.3, tailwindcss 4.3.3,
@tailwindcss/postcss 4.3.3. Dev-only type packages use caret ranges.

**Changed: next 16.3.6 → 16.3.8 (security fix).** `npm audit` reported a high-severity advisory range
covering next 16.0.0–16.3.7, including GHSA-cjq9-62q9-8jv4 (SSRF in image optimization),
GHSA-mcj8-r9mp-w47p and GHSA-4jqv-mc3x-m676 (cache poisoning), and GHSA-39w2-rjm5-chcv (dev-server
information disclosure). 16.3.8 is the nearest patched release (patch bump only). `npm audit` now
reports 0 vulnerabilities. Built and tested on Node 24.21.0 / npm 11.19.0.

### Spec defaults (approved by Bernadette)
1. N/A vs None: v1 "N/A (...)" cells stay N/A with the stated reason. AI Governance (C014) is then
   scored on NIST alone. This is a **disclosed back-test disagreement**, not a bug.
2. Every framework N/A: status "Not scorable", left out of status counts and listed separately.
3. Per-framework coverage: mean rating over confirmed controls where the framework is in scope, plus
   the count of controls with at least one mapped ID.
4. One rating per framework per control, even with several IDs.
5. NIST labels use the subcategory outcome statement (public domain; CSF 2.0 has no subcategory titles).
6. The app and README say "CIS Controls v8.1".
7. Pinned versions confirmed (see above).
8. CLAUDE.md and v1/ are committed. Before committing, the budget line was removed
   from CLAUDE.md and the second dollar figure was reworded to "a small amount of credit".
9. v1 mappings noted for later review, unchanged: C006 maps to SOC 2 P6.4/P6.5 rather than CC9.2;
   C005 and C007 map to NIST ID.IM-04 only.

### Tooling
- Tests run through `node --test` with Node 24 native type stripping; no test or transpile dependency.
  `erasableSyntaxOnly` in tsconfig keeps `lib/` code runnable that way.
- `.claude/settings.local.json` is git-ignored (local tool settings).
