# API

All application APIs return JSON. Protected routes require a valid RuralLens session cookie; role-management routes also require an administrator role. Auth cookies are HttpOnly and SameSite=Strict, and include Secure when `NODE_ENV=production`. The server binds to `PORT` (default 3000). No CORS access is enabled.

## Public authentication routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/auth/setup-status` | Indicates whether first-administrator setup is still required |
| POST | `/api/auth/bootstrap` | One-time first-admin creation using the token printed at initial startup or configured through environment |
| POST | `/api/auth/login` | Validate username/password and start a short-lived password/MFA challenge |
| POST | `/api/auth/password-change` | Change an issued temporary password before dashboard access |
| POST | `/api/auth/mfa/verify` | Enroll or verify an RFC 6238 authenticator code and establish a session |
| GET | `/api/auth/session` | Validate the current session and return the account role |
| POST | `/api/auth/logout` | Invalidate the server-side session and clear cookies |

## Protected data routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Local mode and generated row count |
| GET | `/api/dashboard` | Portfolio totals, 36-month synthetic average-risk history, product summaries, DPD buckets, and NPA availability metadata |
| GET | `/api/portfolio` | Search/filter borrower page (`search`, `tier`, `type`, `state`, `driver`, `page`, `limit`) |
| GET | `/api/borrowers` | Borrower list alias |
| GET | `/api/borrowers/:id` | Borrower, loan, monthly metrics, repayments, buyers, events, risk, and intervention history |
| GET | `/api/alerts` | Prioritized risk queue with portfolio filters |
| GET | `/api/intervention-eligible` | Current High/Critical borrower IDs for intervention entry |
| POST | `/api/borrowers/:id/investigation` | Deterministic evidence-backed structured investigation |
| POST | `/api/borrowers/:id/scenario` | Recompute a what-if; body `{ "collectLargest": true }` |
| GET | `/api/interventions` | Intervention log |
| POST | `/api/interventions` | Record a human-reviewed action; validates risky borrower, team and active assigned member |
| GET/PUT | `/api/preferences` | Read or save the signed-in user's compact-table preference |

## Administrator-only routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET/POST | `/api/auth/users` | List accounts / provision an employee or administrator with a one-time temporary password |
| POST | `/api/auth/users/:username/reset` | Issue a temporary password and invalidate sessions |
| POST | `/api/auth/users/:username/mfa-reset` | Reset authenticator enrollment and invalidate sessions |
| POST | `/api/auth/users/:username/deactivate` | Deactivate an account and invalidate sessions |
| PATCH | `/api/auth/users/:username/role` | Change employee/admin role |
| GET | `/api/auth/audit` | View recent security audit events |

Passwords, MFA codes, and session tokens are not stored in the audit log. Login and MFA attempts use configurable temporary rate limits. JSON local persistence is intended for the demo; deploy behind HTTPS and use a production identity/data store before handling real borrower information.

## Portfolio provisioning and recovery extension

See [Provisioning and recovery](PROVISIONING_RECOVERY.md) for the integrated services, persistent stores, classification and calculation semantics, API routes and regulatory scope.

## Borrower analysis and account preferences

- `POST /api/borrowers/:id/scenario`: body accepts `collectionPercent`, `cashflowImprovement` (percentage points), and `paymentRatio` (percent), each a finite number from 0 to 100. The legacy `collectLargest` boolean remains supported. Returns baseline/projected score, tiers and components, changes, assumptions, current regulatory context, report ID and timestamp. Simulation never posts payments or updates account classification or balances.
- `POST /api/borrowers/:id/investigation`: local evidence review, behavioural drivers, NPA/provisioning/current recovery context, counter-evidence and human follow-up. No external LLM is called. Returns a persisted report ID and timestamp.
- `GET /api/borrowers/:id/analyses`: metadata for the latest twenty saved analyses for the borrower. Reports persist in `analysis-reports.json`; concurrent writes are serialized. Completed runs are linked from the existing security audit log.
- `GET /api/preferences`: returns the signed-in account's preferences, with defaults for older accounts.
- `PUT /api/preferences`: partial updates to `compactTables` (boolean), `theme` (`system`, `light`, `dark`), `textSize` (`standard`, `large`), `reducedMotion` (boolean), `numberFormat` (`compact`, `full`), `landingPage` (`home`; older values migrate to Home), `pageSize` (25, 50, 100), `portfolioSort` (`risk`, `dpd`, `outstanding`, `shortfall`), `notifyRisk` and `notifyInterventions` (booleans). Unknown fields and invalid values return 400. Preferences persist with the existing user record and updates are audited.

All routes require an authenticated MFA session. Unknown borrowers return 404. The scenario and investigation dialogs support JSON downloads, visible progress, retry/error states, keyboard dismissal and focus trapping. Theme selection applies immediately and saves automatically with rollback on error. Other settings include explicit save, discard and restore-defaults controls; restore defaults requires saving before it affects the account. Notification settings affect the in-app menu, not alert generation. Financial detail/provisioning values remain exact; summary number display follows the account preference. Portfolio and Risk alerts support previous/next pages using the saved page size. Account security policy is still managed by IT administrators.

### Teams and person assignments

Authenticated `GET /api/teams` returns the actual account directory grouped by team, plus unassigned employees. Administrators can `PATCH /api/teams/:id` with `name` and `description`, and `PUT /api/team-members/:username` with `teamId` (or null). Team IDs remain stable when display names change. Existing administrators default to IT Administration; employees without recorded membership appear as Unassigned.

`POST /api/interventions` requires `borrowerId`, `recommendedAction`, `teamId` and `assignedMember` (username). The member must be active and belong to the selected operational team. Historical records without a member remain visible. `GET /api/interventions` includes `total`. Root visits and successful sign-ins open Home; explicit page links are preserved.
