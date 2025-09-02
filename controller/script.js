class NanoxController {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.selectedCommand = null;
        this.selectedArgument = null;

        // Command definitions from the SDR
        this.commands = [
            { instruction: 0x4F, function: 'Start-0', arguments: [0x00] },
            { instruction: 0x8D, function: 'Start-1', arguments: [0x27] },
            { instruction: 0x81, function: 'Configuration', arguments: [0x04, 0x05, 0x0D, 0x0F] },
            { instruction: 0x87, function: 'Select', arguments: [0x00, 0x07, 0x0A, 0x0B, 0x0E, 0x0F] },
            { instruction: 0x47, function: 'Read', arguments: [0x00] },
            { instruction: 0x4E, function: 'Pulse-0', arguments: [0x00] },
            { instruction: 0x8F, function: 'Pulse-1/End', arguments: [0x09, 0x0B, 0x0F, 0x1F] },
            { instruction: 0x84, function: 'Pulse-2', arguments: [0x2F] },
            { instruction: 0x86, function: 'Pulse-3', arguments: [0x1A] },
            { instruction: 0x83, function: 'Pulse-4', arguments: [0x1A] },
            { instruction: 0x91, function: 'Pulse-5', arguments: [0x50] },
            { instruction: 0x8A, function: 'Pulse-6', arguments: [0x40] },
            { instruction: 0x85, function: 'Pulse-7', arguments: [0x01] },
            { instruction: 0x55, function: 'Pulse-8', arguments: [0x00] },
            { instruction: 0x40, function: 'Unknown/Debug', arguments: [0x00] }
        ];

        this.initializeElements();
        this.initializeEventListeners();
        this.populateCommandTable();
        this.checkWebSerialSupport();
    }

    initializeElements() {
        this.elements = {
            connectBtn: document.getElementById('connect-btn'),
            sendBtn: document.getElementById('send-btn'),
            clearLogBtn: document.getElementById('clear-log-btn'),
            baudRate: document.getElementById('baud-rate'),
            statusText: document.getElementById('status-text'),
            statusIndicator: document.getElementById('status-indicator'),
            logContainer: document.getElementById('log-container'),
            commandTable: document.getElementById('command-table'),
            commandTbody: document.getElementById('command-tbody')
        };
    }

    initializeEventListeners() {
        this.elements.connectBtn.addEventListener('click', () => this.toggleConnection());
        this.elements.sendBtn.addEventListener('click', () => this.sendCommand());
        this.elements.clearLogBtn.addEventListener('click', () => this.clearLog());
    }

    checkWebSerialSupport() {
        if (!('serial' in navigator)) {
            this.logMessage('ERROR: Web Serial API not supported in this browser. Please use Chrome 89+, Edge 89+, or Opera 75+.', 'error');
            this.elements.connectBtn.disabled = true;
            this.updateStatus('Web Serial Not Supported', false);
        }
    }

    populateCommandTable() {
        this.commands.forEach((cmd, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <input type="radio" name="command" value="${index}" id="cmd-${index}">
                </td>
                <td><span class="hex-value">0x${cmd.instruction.toString(16).toUpperCase().padStart(2, '0')}</span></td>
                <td>${cmd.function}</td>
                <td>
                    <div class="argument-controls" id="args-${index}">
                        ${cmd.arguments.map((arg, argIndex) => `
                            <label>
                                <input type="radio" name="arg-${index}" value="${arg}">
                                <span class="hex-value">0x${arg.toString(16).toUpperCase().padStart(2, '0')}</span>
                            </label>
                        `).join('')}
                    </div>
                </td>
            `;
            this.elements.commandTbody.appendChild(row);

            // Add event listener for command selection
            const radioBtn = row.querySelector(`#cmd-${index}`);
            radioBtn.addEventListener('change', () => {
                if (radioBtn.checked) {
                    this.selectCommand(index);
                    this.updateTableSelection(row);
                }
            });

            // Add event listeners for argument selection
            const argRadios = row.querySelectorAll(`input[name="arg-${index}"]`);
            argRadios.forEach(argRadio => {
                argRadio.addEventListener('change', () => {
                    if (argRadio.checked) {
                        this.selectedArgument = parseInt(argRadio.value);
                        this.updateSendButtonState();
                    }
                });
            });
        });
    }

    selectCommand(index) {
        this.selectedCommand = index;
        this.selectedArgument = null;
        
        // Clear all argument selections
        this.commands.forEach((_, i) => {
            const argRadios = document.querySelectorAll(`input[name="arg-${i}"]`);
            argRadios.forEach(radio => radio.checked = false);
        });

        // Auto-select first argument if only one available
        const cmd = this.commands[index];
        if (cmd.arguments.length === 1) {
            const firstArgRadio = document.querySelector(`input[name="arg-${index}"]`);
            if (firstArgRadio) {
                firstArgRadio.checked = true;
                this.selectedArgument = cmd.arguments[0];
            }
        }

        this.updateSendButtonState();
    }

    updateTableSelection(selectedRow) {
        // Remove selection from all rows
        const allRows = this.elements.commandTbody.querySelectorAll('tr');
        allRows.forEach(row => row.classList.remove('selected'));
        
        // Add selection to current row
        selectedRow.classList.add('selected');
    }

    updateSendButtonState() {
        const canSend = this.isConnected && 
                       this.selectedCommand !== null && 
                       this.selectedArgument !== null;
        this.elements.sendBtn.disabled = !canSend;
    }

    async toggleConnection() {
        if (this.isConnected) {
            await this.disconnect();
        } else {
            await this.connect();
        }
    }

    async connect() {
        try {
            this.updateStatus('Connecting...', false);
            
            // Request a port and open it
            this.port = await navigator.serial.requestPort();
            
            const baudRate = parseInt(this.elements.baudRate.value);
            await this.port.open({
                baudRate: baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });

            this.writer = this.port.writable.getWriter();
            this.reader = this.port.readable.getReader();

            this.isConnected = true;
            this.updateStatus('Connected', true);
            this.elements.connectBtn.textContent = 'Disconnect';
            this.elements.connectBtn.classList.add('disconnect');
            this.elements.baudRate.disabled = true;

            this.logMessage(`Connected to serial port at ${baudRate} baud`, 'info');
            this.startReading();
            this.updateSendButtonState();

        } catch (error) {
            this.handleConnectionError('Connection failed', error);
        }
    }

    async disconnect() {
        try {
            if (this.reader) {
                await this.reader.cancel();
                await this.reader.releaseLock();
                this.reader = null;
            }

            if (this.writer) {
                await this.writer.releaseLock();
                this.writer = null;
            }

            if (this.port) {
                await this.port.close();
                this.port = null;
            }

            this.isConnected = false;
            this.updateStatus('Disconnected', false);
            this.elements.connectBtn.textContent = 'Connect';
            this.elements.connectBtn.classList.remove('disconnect');
            this.elements.baudRate.disabled = false;
            this.updateSendButtonState();

            this.logMessage('Disconnected from serial port', 'info');

        } catch (error) {
            this.handleConnectionError('Disconnection failed', error);
        }
    }

    async startReading() {
        try {
            while (this.isConnected && this.reader) {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                this.handleReceivedData(value);
            }
        } catch (error) {
            if (this.isConnected) {
                this.handleConnectionError('Read error', error);
                await this.disconnect();
            }
        }
    }

    handleReceivedData(data) {
        const hexData = Array.from(data)
            .map(byte => `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`)
            .join(' ');
        
        this.logMessage(`RX: ${hexData}`, 'rx');
    }

    async sendCommand() {
        if (!this.isConnected || this.selectedCommand === null || this.selectedArgument === null) {
            return;
        }

        try {
            const cmd = this.commands[this.selectedCommand];
            const command = new Uint8Array([cmd.instruction, this.selectedArgument]);
            
            await this.writer.write(command);
            
            const hexData = Array.from(command)
                .map(byte => `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`)
                .join(' ');
            
            this.logMessage(`TX: ${hexData} (${cmd.function})`, 'tx');
            
        } catch (error) {
            this.handleConnectionError('Send failed', error);
        }
    }

    handleConnectionError(message, error) {
        console.error(message, error);
        this.logMessage(`ERROR: ${message} - ${error.message}`, 'error');
        
        if (error.name === 'NetworkError' || error.name === 'InvalidStateError') {
            this.disconnect();
        }
    }

    updateStatus(text, connected) {
        this.elements.statusText.textContent = text;
        if (connected) {
            this.elements.statusIndicator.classList.add('connected');
        } else {
            this.elements.statusIndicator.classList.remove('connected');
        }
    }

    logMessage(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        let directionClass = '';
        let directionText = '';
        
        if (type === 'tx') {
            directionClass = 'tx';
            directionText = 'TX';
        } else if (type === 'rx') {
            directionClass = 'rx';
            directionText = 'RX';
        } else if (type === 'error') {
            directionClass = 'error';
            directionText = 'ERR';
        } else {
            directionClass = 'info';
            directionText = 'INFO';
        }

        logEntry.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-direction ${directionClass}">${directionText}</span>
            <span class="log-data">${message.replace(/^(TX|RX|ERROR|INFO):\s*/, '')}</span>
        `;

        this.elements.logContainer.appendChild(logEntry);
        this.elements.logContainer.scrollTop = this.elements.logContainer.scrollHeight;

        // Limit log entries to prevent memory issues (keep last 1000 entries)
        const entries = this.elements.logContainer.querySelectorAll('.log-entry');
        if (entries.length > 1000) {
            entries[0].remove();
        }
    }

    clearLog() {
        this.elements.logContainer.innerHTML = '';
        this.logMessage('Log cleared', 'info');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NanoxController();
});