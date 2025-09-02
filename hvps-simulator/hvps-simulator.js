const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

class HVPSSimulator {
    constructor(configPath = './config.json') {
        this.loadConfig(configPath);
        this.temperature = this.config.simulator.initialTemperature;
        this.voltage = this.config.simulator.initialVoltage;
        this.current = this.config.simulator.initialCurrent;
        this.currentLimit = this.config.simulator.defaultCurrentLimit;
        this.serialPort = null;
        this.parser = null;
    }

    loadConfig(configPath) {
        try {
            const configFile = fs.readFileSync(configPath, 'utf8');
            this.config = JSON.parse(configFile);
        } catch (error) {
            console.error('Error loading config file:', error.message);
            console.log('Using default configuration...');
            this.config = {
                serialPort: {
                    path: "COM3",
                    baudRate: 9600,
                    dataBits: 8,
                    parity: "none",
                    stopBits: 1,
                    flowControl: "none",
                    autoOpen: true
                },
                simulator: {
                    initialTemperature: 25,
                    initialVoltage: 0,
                    initialCurrent: 0,
                    defaultCurrentLimit: 100,
                    debugOutput: true
                }
            };
        }
    }

    // Format number to 3-digit zero-padded string
    formatNumber(num) {
        return num.toString().padStart(3, '0');
    }

    // Parse command and return response
    processCommand(command) {
        // Remove brackets and trim
        const cmd = command.replace(/[\[\]]/g, '').trim();
        
        switch (cmd) {
            case 'XTMP':
                // Temperature poll - return current temperature
                return `[S_T${this.formatNumber(this.temperature)}]`;
                
            case 'XV':
                // Voltage read - return current voltage
                return `[S_V${this.formatNumber(this.voltage)}]`;
                
            case 'XA':
                // Current read - return current measurement
                return `[S_A${this.formatNumber(this.current)}]`;
                
            case 'ERST':
                // Error reset
                this.voltage = 0;
                this.current = 0;
                return '[E_RST]';
                
            default:
                // Check for set voltage command (XVnnn)
                if (cmd.startsWith('XV') && cmd.length === 5) {
                    const voltageStr = cmd.substring(2);
                    if (/^\d{3}$/.test(voltageStr)) {
                        this.voltage = parseInt(voltageStr);
                        // Simulate some current based on voltage (simplified)
                        this.current = Math.min(Math.floor(this.voltage * 0.5), this.currentLimit);
                        return `[X_V${this.formatNumber(this.voltage)}]`;
                    }
                }
                
                // Check for set current limit command (XAnnn)
                if (cmd.startsWith('XA') && cmd.length === 5) {
                    const currentStr = cmd.substring(2);
                    if (/^\d{3}$/.test(currentStr)) {
                        this.currentLimit = parseInt(currentStr);
                        // Adjust current if it exceeds new limit
                        this.current = Math.min(this.current, this.currentLimit);
                        return `[X_A${this.formatNumber(this.currentLimit)}]`;
                    }
                }
                
                // Unknown command - return error or ignore
                return null;
        }
    }

    // Handle serial port data
    handleSerialData(data) {
        let buffer = data.toString();
        
        // Process complete commands (bracketed tokens)
        let bracketStart = buffer.indexOf('[');
        let bracketEnd = buffer.indexOf(']');
        
        while (bracketStart !== -1 && bracketEnd !== -1 && bracketEnd > bracketStart) {
            const command = buffer.substring(bracketStart, bracketEnd + 1);
            if (this.config.simulator.debugOutput) {
                console.log(`Received: ${command}`);
            }
            
            const response = this.processCommand(command);
            if (response) {
                if (this.config.simulator.debugOutput) {
                    console.log(`Sending: ${response}`);
                }
                if (this.serialPort && this.serialPort.isOpen) {
                    this.serialPort.write(response);
                }
            }
            
            // Remove processed command from buffer
            buffer = buffer.substring(bracketEnd + 1);
            bracketStart = buffer.indexOf('[');
            bracketEnd = buffer.indexOf(']');
        }
    }

