# RuralLens

**Don't just predict rural credit risk. Understand it. Act on it. Learn from it.**

RuralLens is a rural lending intelligence MVP that monitors synthetic borrowers, highlights emerging risk, investigates evidence, simulates scenarios, and records human-reviewed interventions. It is decision support; authorized credit personnel retain all decisions.

## Problem statement

CXOs at rural lending institutions can’t get a clear, timely view of portfolio health because today’s approach relies on fragmented reports and detailed account-level reviews to reveal risks and pending actions.

If this worked, they could see portfolio performance, emerging risks, and intervention progress at a glance, then direct the right teams without digging into individual accounts.

## Exasol connection

An explicit Exasol backend and SQL scoring pipeline are available. See [connection setup and validation](docs/EXASOL.md). The application uses local mode until a live import is verified and Exasol mode is selected.

## Start locally

Requirements: Node.js 20 or newer. The app uses built-in Node modules and has no install step.

```bash
node backend/server.mjs
```

Open <http://localhost:3000>. On the first run, the server prints a one-time administrator setup token in its terminal. Enter that token on the sign-in page and choose an administrator username and password (12 characters or longer). Keep the server terminal open during setup; the token is regenerated if the server restarts before setup is completed. Sign in, add the shown TOTP secret to an authenticator app, and verify a code. The app requires this authenticator MFA for every account.

IT administrators create employee accounts from **IT administration**. A generated temporary password is displayed once for secure handoff; employees must change it at first sign-in and enroll an authenticator. For forgotten passwords, IT verifies the employee outside the app and issues a reset from that page. There is no public signup or self-service reset. Admins can also reset MFA, assign roles, deactivate accounts, and inspect the security audit log.

Default settings use 10,000 synthetic borrowers, 36 generated monthly periods, seed 42, local analytics, and a deterministic fallback investigation service. If using configured environment bootstrap instead, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` (12+ characters) before starting the server; keep secrets out of source control.

Copy `.env.example` as a reference for local environment configuration, then set variables in your shell (the server does not load `.env` files automatically). Supported settings include `PORT`, `DATA_BORROWERS`, `DATA_MONTHS`, `DATA_SEED`, `SESSION_TIMEOUT_MINUTES`, `LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_MINUTES`, `MFA_MAX_ATTEMPTS`, `AUDIT_MAX_EVENTS`, `AUTH_BOOTSTRAP_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `LOCAL_ANALYTICS_MODE`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, and `EXASOL_DSN`. Never commit `.env`, setup tokens, or credentials.

## Generate a dataset file

The server creates linked synthetic records in memory. To export the deterministic synthetic portfolio summary as JSON:

```bash
node scripts/generate-data.mjs --borrowers 10000 --months 24 --seed 42
```

This writes an ignored local file under `data/generated/`. Generator limits are 6–50,000 borrowers and 6–36 monthly periods. No real borrower data is used.

## Test and evaluate

```bash
node --test
```

The built-in test suite covers risk score bounds/tiers, deterministic generation, seasonal recovery, planted risk stories, scenario recomputation, and data consistency. Use the test runner above; no third-party packages are required.

## Demo

Follow [docs/DEMO.md](docs/DEMO.md). Start with `BRW-DEMO-001` to show receivable stress with stable revenue, evidence-backed investigation, scenario simulation, and an intervention timeline. Demo IDs `002`–`006` cover healthy seasonality, concentration, structural decline, transaction anomaly, and temporary false-positive recovery.

## Architecture and analytics

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes API, domain services, local repository, and Exasol analytical layers.
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) describes entities and score semantics.
- [docs/API.md](docs/API.md) documents routes and filters.
- `sql/curated`, `sql/features`, and `sql/risk` contain Exasol-oriented SQL examples with window functions, aggregation, ranking, and time-series comparisons. They are integration examples and have not been run against an Exasol instance.

The local generator creates compact related borrower-level loan, repayment, buyer, risk-event, and monthly metric records. It does not persist 500,000 individual bank transaction rows; the transaction-anomaly feature is generated from historical behavior and demonstrated by a planted synthetic scenario. The 36-month risk line is generated synthetic history with a seeded portfolio-wide cycle; it is not real historical performance. Product exposure/risk summaries derive from the generated loan records. DPD ageing assigns each generated loan once using the highest generated repayment DPD and is labelled as a demo proxy. Portfolio initialization now supplements the generated dataset with persistent, clearly synthetic NPA financial states and recovery scenarios. See [Provisioning and recovery](docs/PROVISIONING_RECOVERY.md) for supported rules, applicability assumptions and limitations. For a larger production ingest, load normalized source entities into Exasol RAW and build curated/features/risk tables through the supplied SQL pattern.

