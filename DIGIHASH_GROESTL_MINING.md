# Mining Myriad-Groestl on DigiHash (AMD GPU / sgminer)

A practical guide to point AMD GPUs at **DigiHash's Groestl** algorithm. The goal is
**defensive**: legitimate miners hashing Groestl take block rewards away from the attacker
who reactivated the retired algorithm, and drive its difficulty up so their cheap mining
stops being cheap. This is a stopgap until DigiByte Core **v9.26.2** activates and rejects
Groestl network-wide (block 23,808,000), after which you point this hashpower back at the
five normal DigiByte algorithms.

**Miner used:** sgminer fork → **https://github.com/gto90/sgminer** (has the
`myriadcoin-groestl` kernel).

> DigiByte's "Groestl" is **Myriad-Groestl** (Groestl-512 → SHA-256). In sgminer the
> algorithm name is **`myriadcoin-groestl`** — not plain `groestl` (that's double-Groestl,
> the wrong hash).

---

## 1. Connection details (DigiHash)

| Field | Value |
|-------|-------|
| Host | `digihash.digibyte.io` |
| Algorithm | `myriadcoin-groestl` |
| Ports (difficulty tiers) | **3014** = single GPU · **3038** = multiple GPUs · **3262** = farm |
| Username | your DigiByte payout address (optionally `address.workername`) |
| Password | anything (`x`) |

Pick the port that matches your scale. A 1–4 GPU desktop → **3038**.

---

## 2. Build sgminer (one-time)

Clone the fork that has the `myriadcoin-groestl` kernel: **https://github.com/gto90/sgminer**.
On a modern distro (GCC 10+, current AMD ROCm/OpenCL) two build flags are required or the
link fails:

```bash
git clone https://github.com/gto90/sgminer.git
cd sgminer
git submodule update --init --recursive          # pulls the jansson submodule
./autogen.sh
CFLAGS="-O2 -Wall -march=native -std=gnu99 -fgnu89-inline -fcommon" ./configure
make -j$(nproc)
```

- `-fgnu89-inline` — fixes `undefined reference to x14hash/freshHash/...` (C99 inline semantics).
- `-fcommon` — fixes `multiple definition of opencl_drv/base_contexts` (GCC 10+ defaults to `-fno-common`).

Verify it sees your GPUs and the algo:
```bash
./sgminer -n                                      # lists OpenCL devices
./sgminer --algorithm myriadcoin-groestl -n       # "Set default algorithm to myriadcoin-groestl"
```

Tested working on **2× Radeon RX 7900 XTX (RDNA3 / gfx1100)** — kernel compiles and runs
with **0 hardware errors**.

---

## 3. ⚠️ Read this before mining on a desktop — it WILL freeze your screen

**If a GPU drives your monitor and you mine it at high intensity, your desktop locks up.**

Why: `intensity` sets the OpenCL work-batch size. At intensity ~19+, each kernel dispatch
occupies the GPU for hundreds of milliseconds. Your desktop compositor needs that *same*
GPU to draw frames (~16 ms each), but its render commands queue up behind the giant mining
batches → frames stop → the GUI freezes. The card with no monitor attached is unaffected;
the **display card** is the one that locks up.

**Find which card drives your display:**
```bash
for c in /sys/class/drm/card*-*; do [ "$(cat $c/status 2>/dev/null)" = connected ] && echo "$c"; done
clinfo --raw | grep -E 'CL_DEVICE_NAME|CL_DEVICE_TOPOLOGY'   # map OpenCL device index -> PCI bus
```
Match the connected card's PCI bus to its sgminer device index (`-d 0,1,...`).

### Three ways to mine without freezing the desktop

1. **Best — move the display off the mining GPUs.** Plug your monitor into the
   **motherboard/iGPU** output. Then *both* dGPUs are free and mine at full intensity with a
   perfectly smooth desktop.
2. **Per-device intensity (mine both, desktop stays smooth).** Keep the display GPU gentle
   and run the other card hard. sgminer's `--intensity` takes a comma list mapped to `-d`:
   ```
   -d 0,1 --intensity 17,21      # device 0 = display (gentle), device 1 = free (hard)
   ```
