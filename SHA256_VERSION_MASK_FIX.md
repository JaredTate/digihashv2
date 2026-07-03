# Fixing SHA256 Mining on DigiByte v9.26.x (Bit 23 / Version Rolling)

**Who this is for:** pool operators and miner firmware devs.
**What it fixes:** SHA256 miners (NerdAxe, NerdQAxe, Bitaxe, S19-class) losing ~half
their shares on DigiByte v9.26.x pools — `Difficulty too low` rejects, vanishing
hashrate, duplicate-share storms.

---

## 1. The problem — 30 seconds

DigiByte v9.26.x nodes set the DigiDollar activation signal on **bit 23** of the block
version. Bit 23 sits inside **bits 13–28** — the exact region SHA256 ASICs overwrite
as scratch space for version rolling (AsicBoost).

Miner firmware was written assuming that region starts **empty**. On v8 it always did.
On v9 it doesn't — and the miner's share math breaks on roughly **half of all shares**.

| Symptom | Cause |
|---|---|
| `Difficulty too low` rejects | pool rebuilds a header the chip never hashed |
| Hashrate ~55% of chip spec, clean accepts | firmware silently discards half its own shares |
| `duplicate share` storms | pool's duplicate check can't tell rolled shares apart |

Nothing is wrong with the miners, the chips, or the node. **It's the job format.**

## 2. Why it happens — 60 seconds

```
node → pool:   getblocktemplate version = 20800202   (bit 23 set)
pool → miner:  job goes out with that version
ASIC:          OVERWRITES bits 13–28 with its own counter (bit 23 flips randomly)
miner ← ASIC:  firmware rebuilds "what did the chip hash?" using OR:
               rolled_version = job_version | counter        ← assumes region was empty
```

OR can turn bits on but never off. When the job already has bit 23 **on** and the chip
turns it **off**, the firmware reconstructs the wrong header → wrong hash → a good
share gets discarded or rejected. Coin flip per share: ~50% loss.

## 3. The fix — 3 steps, same on every pool

**Step 1 — Strip the rolling region from every SHA256 job.**
Jobs must go out with version `20000202`, **not** `20800202`.

**Step 2 — Grant and validate the FULL rolling mask `1fffe000`.**
In the `mining.configure` response *and* in share validation. Never narrow it to
"protect" bit 23 — chips roll that bit no matter what; a narrow mask just turns their
legal work into rejects.

**Step 3 — Restart the SHA256 port; miners reconnect** (power-cycle to be sure), so
`mining.configure` renegotiates.

Steps 1 and 2 only work **together**: the strip makes the firmware's math correct;
the full mask makes the chip's inevitable bit-23 flips legal and merged back
faithfully.

## 4. Applying it on your software

### DigiHash / NOMP-style pools (this repo)

```bash
npm update stratum-pool      # v0.3.0 does step 1 automatically + fixes duplicate detection
# coins/digibyte.sha256.json must keep:  "version_mask": "1fffe000"
# restart the SHA256 pool process
```

Only SHA256 is touched. Scrypt/Skein/Qubit/Odo configs have no `version_mask`, so
their jobs keep bit 23 and keep signaling DigiDollar on every block.

### MiningCore

One line where the job takes the template version (`BitcoinJob.cs`), for the
DGB-sha256 pool only:

```csharp
version = BlockTemplate.Version & ~0x00800000u;
```

Leave the global `VersionRollingPoolMask` at `0x1fffe000`. It is shared by every
SHA256 coin on the instance — narrowing it fixed DGB but broke BTC/BCH in field
testing.

### Any other stratum

Apply the same three rules:

1. Strip in **one place** (where the GBT version enters the job) so the job
   announcement, share validation, and block submission all agree.
2. Include the miner's `version_bits` in your **duplicate-share key** — with rolling,
   two valid shares can differ only in those bits.
3. Roll out on a fresh job (`clean_jobs = true`).

### Miner firmware (NerdAxe / NerdQAxe / Bitaxe)

The root fix is one line — replace the OR with a masked merge:

```c
rolled_version = (job->version & ~0x1fffe000) | (version_bits << 13);
```

NerdQAxe also needs the pool-granted mask actually programmed into the ASIC
(upstream issue shufps/ESP-Miner-NerdQAxePlus **#640**). Until those ship in a
release: **mine on a pool that applied steps 1–3. No device setting works around
this.**

## 5. Verifying the fix works

Check these four things, in order:

1. **Job version is clean.** `mining.notify` for SHA256 shows version `20000202`.
2. **Full mask granted.** The `mining.configure` response contains
   `"version-rolling.mask": "1fffe000"`.
3. **Math check.** A share with `version_bits = 03fe2000` on job `20000202` must
   validate against header version `23fe2202`. (Real values from a NerdQAxe++ log.)
4. **Results.** `Difficulty too low` rejects go to zero and credited hashrate returns
   to chip spec (a NerdQAxe++ reads ~11.3 TH/s again). Accepted shares show a mix of
   `version_bits` with bit 23 on (`03fe2000`) and off (`00034000`) — both are normal.

If something still fails:

| Still seeing | It means | Do this |
|---|---|---|
| notify shows `20800202` | strip not active | update stratum-pool / apply the one-liner; check `version_mask` is set for the coin |
| rejects continue, and **rejected** shares have bit 23 set in `version_bits` | a narrowed mask somewhere (grant or validation) | set BOTH to full `1fffe000` |
| `duplicate share` storm | dup key ignores version bits | include `version_bits` in the key (stratum-pool v0.3.0 does) |
| one miner still at ~55%, no rejects | it connected before the restart | power-cycle that miner |

## 6. FAQ

**Does stripping bit 23 hurt DigiDollar activation?**
No. Bit 23 is a vote, never a validity rule — a block is equally valid with or without
it. The chip's own rolling still sets it on ~half this port's blocks (free signaling),
the other four algos signal on 100% of theirs, and from block **23,788,800** every
upgraded node also signals **bit 0**, which rolling cannot touch.

**Why can't the pool just keep bit 23 fixed and forbid rolling it?**
The hardware can't comply. BM13xx chips roll bits 13–28 as one contiguous counter —
there's no way to fence off one bit in the middle, and some firmware never loads the
pool's mask into the chip at all.

**What did "Difficulty too low" actually mean?**
The pool rebuilt a header that wasn't the one the chip hashed (bit 23 mismatch),
hashed it, and got a random number — which almost never meets the target. The share
was fine; the reconstruction wasn't.

**Where's the deep technical writeup?**
DigiByte repo: `BIT_ISSUE.md` (root cause with code citations),
`POOL_BIT23_HOTFIX_GUIDE.md`, and `BIT23_MATH_EXPLAINED.md` (the bit math, step by
step). The stratum fix itself: `node-stratum-pool` commit `e564a00`, tests in
`lib/test_versionroll.js`.
