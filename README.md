# HVPS Controller

A web-based High Voltage Power Supply controller that communicates with HVPS devices using the Web Serial API.

## Features

- **Real-time monitoring**: Live voltage, current, and temperature readings
- **Setpoint control**: Set voltage and current limits with validation
- **Emergency stop**: Immediate E-STOP functionality with keyboard shortcut (Escape)
- **Web Serial API**: Direct serial communication without drivers
- **Responsive design**: Works on desktop and mobile devices
- **Accessibility**: WCAG AA compliant with screen reader support
- **Watchdog system**: Detects stale connections and communication issues

## Requirements

- **Browser**: Chrome 89+, Edge 89+, or other Chromium-based browsers
- **Operating System**: Windows 10+, macOS, or Linux
- **Device**: HVPS with USB-to-Serial interface (FTDI, CP210x, etc.)
- **Protocol**: Device must implement the documented HVPS protocol

## Protocol Overview

The application communicates using ASCII commands wrapped in brackets:

- `[XTMP]` → `[S_T025]` - Temperature reading (25°C)
- `[XV]` → `[S_V123]` - Voltage reading (12.3V)  
- `[XA]` → `[S_A015]` - Current reading (1.5A)
- `[XV123]` → `[X_V123]` - Set voltage to 12.3V
- `[XA015]` → `[X_A015]` - Set current limit to 1.5A
- `[ERST]` → `[E_RST]` - Emergency reset

## Getting Started

1. **Enable Web Serial API** (if not already enabled):
   - Chrome: chrome://flags/#enable-experimental-web-platform-features
   - Edge: edge://flags/#enable-experimental-web-platform-features

2. **Open the application**:
   - Open `index.html` in your browser
   - Or serve via HTTP server for production use

3. **Connect to device**:
   - Click "Connect to Device"
   - Select your HVPS serial port
   - Default baud rate: 9600

4. **Control the device**:
   - Monitor live readings in the top panel
   - Set voltage/current using the control inputs
   - Use E-STOP button or press Escape for emergency stop

## Keyboard Shortcuts

- `Escape`: Emergency stop (E-STOP)
- `Ctrl + Enter`: Connect/Disconnect toggle
- `Ctrl + Shift + D`: Toggle debug log (debug mode only)

## File Structure

```
├── index.html              # Main HTML page
├── styles.css              # Responsive CSS styling  
├── js/
│   ├── serialService.js    # Web Serial API wrapper
│   ├── rxParser.js         # Message parsing and validation
│   ├── txScheduler.js      # Command scheduling (100ms cadence)
│   ├── store.js            # Application state management
│   ├── ui.js               # DOM manipulation and events
│   └── app.js              # Main application logic
├── README.md               # This file
├── Remedi_pc_psu_protocol.md  # Protocol specification
└── sdr.md                  # Software design requirements
```

## Architecture

The application follows a modular architecture:

- **SerialService**: Handles Web Serial API communication
- **RxParser**: Parses incoming messages and validates format
- **TxScheduler**: Manages outgoing commands with priority queue
- **Store**: Centralized state management with event system
- **UIController**: Binds application state to DOM elements
- **HVPSApp**: Main application coordinator

## Communication Flow

1. **TX Loop** (100ms interval):
   - Priority 1: E-STOP commands
   - Priority 2: Custom high-priority commands
   - Priority 3: Voltage setpoints
   - Priority 4: Current setpoints  
   - Priority 5: Polling cycle (temperature → voltage → current)

2. **RX Loop** (continuous):
   - Parse incoming tokens from serial buffer
   - Update application state
   - Refresh watchdog timer
   - Update UI displays

3. **Watchdog** (250ms interval):
   - Monitor for stale data (>500ms since last message)
   - Gray out controls when connection is stale
   - E-STOP remains available even when stale

## Safety Features

- **Always-available E-STOP**: Works even with stale connections
- **Input validation**: Prevents invalid setpoints (0-120kV, 0-10mA)
- **Setpoint verification**: Warns if device acknowledgment doesn't match
- **Connection monitoring**: Detects and reports communication issues
- **Graceful error handling**: Clear error messages and recovery options

## Troubleshooting

### Connection Issues
- Ensure Web Serial API is enabled in browser flags
- Check that device is connected and recognized by OS
- Try different baud rates if default doesn't work
- Verify device implements the required protocol

### No Data Received
- Check device is powered and responding
- Verify correct COM port selection
- Monitor debug log for communication details
- Try disconnecting/reconnecting

### Performance Issues
- Close other applications using serial ports
- Reduce browser tab count if experiencing lag
- Check for JavaScript errors in browser console

### Browser Compatibility
- Use Chrome 89+ or Edge 89+ for best support
- Firefox does not support Web Serial API
- Safari does not support Web Serial API

## Development

### Testing

The application includes self-test methods for key components:

```javascript
// Test RX parser
const results = RxParser.runSelfTest();

// Test TX scheduler  
const schedulerTest = await TxScheduler.runSelfTest();

// Get application diagnostics
const diag = window.hvpsApp.getDiagnostics();
```

### Debug Mode

Enable debug mode in localStorage to see detailed communication logs:

```javascript
localStorage.setItem('hvps-settings', JSON.stringify({
  debugMode: true
}));
```

### Settings

Settings are automatically saved to localStorage:

- `baudRate`: Serial baud rate (default: 9600)
- `stalenessThreshold`: Watchdog timeout (default: 500ms)
- `maxVoltage`: Maximum voltage limit (default: 120kV)
- `maxCurrent`: Maximum current limit (default: 10mA)
- `debugMode`: Enable debug logging (default: false)

## Security

- Web Serial API requires user gesture (button click) to access ports
- No cloud connectivity - all data stays local
- Optional localStorage for settings only
- No sensitive data transmission or storage

## License

This software is provided as-is for educational and research purposes.

## Support

For issues related to:
- **Protocol**: See `Remedi_pc_psu_protocol.md`
- **Requirements**: See `sdr.md`  
- **Implementation**: Check browser console for errors
- **Hardware**: Consult device documentation