-- Monthly transaction baseline and volatility features in Exasol.
CREATE OR REPLACE VIEW features.transaction_features AS
WITH monthly AS (
 SELECT borrower_id, TO_CHAR(TRUNC(transaction_date,'MM'),'YYYY-MM') AS month,
        SUM(CASE WHEN transaction_type='CREDIT' THEN amount ELSE 0 END) AS credit_volume,
        SUM(CASE WHEN transaction_type='DEBIT' THEN amount ELSE 0 END) AS debit_volume,
        SUM(amount) AS transaction_volume, COUNT(*) AS transaction_count,
        STDDEV_POP(amount) AS amount_volatility
 FROM raw.transactions
 GROUP BY borrower_id, TO_CHAR(TRUNC(transaction_date,'MM'),'YYYY-MM')
), baseline AS (
 SELECT monthly.*,
        LAG(transaction_volume,3) OVER (PARTITION BY borrower_id ORDER BY month) AS volume_3m_ago,
        AVG(transaction_volume) OVER (PARTITION BY borrower_id ORDER BY month
          ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS baseline_volume
 FROM monthly
)
SELECT borrower_id, month, credit_volume, debit_volume, transaction_count,
       amount_volatility,
       LEAST(100,GREATEST(0,
         ABS(transaction_volume-COALESCE(baseline_volume,volume_3m_ago))
           / NULLIF(COALESCE(baseline_volume,volume_3m_ago),0)*70
         + amount_volatility / NULLIF(transaction_volume,0)*30)) AS transaction_anomaly_score
FROM baseline;
