# DigiHash v2 — SHA256 Version-Mask Fix (ASICBoost / NerdAxe / Bitaxe)

*Why some SHA256 miners lost ~half their hashrate on DigiByte v9.26.x pools, and exactly
how DigiHash fixed it. Written to be understandable with zero prior stratum knowledge.*

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
