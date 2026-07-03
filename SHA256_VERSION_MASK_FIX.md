# DigiHash v2 — SHA256 Version-Mask Fix (ASICBoost / NerdAxe / Bitaxe)

*Why some SHA256 miners lost ~half their hashrate on DigiByte v9.26.x pools, and exactly
how DigiHash fixed it. Written to be understandable with zero prior stratum knowledge.*

---

## Quick Summary for Pool Developers

**Problem.** DigiByte v9.26.x signals DigiDollar activation on version **bit 23** —
inside the region SHA256 ASICs overwrite for version rolling (AsicBoost, bits 13–28).
Miner firmware assumes that region is empty, so v9 jobs silently break **~half of every
SHA256 miner's shares** (`Difficulty too low` rejects, or vanishing hashrate).

**Fix.** Two settings — they only work together:

| # | Setting | Value |
|---|---------|-------|
| 1 | Zero the rolling region in every SHA256 job | send version `20000202`, not `20800202` |
| 2 | Grant and validate the **full** rolling mask | `version-rolling.mask = 1fffe000` |

> ⚠️ Never narrow the mask to "protect" bit 23. The chips roll it regardless — a
> narrowed mask only turns their legal work into rejects.

**DigiDollar activation is not harmed.** Bit 23 is a vote, never a validity rule;
the ASIC's rolling still sets it on ~half of all blocks; Scrypt/Skein/Qubit/Odo keep
signaling on 100% of blocks; and from block **23,788,800** upgraded nodes also signal
**bit 0**, which rolling cannot touch.

### Per-software fixes

**DigiHash / NOMP-style pools (this repo)** — `stratum-pool` v0.3.0 zeroes masked bits
in every job and makes duplicate detection rolling-aware:

```bash
npm update stratum-pool
# keep "version_mask": "1fffe000" in the sha256 coin config, restart the SHA256 port
```

**MiningCore** — where the job takes the template version (DGB-sha256 pool only):

```csharp
version = BlockTemplate.Version & ~0x00800000u;   // BitcoinJob.cs
```

Leave the global `VersionRollingPoolMask` at `0x1fffe000` — narrowing it breaks every
other SHA256 coin on the instance (field-tested).

