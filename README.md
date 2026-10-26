# RuralLens

**Portfolio clarity for CXOs. Timely action for teams.**

## Overview

RuralLens is a rural lending portfolio monitoring system built for Exathon. It gives CXOs a consolidated view of portfolio health, emerging risks, and intervention progress, with borrower details available when further investigation is needed.

### Problem statement

CXOs at rural lending institutions can’t get a clear, timely view of portfolio health because today’s approach relies on fragmented reports and detailed account-level reviews to reveal risks and pending actions.

If this worked, they could see portfolio performance, emerging risks, and intervention progress at a glance, then direct the right teams without digging into individual accounts.

### What it does

- **Monitor portfolios:** View exposure, risk tiers, product breakdowns, overdue accounts, and risk trends.
- **Identify risk:** Search and filter borrowers, review alerts, and inspect contributing signals.
- **Investigate accounts:** Generate evidence reports and simulate changes to collection, cash flow, and repayment assumptions.
- **Coordinate action:** Assign tasks to teams, allocate a responsible member, and track completion and turnaround time.
- **Review recovery:** Explore synthetic SMA/NPA classifications, provisioning measures, and recovery timelines.

**Current status:** The local demo works with synthetic data. An Exasol connection layer and SQL scoring pipeline are prepared, but live database integration has not been verified. Investigation reports use local rules; a live LLM is not connected.

## Setup

### Requirements

- Node.js **20 or newer**.
- An authenticator app for sign-in verification.

The local demo uses built-in Node.js modules; no dependency installation or Exasol installation is required.

### Run locally

```sh
git clone https://github.com/Dhuna-pixel/RuralLens.git
cd RuralLens
npm start
```

Open **http://localhost:3000**. Keep the server terminal open during first-time setup.

### Create the first account

1. Copy the one-time administrator setup token printed in the server terminal.
2. Enter it on the setup page and choose an administrator username and a password of at least 12 characters.
3. Sign in, enroll an authenticator app, and verify the code.
4. Open **IT administration** to create accounts and assign their teams. Temporary passwords are shown once; each new user must change their password and enroll an authenticator.

There is no public signup. IT handles password and authenticator resets.

### Configuration

Use [.env.example](.env.example) as a reference and set the required variables in your shell. The server **does not automatically load `.env` files**.

Defaults are port `3000`, seed `42`, 10,000 generated borrowers, and 36 monthly periods. Additional synthetic accounts provide provisioning and recovery coverage.

For a different port:

```sh
PORT=3001 npm start
```

For a full local run guide and a reference HTTPS deployment on one Linux server, see the [deployment and run guide](docs/DEPLOYMENT_RUN_GUIDE.md).

### Exasol setup

Follow the [Exasol integration guide](docs/EXASOL.md) to configure a database connection, import the synthetic portfolio, and validate the SQL results before enabling Exasol mode.

The connection requires a working Exasol server, the official `pyexasol` driver, and credentials supplied through environment variables and a private password file. Local demo mode remains available without them.

## Usage

### Monitor the portfolio

1. Open **Command center** for portfolio totals, risk trends, product exposure, and overdue summaries.
2. Use **Portfolio** or **Risk alerts** to find accounts needing attention.
3. Open a borrower to inspect repayment history, risk drivers, provisioning, and recovery details.
4. Use **Run investigation** or **Scenario simulation** for further analysis. Reports can be downloaded as JSON.

For a guided example, start with borrower `BRW-DEMO-001` and follow the [demo walkthrough](docs/DEMO.md).

### Assign and complete interventions

| Role | Responsibility |
| --- | --- |
| **CXO** | Assign a task to an operational team and monitor progress. |
| **Department head** | Allocate the task to an active member of their own team, once. |
| **Assigned member** | Submit completion details to finish the task. |
| **IT administration** | Manage application accounts, team names, and memberships. |

Operational teams are **Business, Credit, Risk, Collection, Recovery, Legal, and Operations**. Each team sees only its own interventions; CXO sees all team tasks. CXO or IT can appoint department heads through **Team Profile**.

Completion finishes the task immediately. Member reassignment and separate CXO approval/closure are disabled. Task details show assignment and closure dates, dated activity history, and turnaround in whole elapsed days; tasks finished within 24 hours show `0 days`.

### Optional demo accounts

After creating the first IT account, stop the server and run:

```sh
node scripts/seed-demo-teams.mjs
npm start
```

This adds demo CEO, COO, CRO, CFO, and CTO accounts, plus a head/member pair for each operational team. Temporary credentials are saved locally in ignored `data/generated/demo-team-credentials.json`. First sign-in still requires a password change and authenticator enrollment.

## Development

```sh
npm run dev   # Restart the server when backend files change
npm test      # Run the automated tests
npm run generate -- --borrowers 10000 --months 24 --seed 42
```

Generated data, accounts, sessions, and workflow records are stored under ignored `data/generated/` files. Keep credentials and setup tokens out of Git.

## Documentation

- [Deployment and run guide](docs/DEPLOYMENT_RUN_GUIDE.md)
- [Demo walkthrough](docs/DEMO.md)
- [Exasol integration](docs/EXASOL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [API reference](docs/API.md)
- [Provisioning and recovery](docs/PROVISIONING_RECOVERY.md)

RuralLens is a synthetic decision-support prototype. Its scores, scenarios, and provisioning examples are not a validated credit model or institution-approved regulatory calculations. Authorized personnel retain lending decisions. The local JSON account store is intended for demonstration; production deployment requires further security work and HTTPS.
