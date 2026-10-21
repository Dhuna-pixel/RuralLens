# RuralLens implementation plan

## Architecture

Build a dependency-light Node.js MVP: a JSON REST API and a responsive vanilla-JavaScript web app. A deterministic synthetic data service supplies borrower, loan, repayment, transaction, invoice, monthly business metric, event, risk score, and intervention records. Repository/service boundaries keep API handlers separate from scoring and investigation logic. Exasol-oriented SQL demonstrates the production analytical path; local mode runs without credentials or network access.

## Data model

Generate borrower profiles and linked loans, repayments, transactions, invoices, monthly metrics, risk events, risk scores, and ground-truth scenario labels. Six stable `BRW-DEMO-*` records demonstrate seasonality, receivable stress, concentration, structural decline, transaction anomalies, and recovery. Use a seeded PRNG and configurable borrower/month counts.

## Frontend

Create a professional portfolio command center with dashboard, searchable portfolio, borrower investigation detail, alert queue, and intervention capture. Keep navigation and actions functional; display evidence and human-review language throughout.

## Backend

Expose dashboard, borrower list/detail, alerts, investigation, scenario simulation, and intervention APIs. Validate query/body inputs and persist interventions locally in a JSON store.

## Analytics

Implement modular 0–100 component scores with the specified 25/20/20/15/10/10 weights, tiering, risk drivers, seasonal comparison, and an Exasol-compatible SQL feature pipeline.

## AI agent

Use an approved-tool investigation service that reads the analytical repository and assembles evidence-backed JSON. Deterministic fallback is always available; no unsupported LLM claims or autonomous credit actions.

## Testing

Use Node's built-in test runner for score weights/tiers, seasonality and planted archetypes, scenario recomputation, API routes, persistence, and basic data integrity. No external test dependencies.

## Demo

Document a deterministic end-to-end story for `BRW-DEMO-001`: identify liquidity stress, inspect retrieved evidence and counter-evidence, simulate receivable collection, record a human-reviewed intervention, and see it in history.

## Milestones

1. Repository foundation and reproducible synthetic generator.
2. Risk features, scoring, SQL analytics, and tests.
3. API, investigation agent, and intervention persistence.
4. Dashboard, portfolio, alerts, and borrower detail UI.
5. Documentation, test run, demo validation, and Git review.