## AI investigation

The investigation endpoint uses approved domain data and returns structured evidence, counter-evidence, drivers, exposure, confidence, and recommended human follow-up. It works without an LLM key and never fabricates numeric claims. `LLM_*` environment fields are documented as future provider settings; a live LLM adapter is not included in this MVP.

## Authentication and production setup

Passwords use Node.js `scrypt`; MFA uses RFC 6238 time-based one-time passwords compatible with authenticator apps. Sessions are random server-side identifiers in HttpOnly, SameSite=Strict cookies, expire after configurable inactivity, and are invalidated on logout, password reset, MFA reset, or deactivation. Admin/user/session/audit data currently persists in local JSON files under ignored `data/generated/` files. A one-time token printed only when no users exist protects first-admin setup. Configure HTTPS and `NODE_ENV=production` before exposing a deployed instance; production cookies then include `Secure`. Do not expose the local HTTP demo to untrusted networks.

## Limitations and next steps

The local portfolio repository is generated in memory at startup. Interventions, account records, sessions, security audit events, and user preferences persist locally as JSON. Exasol connection management, transaction-level raw ingestion, an organization-managed identity provider, external support contacts, institution-approved production regulatory inputs/configuration, external LLM integration, and a validated credit model remain future work. The local JSON auth store is a demo implementation, not a hardened production identity platform. Synthetic scores are demonstrations, not credit advice or a production underwriting model.

## Portfolio provisioning and recovery

Portfolio now includes backend-derived SMA/NPA classification, versioned provisioning profiles, account financial details, recovery timelines, an explicit current stage, filters and aggregate metrics. All eleven requested recovery mechanisms are available as labelled synthetic demonstrations. The base generator remains unchanged; persistent supplemental scenarios ensure NPA coverage. See [configuration, API, sources and tests](docs/PROVISIONING_RECOVERY.md). Rules require institution compliance/legal/risk review before production use.

## Borrower analysis and personal settings

Borrower **Scenario simulation** opens editable receivable collection, cash-flow improvement and repayment-ratio assumptions with a component-by-component comparison. **Run investigation** opens a local evidence report including current NPA, provisioning and recovery context. Both provide downloadable JSON reports and save an audit reference. These are synthetic decision-support tools and do not change payments or regulatory classification.

Workspace Settings now saves appearance, accessibility, number display, landing page, portfolio page size/sort and in-app notification preferences per account. Theme changes apply immediately and save automatically. Other preferences require Save; Discard and Restore defaults are available. See [API documentation](docs/API.md) for validation and persistence details.

Team Profile lists real accounts in separate team cards. Administrators can rename teams and update membership; existing employees without a team appear under Unassigned. Interventions require an active person from the selected team. Home opens by default at the root URL and after sign-in; each user can select another start page in Settings.

## Team task workflow

CXO assigns tasks to one of the seven operational teams. Its department head selects an active member once; member reassignment is rejected. Only the assigned member can submit completion details, which immediately finishes the task and records its closure time. There is no separate CXO approval, redo or final-close action. Historical review and allocation records remain visible. Previously submitted tasks awaiting review migrate to finished tasks at their recorded completion time.

Only IT members manage accounts, teams and memberships. CXO and IT can appoint department heads. Teams see only their own interventions, including in notifications and borrower histories.

Task responses include `assignedOn`, `closedOn` and `turnaroundDays`. Turnaround is the whole number of elapsed 24-hour days, rounded down; under 24 hours is 0 days. Assignment means the original CXO assignment to the team. Existing closed tasks retain their historical closure timestamps. Unknown timing stays unavailable.

For an explicitly requested demo roster, stop the server and run `node scripts/seed-demo-teams.mjs` before restarting. Demo executives include CEO, COO, CRO, CFO and CTO, with a head/member pair per operational team. Existing accounts, credentials and history are retained. Temporary credentials are saved in ignored `data/generated/demo-team-credentials.json`; first sign-in requires a password change and MFA. The existing `demo.cxo.leader` login represents CEO.