3. **Dedicated rig (no monitor on the GPUs).** Run everything full-tilt: `--intensity 21`.

---

## 4. Optimum settings (measured: 2× RX 7900 XTX, myriadcoin-groestl)

Per-card hashrate vs intensity (each card):

| Intensity | Hashrate / card | Notes |
|---|---|---|
| 13 | ~52 Mh/s | safe floor for a display GPU |
| 17 | ~115 Mh/s | **desktop-smooth on a 7900 XTX display card** |
| 21 | ~178 Mh/s | **sweet spot — peak with HW:0** |
| 22 | ~179 Mh/s | diminishing returns |

- **Sweet spot per card ≈ intensity 21 → ~178 Mh/s.** Above that, gains are tiny.
- `worksize 256`, `gpu-threads 1` were best. `gpu-threads 2` gave no clear win.
- intensity 20–22 are all **HW:0** (correct hashing) — the limit is *desktop responsiveness*,
  not the cards.

**Recommended by setup:**

| Setup | Setting | Result |
|---|---|---|
| Desktop, monitor on a mining GPU | free card `21`, **display card: start `13`, step up watching smoothness** (`17` was smooth on a 7900 XTX) | smooth desktop, ~290 Mh/s for 2 cards |
| Desktop, monitor on iGPU **or** headless rig | `--intensity 21` (all cards) | ~355 Mh/s for 2 cards |

> The display-card number is **rig-specific** — it depends on your GPU and how busy your
> desktop is. Start at 13, raise it one step at a time, and back off the moment the desktop
> stutters. The free card (no monitor) can always run at 21.

Anti-stale tuning for DigiByte's 15 s blocks (fewer wasted shares): `--expiry 15 --scan-time 8 --queue 0`.

---

## 5. Ready-to-use config (`digihash-groestl.conf`)

```json
{
  "pools": [{
    "name": "DigiHash-Groestl",
    "url": "stratum+tcp://digihash.digibyte.io:3038",
    "user": "YOUR_DGB_ADDRESS.gpu1",
    "pass": "x",
    "algorithm": "myriadcoin-groestl"
  }],
  "gpu-platform": "0",
  "device": "0,1",
  "intensity": "17,21",
  "worksize": "256",
  "gpu-threads": "1",
  "expiry": "15",
  "scan-time": "8",
  "queue": "0",
  "no-adl": true,
  "failover-only": true,
  "text-only": true,
  "api-listen": true,
  "api-port": "4028"
}
```

Replace `YOUR_DGB_ADDRESS`. **Confirm `device` / `intensity` order matches *your* display
card** — in the example, device 0 is the display card (kept at 17) and device 1 is the free
card (21). On a headless/dedicated rig use `"intensity": "21"`.

Run it:
```bash
./sgminer --config digihash-groestl.conf
```

---

## 6. Confirm it's actually mining

Healthy output looks like:
```
Stratum authorisation success for DigiHash-Groestl
DigiHash-Groestl difficulty changed to 3
Accepted 302d2bda Diff 5.314/3.000 GPU 1
GPU0 | (5s):115M  A:.. R:0 HW:0     GPU1 | (5s):178M  A:.. R:0 HW:0
```
You want: **Accepted shares climbing, Rejected ~0, HW:0.** `HW:0` means the kernel is
producing valid hashes. A few rejects are normal on a 15 s-block chain (stale work).

Live per-card stats (API): `echo '{"command":"devs"}' | nc 127.0.0.1 4028`

---

## 7. Notes

- This is a **temporary defensive tactic.** It self-terminates when v9.26.2's algolock
  activates at block **23,808,000** — after that, Groestl blocks are rejected and you should
  point this hashpower back at the five normal DigiByte algorithms.
- More total Groestl hashpower beats any single-rig tuning: **the more legitimate miners on
  the Groestl port, the faster the attacker's share shrinks and their difficulty climbs.**
- Watch GPU temps if you raise intensity; these settings were HW-error-free but every
  card/cooling setup differs.
