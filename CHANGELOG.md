# Changelog and decision log

Decisions, defaults and mapping differences. Bernadette makes the final call on mappings.

## Step 4: Intake, review and confirm screens (2026-10-10)

### Wording and validation changes after Bernadette's testing (no change to scoring or the data model)
1. **Batch button:** "Ask AI to map controls" (no count), with the helper line "The AI fills in all four
   frameworks for each control. You review and edit everything before confirming." The single-control button
   reads "Ask AI to map this control".
2. **"Check this" notices in plain language with framework display names.** For example: "CIS Controls
   v8.1: the AI said this framework has no requirement on this topic, but it also listed requirements from
   it. Decide which is right: remove the IDs, or change the rating."
   - Display names live in `lib/catalog/names.ts` and are used in every message and History line.
   - A test checks that no internal ID such as `cis-v8.1` appears in blockers, warnings or History.
   - Suggestions saved in a tab before this change keep their old warning text. A fresh tab shows the new
     wording.
3. **Rationale required:**
   - A control can't be confirmed unless every rated framework (Fully meets, Partly meets, Does not meet)
     has a non-empty rationale. For "No requirement here", the required reason counts instead.
   - The red "Not ready to confirm: n things to fix" box lists every blocker at once in plain language.
     After the first attempt it updates live as each one is fixed.
   - Tests cover an empty rationale on Fully meets and Does not meet, a whitespace-only rationale, and the
     reason-counts case.
4. **Rating display labels** (stored values `full/partial/none/na` and scoring unchanged): Fully meets,
   Partly meets, Does not meet, No requirement here.
   - The helper text for the selected value appears under the dropdown.
   - A one-line ratings key sits under the AI/Code/Analyst legend.
   - The scoring rule text uses the new labels. The matrix, report and CSV (steps 5-6) will use the same
     `RATING_LABELS` and `RATING_HELP`.
5. **Re-run button:** "Replace with a new AI suggestion", with helper text saying it replaces the
   requirement IDs, ratings, rationales, uncertainties and missing information for all four frameworks; the
   control text is unchanged; and the current suggestion stays in History. The edit dialog spells out that
   "Keep my edited frameworks" protects the IDs, rating, rationale and reason in the named frameworks,
   while the other frameworks, uncertainties and missing information are replaced.

### Revision after Bernadette's testing (guided flow)
- **Guided flow with real routes** (the browser Back button works):
  - `/` start screen with exactly two choices, Choose sample controls and Enter your own control, plus
    "Continue reviewing (n)" when the tab has controls. No tutorials or videos.
  - `/samples` checklist with Select all, a live "n of 14 selected" count, and Continue (disabled at 0).
    Samples already added are greyed out.
  - `/new` for your own control.
  - `/review` with a step indicator: Choose, Review & confirm, Matrix & gaps, Report. The last two show as
    locked until at least 1 control is confirmed, and as "coming next" until steps 5-6 exist. It also has a
    compact control list with status dots and "+ Add controls".
- **Control text** collapses to a one-line summary with "Edit text", so the mapping sits higher.
- **History:** renamed to "History for this control" ("Kept in this browser tab only."), collapsed, with
  plain sections: What was entered, AI suggestion, Earlier AI suggestions, Changes and decisions.
- **AI original suggestion:** shown only for frameworks where the analyst's values differ from it, always
  collapsed, labelled "Original suggestion (you changed this)" next to the AI badge.
- **"Get a new AI suggestion"** (was "Ask AI again"), with the note "AI choices and wording can vary between
  runs. A new suggestion replaces the current one." Demo mode says it returns the same saved suggestion.
  When the analyst has edited frameworks, an in-page choice replaces the browser pop-up: Keep my edited
  frameworks and replace the rest, Replace everything, or Cancel.
- **At most 3 AI suggestions per control:** the current one plus the last 2 in short form (IDs and
  ratings per framework). This keeps tab storage small: about 64 KB for 15 controls, far below the
  browser limit even at 50 controls. Storage key is now `...:v2`; v1 tab data is ignored.
