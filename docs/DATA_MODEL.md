# Data model

The generator creates linked synthetic records under an in-memory repository. Identifiers are stable for each seed and no real customer data is used.

| Entity | Key and relationships | Representative fields |
| --- | --- | --- |
| Borrower | `borrowerId` | type, state, district, segment, vintage, archetype, ground-truth risk type |
| Loan | `loanId`, borrower FK | product, sanctioned/disbursed/outstanding amount, rate, tenure, status |
| Repayment | borrower/loan relationship | due date, paid and due amount, days past due, status |
| Business metric | borrower + month | revenue, purchases, margin, inventory, receivables, operating cash flow |
| Invoice | borrower + buyer | invoice amount, paid amount, balance, age represented by days late |
| Counterparty | buyer identifier | buyer name, concentration share, exposure, days late |
| Risk event | borrower relationship | type, severity, source, description, resolution status |
| Risk score | borrower + score date | weighted total, six component scores, tier, factors |
| Intervention | borrower relationship | action, owner, date, status, notes/outcome |

The current UI uses representative repayment rows, monthly metric series, buyer rows, and event records generated as related borrower features. The separate Exasol SQL path documents how to curate normalized source entities into a borrower-month analytical feature table. Generated values are illustrative only.

Risk score is `0.25 * repayment + 0.20 * cash flow + 0.20 * receivables + 0.15 * business + 0.10 * concentration + 0.10 * transaction anomaly`. Each component is clamped to 0–100 before weighting. Tiers: LOW 0–29, MODERATE 30–59, HIGH 60–79, CRITICAL 80–100.
