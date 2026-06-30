# Bringing Myriad-Groestl Online as a 6th DigiByte Algorithm (DigiHash V2)

**Audience:** the engineer/agent implementing this on the pool **and** the DigiByte daemon.
**Status:** pool-side config is written; **a DigiByte daemon/consensus change is REQUIRED and is the blocking dependency.**

---

## 0. Read this first — the one thing that will trip you up

A **stock DigiByte daemon refuses to build a Myriad-Groestl block template.** Verified live:

```
$ getblocktemplate '{"rules":["segwit"]}' groestl
error: Algorithm 'groestl' is not currently active.
```

Cause: `src/node/miner.cpp:493` throws when `IsAlgoActive(groestl)` is false, and Groestl
was deactivated at the Odocrypt fork (2019). So a standard `node-stratum-pool` worker
(which mines via `getblocktemplate`) **cannot mine Groestl against an unmodified daemon.**
The attacker in the v9.26.2 incident is NOT using `getblocktemplate`; they hand-build
blocks externally and submit via `submitblock`.

**Therefore this task has two halves, and the pool half alone does nothing:**

1. **DAEMON / CONSENSUS (blocking):** re-activate Groestl in `IsAlgoActive` so the daemon
   builds Groestl templates and accepts Groestl blocks. (Repo: `/home/jared/Code/digibyte`.)
2. **POOL (this repo):** the `coins/` + `pool_configs/` files described below.

---

## 1. ⚠️ Strategic decision required before you implement

This directly conflicts with **DigiByte Core v9.26.2**, which was built to **REJECT**
Myriad-Groestl. v9.26.2 adds an `algolock` rule that rejects any block whose algorithm is
not `IsAlgoActive` at and after activation height **23,808,000**. You must pick a lane:

| | Path A — kill Groestl (v9.26.2 as tagged) | Path B — legitimize Groestl as a 6th algo (this doc) |
|---|---|---|
| `IsAlgoActive(groestl)` | stays **false** | becomes **true** |
| v9.26.2 `algolock` rejection | **keep it** | **must NOT ship it for Groestl** (the same `IsAlgoActive` flip makes algolock accept Groestl automatically) |
| Pool can mine Groestl via GBT | no | yes |
| Result | 5 algos, attacker orphaned | 6 algos, Groestl becomes a normal competitive algo |

**These are mutually exclusive.** Path B legitimizes the exact thing v9.26.2 was written to
stop. Do not deploy a Groestl-mining pool against a Path-A network — its blocks get rejected
at height 23,808,000 and orphan. Confirm with the project owner which path is intended.

If the intent is only a **temporary, defensive** measure (mine Groestl now to take rewards
from the attacker before activation), note it self-terminates at 23,808,000 and still
requires the daemon `IsAlgoActive` change to use `getblocktemplate` at all.

---

## 2. Why `groestlmyriad` (not `groestl`)

DigiByte's `ALGO_GROESTL` is **Myriad-Groestl** = `Groestl-512 -> SHA-256`.

- DigiByte C++ `HashGroestl` (`src/crypto/hashgroestl.h`): `sph_groestl512` then `CSHA256`.
- node-multi-hashing `groestlmyriad_hash` (`src/groestl.c:26`): `sph_groestl512` then `sha256`. **Identical.**
- The plain `groestl` entry in the hashing lib is **double-Groestl** — wrong for DigiByte.

So the coin's `algorithm` must be **`groestlmyriad`** (for share/PoW hashing), while the
daemon's `getblocktemplate` wants the string **`groestl`**. We bridge that with
`passAlgorithm` (see below). jobManager handling is already correct for `groestlmyriad`:
block hash = `reverseBuffer(sha256d)`, coinbase hash = `sha256d` (default) — standard DigiByte.

---

## 3. POOL side — files in THIS repo (already written)

### `coins/digibyte.groestl.json`
- `"algorithm": "groestlmyriad"` — Myriad-Groestl PoW hash.
- `"passAlgorithm": "groestl"` — overrides the GBT positional algo param to `groestl`
  (`node-stratum-pool/lib/pool.js:22-23`). This is what makes the daemon build a
  Groestl (BLOCK_VERSION_GROESTL, `0x…0402`) template while shares hash with groestlmyriad.
- Everything else mirrors `digibyte.sha256.json` (peerMagic `fac3b6da`, `digidollar: true`,
  blockTime 75, dgb address versions).

### `pool_configs/digibyte.groestl.json`
- `"coin": "digibyte.groestl.json"`.
- Daemon RPC port **14066** (next free after odo=14055). Stratum ports **3014 / 3038 / 3262**
  (verified free — no collision with existing 3008-3013, 3032-3037, 3256-3261).
- Reward recipient `0.5%` = `dgb1qmrscvphklukgp9ex2n0wemmhf80dv3cugmq5s8` (provided).
- **Placeholders that MUST be replaced** — see §5.

`init.js` auto-discovers any `pool_configs/*.json`, so no registration is needed; it will
spin up the Groestl stratum on next start (and validates port collisions).

---

## 4. DAEMON side — required changes (repo `/home/jared/Code/digibyte`)

