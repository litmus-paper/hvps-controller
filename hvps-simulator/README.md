# HVPS Simulator

A Node.js simulator for the High Voltage Power Supply (HVPS) protocol based on the Remedi PC-PSU protocol specification. Communicates via serial port (COM port) using configurable parameters.

## Features

- Serial port communication with HVPS protocol commands
- JSON configuration file for COM port settings
- Interactive console mode for testing
- Supports all protocol commands:
  - Temperature polling (`[XTMP]` → `[S_T025]`)
  - Voltage reading (`[XV]` → `[S_Vnnn]`)
  - Voltage setting (`[XVnnn]` → `[X_Vnnn]`)
  - Current reading (`[XA]` → `[S_Annn]`)
  - Current limit setting (`[XAnnn]` → `[X_Annn]`)
  - Error reset (`[ERST]` → `[E_RST]`)

## Configuration

Edit `config.json` to set your COM port parameters:

```json
{
  "serialPort": {
    "path": "COM3",
    "baudRate": 9600,
    "dataBits": 8,
    "parity": "none",
    "stopBits": 1,
    "flowControl": "none",
    "autoOpen": true
  },
  "simulator": {
    "initialTemperature": 25,
    "initialVoltage": 0,
    "initialCurrent": 0,
    "defaultCurrentLimit": 100,
    "debugOutput": true
  }
}
```

## Usage

### List Available Serial Ports
```bash
node hvps-simulator.js list
# or
npm run list
```

### Start Serial Communication (default mode)
```bash
node hvps-simulator.js
# or
npm start
```

### Start in Console Mode Only
```bash
node hvps-simulator.js console
# or  
npm run console
```

### Run Test Client
```bash
node test-client.js
# or
npm test
```

## Protocol Examples

| Input | Output | Description |
|-------|--------|-------------|
| `[XTMP]` | `[S_T025]` | Read temperature (25°C) |
| `[XV]` | `[S_V000]` | Read voltage (0.0V) |
| `[XV050]` | `[X_V050]` | Set voltage to 5.0V |
| `[XA]` | `[S_A000]` | Read current (0.0A) |
| `[XA025]` | `[X_A025]` | Set current limit to 2.5A |
| `[ERST]` | `[E_RST]` | Reset system |

## Requirements

- Node.js (version 14 or higher)
- Available COM port (physical or virtual)
- Windows, macOS, or Linux

## Notes

- Voltage values are in decivolts (nnn/10 = volts)
- Current values are in deci-amps (nnn/10 = amps) 
- Temperature is in whole degrees Celsius
- Does not send unsolicited `[LIVE]` tokens as requested
- Simulated current changes based on voltage settings
- Configure the correct COM port in `config.json` before running
- Use `npm run list` to see available serial ports on your system