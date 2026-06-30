# Mining Myriad-Groestl on DigiHash (AMD & NVIDIA GPU / sgminer)

A practical guide to point AMD GPUs at **DigiHash's Groestl** algorithm. The goal is
**defensive**: legitimate miners hashing Groestl take block rewards away from the attacker
who reactivated the retired algorithm, and drive its difficulty up so their cheap mining
stops being cheap. This is a stopgap until DigiByte Core **v9.26.2** activates and rejects
Groestl network-wide (block 23,808,000), after which you point this hashpower back at the
five normal DigiByte algorithms.

**Miner used:** sgminer fork → **https://github.com/gto90/sgminer** (has the
`myriadcoin-groestl` kernel).

> **NVIDIA users (RTX 30/40/50-series):** same fork, same build. The
> `myriadcoin-groestl` kernel is portable OpenCL with no AMD-only intrinsics, so it
> compiles and runs natively on NVIDIA through the driver's OpenCL — **including
> brand-new Blackwell / RTX 50-series cards — with no CUDA toolkit.** Jump to **§7**
> for measured RTX 5070 Ti settings and an important display-card finding (good news:
> on Blackwell, mining the display GPU does **not** freeze the desktop).

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
*(This is the AMD experience. **NVIDIA Blackwell / RTX 50-series behaves differently** — it
preempts cleanly and does **not** freeze; see §7.3. The rest of this section still applies to
AMD and to pre-Blackwell NVIDIA.)*

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

## 7. NVIDIA GPUs (RTX 50-series / Blackwell) — measured on 2× RTX 5070 Ti

Everything above (§1 connection details, §2 build, §5 config shape, §6 health checks)
applies to NVIDIA unchanged. This section adds the NVIDIA-specific deltas and the
**measured** numbers from a rig with **2× GeForce RTX 5070 Ti** (GB203, Blackwell /
`sm_120`, 16 GB, 300 W cap), driver 595.71.05, OpenCL 3.0 / CUDA 13.2, Ubuntu 24.04.

> **Headline results**
> - **~220 Mh/s per card** at the sweet spot — roughly **20–25% faster than an RX 7900
>   XTX** on the same algo (218 vs 178 Mh/s), at only **~190 W of the 300 W limit** and
>   **≤ 69 °C**. The kernel, not power or heat, is the ceiling.
> - **~437 Mh/s measured for the 2-card rig**, **HW:0**, shares accepted from both cards.
> - **The display GPU never freezes the desktop — even at max intensity 24.** Unlike the
>   RX 7900 XTX (which locks up at intensity ≥ 19, see §3), Blackwell time-slices the GPU
>   between mining and the X compositor, so the desktop stays smooth on demand.

### 7.1 Build deltas vs §2
Same `gto90/sgminer` fork, same `./configure` flags, same `make`. On NVIDIA you only need
the OpenCL headers + loader; the GPU driver already installs the NVIDIA OpenCL ICD
(`/etc/OpenCL/vendors/nvidia.icd`). No CUDA toolkit required to build or run.
```bash
sudo apt install -y opencl-headers ocl-icd-opencl-dev clinfo libtool   # plus the §2 deps
clinfo | grep -E 'Device Name|Device Topology'   # both GPUs should list under "NVIDIA CUDA"
```
Then build exactly as §2. First run compiles a per-GPU kernel binary
(`Building binary myriadcoin-groestl…GeForce RTX 5070 Ti…bin`) and runs at **HW:0**.
ADL is AMD-only, so GPU monitoring is via `nvidia-smi` instead — `"no-adl": true` is
already in the config and `clinfo`/`nvidia-smi` cover device discovery and telemetry.

### 7.2 Find which card drives your display (do this first)
```bash
nvidia-smi          # the GPU with "Disp.A = On" and Xorg/your desktop in the process list
                    # is the DISPLAY card; the other is FREE
```
sgminer enumerates OpenCL devices in **PCI-bus order, which matches the `nvidia-smi` GPU
index**. On this rig that made **`-d 0` = display card (PCI 01:00.0, HDMI)** and
**`-d 1` = free card (PCI 05:00.0)** — confirmed empirically (mining `-d 1` loaded the
05:00.0 card to 100% while the display card stayed at 1% / 13 W). Verify yours the same
way and map the per-device `intensity` list to `-d` accordingly.

### 7.3 Display-card behaviour — better than AMD, but still worth tuning
The display card was escalated through intensity **14 → 24** while a constant 60 FPS GL
workload (glxgears) and a 1 Hz input-latency probe ran on the same desktop. Result at
**every** intensity, including 24: **a flat 60 FPS, 1–5 ms input latency, zero freezes.**
Blackwell preempts the mining kernel whenever the compositor needs to draw, so the desktop
stays responsive even with the display card pinned at 99–100%.

The trade-off is throughput, not stability:
- With the desktop **busy** (constant GL load), the display card's rate peaks ~**130 Mh/s
  at intensity 21** and slightly *declines* above that (preemption overhead) — pushing
  intensity higher gains nothing.
