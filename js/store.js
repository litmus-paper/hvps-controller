class Store {
    constructor() {
        // Connection state
        this.connectionState = 'disconnected'; // 'disconnected', 'connected', 'stale', 'error'
        this.isStale = false;
        
        // Actual readings from device
        this.actualVoltage = null;
        this.actualCurrent = null;
        this.actualTemperature = null;
        
        // User setpoints and their states
        this.voltageSetpoint = 0;
        this.currentSetpoint = 0;
        this.pendingVoltageSet = false;
        this.pendingCurrentSet = false;
        
        // E-STOP state
        this.estopState = 'idle'; // 'idle', 'requested', 'acknowledged'
        this.estopMessage = '';
        
        // Timestamps
        this.lastRxAt = 0;
        this.lastTxAt = 0;
        this.lastUpdateAt = 0;
        
        // Error state
        this.lastError = null;
        this.errorCount = 0;
        
        // Settings
        this.settings = {
            baudRate: 9600,
            stalenessThreshold: 500, // ms
            maxVoltage: 120,
            maxCurrent: 10,
            debugMode: false
        };
        
        // Event listeners
        this.listeners = {
            stateChange: [],
            readingUpdate: [],
            connectionChange: [],
            error: []
        };
        
        // Load settings from localStorage if available
        this.loadSettings();
    }

    // State management methods
    setState(updates) {
        const oldState = this.getState();
        let hasChanges = false;

        for (const [key, value] of Object.entries(updates)) {
            if (this.hasOwnProperty(key) && this[key] !== value) {
                this[key] = value;
                hasChanges = true;
            }
        }

        if (hasChanges) {
            this.lastUpdateAt = Date.now();
            this.notifyListeners('stateChange', {
                oldState: oldState,
                newState: this.getState(),
                changes: updates
            });
        }
    }

    getState() {
        return {
            connectionState: this.connectionState,
            isStale: this.isStale,
            actualVoltage: this.actualVoltage,
            actualCurrent: this.actualCurrent,
            actualTemperature: this.actualTemperature,
            voltageSetpoint: this.voltageSetpoint,
            currentSetpoint: this.currentSetpoint,
            pendingVoltageSet: this.pendingVoltageSet,
            pendingCurrentSet: this.pendingCurrentSet,
            estopState: this.estopState,
            estopMessage: this.estopMessage,
            lastRxAt: this.lastRxAt,
            lastTxAt: this.lastTxAt,
            lastUpdateAt: this.lastUpdateAt,
            lastError: this.lastError,
            errorCount: this.errorCount,
            settings: { ...this.settings }
        };
    }

    // Connection state methods
    setConnectionState(state) {
        if (state !== this.connectionState) {
            const oldState = this.connectionState;
            this.setState({ connectionState: state });
            this.notifyListeners('connectionChange', { oldState, newState: state });
        }
    }

    setStale(stale) {
        if (stale !== this.isStale) {
            this.setState({ isStale: stale });
        }
    }

    // Reading update methods
    updateActualVoltage(voltage) {
        this.setState({ actualVoltage: voltage, lastRxAt: Date.now() });
        this.notifyListeners('readingUpdate', { type: 'voltage', value: voltage });
    }

    updateActualCurrent(current) {
        this.setState({ actualCurrent: current, lastRxAt: Date.now() });
        this.notifyListeners('readingUpdate', { type: 'current', value: current });
    }

    updateActualTemperature(temperature) {
        this.setState({ actualTemperature: temperature, lastRxAt: Date.now() });
        this.notifyListeners('readingUpdate', { type: 'temperature', value: temperature });
    }

    // Setpoint methods
    setVoltageSetpoint(voltage) {
        const validation = RxParser.validateVoltage(voltage);
        if (!validation.valid) {
            throw new Error(validation.error);
        }
        
        this.setState({ 
            voltageSetpoint: voltage,
            pendingVoltageSet: true 
        });
    }

    setCurrentSetpoint(current) {
        const validation = RxParser.validateCurrent(current);
        if (!validation.valid) {
            throw new Error(validation.error);
        }
        
        this.setState({ 
            currentSetpoint: current,
            pendingCurrentSet: true 
        });
    }

    // Acknowledgment methods (called when device confirms setpoints)
    acknowledgeVoltageSet(voltage) {
        this.setState({ 
            pendingVoltageSet: false,
            lastRxAt: Date.now()
        });

        // Verify the acknowledged value matches what we sent
        if (Math.abs(voltage - this.voltageSetpoint) > 0.01) {
            this.setError(`Voltage setpoint mismatch: sent ${this.voltageSetpoint}V, device acknowledged ${voltage}V`);
        }
    }

    acknowledgeCurrentSet(current) {
        this.setState({ 
            pendingCurrentSet: false,
            lastRxAt: Date.now()
        });

        // Verify the acknowledged value matches what we sent
        if (Math.abs(current - this.currentSetpoint) > 0.01) {
            this.setError(`Current setpoint mismatch: sent ${this.currentSetpoint}A, device acknowledged ${current}A`);
        }
    }

    // E-STOP methods
    requestEstop() {
        this.setState({ 
            estopState: 'requested',
            estopMessage: 'E-STOP sent, waiting for acknowledgment...'
        });
    }

    acknowledgeEstop() {
        this.setState({ 
            estopState: 'acknowledged',
            estopMessage: 'Emergency stop acknowledged',
            lastRxAt: Date.now()
        });

        // Auto-clear the message after a few seconds
        setTimeout(() => {
            if (this.estopState === 'acknowledged') {
                this.setState({ 
                    estopState: 'idle',
                    estopMessage: ''
                });
            }
        }, 3000);
    }

    clearEstopState() {
        this.setState({ 
            estopState: 'idle',
            estopMessage: ''
        });
    }

    // Error handling
    setError(error) {
        this.setState({ 
            lastError: error,
            errorCount: this.errorCount + 1
        });
        this.notifyListeners('error', { error, count: this.errorCount });
    }

    clearError() {
        this.setState({ lastError: null });
    }

    // Timestamp updates
    updateLastRx() {
        this.setState({ lastRxAt: Date.now() });
    }

    updateLastTx() {
        this.setState({ lastTxAt: Date.now() });
    }

    // Settings management
    updateSetting(key, value) {
        if (this.settings.hasOwnProperty(key)) {
            this.settings[key] = value;
            this.saveSettings();
            this.setState({ settings: { ...this.settings } });
        }
    }

    updateSettings(newSettings) {
        Object.assign(this.settings, newSettings);
        this.saveSettings();
        this.setState({ settings: { ...this.settings } });
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('hvps-settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                Object.assign(this.settings, parsed);
            }
        } catch (error) {
            console.warn('Failed to load settings from localStorage:', error);
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('hvps-settings', JSON.stringify(this.settings));
        } catch (error) {
            console.warn('Failed to save settings to localStorage:', error);
        }
    }

    // Event listener management
    addEventListener(type, callback) {
        if (this.listeners[type]) {
            this.listeners[type].push(callback);
        }
    }

    removeEventListener(type, callback) {
        if (this.listeners[type]) {
            const index = this.listeners[type].indexOf(callback);
            if (index > -1) {
                this.listeners[type].splice(index, 1);
            }
        }
    }

    notifyListeners(type, data) {
        if (this.listeners[type]) {
            for (const callback of this.listeners[type]) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${type} listener:`, error);
                }
            }
        }
    }

    // Utility methods
    isConnected() {
        return this.connectionState === 'connected';
    }

    isDataCurrent() {
        if (!this.isConnected()) return false;
        const now = Date.now();
        return (now - this.lastRxAt) < this.settings.stalenessThreshold;
    }

    getTimeSinceLastRx() {
        if (this.lastRxAt === 0) return null;
        return Date.now() - this.lastRxAt;
    }

    getTimeSinceLastTx() {
        if (this.lastTxAt === 0) return null;
        return Date.now() - this.lastTxAt;
    }

    // Reset methods
    reset() {
        this.setState({
            connectionState: 'disconnected',
            isStale: false,
            actualVoltage: null,
            actualCurrent: null,
            actualTemperature: null,
            voltageSetpoint: 0,
            currentSetpoint: 0,
            pendingVoltageSet: false,
            pendingCurrentSet: false,
            estopState: 'idle',
            estopMessage: '',
            lastRxAt: 0,
            lastTxAt: 0,
            lastError: null,
            errorCount: 0
        });
    }

    resetReadings() {
        this.setState({
            actualVoltage: null,
            actualCurrent: null,
            actualTemperature: null
        });
    }

    // Diagnostics and debugging
    getDiagnostics() {
        const now = Date.now();
        return {
            state: this.getState(),
            timeSinceLastRx: this.getTimeSinceLastRx(),
            timeSinceLastTx: this.getTimeSinceLastTx(),
            uptime: this.lastUpdateAt > 0 ? now - this.lastUpdateAt : 0,
            isDataFresh: this.isDataCurrent(),
            pendingOperations: {
                voltage: this.pendingVoltageSet,
                current: this.pendingCurrentSet,
                estop: this.estopState === 'requested'
            }
        };
    }

    exportState() {
        return {
            timestamp: Date.now(),
            state: this.getState(),
            diagnostics: this.getDiagnostics()
        };
    }

    // Validation helpers
    validateSetpoints() {
        const errors = [];
        
        if (this.voltageSetpoint < 0 || this.voltageSetpoint > this.settings.maxVoltage) {
            errors.push(`Voltage setpoint ${this.voltageSetpoint}kV is out of range (0-${this.settings.maxVoltage}kV)`);
        }
        
        if (this.currentSetpoint < 0 || this.currentSetpoint > this.settings.maxCurrent) {
            errors.push(`Current setpoint ${this.currentSetpoint}mA is out of range (0-${this.settings.maxCurrent}mA)`);
        }
        
        return errors;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Store = Store;
}