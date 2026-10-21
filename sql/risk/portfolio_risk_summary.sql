-- Illustrative Exasol scoring view. Clamp component expressions to [0,100]
-- in the production feature pipeline; weights match backend/domain.mjs.
CREATE OR REPLACE VIEW risk.borrower_scores AS
WITH components AS (
 SELECT f.*,
  LEAST(100,GREATEST(0,COALESCE(dpd_30_count,0)*9 + COALESCE(dpd_60_count,0)*14 + (1-COALESCE(payment_ratio_90d,1))*70)) AS repayment_score,
  LEAST(100,GREATEST(0,GREATEST(0,-cashflow_growth_3m)*130)) AS cashflow_score,
  LEAST(100,GREATEST(0,GREATEST(0,receivable_growth_3m)*65)) AS receivable_score,
  LEAST(100,GREATEST(0,GREATEST(0,-revenue_growth_3m)*85 + GREATEST(0,-margin_change_3m)*100)) AS business_score,
  LEAST(100,GREATEST(0,(buyer_concentration-.35)*140)) AS concentration_score,
  COALESCE(t.transaction_anomaly_score,0) AS transaction_anomaly_score
 FROM features.borrower_risk_features f
 LEFT JOIN features.transaction_features t
   ON t.borrower_id=f.borrower_id AND t.month=f.month
), weighted AS (
 SELECT borrower_id, month, outstanding_exposure,
       repayment_score, cashflow_score, receivable_score, business_score,
       concentration_score, transaction_anomaly_score,
       ROUND(repayment_score*.25 + cashflow_score*.20 + receivable_score*.20 +
             business_score*.15 + concentration_score*.10 + transaction_anomaly_score*.10,1) AS risk_score
 FROM components
)
SELECT borrower_id, month, outstanding_exposure,
       repayment_score, cashflow_score, receivable_score, business_score,
       concentration_score, transaction_anomaly_score, risk_score,
       CASE WHEN risk_score >= 80 THEN 'CRITICAL' WHEN risk_score >= 60 THEN 'HIGH'
            WHEN risk_score >= 30 THEN 'MODERATE' ELSE 'LOW' END AS risk_tier,
       RANK() OVER (PARTITION BY month ORDER BY risk_score DESC) AS portfolio_priority
FROM weighted;

-- Portfolio summary / cohort cuts.
SELECT month, risk_tier, borrower_type, state, COUNT(*) AS borrowers,
       SUM(outstanding_exposure) AS exposure, AVG(risk_score) AS avg_risk
FROM risk.borrower_scores s
JOIN curated.borrower_monthly c USING (borrower_id, month)
GROUP BY month, risk_tier, borrower_type, state;
