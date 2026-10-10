# Project 4: AI-Assisted Control Mapping & Framework Alignment

## Decisions (final)
- STANDALONE: this repo (github.com/byinchan/Control-Mapping) is its own project with its own
  Vercel project. It must NOT import code from, link to, share keys with, or depend on any other
  portfolio project (including the AI-GRC risk workflow). Bernadette picks which project to show
  employers, so each must stand on its own. Do not read or copy from other repos.
- AI PROVIDER: Anthropic Claude API only. The project is built with Claude Code and powered by
  Claude. Env var: ANTHROPIC_API_KEY (server-side only, never NEXT_PUBLIC_).
- STORAGE: no accounts, no database, no saved sessions. Current browser tab only.

## What this is
A public demo in a GRC portfolio for Pacific Utilities Corporation (PUC), a FICTIONAL BC Crown
corporation. Author: Bernadette Chan, GRC Analyst. Hiring managers will use it, so it must be
reliable, cheap to run and safe on the open internet. Deployed on Vercel from GitHub.
Frameworks: NIST CSF 2.0, ISO/IEC 27001:2022 (Annex A), CIS Controls v8, SOC 2 Trust Services Criteria.
Baseline: 14 controls (C001-C014) from the v1 matrix in /v1. Keep those IDs. They are the sample data.

## Stack and conventions
- SAME TECH STACK as Bernadette's first portfolio project (built fresh here, never copied from it):
  Next.js 16 App Router, React 19, TypeScript 5.9, Tailwind CSS 4 (via @tailwindcss/postcss),
  Node's built-in test runner (node --test). Her first project pinned Next 16.3.6, React 19.3.0,
  Tailwind 4.3.3, TypeScript 5.9.3: start from those exact versions unless a security fix needs a
  newer one, and tell me if you change any. Check current docs rather than relying on memory.
  Keep dependencies minimal and justify each; no UI kit, no PDF library.
- Deterministic logic = pure functions in lib/ (framework-free, unit-tested). UI never computes scores.
- State: validated browser sessionStorage with a versioned key and a schema check on load; discard
  anything that fails validation. Lost when the tab closes: say so in the UI and README.
- AI route pattern: server-side only; strict JSON schema / tool use; runtime-validate every
  response; generic user-facing errors; log only status and request id, never user text.
- PDF: client-side, no server, no library. DEFAULT (chosen for speed): a dedicated print layout
  (@media print, Letter/A4) behind a "Download PDF" button that opens the browser print dialog
  (Save as PDF). Check that the report fits 2 pages by measuring rendered height. STRETCH upgrade:
  a small hand-written dependency-free PDF writer (as in her first project) for a true one-click
  download.
- Tests: node --test. CI runs tests + catalog validator before deploy.
- Preview: `npm run dev` for local preview. Vercel creates a preview deployment for every branch/PR;
  use branches and PRs so I can review the live preview before anything reaches main.
- Tone: a workflow and governance prototype, not a commercial GRC platform. Design the UI so the
  AI recommendation, the human decision and the calculated result are visibly separate.

## Workflow (human in the loop at every stage)
Control Intake -> AI-Assisted Mapping -> Analyst Review & Edit -> Analyst Confirmation ->
Deterministic Scoring -> Matrix & Gaps -> Executive Report (AI narrative) -> Analyst Edit &
Approval -> PDF download
1. INTAKE: analyst enters control name + description (optional owner/objective/activity).
   "Load PUC sample" loads the 14 v1 controls.
2. AI MAPPING: proposes requirement IDs per framework, each with a proposed rating and a one-line
   rationale. May ONLY choose IDs from the reference catalogs.
3. REVIEW: analyst edits everything (control fields, IDs via a searchable catalog picker,
   ratings, rationale). Badge per item: AI-suggested / Human-edited / Confirmed.
4. CONFIRM: only confirmed controls count in scores, matrix and report.
5. MATRIX/SCORES: pure code, no AI.
6. REPORT: 1-2 pages from CONFIRMED data only; every section editable; Approve, then PDF.

## Reference catalogs (source of truth for which IDs exist)
JSON in /reference with source URL, version, retrieval date. Never recall IDs from memory.
Validate every ID against them (API route, UI picker, CI test).
- NIST CSF 2.0: subcategory IDs + titles (US government work; attribute NIST).
- CIS Controls v8.1 (my file is v8.1.2, March 2025; call it "CIS Controls v8.1" in the UI and
  README): licensed CC BY-NC-ND 4.0, as stated on the license page of the PDF. Non-commercial only;
  credit CIS and link the license; modified or derived material may not be distributed. To stay
  clearly inside that: store safeguard IDs + my OWN short labels (no CIS text), credit CIS and link
  https://creativecommons.org/licenses/by-nc-nd/4.0/ on the notice page, keep the site
  non-commercial. Check that every CIS ID used in v1/ still exists in v8.1 and report any that
  changed or disappeared.