A dedicated DigiByte daemon for Groestl on RPC port **14066** with:

1. **Re-activate Groestl in `IsAlgoActive`** (`src/validation.cpp`, post-Odo `else` branch ~line 2223):
   add `|| algo == ALGO_GROESTL` so it returns true again. This single change cascades correctly:
   - `getblocktemplate '… ' groestl` builds a template (fixes the miner.cpp:493 throw).
   - `ContextualCheckBlockHeader` and `ConnectBlock` accept Groestl.
   - The v9.26.2 `algolock` rule (`algo == ALGO_UNKNOWN || !IsAlgoActive(...)`) **stops rejecting
     Groestl automatically**, because `IsAlgoActive(groestl)` is now true.
2. **Difficulty retargeting for 6 algos** — DigiByte's V4 targets `multiAlgoTargetSpacingV4 = 75`
   (= 15s × 5). With a real 6th algo, block time runs ~12.5s and emission accelerates unless this
   is retuned to 90 (= 15s × 6). Decide whether to retarget (a further consensus change) or accept
   faster blocks. This is a chain-wide parameter; coordinate it as part of the same release.
3. Node config: `server=1`, `txindex=1`, `digidollar=1`, RPC `rpcport=14066`, rpcuser/rpcpassword
   matching the pool_config, a loaded **wallet that owns the pool `address`**, and a `blocknotify`
   wired to the pool CLI (mirror the existing 5 algo daemons).

> This is a **consensus hard fork**: it changes which blocks the network considers valid.
> It must be coordinated across pools/exchanges/nodes exactly like any DigiByte fork, and it is
> the opposite of shipping v9.26.2's Groestl rejection. See §1.

---

## 5. Addresses you still need to provide

The Groestl `pool_configs/digibyte.groestl.json` currently has **one real address and two
placeholders**. Each algo's config uses the same three address roles (compare `digibyte.sha256.json`):

| Role | sha256 example | Groestl status |
|---|---|---|
| `address` — pool block-reward / mining payout address (the coinbase output the daemon pays the pool) | `dgb1q7sh8xsku6cd23ew6u349g8d5gmxvjymme482kt` | ❌ **NEEDED** → `REPLACE_WITH_GROESTL_POOL_ADDRESS` |
| `rewardRecipients` 0.5% fee | `dgb1qdqxlgxwc90xqzdz4vh760tvj3pjgn2y3rg0ar0` | ✅ set → `dgb1qmrscvphklukgp9ex2n0wemmhf80dv3cugmq5s8` |
| `rewardRecipients` 9.5% fee | `dgb1q5qgr5x6snxlll9t2s4ndsnna8tcmpdkrtulztz` | ❌ **NEEDED** → `REPLACE_WITH_GROESTL_POOL_FEE_ADDRESS` |

**So you still need two DigiByte (`dgb1…`) addresses:**

1. **Main pool `address`** — the block-reward collection / mining payout address for Groestl.
   It must be owned by the wallet loaded in the Groestl daemon (port 14066) so the pool can
   receive and pay out block rewards.
2. **The 9.5% `rewardRecipients` address** — the main pool-operator fee address for Groestl.

Also set, in `pool_configs/digibyte.groestl.json`, the daemon **`user` / `password`** (currently
`"user"` / `"password"` placeholders) to the real RPC credentials of the Groestl daemon.

---

## 6. Verification checklist (do these in order)

1. **Daemon builds a template (the gate everything depends on):**
   ```
   digibyte-cli -rpcport=14066 getblocktemplate '{"rules":["segwit","digidollar-oracle"]}' groestl
   ```
   Must return a template with `version` carrying the Groestl bits (`0x…0402`), **not**
   `Algorithm 'groestl' is not currently active`.
2. **Hash parity:** confirm a share hashed by the pool (`groestlmyriad`) matches the daemon's
   PoW for the same header (groestl512→sha256). Use a regtest block end-to-end before mainnet.
3. **Pool starts the algo:** `init.js` logs a stratum listener on 3014/3038/3262 with
   `{groestlmyriad}` and no "hashing algorithm is not supported" / port-collision error.
4. **Block submission:** mine a regtest/testnet Groestl block and confirm `submitblock`
   acceptance and that the reward lands at the pool `address`.
5. **Only then** point real hashpower at it on mainnet, and only on a network that has made
   the §4 `IsAlgoActive` change (otherwise blocks orphan at height 23,808,000).

---

## 7. Summary

- Pool config files are written (`coins/digibyte.groestl.json`, `pool_configs/digibyte.groestl.json`),
  using `groestlmyriad` + `passAlgorithm: "groestl"`, ports 14066 / 3014-3038-3262.
- **Blocking dependency:** a DigiByte daemon with Groestl re-activated in `IsAlgoActive`
  (`/home/jared/Code/digibyte`). Without it the daemon refuses Groestl templates.
- **Strategic conflict:** this is incompatible with shipping v9.26.2's Groestl rejection —
  confirm Path B is intended before deploying.
- **Still needed from the operator:** the main pool `address`, the 9.5% fee address, and the
  Groestl daemon RPC credentials.
