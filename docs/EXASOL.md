# Exasol backend

Status: connection code is prepared but has not been validated against a running Exasol server. The local installation was stopped and removed by the user. Default local mode remains available; Exasol software is not required to run it.

`DATA_MODE=local` uses the generated in-memory demo. `DATA_MODE=exasol` requires a verified Exasol dataset and never silently falls back to local data.

Configure `EXASOL_DSN`, `EXASOL_USER`, `EXASOL_PASSWORD_FILE` and optionally `EXASOL_PYTHON`. The driver reads the password file at runtime. The starter kit provides `~/.exasol-starter-kit/pyexasol-venv/bin/python`. Remote TLS verification stays enabled. `EXASOL_ALLOW_SELF_SIGNED=true` is accepted only for local loopback addresses.

Review `sql/exasol/schema.sql`, stop the app to keep its local provisioning snapshot consistent, then run `npm run exasol:load`. The loader creates dedicated `RURALLENS` objects, inserts a UUID snapshot without dropping previous datasets, checks counts, exposure and every current risk score/tier against JavaScript, and publishes metadata only after validation succeeds.

Start with `DATA_MODE=exasol npm start` after the import passes. Borrower documents and monthly features come from Exasol; scoring, tier counts, exposure totals and risk trends execute in SQL. Additional prudential filters, product/DPD summaries, provisioning, simulations, investigation, authentication and task workflows still use application logic/local stores. This is a staged analytics integration, not migration of all storage.

Use a schema-owner loader account for initialization. The runtime may use a separate SELECT-only account on these objects. Grants/users are not changed automatically. Failed imports are unpublished and retained for inspection.

Live SQL, driver and reconciliation checks must pass before marking the connection active. Automated tests alone do not prove a database connection.
