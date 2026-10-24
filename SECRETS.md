# Pool secrets

The pool talks to one DigiByte node per algorithm over RPC. The RPC user and
password for each node are secrets. They are **not** in the tracked
`pool_configs/*.json` files. Those files hold the placeholder
`SET_IN_SECRETS_JSON`.

At startup, `init.js` loads the real values for every **enabled** pool config.
If any are missing, the pool stops with an error that names the file and the
env vars to set.

## Option 1: `pool_configs/secrets.json` (recommended)

This file is gitignored. Create it next to the pool configs:

```json
{
  "digibyte.sha256": { "user": "rpc-user-sha256", "password": "long-random-password" },
  "digibyte.scrypt": { "user": "rpc-user-scrypt", "password": "long-random-password" },
  "digibyte.skein":  { "user": "rpc-user-skein",  "password": "long-random-password" },
  "digibyte.qubit":  { "user": "rpc-user-qubit",  "password": "long-random-password" },
  "digibyte.odo":    { "user": "rpc-user-odo",    "password": "long-random-password" }
}
```

- Each key is the pool config file name without `.json`.
- The values must match `rpcuser` / `rpcpassword` in that node's `digibyte.conf`.
- Add an entry only for configs you enable (for example `digibyte.groestl`).
- Lock it down: `chmod 600 pool_configs/secrets.json`.

Make a strong password with `openssl rand -hex 32`.

## Option 2: environment variables

```sh
export DGB_RPC_USER_SHA256=...   DGB_RPC_PASS_SHA256=...
export DGB_RPC_USER_SCRYPT=...   DGB_RPC_PASS_SCRYPT=...
```

The name suffix comes from the config file name: `digibyte.sha256.json` →
`SHA256`, `testnet.skein.json` → `TESTNET_SKEIN`. Env vars override
`secrets.json`.

## Rules

- Never commit real values. `npm test` checks that the tracked configs hold
  only the placeholder.
- One user/password applies to all `daemons` and to `paymentProcessing.daemon`
  in that config.
- If you enable `website.adminCenter`, set a strong password there too. Its
  `/api/admin/pools` call returns the full pool configs, including these values.