- With the desktop **idle/normal**, the display card mines at nearly full speed
  (~**216 Mh/s at intensity 20** in the 2-card run) because the compositor only borrows
  the GPU when it actually has frames to draw.

**Recommendation:** run the free card hard (intensity 22) and the display card one notch
lower (intensity 20). That leaves preemption headroom for heavy desktop bursts (video, 3D,
window dragging) while still mining ~216 Mh/s on the display card when the desktop is idle.
You *can* run the display card at 22–24 without freezing — it just buys no extra hashrate
and less headroom.

### 7.4 Optimum settings (measured: RTX 5070 Ti, `myriadcoin-groestl`, worksize 256, gpu-threads 1)

Per-card hashrate vs intensity (free card, no display load), all **HW:0**:

| Intensity | Mh/s / card | Power | Temp | Notes |
|---|---|---|---|---|
| 16 | 174 | 163 W | 65 °C | |
| 18 | 204 | 181 W | 68 °C | |
| 20 | 215 | 188 W | 68 °C | |
| 21 | 216 | 189 W | 69 °C | knee |
| **22** | **218** | 190 W | 69 °C | **sweet spot** |
| 23 | 219 | 191 W | 69 °C | diminishing |
| 24 | 220 | 191 W | 69 °C | peak (+0.6% over 22) |

- **Sweet spot ≈ intensity 22 → ~218 Mh/s.** Intensity 23–24 add < 1%.
- `worksize 256` was best; `64`/`128` within noise. **`gpu-threads 2` *hurt* (~207 Mh/s,
  −6%) — keep `gpu-threads 1`.** `rawintensity` gave no benefit; plain `--intensity`
  already saturates the card.
- **Kernel-bound, not power- or thermal-bound:** peaks at ~190 W of the 300 W limit and
  never exceeds ~69–73 °C at stock. Raising the power limit does nothing.

**Recommended by setup:**

| Setup | Setting | Measured result |
|---|---|---|
| Desktop, monitor on a mining card (this rig) | `-d 0,1 --intensity 20,22` (display 20, free 22) | **~437 Mh/s** for 2 cards, desktop stays smooth |
| Monitor on iGPU **or** headless rig | `--intensity 22` (all cards) | **~2 × 220 ≈ 440 Mh/s** |

Anti-stale tuning for DigiByte's 15 s blocks (same as AMD): `--expiry 15 --scan-time 8 --queue 0`.

### 7.5 Ready-to-use config (`digihash-groestl-nvidia.conf`)

```json
{
  "pools": [{
    "name": "DigiHash-Groestl",
    "url": "stratum+tcp://digihash.digibyte.io:3038",
    "user": "YOUR_DGB_ADDRESS.nvidia",
    "pass": "x",
    "algorithm": "myriadcoin-groestl"
  }],
  "gpu-platform": "0",
  "device": "0,1",
  "intensity": "20,22",
  "worksize": "256",
  "gpu-threads": "1",
  "expiry": "15",
  "scan-time": "8",
  "queue": "0",
  "no-adl": true,
  "failover-only": true,
  "text-only": true,
  "api-listen": true,
  "api-allow": "W:127.0.0.1",
  "api-port": "4028"
}
```

Replace `YOUR_DGB_ADDRESS`. **Confirm device 0 is *your* display card** (`nvidia-smi`); if
yours is reversed, swap the `intensity` order to `"22,20"`. On a headless/iGPU rig set
`"device": "0,1"`, `"intensity": "22"`. Run it:
```bash
./sgminer --config digihash-groestl-nvidia.conf
```
Healthy combined output: `(5s):437M … A:.. R:0 HW:0`, both GPUs ~190–200 W, ≤ 73 °C.
Live per-card stats: `echo '{"command":"devs"}' | nc 127.0.0.1 4028`.

### 7.6 What about ccminer (CUDA)?
ccminer is the "canonical" NVIDIA Myriad-Groestl miner (`-a myr-gr`), and CUDA can edge out
OpenCL on some algos. But on **Blackwell + CUDA 13 it won't build out of the box**:
`tpruvot/ccminer` is frozen at 2019 / CUDA-11-era code, emits only `compute_52`, and its
scrypt kernels use texture references that CUDA 12 removed. The working path is to build
`compute_90` **PTX** under CUDA 11.8 (e.g. the `nvidia/cuda:11.8.0-devel-ubuntu22.04`
container) and let the driver JIT-forward-compile it to `sm_120` at launch — a real detour.
Since sgminer's OpenCL kernel already runs at **~220 Mh/s/card with HW:0**, **sgminer is the
recommended path on these cards.** ccminer is only worth trying if you want to chase a
possible few-percent CUDA gain (not benchmarked here).

---

## 8. Notes

- This is a **temporary defensive tactic.** It self-terminates when v9.26.2's algolock
  activates at block **23,808,000** — after that, Groestl blocks are rejected and you should
  point this hashpower back at the five normal DigiByte algorithms.
- More total Groestl hashpower beats any single-rig tuning: **the more legitimate miners on
  the Groestl port, the faster the attacker's share shrinks and their difficulty climbs.**
- Watch GPU temps if you raise intensity; these settings were HW-error-free but every
  card/cooling setup differs.
