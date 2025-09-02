class SerialService {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.readLoopActive = false;
        this.onDataReceived = null;
        this.onStatusChanged = null;
        this.onError = null;
        
        this.lastRxAt = 0;
        this.lastTxAt = 0;
        
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
    }

    async requestPort() {
        if (!('serial' in navigator)) {
            throw new Error('Web Serial API not supported in this browser');
        }

        try {
            this.port = await navigator.serial.requestPort();
            return this.port;
        } catch (error) {
            if (error.name === 'NotFoundError') {
                throw new Error('No port selected');
            }
            throw error;
        }
    }

    async connect(baudRate = 9600) {
        if (!this.port) {
            throw new Error('No port selected. Call requestPort() first.');
        }

        try {
            await this.port.open({
                baudRate: baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });

            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            // Get reader and writer
            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();

            // Start read loop
            this.startReadLoop();

            // Listen for disconnect events
            this.port.addEventListener('disconnect', this.handleDisconnect.bind(this));

            this.notifyStatusChange('connected');
            return true;

        } catch (error) {
            this.isConnected = false;
            this.notifyError(`Connection failed: ${error.message}`);
            throw error;
        }
    }

    async disconnect() {
        if (!this.isConnected) {
            return;
        }

        this.readLoopActive = false;
        
        try {
            // Release reader/writer
            if (this.reader) {
                await this.reader.cancel();
                this.reader.releaseLock();
                this.reader = null;
            }
            
            if (this.writer) {
                this.writer.releaseLock();
                this.writer = null;
            }

            // Close port
            if (this.port) {
                await this.port.close();
            }

        } catch (error) {
            console.error('Error during disconnect:', error);
        } finally {
            this.isConnected = false;
            this.port = null;
            this.notifyStatusChange('disconnected');
        }
    }

    async sendCommand(command) {
        if (!this.isConnected || !this.writer) {
            throw new Error('Not connected to device');
        }

        try {
            const commandWithBrackets = `[${command}]`;
            const data = new TextEncoder().encode(commandWithBrackets);
            
            await this.writer.write(data);
            this.lastTxAt = Date.now();
            
            // Debug logging
            this.debugLog('TX', commandWithBrackets);
            
            return true;
        } catch (error) {
            this.notifyError(`Send failed: ${error.message}`);
            throw error;
        }
    }

    startReadLoop() {
        if (this.readLoopActive) {
            return;
        }

        this.readLoopActive = true;
        this.readLoop();
    }

    async readLoop() {
        let buffer = '';
        
        try {
            while (this.readLoopActive && this.reader) {
                const { value, done } = await this.reader.read();
                
                if (done) {
                    break;
                }

                // Decode received bytes
                const text = new TextDecoder().decode(value);
                buffer += text;

                // Extract complete tokens
                const tokens = this.extractTokens(buffer);
                
                // Update buffer to remove processed tokens
                buffer = this.updateBuffer(buffer, tokens);

                // Process each token
                for (const token of tokens) {
                    this.lastRxAt = Date.now();
                    this.debugLog('RX', `[${token}]`);
                    
                    if (this.onDataReceived) {
                        this.onDataReceived(token);
                    }
                }
            }
        } catch (error) {
            if (this.readLoopActive) {
                this.notifyError(`Read error: ${error.message}`);
                this.handleConnectionError(error);
            }
        }
    }

    extractTokens(buffer) {
        const tokens = [];
        let startIndex = 0;
        
        while (true) {
            const openBracket = buffer.indexOf('[', startIndex);
            if (openBracket === -1) break;
            
            const closeBracket = buffer.indexOf(']', openBracket);
            if (closeBracket === -1) break;
            
            // Extract token content (without brackets)
            const token = buffer.substring(openBracket + 1, closeBracket);
            tokens.push(token);
            
            startIndex = closeBracket + 1;
        }
        
        return tokens;
    }

    updateBuffer(buffer, tokens) {
        if (tokens.length === 0) {
            return buffer;
        }
        
        // Find the position after the last complete token
        let lastTokenEnd = -1;
        let searchStart = 0;
        
        for (const token of tokens) {
            const tokenWithBrackets = `[${token}]`;
            const tokenIndex = buffer.indexOf(tokenWithBrackets, searchStart);
            if (tokenIndex !== -1) {
                lastTokenEnd = tokenIndex + tokenWithBrackets.length;
                searchStart = lastTokenEnd;
            }
        }
        
        // Return remaining buffer after last complete token
        return lastTokenEnd !== -1 ? buffer.substring(lastTokenEnd) : buffer;
    }

    handleDisconnect() {
        this.isConnected = false;
        this.readLoopActive = false;
        this.notifyStatusChange('disconnected');
        
        // Attempt reconnection if configured
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
                this.attemptReconnect();
            }, 2000);
        }
    }

    async attemptReconnect() {
        if (this.isConnected || !this.port) {
            return;
        }

        this.reconnectAttempts++;
        this.notifyStatusChange('reconnecting');

        try {
            await this.connect();
        } catch (error) {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                this.notifyError('Reconnection failed after maximum attempts');
            }
        }
    }

    handleConnectionError(error) {
        this.isConnected = false;
        this.readLoopActive = false;
        
        if (error.name === 'NetworkError' || error.name === 'NotFoundError') {
            this.notifyStatusChange('disconnected');
        } else {
            this.notifyStatusChange('error');
        }
    }

    notifyStatusChange(status) {
        if (this.onStatusChanged) {
            this.onStatusChanged(status);
        }
    }

    notifyError(message) {
        if (this.onError) {
            this.onError(message);
        }
    }

    debugLog(direction, message) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`${timestamp} [${direction}] ${message}`);
        
        // Could emit debug events here for UI display
        if (window.debugLogger) {
            window.debugLogger.log(direction, message, timestamp);
        }
    }

    // Getters for status information
    getConnectionState() {
        if (!this.isConnected) return 'disconnected';
        
        const now = Date.now();
        const timeSinceRx = now - this.lastRxAt;
        
        if (timeSinceRx > 500) { // 500ms staleness threshold
            return 'stale';
        }
        
        return 'connected';
    }

    isDataStale() {
        if (!this.isConnected) return true;
        const now = Date.now();
        return (now - this.lastRxAt) > 500;
    }

    getLastRxTime() {
        return this.lastRxAt;
    }

    getLastTxTime() {
        return this.lastTxAt;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.SerialService = SerialService;
}