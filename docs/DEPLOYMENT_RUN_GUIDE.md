# Deployment and run guide

This guide covers running RuralLens locally and hosting a shared synthetic-data demo on one Linux server. The application uses Node.js built-in modules; there is no build step or `npm install`.

> **Demo deployment only.** RuralLens currently stores accounts, sessions, audit events, interventions, and portfolio workflow data in local JSON files. It is not ready for real borrower information or a public production service. Before production, replace the local identity and workflow stores with supported durable services, review access and recovery policies, add operational monitoring and tested backups, and complete an organization security review. Exasol currently backs only the staged analytics path; it does not replace these local stores.

## 1. Run a local demo

### Requirements

- Node.js 20 or newer.
- An authenticator app for MFA.

Clone the repository and start the server:

```sh
git clone https://github.com/Dhuna-pixel/RuralLens.git
cd RuralLens
npm start
```

Open <http://localhost:3000>. Keep the terminal open while the server runs. On first startup, copy the one-time administrator setup token printed in that terminal. Use the setup screen to create the first IT administrator with a password of at least 12 characters, then sign in and enroll an authenticator app.

The server generates synthetic data in memory by default (seed `42`, 10,000 borrowers, and 36 monthly periods). Local accounts and application records are written to `data/generated/`. That directory is ignored by Git; keep it private and back it up if you need to retain a demo's state.

To choose a different port or data directory:

```sh
PORT=3001 DATA_STORE_DIR="$PWD/data/demo" npm start
```

The app does not automatically read `.env` files. Export settings in the shell or use a service manager's environment-file support.

## 2. Run the application

### Start and stop

Start the foreground server with `npm start`. Stop it with **Ctrl+C**. During development, `npm run dev` restarts the process when backend files change; do not use watch mode for a hosted demo.

The default local mode needs no database connection. To run the staged Exasol analytics mode, first complete the requirements and validation in the [Exasol guide](EXASOL.md). Do not set `DATA_MODE=exasol` until a live server, driver, dataset load, and reconciliation have all been checked. Other workflow and account records remain in the local data directory.

### First sign-in and team setup

1. Create the first IT administrator through the one-time setup page.
2. Sign in and enroll an authenticator app.
3. In **IT administration**, create the accounts and assign team memberships. Temporary passwords appear once; each user must change their password and enroll MFA at first sign-in.
4. In **Team Profile**, appoint department heads. CXO or IT administration can appoint a head who is already an active member of that team.
5. CXO assigns each intervention to a team. The department head allocates it to one active team member. That member submits completion details to finish the task.

For an optional synthetic user directory, stop the app and run `node scripts/seed-demo-teams.mjs` once. Generated credentials are written to the ignored file `data/generated/demo-team-credentials.json`. Protect and remove that file after sharing the demo credentials securely.

### Update and restart

For a single-server demo, back up the data directory, update the checked-out code to the chosen Git revision, then restart the service. Avoid running two application instances against the same JSON data directory; this app does not provide multi-process file locking.

## 3. Host a shared demo on Ubuntu

The following is a reference setup for one Ubuntu server with a DNS name. It runs Node under a dedicated account, keeps the writable data outside the code checkout, and uses Caddy for HTTPS.

### Prepare the server

1. Point a DNS `A` (and, if used, `AAAA`) record for your chosen hostname to the server.
2. Install Node.js 20 or newer from a trusted distribution source and install Git and Caddy using their official installation instructions.
3. Create a dedicated service account and directories. The commands below assume the service account is named `rurallens`:

   ```sh
   sudo useradd --system --home-dir /opt/rurallens --shell /usr/sbin/nologin rurallens
   sudo install -d -o rurallens -g rurallens /opt/rurallens /var/lib/rurallens
   sudo install -d -o root -g rurallens -m 0750 /etc/rurallens
   ```

4. Clone the project into `/opt/rurallens` and make the checkout readable by the service account:

   ```sh
   sudo -u rurallens git clone https://github.com/Dhuna-pixel/RuralLens.git /opt/rurallens
   ```

### Set server configuration

Create `/etc/rurallens/rurallens.env` with a unique random bootstrap token. Keep it private; this token can create the first administrator if the data directory has no users.

```sh
sudo install -o root -g rurallens -m 0640 /dev/null /etc/rurallens/rurallens.env
sudoedit /etc/rurallens/rurallens.env
```

Add settings like these, replacing the example token with a securely generated value:

```ini
NODE_ENV=production
PORT=3000
DATA_MODE=local
DATA_STORE_DIR=/var/lib/rurallens
AUTH_BOOTSTRAP_TOKEN=replace-with-a-long-random-one-time-secret
```

Do not commit this file or share the bootstrap token in chat or source control. Once the first administrator is created, remove `AUTH_BOOTSTRAP_TOKEN` from the environment file. Protect `/var/lib/rurallens`; it contains account hashes, MFA secrets, sessions, audit history, and application records.

### Run it as a service

Create `/etc/systemd/system/rurallens.service`:

```ini
[Unit]
Description=RuralLens demo application
After=network.target

[Service]
Type=simple
User=rurallens
Group=rurallens
WorkingDirectory=/opt/rurallens
EnvironmentFile=/etc/rurallens/rurallens.env
ExecStart=/usr/bin/node /opt/rurallens/backend/server.mjs
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/rurallens

[Install]
WantedBy=multi-user.target
```

If Node is installed somewhere other than `/usr/bin/node`, use the path returned by `command -v node`. Then enable and start the app:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now rurallens
sudo systemctl status rurallens
sudo journalctl -u rurallens -f
```

The first-admin token is printed to the service journal only when it is generated automatically. With `AUTH_BOOTSTRAP_TOKEN` configured, use the value from the protected environment file in the first-admin setup screen instead.

### Add HTTPS with Caddy

Add a site block to the Caddy configuration (commonly `/etc/caddy/Caddyfile`), replacing the hostname:

```caddy
rurallens.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Reload Caddy after validating its configuration:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Allow inbound HTTPS and, if Caddy obtains certificates automatically, HTTP for certificate validation. Do not expose port `3000` directly to the public internet. Open the hostname, complete first-admin setup, enroll MFA, then remove the bootstrap token from `/etc/rurallens/rurallens.env` and restart the service.

### Back up, update, and troubleshoot

- Stop the service before copying its data directory. Keep backups encrypted and access-controlled; they contain sensitive authentication material. Test restoring a backup to a separate demo instance before relying on it.
- To update code, stop the service, fetch/check out the intended revision in `/opt/rurallens`, ensure files remain readable by `rurallens`, and start it again. Do not overwrite or remove `/var/lib/rurallens` when updating the code.
- View application logs with `sudo journalctl -u rurallens`. Check Caddy logs and DNS/firewall settings if HTTPS is unavailable.
- After signing in, the application health endpoint is `GET /api/health`; it requires an authenticated session.
- Keep only one running app process for each `DATA_STORE_DIR`. Use a tested backup before changing data or application versions.

## 4. Common commands

| Task | Command |
| --- | --- |
| Start locally | `npm start` |
| Start with auto-restart for development | `npm run dev` |
| Run automated checks | `npm test` |
| Generate a saved synthetic portfolio | `npm run generate -- --borrowers 10000 --months 24 --seed 42` |
| Seed optional demo team accounts | `node scripts/seed-demo-teams.mjs` |

See the [README](../README.md) for feature overview and role responsibilities, the [demo walkthrough](DEMO.md) for an example portfolio review, and the [API reference](API.md) for available routes.