    // Start serial port communication
    async startSerial() {
        try {
            const portConfig = {
                path: this.config.serialPort.path,
                baudRate: this.config.serialPort.baudRate,
                dataBits: this.config.serialPort.dataBits,
                parity: this.config.serialPort.parity,
                stopBits: this.config.serialPort.stopBits,
                autoOpen: false
            };

            this.serialPort = new SerialPort(portConfig);

            // Open the port
            await new Promise((resolve, reject) => {
                this.serialPort.open((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`HVPS Simulator connected to ${this.config.serialPort.path}`);
            console.log('Serial port configuration:');
            console.log(`  Port: ${this.config.serialPort.path}`);
            console.log(`  Baud Rate: ${this.config.serialPort.baudRate}`);
            console.log(`  Data Bits: ${this.config.serialPort.dataBits}`);
            console.log(`  Parity: ${this.config.serialPort.parity}`);
            console.log(`  Stop Bits: ${this.config.serialPort.stopBits}`);
            
            console.log('\nCommands supported:');
            console.log('  [XTMP] - Get temperature');
            console.log('  [XV] - Get voltage');
            console.log('  [XVnnn] - Set voltage (nnn = decivolts)');
            console.log('  [XA] - Get current');
            console.log('  [XAnnn] - Set current limit (nnn = deci-amps)');
            console.log('  [ERST] - Reset');
            
            console.log('\nSimulator state:');
            console.log(`  Temperature: ${this.temperature}°C`);
            console.log(`  Voltage: ${this.voltage / 10}V`);
            console.log(`  Current: ${this.current / 10}A`);
            console.log(`  Current Limit: ${this.currentLimit / 10}A`);

            // Handle incoming data
            this.serialPort.on('data', (data) => {
                this.handleSerialData(data);
            });

            this.serialPort.on('error', (err) => {
                console.error('Serial port error:', err.message);
            });

            this.serialPort.on('close', () => {
                console.log('Serial port closed');
            });

        } catch (error) {
            console.error('Failed to open serial port:', error.message);
            console.log('Available ports:');
            try {
                const ports = await SerialPort.list();
                ports.forEach(port => {
                    console.log(`  ${port.path} - ${port.manufacturer || 'Unknown'}`);
                });
            } catch (listErr) {
                console.error('Could not list ports:', listErr.message);
            }
            throw error;
        }
    }

    // Interactive console for testing
    startConsole() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'HVPS> '
        });

        console.log('\nInteractive console started. Type commands without brackets:');
        console.log('Examples: XTMP, XV, XV050, XA, XA025, ERST');
        console.log('Type "quit" to exit console mode.\n');

        rl.prompt();

        rl.on('line', (input) => {
            const trimmed = input.trim();
            
            if (trimmed.toLowerCase() === 'quit') {
                rl.close();
                return;
            }

            if (trimmed) {
                const command = `[${trimmed}]`;
                console.log(`Processing: ${command}`);
                const response = this.processCommand(command);
                if (response) {
                    console.log(`Response: ${response}`);
                } else {
                    console.log('Unknown command or invalid format');
                }
                console.log(`State: T=${this.temperature}°C, V=${this.voltage/10}V, A=${this.current/10}A`);
            }
            
            rl.prompt();
        });

        rl.on('close', () => {
            console.log('\nConsole mode ended.');
        });
    }

    stop() {
        if (this.serialPort && this.serialPort.isOpen) {
            this.serialPort.close((err) => {
                if (err) {
                    console.error('Error closing serial port:', err.message);
                } else {
                    console.log('Serial port closed.');
                }
            });
        }
    }

    // List available serial ports
    static async listPorts() {
        try {
            const ports = await SerialPort.list();
            console.log('Available serial ports:');
            if (ports.length === 0) {
                console.log('  No serial ports found');
            } else {
                ports.forEach(port => {
                    console.log(`  ${port.path} - ${port.manufacturer || 'Unknown manufacturer'} ${port.productId ? `(PID: ${port.productId})` : ''}`);
                });
            }
            return ports;
        } catch (error) {
            console.error('Error listing ports:', error.message);
            return [];
        }
    }
}

// Main execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const mode = args[0] || 'serial';
    const configPath = args[1] || './config.json';
    
    if (mode === 'list') {
        // List available ports and exit
        HVPSSimulator.listPorts().then(() => {
            process.exit(0);
        });
    } else if (mode === 'console') {
        // Console mode only
        const simulator = new HVPSSimulator(configPath);
        simulator.startConsole();
    } else {
        // Serial mode (default)
        const simulator = new HVPSSimulator(configPath);
        
        simulator.startSerial().then(() => {
            // Also start console for interactive testing
            setTimeout(() => {
                simulator.startConsole();
            }, 100);
        }).catch((error) => {
            console.error('Failed to start simulator:', error.message);
            process.exit(1);
        });
        
        // Handle shutdown gracefully
        process.on('SIGINT', () => {
            console.log('\nShutting down...');
            simulator.stop();
            setTimeout(() => process.exit(0), 1000);
        });
    }
}

module.exports = HVPSSimulator;