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
| POST | `/api/interventions` | Record a human-reviewed action; validates risky borrower and department |
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
