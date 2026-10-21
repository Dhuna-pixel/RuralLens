# API

All responses are JSON. The app binds to `PORT` (default 3000).

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Local mode and generated row count |
| GET | `/api/dashboard` | Portfolio totals, trends, tiers, events, priority queue |
| GET | `/api/portfolio` | Search/filter borrower page (`search`, `tier`, `type`, `state`, `driver`, `page`, `limit`) |
| GET | `/api/borrowers` | Borrower list alias |
| GET | `/api/borrowers/:id` | Borrower, loan, monthly metrics, repayments, buyers, events, risk and intervention history |
| GET | `/api/alerts` | Prioritized risk queue with portfolio filters |
| POST | `/api/borrowers/:id/investigation` | Deterministic evidence-backed structured investigation |
| POST | `/api/borrowers/:id/scenario` | Recompute a what-if; body `{ "collectLargest": true }` |
| GET | `/api/interventions` | Intervention log |
| POST | `/api/interventions` | Record a human-reviewed action; requires borrowerId and recommendedAction |

Unknown routes return 404. Invalid JSON, invalid intervention payloads, and oversized bodies return JSON errors. No credentials are required for local mode.
