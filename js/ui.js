class UIController {
    constructor(store) {
        this.store = store;
        this.elements = {};
        this.isInitialized = false;
        
        // Bind store event listeners
        this.store.addEventListener('stateChange', this.handleStateChange.bind(this));
        this.store.addEventListener('readingUpdate', this.handleReadingUpdate.bind(this));
        this.store.addEventListener('connectionChange', this.handleConnectionChange.bind(this));
        this.store.addEventListener('error', this.handleError.bind(this));
    }

    initialize() {
        if (this.isInitialized) {
            return;
        }

        // Get all DOM elements
        this.elements = {
            // Connection
            btnConnect: document.getElementById('btnConnect'),
            portStatus: document.getElementById('portStatus'),
            
            // Readings
            actVoltage: document.getElementById('actVoltage'),
            actCurrent: document.getElementById('actCurrent'),
            actTemp: document.getElementById('actTemp'),
            
            // Controls
            inVoltage: document.getElementById('inVoltage'),
            btnSetVoltage: document.getElementById('btnSetVoltage'),
            inCurrent: document.getElementById('inCurrent'),
            btnSetCurrent: document.getElementById('btnSetCurrent'),
            
            // Emergency
            btnEstop: document.getElementById('btnEstop'),
            estopStatus: document.getElementById('estopStatus'),
            
            // Debug
            debugLog: document.getElementById('debugLog'),
            
            // Container for stale state management
            container: document.querySelector('.container')
        };

        // Verify all elements exist
        const missingElements = [];
        for (const [key, element] of Object.entries(this.elements)) {
            if (!element) {
                missingElements.push(key);
            }
        }

        if (missingElements.length > 0) {
            throw new Error(`Missing DOM elements: ${missingElements.join(', ')}`);
        }

        // Set up event listeners
        this.setupEventListeners();

        // Initial UI update
        this.updateUI();

        this.isInitialized = true;
        console.log('UIController initialized');
    }

    setupEventListeners() {
        // Connection button
        this.elements.btnConnect.addEventListener('click', () => {
            this.handleConnectClick();
        });

        // Voltage setpoint
        this.elements.btnSetVoltage.addEventListener('click', () => {
            this.handleVoltageSet();
        });
        
        this.elements.inVoltage.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleVoltageSet();
            }
        });

        // Current setpoint
        this.elements.btnSetCurrent.addEventListener('click', () => {
            this.handleCurrentSet();
        });
        
        this.elements.inCurrent.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleCurrentSet();
            }
        });

        // E-STOP button
        this.elements.btnEstop.addEventListener('click', () => {
            this.handleEstopClick();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // E-STOP on Escape key
            if (e.key === 'Escape') {
                e.preventDefault();
                this.handleEstopClick();
            }
            
            // Connect/disconnect on Ctrl+Enter
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.handleConnectClick();
            }
        });

        // Input validation
        this.elements.inVoltage.addEventListener('input', () => {
            this.validateInput(this.elements.inVoltage, 'voltage');
        });
        
        this.elements.inCurrent.addEventListener('input', () => {
            this.validateInput(this.elements.inCurrent, 'current');
        });
    }

    // Event handlers
    handleConnectClick() {
        const event = new CustomEvent('connect-request', {
            detail: { currentState: this.store.connectionState }
        });
        document.dispatchEvent(event);
    }

    handleVoltageSet() {
        const input = this.elements.inVoltage;
        const value = parseFloat(input.value);
        
        if (isNaN(value)) {
            this.showError('Please enter a valid voltage value');
            return;
        }

        try {
            const event = new CustomEvent('voltage-set-request', {
                detail: { voltage: value }
            });
            document.dispatchEvent(event);
        } catch (error) {
            this.showError(error.message);
        }
    }

    handleCurrentSet() {
        const input = this.elements.inCurrent;
        const value = parseFloat(input.value);
        
        if (isNaN(value)) {
            this.showError('Please enter a valid current value');
            return;
        }

        try {
            const event = new CustomEvent('current-set-request', {
                detail: { current: value }
            });
            document.dispatchEvent(event);
        } catch (error) {
            this.showError(error.message);
        }
    }

    handleEstopClick() {
        const event = new CustomEvent('estop-request');
        document.dispatchEvent(event);
        
        // Visual feedback
        this.elements.btnEstop.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.elements.btnEstop.style.transform = '';
        }, 150);
    }

    // Store event handlers
    handleStateChange(data) {
        this.updateUI();
    }

    handleReadingUpdate(data) {
        this.updateReadings();
    }

    handleConnectionChange(data) {
        this.updateConnectionUI();
    }

    handleError(data) {
        this.showError(data.error);
    }

    // UI update methods
    updateUI() {
        this.updateConnectionUI();
        this.updateReadings();
        this.updateControls();
        this.updateEstopUI();
        this.updateStaleState();
    }

    updateConnectionUI() {
        const state = this.store.connectionState;
        const statusElement = this.elements.portStatus;
        const connectButton = this.elements.btnConnect;

        // Remove all status classes
        statusElement.className = 'status-indicator';
        
        switch (state) {
            case 'disconnected':
                statusElement.classList.add('disconnected');
                statusElement.textContent = 'Disconnected';
                connectButton.textContent = 'Connect to Device';
                connectButton.disabled = false;
                break;
                
            case 'connected':
                statusElement.classList.add('connected');
                statusElement.textContent = 'Connected';
                connectButton.textContent = 'Disconnect';
                connectButton.disabled = false;
                break;
                
            case 'stale':
                statusElement.classList.add('stale');
                statusElement.textContent = 'Connected (No Data)';
                connectButton.textContent = 'Disconnect';
                connectButton.disabled = false;
                break;
                
            case 'error':
                statusElement.classList.add('error');
                statusElement.textContent = 'Connection Error';
                connectButton.textContent = 'Reconnect';
                connectButton.disabled = false;
                break;
                
            default:
                statusElement.textContent = 'Unknown State';
                connectButton.disabled = true;
        }
    }

    updateReadings() {
        // Voltage
        if (this.store.actualVoltage !== null) {
            this.elements.actVoltage.textContent = `${this.store.actualVoltage.toFixed(1)} V`;
        } else {
            this.elements.actVoltage.textContent = '--.- V';
        }

        // Current
        if (this.store.actualCurrent !== null) {
            this.elements.actCurrent.textContent = `${this.store.actualCurrent.toFixed(1)} A`;
        } else {
            this.elements.actCurrent.textContent = '--.- A';
        }

        // Temperature
        if (this.store.actualTemperature !== null) {
            this.elements.actTemp.textContent = `${this.store.actualTemperature} °C`;
        } else {
            this.elements.actTemp.textContent = '-- °C';
        }
    }

    updateControls() {
        const connected = this.store.isConnected() && !this.store.isStale;
        
        // Enable/disable inputs based on connection state
        this.elements.inVoltage.disabled = !connected;
        this.elements.btnSetVoltage.disabled = !connected || this.store.pendingVoltageSet;
        this.elements.inCurrent.disabled = !connected;
        this.elements.btnSetCurrent.disabled = !connected || this.store.pendingCurrentSet;

        // Update button text to show pending state
        if (this.store.pendingVoltageSet) {
            this.elements.btnSetVoltage.textContent = 'Setting...';
        } else {
            this.elements.btnSetVoltage.textContent = 'Set';
        }

        if (this.store.pendingCurrentSet) {
            this.elements.btnSetCurrent.textContent = 'Setting...';
        } else {
            this.elements.btnSetCurrent.textContent = 'Set';
        }
    }

    updateEstopUI() {
        const estopStatus = this.elements.estopStatus;
        
        switch (this.store.estopState) {
            case 'idle':
                estopStatus.textContent = '';
                estopStatus.className = '';
                break;
                
            case 'requested':
                estopStatus.textContent = this.store.estopMessage;
                estopStatus.className = 'estop-pending';
                break;
                
            case 'acknowledged':
                estopStatus.textContent = this.store.estopMessage;
                estopStatus.className = 'estop-acknowledged';
                break;
        }
    }

    updateStaleState() {
        if (this.store.isStale) {
            this.elements.container.classList.add('stale');
        } else {
            this.elements.container.classList.remove('stale');
        }
    }

    // Input validation
    validateInput(inputElement, type) {
        const value = parseFloat(inputElement.value);
        let isValid = true;
        let errorMessage = '';

        if (!isNaN(value)) {
            if (type === 'voltage') {
                const validation = RxParser.validateVoltage(value);
                isValid = validation.valid;
                errorMessage = validation.error || '';
            } else if (type === 'current') {
                const validation = RxParser.validateCurrent(value);
                isValid = validation.valid;
                errorMessage = validation.error || '';
            }
        }

        // Update visual feedback
        if (isValid) {
            inputElement.classList.remove('invalid');
            inputElement.title = '';
        } else {
            inputElement.classList.add('invalid');
            inputElement.title = errorMessage;
        }

        return isValid;
    }

    // Error display
    showError(message) {
        console.error('UI Error:', message);
        
        // Could implement toast notifications here
        // For now, use browser alert for critical errors
        if (message.includes('E-STOP') || message.includes('Emergency')) {
            alert(`HVPS Error: ${message}`);
        }
    }

    // Utility methods
    formatNumber(value, decimals = 1) {
        if (value === null || value === undefined || isNaN(value)) {
            return '--';
        }
        return value.toFixed(decimals);
    }

    formatTime(timestamp) {
        if (!timestamp) return '--';
        return new Date(timestamp).toLocaleTimeString();
    }

    // Debug functionality
    toggleDebugLog() {
        if (this.elements.debugLog.classList.contains('visible')) {
            this.elements.debugLog.classList.remove('visible');
        } else {
            this.elements.debugLog.classList.add('visible');
        }
    }

    addDebugEntry(direction, message) {
        if (!this.store.settings.debugMode) return;

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        
        const timestamp = document.createElement('span');
        timestamp.className = 'log-timestamp';
        timestamp.textContent = this.formatTime(Date.now());
        
        const content = document.createElement('span');
        content.className = `log-${direction.toLowerCase()}`;
        content.textContent = `[${direction}] ${message}`;
        
        entry.appendChild(timestamp);
        entry.appendChild(content);
        
        this.elements.debugLog.appendChild(entry);
        
        // Limit log entries
        const entries = this.elements.debugLog.querySelectorAll('.log-entry');
        if (entries.length > 100) {
            entries[0].remove();
        }
        
        // Auto-scroll to bottom
        this.elements.debugLog.scrollTop = this.elements.debugLog.scrollHeight;
    }

    clearDebugLog() {
        this.elements.debugLog.innerHTML = '';
    }

    // Accessibility helpers
    announceToScreenReader(message) {
        // Create a temporary element for screen reader announcements
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'assertive');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    // Cleanup
    destroy() {
        if (!this.isInitialized) return;

        // Remove event listeners
        this.store.removeEventListener('stateChange', this.handleStateChange);
        this.store.removeEventListener('readingUpdate', this.handleReadingUpdate);
        this.store.removeEventListener('connectionChange', this.handleConnectionChange);
        this.store.removeEventListener('error', this.handleError);

        this.isInitialized = false;
        console.log('UIController destroyed');
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.UIController = UIController;
}