-- Exasol rolling features using ordered analytic windows.
CREATE OR REPLACE VIEW features.borrower_risk_features AS
WITH monthly AS (
 SELECT c.*,
   LAG(revenue, 3) OVER (PARTITION BY borrower_id ORDER BY month) AS revenue_3m_ago,
   LAG(operating_cash_flow, 3) OVER (PARTITION BY borrower_id ORDER BY month) AS cashflow_3m_ago,
   LAG(receivables, 3) OVER (PARTITION BY borrower_id ORDER BY month) AS receivables_3m_ago,
   LAG(gross_margin, 3) OVER (PARTITION BY borrower_id ORDER BY month) AS margin_3m_ago,
   AVG(operating_cash_flow) OVER (PARTITION BY borrower_id ORDER BY month
      ROWS BETWEEN 11 PRECEDING AND 1 PRECEDING) AS prior_year_cashflow_avg,
   AVG(operating_cash_flow) OVER (PARTITION BY borrower_id, EXTRACT(MONTH FROM CAST(month || '-01' AS DATE))) AS same_month_cashflow_avg
 FROM curated.borrower_monthly c
), repayment AS (
 SELECT borrower_id,
   SUM(CASE WHEN days_past_due >= 30 THEN 1 ELSE 0 END) AS dpd_30_count,
   SUM(CASE WHEN days_past_due >= 60 THEN 1 ELSE 0 END) AS dpd_60_count,
   SUM(CASE WHEN days_past_due >= 90 THEN 1 ELSE 0 END) AS dpd_90_count,
   SUM(CASE WHEN due_date >= ADD_DAYS(CURRENT_DATE, -90) THEN paid_amount ELSE 0 END)
    / NULLIF(SUM(CASE WHEN due_date >= ADD_DAYS(CURRENT_DATE, -90) THEN due_amount ELSE 0 END),0) AS payment_ratio_90d
 FROM raw.repayments GROUP BY borrower_id
), concentration AS (
 SELECT borrower_id, MAX(buyer_share) AS buyer_concentration
 FROM (
   SELECT borrower_id, buyer_id,
      SUM(outstanding_amount) / NULLIF(SUM(SUM(outstanding_amount)) OVER (PARTITION BY borrower_id),0) AS buyer_share
   FROM raw.invoices WHERE outstanding_amount > 0 GROUP BY borrower_id, buyer_id
 ) x GROUP BY borrower_id
)
SELECT m.borrower_id, m.month, m.outstanding_exposure,
       r.dpd_30_count, r.dpd_60_count, r.dpd_90_count, r.payment_ratio_90d,
       (m.revenue / NULLIF(m.revenue_3m_ago,0))-1 AS revenue_growth_3m,
       (m.operating_cash_flow / NULLIF(m.cashflow_3m_ago,0))-1 AS cashflow_growth_3m,
       m.gross_margin - m.margin_3m_ago AS margin_change_3m,
       (m.receivables / NULLIF(m.receivables_3m_ago,0))-1 AS receivable_growth_3m,
       COALESCE(c.buyer_concentration,0) AS buyer_concentration,
       m.operating_cash_flow - COALESCE(m.same_month_cashflow_avg,m.prior_year_cashflow_avg) AS seasonality_adjusted_cashflow,
       m.revenue, m.inventory, m.receivables
FROM monthly m
LEFT JOIN repayment r ON r.borrower_id=m.borrower_id
LEFT JOIN concentration c ON c.borrower_id=m.borrower_id;