- **Per-visitor limit while suggesting several controls:** the server now returns a reason code
  (`rate-limited`, `unavailable`, `invalid-output`, `bad-request`) and, in demo mode, `demoReason`. The batch
  no longer stops at the first problem: it carries on and ends with one friendly summary. "You've reached
  the AI suggestion limit for now" explains how many controls got live suggestions, how many sample
  controls got saved demo suggestions instead, which of the analyst's own controls were not sent ("wait a
  few minutes… or map them by hand"), and that nothing was lost. The single-control message uses the real
  configured limit ("20 every 10 minutes per visitor").
- **Click count to confirm all 14 samples,** accepting every suggestion as is: 32 clicks.
  - 4 to get started: Choose sample controls, Select all, Continue, Suggest with AI.
  - 1 to confirm C001, which is already open.
  - 26 to select and confirm each of the other 13.
  - 1 to remove C008's CIS ID 3.1, because the AI rated CIS N/A but still listed it.

  13 of 14 saved suggestions pass the confirm rules unchanged.

### Workflow state (`lib/workflow/`, pure and unit-tested; the UI only calls it)
- Each control keeps its **original text**, **current text**, the **AI proposal exactly as received**
  (mode, model, request id, guardrails, notices, and the text it was made for), the analyst's
  **working mapping**, the **confirmed snapshot** and a short **history**. That is the in-tab traceability
  from principle 3. It is not a durable audit trail, and the UI says so.
- Item badges: AI-suggested, Human-edited, Confirmed, Not mapped. Control status: Not mapped yet,
  Awaiting review, Confirmed. Only confirmed controls feed scoring (`confirmedRatings`).
- **Confirm is blocked** until every framework has a rating; N/A has a reason and no IDs; every other
  rating has at least one ID; and every ID is in the catalog. Confirmed controls are locked until reopened.
- Editing the control text after the AI suggestion marks the suggestion **stale**, with a visible warning.
- Analyst-entered controls get IDs A001, A002, and so on. Sample controls keep C001-C014. Limit: 50
  controls per tab.

### Tab storage (`lib/workflow/storage.ts`)
- `sessionStorage` under the versioned key `puc-control-mapping:workspace:v1`. Every load is
  schema-checked: shape, lengths, ratings, control ids, and every stored ID against the catalogs.
  **Anything that fails is discarded as a whole** and the analyst sees "Saved data in this tab failed
  validation and was discarded." Blocked storage (private mode) shows a warning instead of failing.
- Default: a React ref guards the one-time load so React's double effect run in development can't hide
  the discard notice. This was found during browser testing.

### Screens (`app/components/`)
- One workspace page: intake (Load PUC sample, or enter a control), a control list with status counts,
  and a review panel. The panel has five parts:
  1. Control text (Analyst).
  2. AI suggestion (AI), with mode badge, guardrail notices, and uncertainties and missing information
     shown next to the mapping.
  3. Per-framework editors (Analyst): searchable catalog picker that can only add catalog IDs, rating,
     N/A reason, rationale, and the AI's original suggestion kept visible ("analyst changed this").
  4. Confirm (Analyst), then the Code-calculated score and status with the limited-coverage flag and the
     "alignment, not implementation or effectiveness" note.
  5. Traceability.
- Legend at the top: AI suggests, Code calculates, Analyst decides. Footer: verbatim disclaimer, fictional
  organization note, short prototype boundaries.
- "Suggest mappings with AI (n)" maps all unmapped controls one at a time and stops on the first error.
  The per-IP limit of 20 per 10 minutes allows all 14 samples.
- The AI line reads "AI-generated, awaiting your review" until the control is confirmed, then
  "AI-generated, human-reviewed".

### Verified in the browser (dev server)
- Demo mode (no key): all 14 samples get saved suggestions with the demo and source notices. A custom
  control gets the "demo mode only covers unchanged samples" message.
