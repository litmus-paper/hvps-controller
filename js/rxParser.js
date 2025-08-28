class RxParser {
    constructor() {
        this.onTemperatureUpdate = null;
        this.onVoltageUpdate = null;
        this.onCurrentUpdate = null;
        this.onVoltageAck = null;
        this.onCurrentAck = null;
        this.onResetAck = null;
        this.onHeartbeat = null;
        this.onParseError = null;
        
        // Statistics
        this.stats = {
            totalMessages: 0,
            validMessages: 0,
            parseErrors: 0,
            lastErrorTime: null,
            lastErrorToken: null
        };
    }

    parseToken(token) {
        if (!token || typeof token !== 'string') {
            this.handleParseError('Invalid token format', token);
            return false;
        }

        this.stats.totalMessages++;

        try {
            // Temperature reading: S_Tnnn
            const tempMatch = token.match(/^S_T(\d{3})$/);
            if (tempMatch) {
                const temperature = parseInt(tempMatch[1], 10);
                this.stats.validMessages++;
                this.notifyTemperatureUpdate(temperature);
                return true;
            }

            // Voltage reading: S_Vnnn
            const voltageMatch = token.match(/^S_V(\d{3})$/);
            if (voltageMatch) {
                const voltageRaw = parseInt(voltageMatch[1], 10);
                const voltage = voltageRaw / 10.0; // Convert from decivolts to volts
                this.stats.validMessages++;
                this.notifyVoltageUpdate(voltage);
                return true;
            }

            // Current reading: S_Annn
            const currentMatch = token.match(/^S_A(\d{3})$/);
            if (currentMatch) {
                const currentRaw = parseInt(currentMatch[1], 10);
                const current = currentRaw / 10.0; // Convert from deciamps to amps
                this.stats.validMessages++;
                this.notifyCurrentUpdate(current);
                return true;
            }

            // Voltage setpoint acknowledgment: X_Vnnn
            const voltageAckMatch = token.match(/^X_V(\d{3})$/);
            if (voltageAckMatch) {
                const voltageRaw = parseInt(voltageAckMatch[1], 10);
                const voltage = voltageRaw / 10.0;
                this.stats.validMessages++;
                this.notifyVoltageAck(voltage);
                return true;
            }

            // Current setpoint acknowledgment: X_Annn
            const currentAckMatch = token.match(/^X_A(\d{3})$/);
            if (currentAckMatch) {
                const currentRaw = parseInt(currentAckMatch[1], 10);
                const current = currentRaw / 10.0;
                this.stats.validMessages++;
                this.notifyCurrentAck(current);
                return true;
            }

            // Reset acknowledgment: E_RST
            if (token === 'E_RST') {
                this.stats.validMessages++;
                this.notifyResetAck();
                return true;
            }

            // Heartbeat/banner: LIVE
            if (token === 'LIVE') {
                this.stats.validMessages++;
                this.notifyHeartbeat();
                return true;
            }

            // Unknown token
            this.handleParseError('Unknown token format', token);
            return false;

        } catch (error) {
            this.handleParseError(`Parse exception: ${error.message}`, token);
            return false;
        }
    }

    handleParseError(message, token) {
        this.stats.parseErrors++;
        this.stats.lastErrorTime = Date.now();
        this.stats.lastErrorToken = token;
        
        console.warn(`RxParser: ${message}, token: "${token}"`);
        
        if (this.onParseError) {
            this.onParseError(message, token);
        }
    }

    // Notification methods
    notifyTemperatureUpdate(temperature) {
        if (this.onTemperatureUpdate) {
            this.onTemperatureUpdate(temperature);
        }
    }

    notifyVoltageUpdate(voltage) {
        if (this.onVoltageUpdate) {
            this.onVoltageUpdate(voltage);
        }
    }

    notifyCurrentUpdate(current) {
        if (this.onCurrentUpdate) {
            this.onCurrentUpdate(current);
        }
    }

    notifyVoltageAck(voltage) {
        if (this.onVoltageAck) {
            this.onVoltageAck(voltage);
        }
    }

    notifyCurrentAck(current) {
        if (this.onCurrentAck) {
            this.onCurrentAck(current);
        }
    }

    notifyResetAck() {
        if (this.onResetAck) {
            this.onResetAck();
        }
    }

    notifyHeartbeat() {
        if (this.onHeartbeat) {
            this.onHeartbeat();
        }
    }

    // Utility methods for formatting outgoing commands
    static formatVoltageCommand(voltage) {
        // Convert voltage to decivolts and format as 3-digit zero-padded string
        const decivolts = Math.round(voltage * 10);
        const clampedDecivolts = Math.max(0, Math.min(999, decivolts));
        return `XV${clampedDecivolts.toString().padStart(3, '0')}`;
    }

    static formatCurrentCommand(current) {
        // Convert current to deciamps and format as 3-digit zero-padded string
        const deciamps = Math.round(current * 10);
        const clampedDeciamps = Math.max(0, Math.min(999, deciamps));
        return `XA${clampedDeciamps.toString().padStart(3, '0')}`;
    }

    static formatTemperaturePoll() {
        return 'XTMP';
    }

    static formatVoltagePoll() {
        return 'XV';
    }

    static formatCurrentPoll() {
        return 'XA';
    }

    static formatResetCommand() {
        return 'ERST';
    }

    // Validation methods
    static validateVoltage(voltage) {
        if (typeof voltage !== 'number' || isNaN(voltage)) {
            return { valid: false, error: 'Voltage must be a number' };
        }
        if (voltage < 0 || voltage > 120) {
            return { valid: false, error: 'Voltage must be between 0 and 120 kV' };
        }
        return { valid: true };
    }

    static validateCurrent(current) {
        if (typeof current !== 'number' || isNaN(current)) {
            return { valid: false, error: 'Current must be a number' };
        }
        if (current < 0 || current > 10) {
            return { valid: false, error: 'Current must be between 0 and 10 mA' };
        }
        return { valid: true };
    }

    // Statistics and diagnostics
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalMessages > 0 
                ? (this.stats.validMessages / this.stats.totalMessages * 100).toFixed(1) + '%' 
                : '0%'
        };
    }

    resetStats() {
        this.stats = {
            totalMessages: 0,
            validMessages: 0,
            parseErrors: 0,
            lastErrorTime: null,
            lastErrorToken: null
        };
    }

    // Test methods for validation
    static runSelfTest() {
        const parser = new RxParser();
        const results = [];

        // Test cases
        const testCases = [
            // Valid cases
            { token: 'S_T025', expected: 'temperature', value: 25 },
            { token: 'S_V123', expected: 'voltage', value: 12.3 },
            { token: 'S_A015', expected: 'current', value: 1.5 },
            { token: 'X_V100', expected: 'voltageAck', value: 10.0 },
            { token: 'X_A050', expected: 'currentAck', value: 5.0 },
            { token: 'E_RST', expected: 'resetAck' },
            { token: 'LIVE', expected: 'heartbeat' },
            
            // Invalid cases
            { token: 'INVALID', expected: 'error' },
            { token: 'S_T', expected: 'error' },
            { token: 'S_V12', expected: 'error' },
            { token: '', expected: 'error' }
        ];

        // Set up test handlers
        let lastResult = null;
        parser.onTemperatureUpdate = (temp) => lastResult = { type: 'temperature', value: temp };
        parser.onVoltageUpdate = (volt) => lastResult = { type: 'voltage', value: volt };
        parser.onCurrentUpdate = (curr) => lastResult = { type: 'current', value: curr };
        parser.onVoltageAck = (volt) => lastResult = { type: 'voltageAck', value: volt };
        parser.onCurrentAck = (curr) => lastResult = { type: 'currentAck', value: curr };
        parser.onResetAck = () => lastResult = { type: 'resetAck' };
        parser.onHeartbeat = () => lastResult = { type: 'heartbeat' };
        parser.onParseError = (msg, token) => lastResult = { type: 'error', message: msg, token };

        // Run tests
        for (const testCase of testCases) {
            lastResult = null;
            parser.parseToken(testCase.token);
            
            const passed = lastResult && 
                lastResult.type === testCase.expected &&
                (testCase.value === undefined || Math.abs(lastResult.value - testCase.value) < 0.01);
                
            results.push({
                token: testCase.token,
                expected: testCase.expected,
                actual: lastResult ? lastResult.type : 'null',
                passed: passed
            });
        }

        return results;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.RxParser = RxParser;
}