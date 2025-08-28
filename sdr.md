# Software Design Requirements (SDR) — HVPS Control (Web Serial, JS/HTML/CSS)

## 1) Overview & Scope

A single-page web application (SPA) that runs in a Chromium-based browser and communicates with a High Voltage Power Supply (HVPS) over a serial (COM) port using the Web Serial API. The app provides live readouts (Voltage, Current, Temperature), allows setting Voltage and Current Limit, and implements an emergency stop (E-STOP).

## 2) Target Environment

- **Runtime:** Modern Chromium browsers (Chrome/Edge) with Web Serial enabled.
- **OS:** Windows 10+ (primary), macOS/Linux (best-effort; serial driver dependent).
- **Device link:** USB-to-Serial (CDC/FTDI/CP210x) exposed as COM/tty.
- **Language/stack:** HTML + CSS + JavaScript (no backend).

## 3) Communication Protocol (Summary)

- **Transport:** 8-N-1 serial ASCII stream; messages are **tokens wrapped in brackets**: `[ ... ]`.
- **Batching:** Tokens may appear back-to-back without separators.
- **Numerics:** Fixed-width 3 digits `000–999`.
- **Core commands:**

  - **Poll Temperature:** `PC [XTMP]` → `Dev [S_Tnnn]` (°C).
  - **Read Voltage:** `PC [XV]` → `Dev [S_Vnnn]` (voltage, nnn/10 V).
  - **Set Voltage:** `PC [XVnnn]` → `Dev [X_Vnnn]` ack.
  - **Read Current:** `PC [XA]` → `Dev [S_Annn]` (current, nnn/10 A).
  - **Set Current Limit:** `PC [XAnnn]` → `Dev [X_Annn]` ack.
  - **Reset:** `PC [ERST]` → `Dev [E_RST]`.
  - **Heartbeat/banner (unsolicited):** `Dev [LIVE]` (ignore for logic; counts as activity).

- **Scaling (inferred):** V = `nnn/10` V; A = `nnn/10` A; T = integer °C.
- The device **does not** stream measurements; **PC must poll**.

## 4) UX & UI Requirements

**Visible elements (enabled when link healthy):**

- **Actual Voltage** (read-only).
- **Actual Current** (read-only).
- **Actual Temperature** (read-only).
- **Voltage setpoint input** + **“Set”** button.
- **Current limit input** + **“Set”** button.
- **E-STOP** (always enabled).

**Connectivity affordances:**

- **“Connect”** button (opens Web Serial port picker).
- Port/bps/status indicator (Connected / No data / Stale / Error).

**Staleness handling (watchdog):**

- If **no message received for ≥ 500 ms**, gray out all UI **except E-STOP**. Re-enable when any valid token is received.

**Validation & formatting:**

- Setpoint inputs accept **numeric with one decimal** (e.g., 12.3 V, 1.5 A). Internally convert to protocol `nnn` (0–999). Clamp to device range if known; otherwise clamp to `0.0–99.9` by default and surface range in UI help.

**E-STOP behavior:**

- On press, **immediately enqueue high-priority** `[ERST]` and visually latch an **“E-STOP sent”** state until a reply (`[E_RST]`) or user clears.

**Accessibility:**

- Keyboard operable; focus order logical; ARIA live region for status; color-contrast ≥ WCAG AA.

## 5) Functional Requirements (I/O Loops & Timing)

**Separate Read and Write processes** (independent async loops):

### 5.1 Write Loop (100 ms cadence, one command per tick)

**Priority queue** (highest first):

1. **E-STOP** request → send `[ERST]` once per press (debounce 250 ms).
2. **Pending setpoints** (voltage/current) → send `[XVnnn]` / `[XAnnn]`.
3. **Polling cycle** (round-robin):

   - `XTMP` (temperature)
   - `XV` (read voltage)
   - `XA` (read current)

**Rules:**

- Do not exceed **1 command / 100 ms** (10 Hz).
- If a higher-priority item arrives, it preempts the poll order for the next tick.
- After sending a setpoint, **do not immediately resend** the same setpoint unless changed by the user.