**NerdAxe / NerdQAxe / Bitaxe firmware** — replace the OR reconstruction with a masked
merge, and program the pool-granted mask into the ASIC (NerdQAxe issue #640):

```c
rolled_version = (job->version & ~0x1fffe000) | (version_bits << 13);
```

Until that ships in a firmware release, mine on a pool with the fix above — no device
setting works around it.

---

## The problem in one paragraph

DigiByte v9.26.x nodes put a new signal — the **DigiDollar vote, "bit 23"** — into the
block version of every mining job. Unfortunately, bit 23 lives inside the chunk of the
version that SHA256 ASICs use as **scratch space** for a speed trick called version
rolling (AsicBoost). Miner firmware was built assuming that scratch space starts out
**empty**. On v8 pools it always was. On v9 pools it suddenly wasn't — and the math
inside NerdAxe/NerdQAxe/Bitaxe-class firmware quietly broke: about **half of every
miner's valid shares** were either thrown away before submitting (silent hashrate loss)
or rejected by the pool as `Difficulty too low`. Nothing was wrong with the miners, the
chips, or the node. It was the job format.

## The fix in one paragraph

Two settings, working **together**:

1. **Strip the scratch space in the job.** The pool now sends SHA256 jobs with the whole
   rolling region zeroed (version `20000202` instead of `20800202`) — exactly the shape
   every firmware was designed for.
2. **Grant the full rolling mask `1fffe000`.** The ASIC chip flips bit 23 on and off as
   part of its normal rolling — it physically can't avoid it. With the full mask, those
   flips are *legal*, and the pool faithfully rebuilds exactly what the chip hashed.

Strip the job **and** grant the full mask. One without the other just moves the 50% loss
somewhere else (this was field-tested the hard way).

---

## How mining actually flows here (60-second version)

```
 DigiByte node                DigiHash pool                 Your ASIC
 ─────────────                ─────────────                 ─────────
 getblocktemplate      →      builds a JOB           →     chip hashes billions of
 version: 20800202            (mining.notify)              header variants, using
        ▲                            │                     bits 13–28 of the version
        │                            │                     as extra counter space
   bit 23 set by              job version goes             (this is "version rolling")
   v9.26.x node               out to miners                        │
                                     │                             ▼
                              pool REBUILDS the       ←     share comes back with
                              header from the job +         "version_bits" = what the
                              the miner's version_bits      chip changed
                              and checks the hash
```

**Where it broke:** the chip *replaces* bits 13–28 with its own counter. Firmware then
reconstructs "what did the chip hash?" by OR-ing the job version with the counter. OR
can add bits but never remove them — so when the job already had bit 23 set and the
chip's counter turned it *off*, the firmware reconstructed the wrong header. Wrong
header → wrong hash → good shares discarded or rejected. A coin flip per share: ~50%.

## What exactly changed in DigiHash v2

### 1. `node-stratum-pool` (commit `e564a00`)

- **Jobs are auto-cleaned.** For any coin with `version_mask` configured, the pool now
  zeroes every masked bit in the job version before it goes anywhere. One change, one
  place — the job announcement, the share check, and the block submitted to the network
  all see the same clean version.
- **Duplicate detection understands rolling.** Two shares can now legitimately differ
  only in their rolled version bits; the duplicate-share check includes those bits so
  valid shares aren't rejected as duplicates.
- Covered by tests pinned to real miner-log values
  (`lib/test_versionroll.js` — job `20000202` + miner bits `03fe2000` must rebuild
  header version `23fe2202`, taken verbatim from a NerdQAxe++ log).

### 2. Coin config (`coins/digibyte.sha256.json`) — already correct, just don't change it

```json
"version-rolling": true,
"allowAsicboost": true,
"version_mask": "1fffe000"
```

`1fffe000` is the **full** 16-bit rolling mask (bits 13–28). Do **not** narrow it (for
example to `1f7fe000` to "protect" bit 23) — the chips roll bit 23 regardless, and a
narrowed mask turns their legal rolls into rejects. Full mask + stripped job is the
only combination that works for every device.

### 3. Only SHA256 is touched

Scrypt, Skein, Qubit and Odo miners don't version-roll, so their coin configs have no
`version_mask` — their jobs keep bit 23 exactly as the node sets it, and those blocks
keep signaling DigiDollar at full strength. Nothing changes for them.

## Deploying it

```bash
cd digihashv2
npm update stratum-pool        # pulls the fixed node-stratum-pool
# restart the SHA256 pool process/port
```

Miners need to do **nothing** except reconnect (a restart/power-cycle is the sure way) —
the fix is negotiated automatically in `mining.configure` when they connect.

## How to verify it's working

1. **The job version is clean.** In the pool log or a miner's log, `mining.notify` for
   SHA256 jobs now shows version `20000202` (was `20800202`).
2. **`mining.configure` grants the full mask.** The response contains
   `"version-rolling.mask": "1fffe000"`.
3. **Rejects stop.** `Difficulty too low` errors for NerdAxe/NerdQAxe/Bitaxe workers
   drop to zero, and their credited hashrate climbs back to chip spec (a NerdQAxe++
   should read ~11.3 TH/s again, not ~6).
4. **Some accepted shares carry bit 23 — that's good.** You'll see `version_bits` like
   `03fe2000` (bit 23 on) and `00034000` (bit 23 off) both being accepted. The chip's
   coin flip means roughly half the blocks this port finds will still carry the
   DigiDollar signal — for free.

## If you own a NerdAxe / NerdQAxe / Bitaxe — what's happening on your device

Your miner was never broken — its firmware just trusted the old job format. Inside the
firmware, when the chip reports a found share, the code reconstructs "what version did
the chip actually hash?" like this:

```c
rolled_version = job->version | (version_bits << 13);   // bitwise OR
```

OR can only turn bits **on**, never off. The chip, however, *overwrites* bits 13–28 —
including turning bit 23 **off** about half the time. So when a v9 job arrived with
bit 23 already on, the firmware reconstructed the wrong version for half its shares,
computed the wrong hash, decided they were junk, and silently threw them away (or
submitted mismatched shares the pool rejected as `Difficulty too low`).

**The real firmware fix is one line** — replace the OR with a proper merge:

```c
rolled_version = (job->version & ~0x1fffe000) | (version_bits << 13);
```

NerdQAxe firmware needs one more fix: it never programs the pool-granted rolling mask
into the ASIC at all (tracked upstream as shufps/ESP-Miner-NerdQAxePlus **#640**,
maintainer-confirmed; related: bitaxeorg/ESP-Miner **#1169**). Until those land in a
release, **there is no setting on the device that fixes this** — which is exactly why
pools fix the job format instead. On DigiHash (post-fix) your device mines at full
speed with stock firmware today; once the firmware fix ships, every pool works, even
unfixed ones.

## If you run another pool (MiningCore, ckpool, NOMP forks)

Same two rules, applied to your stack: **send SHA256 jobs with the rolling region
zeroed, and grant/validate with the full `1fffe000` mask.**

**MiningCore:**

1. Where the job takes the template version (`src/Miningcore/Blockchain/Bitcoin/BitcoinJob.cs`,
   `BlockTemplate.Version`), clear bit 23 for the DigiByte-sha256 pool:
   ```csharp
   version = BlockTemplate.Version & ~0x00800000u;
   ```
2. Leave `BitcoinConstants.VersionRollingPoolMask` at the full `0x1fffe000`. It is a
   **global** constant — do *not* narrow it to protect bit 23: that was field-tested and
   it fixed DGB while breaking every other SHA256 coin on the same instance
   ("rolling-version mask violation" from mask-ignoring firmware, duplicate-share
   storms from Bitaxe's contiguous roll counter). If you want per-coin masks, make the
   constant a per-pool config value first.

**ckpool / yiimp / other NOMP forks:** the same one-liner wherever the GBT `version`
is read into the job. (This repo's `node-stratum-pool` does it generically: any coin
with `version_mask` configured gets all masked bits cleared from the job.)

**Four pitfalls that have already burned pools in the field — check all four:**

1. **Never combine the job-strip with a narrowed mask** (e.g. a leftover `1f7fe000`
   from an experiment). The chips roll bit 23 regardless; with the job bit cleared
   those rolls are *legitimate* and must be inside the granted mask, or you're back to
   ~50% loss — just moved from the firmware to the pool.
2. **Strip in exactly one place** so `mining.notify`, share validation, and block
   submission all use the same version. Two variants of the same job circulating =
   duplicate-share storm.
3. **Include the version bits in your duplicate-share key.** With rolling, two valid
   shares can differ only in their rolled bits; a version-blind dedupe rejects real
   work — and the strip roughly doubles small-miner submissions, so you'll hit it.
4. **Roll out on a fresh job (`clean_jobs = true`)** and have miners reconnect so
   `mining.configure` renegotiates.

Quick sanity check for any pool, straight from a real NerdQAxe log: job version
`20000202`, miner submits `version_bits 03fe2000` → your share validator must rebuild
header version `23fe2202`. If it computes anything else, your merge is wrong.

## FAQ

**Does stripping bit 23 hurt DigiDollar activation?**
No. The bit is a *signal*, never a validity rule — a block is equally valid with or
without it, in every BIP9 state. Our non-SHA256 ports still signal on 100% of their
blocks, and the SHA256 port still signals on ~half its blocks via the chip's own
rolling. From block **23,788,800** the second deployment (algolock, bit 0 — *outside*
the rolling scratch space) signals on every block from every algo, untouchable by
rolling.

**Why not just keep bit 23 fixed in the job and forbid rolling it?**
Because the hardware can't comply. BM13xx-class chips roll bits 13–28 as one contiguous
counter — there is no way to fence off one bit in the middle. Some firmware
(NerdQAxe) doesn't even load the pool's mask into the chip at all. Any scheme that
needs bit 23 to stay put fails on real devices.

**What was "Difficulty too low" actually telling us?**
The pool rebuilt a header that wasn't the one the chip hashed (bit 23 mismatch), hashed
it, and got a random number — which almost never meets the share target. The share was
fine; the reconstruction wasn't.

**Does this affect big ASICs (S19s etc.)?**
They suffered the same class of problem with mismatched masks. The strip + full mask
combination is the one configuration that's correct for stock firmware across the
board — spec-compliant rollers, mask-ignoring firmware, and non-rolling miners alike
(non-rollers simply mine the clean job version as-is).

**Where's the deep technical writeup?**
The DigiByte repo: `BIT_ISSUE.md` (full root-cause with code citations),
`POOL_BIT23_HOTFIX_GUIDE.md` (guidance for other pool software, incl. MiningCore), and
`BIT23_MATH_EXPLAINED.md` (the bit math, step by step).
