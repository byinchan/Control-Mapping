# Changelog and decision log

Decisions, defaults and mapping differences. Bernadette makes the final call on mappings.

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