- SOC 2 TSC (AICPA, copyrighted): criterion IDs + my own short labels. No criteria text/points of focus.
- ISO 27001:2022 (copyrighted): Annex A IDs (A.5-A.8, 93 controls) + my OWN paraphrased labels.
In-app "Framework content notice" page: what is stored, attributions, "own paraphrase".

## Deterministic scoring (pure functions, unit-tested)
AI proposes, human confirms, CODE computes. Never let a model produce a score.
Per control, per framework, one rating: Full = 1.0, Partial = 0.5, None = 0,
N/A = excluded (analyst must give a reason).
Control score = mean of in-scope framework values. Status:
- Fully Aligned: score >= 0.9 and no framework rated None
- Gap Identified: score < 0.4, or any in-scope framework None with score < 0.5
- Partially Aligned: otherwise
Thresholds CONFIRMED by Bernadette for now (revisit only if real use cases need a deeper rule).
Keep them in one config file and show the rule in the UI.
Also compute per-framework coverage, status counts, controls with any None.
Back-test on the 14 v1 controls and show where the rule disagrees with my v1 labels (e.g. AI
Governance). Differences are for me to decide, not bugs.
"Alignment to frameworks" is not "control is implemented/effective". Say so in the UI.

## AI mapping route rules
- Use the cheapest Claude model that maps reliably (a Haiku-class model is the starting point;
  test against the 14 v1 controls before choosing). Check current Anthropic docs for model IDs,
  structured output / tool-use syntax and pricing. Do not rely on memory. Keep the model name in
  one env var/config so it can change.
- Constrain IDs to the catalogs in the prompt AND re-validate on the server; drop unknown IDs and
  tell the analyst how many were dropped.
- User text is DATA, never instructions (prompt injection). Cap input length and item counts.
- Budget: the real hard cap is the Anthropic account itself: Bernadette should fund only a small
  amount of credit and leave auto-reload off (she should verify this in the Console).
- Also build: per-IP rate limit, an app-level daily call cap, and a DEMO MODE with saved outputs
  for the 14 samples that the app switches to automatically when the key is missing, the app is
  rate-limited or the budget is exhausted.
- Label AI output "AI-generated, human-reviewed".

## Report rules
- Counts, scores and tables are computed by code. AI writes narrative only (interpretation,
  themes, prioritized recommendations with owner/rationale/effort), grounded in confirmed data;
  must not add controls, tools or facts not in the data. Validate that numbers quoted in the
  narrative match computed values; flag mismatches.
- Sections: Purpose & scope; Headline results; Strengths; Gaps & risks; Recommendations;
  Method & limitations. 1-2 pages max; warn if over. Per-section edit and regenerate.
- Footer: "Fictional organization. AI-assisted, human-reviewed." + a governance note describing the
  boundary between deterministic results and narrative synthesis.

## Governance principles (design requirements, not just README text)
The same six principles as Bernadette's first portfolio project, adapted. Each must be visible in
the product itself:
1. Human-Owned GRC Logic: analysts make the mapping and rating decisions. AI suggestions are
   advisory; every ID, rating and rationale is editable.
2. Human Approval Before Authoritative Records: only confirmed values enter the matrix, scores
   and report. Unconfirmed controls are excluded and shown as "Awaiting review".
3. Traceability and Auditability: the current tab retains source-to-record traceability (original
   control text, AI proposal, analyst edits, final confirmed mapping). It is NOT a durable audit trail.
4. Transparency About Uncertainty: gaps, assumptions, uncertainties and missing information stay
   explicit. The AI returns them per control, the UI shows them beside the mapping, and nothing is
   silently filled in.
5. Deterministic Over Generative Where Possible: ID validation, scoring, status, counts and every
   figure in the report are code. The model never calculates.