### 5.2 Read Loop (continuous)

- Non-blocking reader accumulates bytes, extracts bracketed tokens `\[([^\]]+)\]` (supports back-to-back tokens).
- For each token:

  - Match and **update UI**:

    - `S_Vnnn` → Actual Voltage.
    - `S_Annn` → Actual Current.
    - `S_Tnnn` → Actual Temperature.

  - Acks:

    - `X_Vnnn` / `X_Annn` → clear pending setpoint state.

  - `E_RST` → clear E-STOP latch / show “Reset acknowledged”.
  - `LIVE` → ignore semantically but **refresh activity timer**.

- Update **last-received timestamp**. Watchdog drives “stale UI” state (≥ 500 ms).

## 6) State Machine

**Connection:** `DISCONNECTED → PORT_SELECTED → CONNECTED → ALIVE`

- `ALIVE` = received at least one valid token within last 500 ms.
  Transitional errors (port lost, decode error) return to `CONNECTED (stale)` or `DISCONNECTED` as appropriate and surface toast/log.

**E-STOP sub-state:** `idle → requested → acknowledged`. Time out after 1 s without `[E_RST]` → show warning but keep system operable and continue polls.

## 7) Web Serial API Integration

- `navigator.serial.requestPort({ filters: [...] })`
- `port.open({ baudRate: <configurable, default 9600> })`
- Writer: `TextEncoder().encode('[CMD]')` → `writable.getWriter().write(...)`
- Reader: `readable.getReader().read()` loop; stitch chunks; parse.
- **Line discipline:** No terminators; rely on brackets.
- **Reconnect flow:** On disconnect event, stop loops, gray UI (except E-STOP disabled because no link), prompt to reconnect.

## 8) Data & Modules

- **`SerialService`**: open/close, reader/writer, health timestamps.
- **`TxScheduler`**: 100 ms timer, priority queue, poll round-robin.
- **`RxParser`**: tokenization and message decoding.
- **`Store`** (state): `actualV/A/T`, `pendingSetV/A`, `stale`, `connState`, `lastRxAt`, `lastTxAt`.
- **`UI`**: binds store → DOM; disables on `stale`.

## 9) Parsing & Formatting

**Outgoing:**

- Voltage set `V_set_decivolts = round(V_user * 10)` → `[XV${nnn}]`
- Current set `A_set_deciamps = round(A_user * 10)` → `[XA${nnn}]`
- Polls `[XTMP]`, `[XV]`, `[XA]`; Reset `[ERST]`.

**Incoming (regexes):**

- `/^S_V(\d{3})$/` → volts = `parseInt(nnn)/10`
- `/^S_A(\d{3})$/` → amps = `parseInt(nnn)/10`
- `/^S_T(\d{3})$/` → degC = `parseInt(nnn)`
- `/^X_V(\d{3})$/`, `/^X_A(\d{3})$/`, `/^E_RST$/`, `/^LIVE$/`

**Tokenizer:**

- Stream buffer; find `'['` then next `']'`; extract; continue (handles `[TOK1][TOK2]` without whitespace).

## 10) Timing, Rate Limits, & Watchdogs

- **Tx period:** 100 ms (configurable; default 100 ms; min 100 ms).
- **Rx staleness:** UI goes **stale** at `now - lastRxAt ≥ 500 ms`.
- **Command pacing:** Never send multiple tokens in the same 100 ms tick.
- **Setpoint coalescing:** If user types quickly, only last value before next tick is sent.

## 11) Error Handling & Robustness

- **Malformed token:** discard; log count; does not advance UI; still refresh activity if bracketed but unknown? **No**, only refresh on known tokens or `[LIVE]`.
- **Ack mismatch:** Ack value differs from sent setpoint → display warning; continue polling.
- **Port errors:** close gracefully; present reconnect UI.
- **E-STOP with link down:** Show “Not sent—disconnected”.

## 12) Security & Privacy

- Web Serial is **user-gesture gated**; no background access.
- No cloud; no PII stored. Optional local settings in `localStorage` (baud, last port id if allowed).

