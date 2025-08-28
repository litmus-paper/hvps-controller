class HVPSApp {
    constructor() {
        this.store = new Store();
        this.serialService = new SerialService();
        this.rxParser = new RxParser();
        this.txScheduler = null;
        this.uiController = new UIController(this.store);
        this.watchdogTimer = null;
        
        this.isInitialized = false;
        this.isConnected = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Check Web Serial API support
            if (!('serial' in navigator)) {
                throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or another Chromium-based browser.');
            }

            // Initialize UI controller
            this.uiController.initialize();

            // Set up serial service callbacks
            this.setupSerialServiceCallbacks();

            // Set up RX parser callbacks
            this.setupRxParserCallbacks();

            // Set up application event listeners
            this.setupApplicationEventListeners();

            // Start watchdog timer
            this.startWatchdog();

            // Load debug logger if enabled
            if (this.store.settings.debugMode) {
                this.setupDebugLogger();
            }

            this.isInitialized = true;
            console.log('HVPS Application initialized successfully');

            // Show initial instructions
            this.showWelcomeMessage();

        } catch (error) {
            console.error('Failed to initialize HVPS Application:', error);
            alert(`Initialization Error: ${error.message}`);
            throw error;
        }
    }

    setupSerialServiceCallbacks() {
        // Handle incoming data
        this.serialService.onDataReceived = (token) => {
            this.rxParser.parseToken(token);
        };

        // Handle connection status changes
        this.serialService.onStatusChanged = (status) => {
            this.handleConnectionStatusChange(status);
        };

        // Handle serial errors
        this.serialService.onError = (error) => {
            this.store.setError(`Serial communication error: ${error}`);
            console.error('Serial error:', error);
        };
    }

    setupRxParserCallbacks() {
        // Temperature updates
        this.rxParser.onTemperatureUpdate = (temperature) => {
            this.store.updateActualTemperature(temperature);
        };

        // Voltage updates
        this.rxParser.onVoltageUpdate = (voltage) => {
            this.store.updateActualVoltage(voltage);
        };

        // Current updates
        this.rxParser.onCurrentUpdate = (current) => {
            this.store.updateActualCurrent(current);
        };

        // Voltage setpoint acknowledgments
        this.rxParser.onVoltageAck = (voltage) => {
            this.store.acknowledgeVoltageSet(voltage);
        };

        // Current setpoint acknowledgments
        this.rxParser.onCurrentAck = (current) => {
            this.store.acknowledgeCurrentSet(current);
        };

        // Reset acknowledgments
        this.rxParser.onResetAck = () => {
            this.store.acknowledgeEstop();
        };

        // Heartbeat messages
        this.rxParser.onHeartbeat = () => {
            // Heartbeat just refreshes the activity timer, handled by serial service
        };

        // Parse errors
        this.rxParser.onParseError = (message, token) => {
            console.warn(`Parse error: ${message}, token: "${token}"`);
            if (this.store.settings.debugMode) {
                this.uiController.addDebugEntry('ERROR', `Parse error: ${message}`);
            }
        };
    }

    setupApplicationEventListeners() {
        // Connection requests
        document.addEventListener('connect-request', async (e) => {
            await this.handleConnectionRequest();
        });

        // Voltage setpoint requests
        document.addEventListener('voltage-set-request', (e) => {
            this.handleVoltageSetRequest(e.detail.voltage);
        });

        // Current setpoint requests
        document.addEventListener('current-set-request', (e) => {
            this.handleCurrentSetRequest(e.detail.current);
        });

        // E-STOP requests
        document.addEventListener('estop-request', () => {
            this.handleEstopRequest();
        });

        // Window/tab close handling
        window.addEventListener('beforeunload', (e) => {
            if (this.isConnected) {
                e.preventDefault();
                e.returnValue = 'You are connected to the power supply. Are you sure you want to close?';
                return e.returnValue;
            }
        });

        // Visibility change (tab switching)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Tab became hidden - could pause some operations
                console.log('Application hidden');
            } else {
                // Tab became visible - resume full operations
                console.log('Application visible');
            }
        });
    }

    async handleConnectionRequest() {
        if (this.isConnected) {
            await this.disconnect();
        } else {
            await this.connect();
        }
    }

    async connect() {
        try {
            this.store.setConnectionState('connecting');

            // Request port if not already selected
            if (!this.serialService.port) {
                await this.serialService.requestPort();
            }

            // Connect to the device
            await this.serialService.connect(this.store.settings.baudRate);

            // Create TX scheduler with send callback
            this.txScheduler = new TxScheduler(async (command) => {
                try {
                    await this.serialService.sendCommand(command);
                    this.store.updateLastTx();
                    
                    if (this.store.settings.debugMode) {
                        this.uiController.addDebugEntry('TX', command);
                    }
                } catch (error) {
                    console.error('Failed to send command:', error);
                    this.store.setError(`Failed to send command: ${error.message}`);
                }
            });

            // Start TX scheduler
            this.txScheduler.start();

            this.isConnected = true;
            this.store.setConnectionState('connected');
            
            console.log('Successfully connected to HVPS');

        } catch (error) {
            console.error('Connection failed:', error);
            this.store.setError(`Connection failed: ${error.message}`);
            this.store.setConnectionState('error');
            
            // Clean up on failed connection
            if (this.txScheduler) {
                this.txScheduler.stop();
                this.txScheduler = null;
            }
        }
    }

    async disconnect() {
        try {
            // Stop TX scheduler
            if (this.txScheduler) {
                this.txScheduler.stop();
                this.txScheduler = null;
            }

            // Disconnect serial service
            await this.serialService.disconnect();

            this.isConnected = false;
            this.store.setConnectionState('disconnected');
            this.store.resetReadings();

            console.log('Disconnected from HVPS');

        } catch (error) {
            console.error('Disconnect error:', error);
            this.store.setError(`Disconnect error: ${error.message}`);
        }
    }

    handleVoltageSetRequest(voltage) {
        if (!this.isConnected || !this.txScheduler) {
            this.store.setError('Not connected to device');
            return;
        }

        try {
            this.store.setVoltageSetpoint(voltage);
            this.txScheduler.setVoltage(voltage);
            console.log(`Voltage setpoint: ${voltage} V`);
        } catch (error) {
            this.store.setError(error.message);
        }
    }

    handleCurrentSetRequest(current) {
        if (!this.isConnected || !this.txScheduler) {
            this.store.setError('Not connected to device');
            return;
        }

        try {
            this.store.setCurrentSetpoint(current);
            this.txScheduler.setCurrent(current);
            console.log(`Current setpoint: ${current} A`);
        } catch (error) {
            this.store.setError(error.message);
        }
    }

    handleEstopRequest() {
        if (!this.isConnected || !this.txScheduler) {
            this.store.setError('E-STOP failed: Not connected to device');
            return;
        }

        try {
            this.store.requestEstop();
            this.txScheduler.requestEstop();
            console.log('E-STOP requested');
            
            // Announce to screen readers
            this.uiController.announceToScreenReader('Emergency stop activated');
            
        } catch (error) {
            this.store.setError(`E-STOP failed: ${error.message}`);
        }
    }

    handleConnectionStatusChange(status) {
        switch (status) {
            case 'connected':
                this.store.setConnectionState('connected');
                break;
                
            case 'disconnected':
                this.isConnected = false;
                this.store.setConnectionState('disconnected');
                this.store.resetReadings();
                
                // Stop TX scheduler
                if (this.txScheduler) {
                    this.txScheduler.stop();
                    this.txScheduler = null;
                }
                break;
                
            case 'error':
                this.store.setConnectionState('error');
                break;
                
            case 'reconnecting':
                this.store.setConnectionState('connecting');
                break;
        }
    }

    // Watchdog functionality
    startWatchdog() {
        if (this.watchdogTimer) {
            clearInterval(this.watchdogTimer);
        }

        this.watchdogTimer = setInterval(() => {
            this.checkStaleness();
        }, 250); // Check every 250ms
    }

    stopWatchdog() {
        if (this.watchdogTimer) {
            clearInterval(this.watchdogTimer);
            this.watchdogTimer = null;
        }
    }

    checkStaleness() {
        if (!this.isConnected) {
            this.store.setStale(false);
            return;
        }

        const isStale = this.serialService.isDataStale();
        
        if (isStale !== this.store.isStale) {
            this.store.setStale(isStale);
            
            if (isStale) {
                this.store.setConnectionState('stale');
                console.warn('Data is stale - no recent messages from device');
            } else {
                this.store.setConnectionState('connected');
                console.log('Data freshness restored');
            }
        }
    }

    // Debug functionality
    setupDebugLogger() {
        window.debugLogger = {
            log: (direction, message, timestamp) => {
                this.uiController.addDebugEntry(direction, message);
            }
        };

        // Add debug keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.uiController.toggleDebugLog();
            }
        });
    }

    // Utility methods
    showWelcomeMessage() {
        console.log('HVPS Controller Ready');
        console.log('Keyboard shortcuts:');
        console.log('  Escape: E-STOP');
        console.log('  Ctrl+Enter: Connect/Disconnect');
        if (this.store.settings.debugMode) {
            console.log('  Ctrl+Shift+D: Toggle debug log');
        }
    }

    // Application lifecycle
    async shutdown() {
        console.log('Shutting down HVPS Application...');

        try {
            // Disconnect if connected
            if (this.isConnected) {
                await this.disconnect();
            }

            // Stop watchdog
            this.stopWatchdog();

            // Clean up UI controller
            this.uiController.destroy();

            // Clean up debug logger
            if (window.debugLogger) {
                delete window.debugLogger;
            }

            this.isInitialized = false;
            console.log('HVPS Application shut down successfully');

        } catch (error) {
            console.error('Error during shutdown:', error);
        }
    }

    // Diagnostics and status
    getDiagnostics() {
        return {
            app: {
                initialized: this.isInitialized,
                connected: this.isConnected
            },
            store: this.store.getDiagnostics(),
            serial: {
                connected: this.serialService.isConnected,
                lastRx: this.serialService.getLastRxTime(),
                lastTx: this.serialService.getLastTxTime(),
                state: this.serialService.getConnectionState()
            },
            scheduler: this.txScheduler ? this.txScheduler.getStats() : null,
            parser: this.rxParser.getStats()
        };
    }

    exportDiagnostics() {
        const diagnostics = this.getDiagnostics();
        const blob = new Blob([JSON.stringify(diagnostics, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hvps-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Application startup
document.addEventListener('DOMContentLoaded', async () => {
    try {
        window.hvpsApp = new HVPSApp();
        await window.hvpsApp.initialize();
    } catch (error) {
        console.error('Failed to start HVPS Application:', error);
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #dc2626;">
                <h1>HVPS Controller - Initialization Error</h1>
                <p>${error.message}</p>
                <p>Please ensure you're using a supported browser (Chrome, Edge) with Web Serial API enabled.</p>
            </div>
        `;
    }
});

// Global error handler
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
    if (window.hvpsApp && window.hvpsApp.store) {
        window.hvpsApp.store.setError(`Application error: ${e.error.message}`);
    }
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
    if (window.hvpsApp && window.hvpsApp.store) {
        window.hvpsApp.store.setError(`Promise rejection: ${e.reason}`);
    }
});

// Export app class for testing
if (typeof window !== 'undefined') {
    window.HVPSApp = HVPSApp;
}