6. Data Minimization by Design: no database or server-side workflow store; the app never logs or
   persists user-entered text. Describe the AI provider's own data handling accurately in the
   README (check Anthropic's current terms; do not overclaim).

## Prototype boundaries and disclaimer
Disclaimer, verbatim, at the top of the README AND in the app footer/About page:
"This is a workflow and governance prototype, not a commercial GRC platform or an enterprise-ready product."
Boundaries (README section "Intentional prototype boundaries", plus a short version in the app):
no authentication or real role enforcement, no enterprise database, no durable persistence, no
production audit history, no enterprise integrations, no organizational taxonomies, no tenant
model, and no production security hardening beyond the basic public-demo safeguards (rate limit,
call cap, input validation, demo mode), which the README must describe honestly. No accounts and no
saved sessions: state lives only in the current browser tab and is lost when it closes.
Enterprise note: in a real environment these concepts could be implemented through an existing GRC
platform such as ServiceNow IRM, with integrations to enterprise data sources, identity and access
management, workflow approvals, audit logging and organizational taxonomies. ServiceNow is not
integrated in this project.

## README (write at the end)
Standalone, first person as Bernadette, same structure as her first project's README: opening
question, what it demonstrates, where AI helps and where it stops (AI assists with / the analyst
owns / deterministic logic handles), workflow with screenshots in docs/images, executive report,
architecture, the six principles, intentional prototype boundaries, closing reflection. Also the
framework content/copyright notice and a note that it was built with Claude Code and uses the
Claude API. Fictional organization; never imply professional experience or validated mappings.
Include a short, honest "About the sample data" paragraph in first person: Version 1 was my first
manual mapping; in this version I reviewed and corrected four sample mappings against the official
framework text (C002 NIST, C006 SOC 2, C012 SOC 2, C013 SOC 2); every change is recorded in
data/sample-corrections.json with the old IDs, new IDs and reason; and the draft ratings were
AI-drafted and reviewed by me. Keep it accurate to what has actually happened when the README is written.

## Showcase features (all in scope; keep each small)
The project must show two things to hiring managers: (1) I understand control mapping as a GRC
process, and (2) I know what should be AI, what should be deterministic code, and what must stay
human judgment.
1. WHO DECIDES WHAT: every workflow step and output carries a consistent badge: AI (suggests),
   Code (calculates), Analyst (decides), with a visible legend. Add a short "How it works" page:
   what control mapping is, the idea of one PUC control mapped to a requirement in each framework,
   what Full / Partial / None / N/A mean with one worked example, and the scoring rule in plain words.
2. AI vs ANALYST BASELINE: run the mapper ONCE offline over the 14 v1 controls with the chosen
   model, save the results as a static file (model name + date), and show a page comparing it to my
   v1 mappings per framework: exact match, overlap, AI-only IDs, analyst-only IDs, and the cases
   that differ. Static data, no live API call. State that v1 is one analyst's judgment, not ground truth.
3. VISIBLE GUARDRAILS: show when validation changes AI output ("2 suggested IDs were not in the
   catalog and were removed"), when input was truncated, and when demo mode or rate limiting is active.
4. CSV EXPORT of the confirmed matrix (confirmed controls only; v1 columns + ratings, score, status,
   rationale). Neutralize spreadsheet formula injection (prefix cells starting with = + - @).
5. README SCREENSHOTS: I take them at the end. Make every key state easy to reach: sample loader, a
   removed-ID warning, review screen, matrix, report.
6. "AI SAFEGUARDS & CONTENT NOTICE" page: plain, accurate, short. (a) The model is treated as an
   untrusted component: what is constrained, validated, capped and never logged. (b) Copyright
   approach per framework: what is stored, own labels, attributions. Describe only what is really
   built. No overclaims.

## Scope tiers and time box
Target: a working prototype in 2-3 working days (about 4-5 hours a day). Work from an approved plan
with minimal back-and-forth.
- MUST: catalogs + validator, scoring + tests, mapping API + demo mode, intake/review/confirm,
  matrix + gaps, report + edit + print-PDF, disclaimer/footer, README.
- SHOULD (small): showcase 1, 3, 6.
- STRETCH (cut these first if time runs short, and log it in CHANGELOG): showcase 2 and 4, the
  hand-written PDF writer.
Rules for speed:
- Run steps autonomously within the approved plan. Stop only at the end of each build-order step
  with a 5-line summary and a PR. Don't ask about choices that have a sensible default; record them
  in CHANGELOG.md.
- Time-box the three risky tasks to about 1.5 hours each: assembling catalogs, tuning the mapping
  prompt, and report/print layout. If a box is exceeded, ship the fallback (smaller catalog subset
  flagged as such, demo mode, simpler layout) and tell me.
- Catalogs: generate ISO Annex A IDs from the known numbering (A.5.1-A.5.37, A.6.1-A.6.8,
  A.7.1-A.7.14, A.8.1-A.8.34 = 93) and check the count. Draft my own short labels for ISO and SOC 2;
  I will spot-check about 10%. The official source files I downloaded are in reference-sources/ on
  my computer (git-ignored, never committed). Read them from there to build the catalogs. If a
  file is missing, or looks like the wrong version (it must be NIST CSF 2.0, CIS Controls v8,
  ISO/IEC 27001:2022, AICPA TSC), stop and tell me exactly what to provide.
- Until an API key is available, build and test against a mock mapper and demo data.

## Hard rules
1. Never invent framework IDs. Never copy ISO or AICPA text.
2. Keep v1 IDs C001-C014 stable. Original v1 files are never edited.
3. Branch + small commits + PR. Never push to main.
4. Tests for scoring, catalog validation, session-state validation and PDF page limit; CI runs them.
5. Log decisions and mapping differences in CHANGELOG.md. I make the final call on mappings.
6. This GitHub repo is PUBLIC. Your FIRST action in step 0 is to create .gitignore containing at
   least: reference-sources/, .env.local, .env*.local, node_modules/, .next/. Never commit raw
   framework source files (they are copyrighted); only the generated catalogs in /reference. Never
   commit API keys. Before every commit, check `git status` for anything under reference-sources/.

## Build order
Prefer thin vertical slices: after step 2, get ONE control through intake -> mapping -> review ->
score -> matrix end to end before widening to all four frameworks and the report.
0 setup  1 catalogs + validator  2 scoring + tests + v1 back-test  3 mapping API + demo mode
4 intake/review/confirm UI  5 matrix + gaps view  6 report + edit + PDF  7 hardening + deploy + README
