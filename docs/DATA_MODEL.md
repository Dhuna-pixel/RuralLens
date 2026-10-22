# Data model

Default generation creates 10,000 synthetic borrowers with 36 monthly periods. Each generated borrower has one loan record, so product-level borrower counts do not overlap in the current demo even though the aggregation uses stable borrower IDs and supports overlapping counts in future account data. Product exposure totals reconcile to total exposure.

The demo DPD bucket assigns the generated loan exposure once using the highest DPD among its synthetic repayment records. Current 0-DPD loans are excluded from overdue exposure; a record with missing/invalid DPD is left unclassified. This is only an illustrative account-level proxy, not an approved instalment-allocation rule.

NPA classifications, collateral/security details, regulatory rule versions, and existing provisions are not represented in this schema. Consequently NPA exposure and required/existing provision amounts cannot be calculated from the current data.

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
