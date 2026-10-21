# RuralLens

**Don't just predict rural credit risk. Understand it. Act on it. Learn from it.**

RuralLens is a rural lending intelligence MVP that monitors synthetic borrowers, highlights emerging risk, investigates evidence, simulates scenarios, and records human-reviewed interventions. It is decision support; authorized credit personnel retain all decisions.

## Start locally

Requirements: Node.js 20 or newer. The app uses built-in Node modules and has no install step.

```bash
node backend/server.mjs
```

Open <http://localhost:3000>. `npm start` is also available when npm is installed. Default settings use 10,000 borrowers, 18 monthly periods, seed 42, local analytics, and a deterministic fallback investigation service.

Copy `.env.example` to `.env` only if you want local environment configuration, then set variables in your shell (the server does not load `.env` files automatically). Supported variables include `PORT`, `DATA_BORROWERS`, `DATA_MONTHS`, `DATA_SEED`, `LOCAL_ANALYTICS_MODE`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, and `EXASOL_DSN`. Never commit `.env` or credentials.

## Generate a dataset file

The server creates linked synthetic records in memory. To export the deterministic synthetic portfolio summary as JSON:

```bash
node scripts/generate-data.mjs --borrowers 10000 --months 24 --seed 42
```

This writes an ignored local file under `data/generated/`. Generator limits are 6–50,000 borrowers and 6–36 monthly periods. No real borrower data is used.

## Test and evaluate

```bash
node --test
```

The built-in test suite covers risk score bounds/tiers, deterministic generation, seasonal recovery, planted risk stories, scenario recomputation, and data consistency. Use the test runner above; no third-party packages are required.

## Demo

Follow [docs/DEMO.md](docs/DEMO.md). Start with `BRW-DEMO-001` to show receivable stress with stable revenue, evidence-backed investigation, scenario simulation, and an intervention timeline. Demo IDs `002`–`006` cover healthy seasonality, concentration, structural decline, transaction anomaly, and temporary false-positive recovery.

## Architecture and analytics

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes API, domain services, local repository, and Exasol analytical layers.
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) describes entities and score semantics.
- [docs/API.md](docs/API.md) documents routes and filters.
- `sql/curated`, `sql/features`, and `sql/risk` contain Exasol-oriented SQL examples with window functions, aggregation, ranking, and time-series comparisons. They are integration examples and have not been run against an Exasol instance.

The local generator creates compact related borrower-level loan, repayment, buyer, risk-event, and monthly metric records. It does not persist 500,000 individual bank transaction rows; the transaction-anomaly feature is generated from historical behavior and demonstrated by a planted synthetic scenario. For a larger production ingest, load normalized source entities into Exasol RAW and build curated/features/risk tables through the supplied SQL pattern.

## AI investigation

The investigation endpoint uses approved domain data and returns structured evidence, counter-evidence, drivers, exposure, confidence, and recommended human follow-up. It works without an LLM key and never fabricates numeric claims. `LLM_*` environment fields are documented as future provider settings; a live LLM adapter is not included in this MVP.

## Limitations and next steps

The local repository is generated in memory at startup and only interventions persist locally. The current frontend is dependency-free vanilla JavaScript. Exasol connection management, transaction-level raw ingestion, production authentication, external LLM integration, and a validated credit model remain future work. Synthetic scores are demonstrations, not credit advice or a production underwriting model.
