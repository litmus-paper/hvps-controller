const { SerialPort } = require('serialport');
const fs = require('fs');

class TestClient {
    constructor(configPath = './config.json') {
        this.serialPort = null;
        this.loadConfig(configPath);
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
                    stopBits: 1
                }
            };
        }
    }

    async connect() {
        return new Promise((resolve, reject) => {
            const portConfig = {
                path: this.config.serialPort.path,
                baudRate: this.config.serialPort.baudRate,
                dataBits: this.config.serialPort.dataBits,
                parity: this.config.serialPort.parity,
                stopBits: this.config.serialPort.stopBits,
                autoOpen: false
            };

            this.serialPort = new SerialPort(portConfig);
            
            this.serialPort.open((err) => {
                if (err) {
                    console.error('Failed to open serial port:', err.message);
                    reject(err);
                    return;
                }
                
                console.log(`Connected to HVPS simulator on ${this.config.serialPort.path}`);
                resolve();
            });

            this.serialPort.on('data', (data) => {
                console.log(`Received: ${data.toString().trim()}`);
            });

            this.serialPort.on('error', (err) => {
                console.error('Serial port error:', err.message);
            });

            this.serialPort.on('close', () => {
                console.log('Serial port closed');
            });
        });
    }

    sendCommand(command) {
        return new Promise((resolve) => {
            if (this.serialPort && this.serialPort.isOpen) {
                console.log(`Sending: ${command}`);
                this.serialPort.write(command);
                // Give some time for response
                setTimeout(resolve, 200);
            } else {
                console.error('Serial port not open');
                resolve();
            }
        });
    }

    async runTests() {
        try {
            console.log('=== HVPS Simulator Test Client (Serial) ===\n');
            console.log(`Connecting to ${this.config.serialPort.path}...`);
            
            await this.connect();
            
            console.log('\n--- Testing Temperature ---');
            await this.sendCommand('[XTMP]');
            
            console.log('\n--- Testing Voltage Read ---');
            await this.sendCommand('[XV]');
            
            console.log('\n--- Testing Voltage Set ---');
            await this.sendCommand('[XV050]');  // Set to 5.0V
            await this.sendCommand('[XV]');     // Read it back
            
            console.log('\n--- Testing Current ---');
            await this.sendCommand('[XA]');     // Read current
            await this.sendCommand('[XA025]');  // Set limit to 2.5A
            await this.sendCommand('[XA]');     // Read current again
            
            console.log('\n--- Testing Reset ---');
            await this.sendCommand('[ERST]');
            await this.sendCommand('[XV]');     // Should be 0 after reset
            
            console.log('\n--- Example from user request ---');
            await this.sendCommand('[XTMP]');   // Should get [S_T025]
            await this.sendCommand('[XV]');     // Should get [S_Vnnn]  
            await this.sendCommand('[XV100]');  // Should get [X_V100]
            
            console.log('\nTest completed!');
            
        } catch (error) {
            console.error('Test failed:', error.message);
        } finally {
            this.disconnect();
        }
    }

    disconnect() {
        if (this.serialPort && this.serialPort.isOpen) {
            this.serialPort.close((err) => {
                if (err) {
                    console.error('Error closing serial port:', err.message);
                } else {
                    console.log('Disconnected from serial port');
                }
            });
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const client = new TestClient();
    client.runTests().then(() => {
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}

module.exports = TestClient;