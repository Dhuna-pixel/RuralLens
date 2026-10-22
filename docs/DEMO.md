# Demo flow

## First-time access setup

1. Start the server with `node backend/server.mjs` and keep its terminal open.
2. Open `http://localhost:3000`. Copy the one-time administrator setup token from the server terminal.
3. Create the first administrator using the token and a password of at least 12 characters.
4. Sign in. Copy the displayed TOTP secret into an authenticator app and verify its current six-digit code.
5. Use **IT administration** to provision demo employee accounts. Send each generated temporary password directly and securely to its verified user; they must change it and enroll MFA.

## Detect → Investigate → Explain → Act → Learn

1. Open the Home page for a summary, then select **Command center**.
2. Review total exposure and borrower counts by generated product, separate High and Critical counts/exposure, mutually exclusive DPD buckets, the 36-month average-risk trend, and the NPA-data limitation.
3. Select **Risk alerts**, search `BRW-DEMO-001`, and open Sundar Harvest Collective.
4. Review its synthetic HIGH tier and receivable, cash-flow, repayment, and concentration components. Revenue remains broadly stable.
5. Choose **Run investigation** to retrieve profile, exposure, repayment, cash-flow, ageing, buyer, business, historical, event, and score evidence.
6. Choose **Scenario simulation** to see the illustrative score after the two largest receivables are collected. Treat it as a what-if, not a forecast.
7. Open **Interventions**, select an eligible High/Critical borrower and one of Business, Credit, Risk, Collection, Recovery, or Legal, then record a human-reviewed follow-up.
8. Use the notification bell for current risk alerts and recorded intervention updates. Use the Credit Operations menu for Team Profile, Workspace Settings, and About RuralLens. Help and FAQs are in the sidebar and top bar.

Other seeded borrowers: `BRW-DEMO-002` healthy seasonal borrower, `BRW-DEMO-003` buyer concentration, `BRW-DEMO-004` structural decline, `BRW-DEMO-005` transaction anomaly, and `BRW-DEMO-006` temporary seasonal stress and recovery.

All portfolio records and the displayed 36-month trend are synthetic generated data. The DPD summary assigns each borrower loan once using its maximum generated repayment DPD. The demo does not include NPA classifications, collateral data, existing provisions, or approved prudential rates, so it does not calculate NPA provisioning.
