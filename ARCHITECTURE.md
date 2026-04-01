# DigiHash V2 Architecture

## Executive Summary
DigiHash V2 is a Node.js mining-pool stack for DigiByte that combines:
- **Stratum pool servers** (multi-algo, multi-port)
- **Share accounting + payment processing** (Redis-backed, daemon RPC-driven)
- **Web UI + JSON/SSE API** for miners and admins
- **Optional auto-switching** across coins by profitability

`init.js` is the process orchestrator. It reads `config.json` + `pool_configs/*.json` + `coins/*.json`, validates configuration, then forks worker processes for pool, website, payment, and profit-switch roles.

## System Overview

```text
                         +------------------------------+
                         | DigiByte daemons (RPC)      |
                         | getbalance, validateaddress |
                         | listunspent, sendmany, ...  |
                         +---------------+--------------+
                                         ^
                                         |
+-------------------+      IPC       +---+-----------------------------+
| CLI tools         +<-------------->+ Master process (init.js)        |
| scripts/cli.js    |                | - load/validate configs         |
| blocknotify.c     |                | - fork workers                  |
+---------+---------+                | - route CLI commands to workers |
          |                          +---+-----------+------------------+
          |                              |           |
          |                              |           |
          v                              v           v
+---------+---------+             +------+----+  +--+-------------------+
| Pool workers      |<--Redis----> Share DB   |  | Payment processor    |
| libs/poolWorker.js|             | (Redis)   |  | libs/paymentProcessor|
| Stratum listeners |             +-----------+  | block maturity/payout|
+---------+---------+                              +--+-------------------+
          |                                           |
          | shares + blocks                           |
          +-------------------------------------------+

+-----------------------------+
| Website worker              |
| libs/website.js + libs/api  |
| /api/stats /api/worker_stats|
| SSE /api/live_stats         |
+--------------+--------------+
               |
               v
      Browser clients (website/static/*.js)
```

## Directory Structure (validated)
- `init.js` — master entrypoint and worker supervision
- `libs/` — core server modules (pool, API, stats, payments, website, switching)
- `pool_configs/` — per-pool operational config (ports, daemon, payout mode)
- `coins/` — coin metadata (algorithm, address versions, explorer links)
- `website/` — doT templates and static assets
- `scripts/` — helper utilities (`cli.js`, `blocknotify.c`, `getbalance.py`, chart scripts)
- `.circleci/`, `.github/` — CI/workflow metadata

## Key Components
1. **Master/Orchestration (`init.js`)**
   - Loads and minifies JSON config.
   - Merges defaults from `config.json` into each pool config.
   - Validates port collisions and duplicate coin assignments.
   - Forks cluster workers for:
     - `pool` (`libs/poolWorker.js`)
     - `paymentProcessor` (`libs/paymentProcessor.js`, optional)
     - `website` (`libs/website.js`, optional)
     - `profitSwitch` (`libs/profitSwitch.js`, optional)
   - Hosts CLI listener (`libs/cliListener.js`) for `blocknotify`, `coinswitch`, `reloadpool`.

2. **Stratum Pool Worker (`libs/poolWorker.js`)**
   - Builds Stratum pools per configured coin.
   - Handles auth/share/difficulty callbacks.
   - Persists shares via:
     - **Internal mode**: `libs/shareProcessor.js` (Redis)
     - **MPOS mode**: `libs/mposCompatibility.js` (MySQL)
   - Supports IPC actions: ban propagation, blocknotify, coin switch.
   - Supports proxy switching ports and algorithm routing.

3. **Share + Stats Storage (`Redis`)**
   - Share processor writes current round shares, hashrate ZSET, pending blocks, counters.
   - Stats module (`libs/stats.js`) aggregates workers/pools/network stats and historical windows.

4. **Payment Engine (`libs/paymentProcessor.js`)**
   - Validates payout addresses and daemon ownership.
   - Tracks confirmations and rounds; computes miner balances.
   - Executes payouts according to payment mode (`prop` / `pplnt`) and thresholds.
   - Handles shielding/unshielding workflows when required by coin config.

5. **Website/API (`libs/website.js`, `libs/api.js`)**
   - Express server + doT templates (`website/pages/*.html`, `website/index.html`).
   - JSON endpoints (`/api/stats`, `/api/pool_stats`, `/api/worker_stats`, `/api/payments`, etc.).
   - SSE endpoint (`/api/live_stats`) for live front-end updates.
   - Optional admin API guard with password (`website.adminCenter`).

6. **Profit Switching (`libs/profitSwitch.js`)**
   - Collects ticker/depth/network info.
   - Computes normalized profitability per algorithm/coin.
   - Sends switch commands to pool workers (via IPC/CLI path).
   - Exchange adapters: Poloniex, Mintpal, Cryptsy, Bittrex (+ CoinWarz helper module).

## Data Flow
1. Miner submits shares to Stratum port.
2. `poolWorker` validates share/block and emits events.
3. Share is written to Redis (`shareProcessor`) or MySQL (`mposCompatibility`).
4. Stats worker (`libs/stats.js`) periodically aggregates Redis data into in-memory snapshots and history.
5. Website worker serves snapshots through JSON API + SSE; front-end charts update live.
6. Payment processor periodically scans rounds/balances and issues daemon RPC payouts.
7. Optional profit switch compares markets + daemon info and re-routes switching ports.

## Configuration and Deployment
- **Global config**: `config.json` (example in `config_example.json`)
  - Logging, clustering, website, Redis, switching, profit switch.
- **Pool config**: `pool_configs/*.json`
  - Coin file binding, stratum ports/varDiff, daemon creds, payout mode/interval, MPOS mode.
- **Coin metadata**: `coins/*.json`
  - Algorithm, symbol, network bytes, block time, explorer URLs.
- **Runtime deps**:
  - Node.js (cluster workers)
  - Redis (required)
  - DigiByte full node(s) / daemon RPC (required)
  - MySQL only when MPOS compatibility is enabled
- **Web**:
  - Built-in Express server (`http` or `https` with TLS options)

## Technical Decisions
- **Process isolation by role** using Node cluster for resilience and fault containment.
- **Redis as primary state backend** for shares, hashrate windows, and pool stats.
- **Template-driven website** (doT) with server-side page generation + client-side live chart updates.
- **Backward compatibility paths** retained (MPOS mode, legacy exchange adapters/scripts).
- **Config-driven extensibility** (coin/pool JSON) rather than hardcoding algorithms/ports.
- **Operational control plane via local TCP CLI** for notify/reload/switch actions.

## Path Validation Notes
All paths referenced above were validated against the current repository tree at:
`/home/jared/Code/digihashv2`
(excluding `.git`, `node_modules`, and build-artifact paths).