## 13) Performance Targets

- First paint < 1 s.
- UI update within ≤ 50 ms of message parse.
- No missed 100 ms ticks under normal load.

## 14) Test Plan (Acceptance Criteria)

**Protocol conformance** (using a loopback or simulator):

1. On connect, app begins polling (`XTMP`, `XV`, `XA`) in round-robin at ≤ 10 Hz total; one command each 100 ms.
2. When user sets 12.3 V → app sends `[XV123]`; upon device ack `[X_V123]`, next voltage poll returns `[S_V123]`; UI shows **12.3 V**.

3. When user sets 1.5 A → app sends `[XA015]`; ack `[X_A015]`; current polls show `[S_A000…]` (if no load) and UI updates.

4. Press **E-STOP** → immediate `[ERST]`; on `[E_RST]` UI shows reset acknowledged.

5. If **no tokens received for 500 ms**, all controls (except E-STOP) gray out; any subsequent valid token (including `[LIVE]`) restores UI.

6. Parser correctly handles concatenated tokens like `[S_V010][S_A000][S_T025]`.

## 15) Example Sequences (for QA)

- **Steady poll loop (1 s window):**
  t=0ms `[XTMP]` → rx `[S_T025]`
  t=100ms `[XV]` → rx `[S_V000]`
  t=200ms `[XA]` → rx `[S_A000]`
  … repeat.

- **Voltage ramp:** send `[XV010]`, ack `[X_V010]`; subsequent polls show `[S_V010]`; then `[XV020]` … etc.

## 16) Non-Functional Requirements

- **Reliability:** tolerate brief framing glitches; never freeze the E-STOP control.
- **Maintainability:** modules decoupled; pure functions for encode/decode; unit tests for parser/formatter and scheduler.
- **Internationalization:** numeric formatting fixed to dot decimal in protocol; UI may localize labels only.

## 17) Risks & Mitigations

- **Browser support variance (Web Serial):** document tested versions; provide graceful message if unsupported.
- **Unknown device limits:** expose setpoint ranges as settings; default to conservative 0–99.9.
- **Throughput contention:** 100 ms pacing avoids overruns while meeting responsiveness targets.

## 18) Deliverables

- Source code (HTML/CSS/JS) with README.
- Test harness (simulator or scriptable serial echo).
- QA checklist mapped to §14.
- Deployment guide (how to enable Web Serial flag if enterprise-locked).

---

### Appendix A — DOM IDs (proposed)

- `#btnConnect`, `#portStatus`
- `#actVoltage`, `#actCurrent`, `#actTemp`
- `#inVoltage`, `#btnSetVoltage`
- `#inCurrent`, `#btnSetCurrent`
- `#btnEstop`

### Appendix B — Pseudocode (scheduling core)

```text
Every 100 ms (Tx tick):
  if estopRequested: send "[ERST]"; estopRequested = false; return
  if pendingSetVoltage != null: send "[XV" + fmt3(pendingSetVoltage) + "]"; pendingSetVoltage = null; return
  if pendingSetCurrent != null: send "[XA" + fmt3(pendingSetCurrent) + "]"; pendingSetCurrent = null; return
  switch pollPhase:
    0: send "[XTMP]"; pollPhase = 1
    1: send "[XV]";   pollPhase = 2
    2: send "[XA]";   pollPhase = 0
```

```text
Rx loop:
  buffer += incomingChunk
  while buffer contains '[' ... ']':
    token = extractBracketToken()
    lastRxAt = now
    if token matches S_Vnnn → ui.actualV = nnn/10
    else if S_Annn → ui.actualA = nnn/10
    else if S_Tnnn → ui.temp = nnn
    else if X_Vnnn → clear setV busy
    else if X_Annn → clear setA busy
    else if E_RST  → clear estop latch
    else if LIVE   → // ignore, but counts as activity
```

This SDR defines the behavior, timing, parsing, UI states, and acceptance criteria needed to implement the HVPS controller safely and predictably using the documented protocol.&#x20;
