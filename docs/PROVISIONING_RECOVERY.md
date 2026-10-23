# Portfolio provisioning and recovery

RuralLens now models current loan financial state in `backend/portfolio-store.mjs`, computes classifications and provisions in `backend/provisioning.mjs`, and validates recovery workflows in `backend/recovery.mjs`. The existing repository, authentication, MFA, sessions and intervention routes are reused. There is one loan per borrower in the current local model; borrower-wide arrears are represented explicitly for upgrade checks. A production multi-facility adapter must aggregate all facilities before supplying that input.

## Regulatory scope and sources

Authority reviewed on 23 October 2026: [RBI IRACP Directions 2025, updated 1 October 2026](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12948), ordinary-loan provisioning paragraphs 32, Base Layer paragraphs 44–48, Middle Layer paragraphs 52–55, Upper Layer paragraphs 56–58 and borrower-level upgrades paragraphs 23–26. The supplied [Panchal SK reference](https://panchalsk.com/blog/nbfc-asset-classification-and-provisioning) is secondary, not legal authority.

The request's 25/40/100 doubtful secured rates and additional unsecured sub-standard rate differ from the RBI ordinary-loan floor. They are supported only by the explicitly labelled `REQUEST-REFERENCE` demo profile. The RBI profiles use 10% sub-standard, doubtful secured 20/30/50%, uncovered 100%, and loss 100%. Standard BL is 0.25%, ML 0.40%; UL requires an explicit asset category and uses differentiated standard rates. BL sub-standard lasts up to 18 calendar months, ML/UL up to 12. Calendar anniversary boundaries are inclusive; progression occurs after the anniversary.

The default `RBI-ORDINARY-BL` assumes an NBFC-ICC Base Layer solely for the demo. The actual institution is unknown. No claim of RBI approval or institution compliance is made. The implemented ordinary-loan floor excludes lease/hire purchase, MFI, restructured loans, project finance, Ind AS adjustments, transferred assets and other special regimes. Flag these inputs `specialRegime: true` to return unavailable pending a dedicated approved profile. Institution compliance, legal and risk teams must review all configuration and input mappings before production use.

DPD follows the task's integer convention: 0 Standard, 1–30 SMA-0, 31–60 SMA-1, 61–90 SMA-2 and >90 NPA. SMA monitoring labels are separate from NPA status. The lending system's day-end overdue counting must be reconciled with RBI date examples before live ingestion. A valid NPA date is mandatory for delinquent accounts; an explicit reason and date are required for loss identification. An existing NPA remains NPA until own and all borrower principal/interest arrears are zero and no special upgrade restriction remains. Recovery status never drives classification.

Covered exposure is the lesser of secured outstanding and realisable security value. Uncovered exposure includes the original unsecured component and any security shortfall. Required provision = covered × configured covered rate + uncovered × configured uncovered rate, rounded to paise. Existing provisions are independent supplied balances. Shortfall and excess are non-negative account-level amounts; excess on one account does not hide shortfall on another.

## Persistent stores

All stores live under `DATA_STORE_DIR` (default `data/generated`, ignored by Git):

- `provisioning-rules.json`: schema version, active profile, explicit applicability assumption, versioned rule profiles with effective dates, source and verification date.
- `loan-provisioning.json`: account-keyed loan financial/classification inputs and stable synthetic scenario identifiers.
- `recovery-actions.json`: validated chronological actions with borrower/loan/portfolio IDs and explicit current state.
- `recovery-seeded.json`: per-account seeding markers; closing demo actions does not cause them to reappear on restart.
- `npa-coverage-report.json`: original account count, pre-supplement classification coverage, missing categories and added scenario IDs.
- Existing `security-audit.json`: recovery before/after events, rule selection and explicit provisioning calculation snapshots.

New stores use temporary-file rename writes and recovery mutations run through one process-local queue. Corrupt stores fail initialization rather than being silently reset. This is a single-server local JSON architecture; it does not provide multi-process transactions or a hardened immutable regulatory audit repository. Back up the entire store directory together. Do not run multiple servers against one directory.

## Demo generation

The base generator remains 10,000 borrowers, 36 months and seed 42. Initialization inspects persisted states and fills only missing synthetic states. Missing Standard/SMA categories and named NPA coverage scenarios are appended with seed-derived IDs. Original borrower IDs and stories are preserved. Scenarios cover new NPA, near sub-standard threshold, all three doubtful brackets, loss, unsecured, partial recovery, no action, proposed OTS and cleared arrears. Catalogue scenarios ensure every required action is demonstrable. These are coverage targets, not estimates of NPA prevalence.

`NPA_DEMO_ENABLED=false` disables supplementation and recovery seeding, while retaining previously persisted scenarios. `NPA_DEMO_SCENARIOS` controls the number of the twelve named financial scenarios (0–12, default 12); catalogue coverage is separately maintained while enabled. The current application is a synthetic repository; never use this initializer to create state for imported real borrowers. Persisted inputs and manually recorded recovery actions are preserved across initialization. Date anchors are persisted; DPD is a supplied snapshot, not inferred cash-ledger servicing.

Recovery entries are conspicuously synthetic and contain no case numbers, filing references, court orders or real legal outcomes. The catalogue indicates a demonstration mechanism, not legal eligibility. An institution must determine applicability outside this demo.

## Rules configuration

Administrators can select a profile in Portfolio. This explicitly changes the demo applicability layer on synthetic states and writes an audit event. Employees can view configuration. Unsupported or missing entity/layer/date/category data produces unavailable, not zero provision. For new regulatory versions, stop the server, back up the directory, add a new profile with a unique ID/version and effective interval to `provisioning-rules.json`, validate it with tests, restart and select it. Retain older versions for audit. No percentages live in frontend code. Rules and calculation input snapshots are visible in borrower details; the explicit provisioning GET also writes a snapshot to the existing audit log.

## Recovery workflow

Canonical catalogue: SARFAESI, DRT, IBC, CIVIL_COURT, LOK_ADALAT, SECTION_138_NI_ACT, WILFUL_DEFAULTER, CRIMINAL_ACTION, OTS, ARC, SDR. Full names are shown in the UI. All authenticated employees may record actions, consistent with existing intervention permissions; rule selection requires administrator access.

Only one active action per borrower is supported. Start Planned or Initiated, progress through the server transition map, then close/withdraw/mark recovered/failed before starting a successor. Terminal actions cannot be current or edited. Historical records remain on the timeline. Terminal updates automatically clear current. Arbitrary statuses and parallel workflows are rejected. Current state is explicit, never inferred from timestamps. Dates, identities, finite non-negative amounts, allowed departments, types and field sizes are validated on the server. Each amount recovered is incremental for that action, not cumulative across every historical row. Action reporting does not post payments or alter outstanding loan state.

To extend the catalogue, add a canonical identifier and label to `ACTIONS`, review any status transition differences, add tests and document legal eligibility; the API, filters and form derive options from the catalogue.

## APIs (all require completed MFA session)

| Route | Behavior |
|---|---|
| GET `/api/regulatory-rules` | Configuration, full action labels and validated status catalogue |
| PUT `/api/regulatory-rules/active` | Admin only, body `{ "profileId": "RBI-ORDINARY-BL" }` |
| GET `/api/borrowers/:id/provisioning` | Calculated details, inputs, rule metadata and audit snapshot |
| GET `/api/borrowers/:id/recovery-actions` | Ascending chronological history and explicit current action |
| POST `/api/borrowers/:id/recovery-actions` | Create validated workflow action |
| PATCH `/api/recovery-actions/:id` | Update active action using transition validation |
| GET `/api/portfolio/provisioning-summary` | Reconciled classification/provisioning/NPA metrics |
| GET `/api/portfolio/recovery-summary` | Current action counts/exposure including NONE |
| GET `/api/portfolio` | Existing filters plus classification, recovery, provision, sort, order |

Recovery POST fields: actionType, stage, status, current, actionDate, effectiveDate, amountRecovered, amountOutstanding, responsibleDepartment, owner, notes, source. Dates are YYYY-MM-DD. IDs, synthetic flag and audit fields are server-owned. PATCH accepts the same editable fields; type cannot change. Nonexistent IDs return 404, workflow conflicts 409 and invalid values/transitions 400.

Portfolio filters: `classification=NPA|Standard|SMA-0|SMA-1|SMA-2|Sub-standard|Doubtful|Loss`; `recovery=NONE|<canonical action>`; `provision=adequate|shortfall|fully`; `sort=risk|dpd|outstanding|provision|shortfall`; `order=asc|desc`. Existing pagination remains `page` and `limit` (maximum 100).

Gross NPA is the sum of NPA-classified outstanding and its ratio uses total modelled outstanding. Net NPA is unavailable because interest suspense, eligible deductions and regulatory net advances are not modelled. Recovery rate is unavailable without a valid opening recoverable pool and cash ledger. Provisioning totals identify unavailable accounts and are partial when configuration is incomplete.

## Verification

Run `node --test` from the repository root. Tests cover DPD boundaries, calendar ages, financial reconciliation, covered/uncovered exposure, BL/ML/UL and reference profiles, shortfall/excess, blocked/eligible upgrades, all eleven recovery types, invalid transitions, current uniqueness, serialized writes, nonexistent IDs, persistence, repeat initialization, demo coverage, totals, authenticated routes, MFA and existing application regressions. Start `node backend/server.mjs`, open Portfolio, select NPA, sort by DPD and open an account to verify the rule details and recovery timeline. Existing notifications and intervention screens continue to use their original APIs.