- Confirm blockers, Human-edited badge, AI-original panel, confirmation with the code score (C001: 0.625,
  Partially Aligned), reload keeps the work, tampered storage is discarded with a notice, 375 px phone
  width has no horizontal scroll.
- Live mode: one real call (about $0.0005) for a custom control that mentioned outdated IDs (ISO
  A.9.2.5, CIS 18.6). The model ignored them, so the removed-ID warning did not appear.
- **Open point for screenshots (step 7):** the live model rarely produces invalid IDs, so the removed-ID
  warning is easiest to show with the mock mapper (`MAPPER=mock`, labelled "Mock mapper: not AI") and a
  description that mentions an outdated ID such as "ISO A.9.2.1".

## Step 3: Mapping API route and demo mode (2026-10-09)

### Model and API
- **Model: `claude-haiku-5-5`** (confirmed after the sample test below). It's the cheapest current Claude model ($0.10 / $0.50 per
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

### Model test on the 14 sample controls (2026-10-10)
Three live runs of `claude-haiku-5-5` over the 14 PUC sample controls, about $0.021 in total.
- **Reliability:** 42 of 42 calls returned schema-valid JSON, and no suggested ID was outside the
  catalogs (0 removed). Runs 1 and 2 used the same prompt and gave nearly identical results.
  Rationales are grounded in the control text, and uncertainties and missing information are specific.
- **Prompt fix after run 2:** the first prompt defined None and N/A almost identically, so the model
  forced loosely related IDs with "none" where the analyst has N/A. The prompt now matches the scoring
  meaning: None = the framework has requirements on the topic but the control doesn't meet them; N/A =
  the framework doesn't cover the topic. Empty optional fields are no longer sent, so the model no
  longer comments on them ("activity field is null"). In run 3, N/A appeared for C008 and C010 CIS
  (matching the analyst) and 0 uncertainties mentioned empty fields.
- **Remaining differences are judgment, for the analyst:** the model still proposes loose Partial matches
  where the analyst has N/A (C009 ISO/CIS; C014 ISO, CIS, SOC 2). It often suggests extra plausible IDs
  (e.g. RS.MA-01 for incident response, PR.DS-11 for backups). Once (C008 CIS) it said N/A but still
  listed an ID, which the sanitizer flags as a warning.
- Run 3 vs the analyst's sample mappings (56 cells): 9 exact, 33 overlap, 7 disjoint, 2 both N/A,
  5 N/A on one side only.
- **Decision: keep `claude-haiku-5-5`.** It is reliable on format and catalog IDs at about $0.0005 per
  control with caching. A stronger model would cost more without fixing the remaining differences, which
  are judgment calls for the analyst.

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
- **`data/demo-mappings.json` holds run 3** (approved by Bernadette, 2026-10-10). It's labelled "AI-generated,
  not reviewed" and records the model (`claude-haiku-5-5`), date (2026-10-10) and prompt version
  (`v2 (2026-10-10)`, also `PROMPT_VERSION` in `lib/mapping/prompt.ts`). Demo responses show the label,
  model, date and prompt version. The file's notes state two caveats:
  - **Not a blind test:** the prompt was refined once (v1 to v2) after the outputs of runs 1 and 2 on these
    same 14 controls were reviewed.
  - **Small sample:** 14 controls (56 cells), not evidence of how the mapper does on other controls.

  The same file is the static AI baseline for showcase 2 (AI vs analyst).

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

## Documentation notes

### README plan: "About the sample data" (2026-10-09)
Added to the README plan in CLAUDE.md at Bernadette's request: the README must include a short,
first-person "About the sample data" paragraph. It says Version 1 was her first manual mapping; that in
this version she reviewed and corrected four sample mappings against the official framework text (C002
NIST, C006 SOC 2, C012 SOC 2, C013 SOC 2); that every change is recorded in
`data/sample-corrections.json` with old IDs, new IDs and reason; and that the draft ratings were
AI-drafted and reviewed by her. The README itself is written in step 7.
