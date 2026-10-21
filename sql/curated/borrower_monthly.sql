-- Exasol curated borrower-month table. Source tables are raw.borrowers,
-- raw.loans, raw.business_metrics, raw.repayments, raw.invoices,
-- raw.transactions and raw.counterparties.
CREATE OR REPLACE VIEW curated.borrower_monthly AS
SELECT b.borrower_id, m.month,
       b.borrower_type, b.state, b.district, b.business_segment,
       SUM(l.outstanding_amount) AS outstanding_exposure,
       m.revenue, m.purchases, m.gross_margin, m.inventory,
       m.receivables, m.payables, m.operating_cash_flow
FROM raw.borrowers b
JOIN raw.business_metrics m ON m.borrower_id = b.borrower_id
LEFT JOIN raw.loans l ON l.borrower_id = b.borrower_id AND l.status = 'Active'
GROUP BY b.borrower_id, m.month, b.borrower_type, b.state, b.district,
         b.business_segment, m.revenue, m.purchases, m.gross_margin,
         m.inventory, m.receivables, m.payables, m.operating_cash_flow;
