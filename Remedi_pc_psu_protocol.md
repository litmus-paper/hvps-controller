# Protocol Specification for PC ↔ Power Supply Communication

This document describes the observed communication protocol between a PC (host controller) and a power supply device, as inferred from captured traffic. The PC sends bracket-wrapped ASCII commands, and the device responds with bracket-wrapped ASCII status or acknowledgements.

---

## General Format

- **Tokens:** ASCII text enclosed in square brackets `[ ... ]`.
- **Direction:**
  - PC → Device: commands and setpoints.
  - Device → PC: status reports, acknowledgements, and heartbeats.
- **Batching:** Multiple tokens can appear back-to-back in a stream.
- **Numeric Fields:** Three-digit decimal values (000–999), fixed-width, zero-padded.

---

## Command Set

### 1. Temperature

- **Poll Temperature**\
  PC: `[XTMP]`\
  Device: `[S_Tnnn]` → Temperature in whole °C (e.g., `025` = 25 °C).

### 2. Voltage

- **Read Voltage**\
  PC: `[XV]`\
  Device: `[S_Vnnn]` → Voltage reading (likely decivolts; e.g., `010` ≈ 1.0 V).

- **Set Voltage**\
  PC: `[XVnnn]`\
  Device: `[X_Vnnn]` (acknowledgement).\
  A subsequent `[XV]` poll returns `[S_Vnnn]`.

### 3. Current

- **Read Current**\
  PC: `[XA]`\
  Device: `[S_Annn]` → Output current (likely deci-amps).

- **Set Current Limit**\
  PC: `[XAnnn]`\
  Device: `[X_Annn]` (acknowledgement).

### 4. Reset

- **Error/Status Reset**\
  PC: `[ERST]`\
  Device: `[E_RST]`.

### 5. Heartbeat / Banner

- Device occasionally sends `[LIVE]` before or between status messages. This functions as a keep-alive signal and can be ignored for command/response purposes.

---

## Typical Communication Sequences

### Poll Loop

```
PC → [XTMP]   → Device → [S_T025]
PC → [XV]     → Device → [S_V000]
PC → [XA]     → Device → [S_A000]
(repeats)
```

### Reset and Initialization

```
PC → [ERST]   → Device → [E_RST]
PC → [XV000]  → Device → [X_V000]
PC → [XA000]  → Device → [X_A000]
```

### Voltage Ramp Example

```
PC → [XV010]  → Device → [X_V010]
PC → [XV]     → Device → [S_V010]
PC → [XA]     → Device → [S_A000]

PC → [XV020]  → Device → [X_V020]
PC → [XV]     → Device → [S_V020]
PC → [XA]     → Device → [S_A000]

PC → [XV030]  → Device → [X_V030]
PC → [XV]     → Device → [S_V030]
PC → [XA]     → Device → [S_A000]
```

---

## Field Scaling (Inferred)

- **Temperature:** `nnn` = °C.
- **Voltage:** `nnn` / 10 = Volts.
- **Current:** `nnn` / 10 = Amps (limit and measurement).

---

## Summary of Message Types

| Category    | PC → Device | Device → PC | Meaning            |
| ----------- | ----------- | ----------- | ------------------ |
| Temperature | `XTMP`      | `S_Tnnn`    | Read temperature   |
| Voltage     | `XV`        | `S_Vnnn`    | Read voltage       |
| Voltage     | `XVnnn`     | `X_Vnnn`    | Set voltage        |
| Current     | `XA`        | `S_Annn`    | Read current       |
| Current     | `XAnnn`     | `X_Annn`    | Set current limit  |
| Reset       | `ERST`      | `E_RST`     | Reset/clear errors |
| Heartbeat   | —           | `LIVE`      | Keep-alive/banner  |

---

## Implementation Notes

- Each command must be wrapped in brackets before transmission.
- Device acknowledgements (`X_…`) mirror setpoints.
- Device status (`S_…`) must be polled explicitly; the device does not stream continuous measurements.
- Occasional unsolicited `[LIVE]` messages may occur.

---

## Recommendations for Testing

- Verify scaling by sweeping voltage (`XVnnn`) beyond 9.9 V (e.g., `XV120` → expect `12.0 V`).
- Test current limit commands with non-zero values to confirm amperage scaling.
- Investigate whether an output-enable command exists (not present in the captured trace).

---

