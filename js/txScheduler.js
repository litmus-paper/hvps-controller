class TxScheduler {
    constructor(sendCallback) {
        this.sendCallback = sendCallback;
        this.isRunning = false;
        this.intervalId = null;
        this.tickInterval = 100; // 100ms = 10Hz
        
        // Priority queue - higher priority = lower number
        this.priorityQueue = [];
        
        // Polling state
        this.pollPhase = 0; // 0 = temperature, 1 = voltage, 2 = current
        this.pollCommands = [
            RxParser.formatTemperaturePoll(),
            RxParser.formatVoltagePoll(),
            RxParser.formatCurrentPoll()
        ];
        
        // Pending setpoints
        this.pendingVoltageSet = null;
        this.pendingCurrentSet = null;
        this.estopRequested = false;
        
        // Debouncing
        this.lastEstopTime = 0;
        this.estopDebounceMs = 250;
        
        // Statistics
        this.stats = {
            totalTicks: 0,
            commandsSent: 0,
            estopsSent: 0,
            setpointsSent: 0,
            pollsSent: 0,
            queueOverruns: 0
        };
    }

    start() {
        if (this.isRunning) {
            return;
        }
        
        this.isRunning = true;
        this.intervalId = setInterval(() => {
            this.tick();
        }, this.tickInterval);
        
        console.log(`TxScheduler started with ${this.tickInterval}ms interval`);
    }

    stop() {
        if (!this.isRunning) {
            return;
        }
        
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        // Clear pending operations
        this.priorityQueue = [];
        this.pendingVoltageSet = null;
        this.pendingCurrentSet = null;
        this.estopRequested = false;
        
        console.log('TxScheduler stopped');
    }

    tick() {
        if (!this.isRunning || !this.sendCallback) {
            return;
        }

        this.stats.totalTicks++;

        try {
            const command = this.getNextCommand();
            if (command) {
                this.sendCallback(command);
                this.stats.commandsSent++;
            }
        } catch (error) {
            console.error('TxScheduler tick error:', error);
        }
    }

    getNextCommand() {
        // Priority 1: E-STOP (with debouncing)
        if (this.estopRequested) {
            const now = Date.now();
            if (now - this.lastEstopTime >= this.estopDebounceMs) {
                this.estopRequested = false;
                this.lastEstopTime = now;
                this.stats.estopsSent++;
                return RxParser.formatResetCommand();
            }
        }

        // Priority 2: High-priority queue items (custom commands)
        if (this.priorityQueue.length > 0) {
            const item = this.priorityQueue.shift();
            return item.command;
        }

        // Priority 3: Pending voltage setpoint
        if (this.pendingVoltageSet !== null) {
            const voltage = this.pendingVoltageSet;
            this.pendingVoltageSet = null;
            this.stats.setpointsSent++;
            return RxParser.formatVoltageCommand(voltage);
        }

        // Priority 4: Pending current setpoint
        if (this.pendingCurrentSet !== null) {
            const current = this.pendingCurrentSet;
            this.pendingCurrentSet = null;
            this.stats.setpointsSent++;
            return RxParser.formatCurrentCommand(current);
        }

        // Priority 5: Regular polling (round-robin)
        const pollCommand = this.pollCommands[this.pollPhase];
        this.pollPhase = (this.pollPhase + 1) % this.pollCommands.length;
        this.stats.pollsSent++;
        return pollCommand;
    }

    // Public interface methods
    requestEstop() {
        this.estopRequested = true;
        console.log('E-STOP requested');
    }

    setVoltage(voltage) {
        const validation = RxParser.validateVoltage(voltage);
        if (!validation.valid) {
            throw new Error(validation.error);
        }
        
        // Replace any existing pending voltage setpoint (coalescing)
        this.pendingVoltageSet = voltage;
        console.log(`Voltage setpoint queued: ${voltage} V`);
    }

    setCurrent(current) {
        const validation = RxParser.validateCurrent(current);
        if (!validation.valid) {
            throw new Error(validation.error);
        }
        
        // Replace any existing pending current setpoint (coalescing)
        this.pendingCurrentSet = current;
        console.log(`Current setpoint queued: ${current} A`);
    }

    // Queue a custom command with priority
    queueCommand(command, priority = 10) {
        if (this.priorityQueue.length >= 10) {
            this.stats.queueOverruns++;
            console.warn('Priority queue full, dropping oldest command');
            this.priorityQueue.shift();
        }

        const item = {
            command: command,
            priority: priority,
            timestamp: Date.now()
        };

        // Insert in priority order (lower priority number = higher priority)
        let inserted = false;
        for (let i = 0; i < this.priorityQueue.length; i++) {
            if (priority < this.priorityQueue[i].priority) {
                this.priorityQueue.splice(i, 0, item);
                inserted = true;
                break;
            }
        }

        if (!inserted) {
            this.priorityQueue.push(item);
        }

        console.log(`Custom command queued: ${command} (priority ${priority})`);
    }

    // Configuration methods
    setTickInterval(intervalMs) {
        if (intervalMs < 50) {
            throw new Error('Tick interval cannot be less than 50ms');
        }
        
        const wasRunning = this.isRunning;
        if (wasRunning) {
            this.stop();
        }
        
        this.tickInterval = intervalMs;
        
        if (wasRunning) {
            this.start();
        }
        
        console.log(`Tick interval set to ${intervalMs}ms`);
    }

    setEstopDebounce(debounceMs) {
        this.estopDebounceMs = debounceMs;
        console.log(`E-STOP debounce set to ${debounceMs}ms`);
    }

    // Status and diagnostics
    getStatus() {
        return {
            isRunning: this.isRunning,
            tickInterval: this.tickInterval,
            queueLength: this.priorityQueue.length,
            pendingVoltage: this.pendingVoltageSet,
            pendingCurrent: this.pendingCurrentSet,
            estopPending: this.estopRequested,
            pollPhase: this.pollPhase,
            stats: { ...this.stats }
        };
    }

    getPendingOperations() {
        const pending = [];
        
        if (this.estopRequested) {
            pending.push({ type: 'estop', priority: 1 });
        }
        
        for (const item of this.priorityQueue) {
            pending.push({ type: 'custom', command: item.command, priority: item.priority });
        }
        
        if (this.pendingVoltageSet !== null) {
            pending.push({ type: 'voltage', value: this.pendingVoltageSet, priority: 3 });
        }
        
        if (this.pendingCurrentSet !== null) {
            pending.push({ type: 'current', value: this.pendingCurrentSet, priority: 4 });
        }
        
        pending.push({ type: 'poll', command: this.pollCommands[this.pollPhase], priority: 5 });
        
        return pending;
    }

    getStats() {
        const totalCommands = this.stats.commandsSent;
        return {
            ...this.stats,
            commandRate: totalCommands > 0 && this.stats.totalTicks > 0 
                ? (totalCommands / (this.stats.totalTicks * this.tickInterval / 1000)).toFixed(1) + ' Hz'
                : '0 Hz',
            uptime: this.isRunning 
                ? ((this.stats.totalTicks * this.tickInterval) / 1000).toFixed(1) + 's'
                : '0s'
        };
    }

    resetStats() {
        this.stats = {
            totalTicks: 0,
            commandsSent: 0,
            estopsSent: 0,
            setpointsSent: 0,
            pollsSent: 0,
            queueOverruns: 0
        };
    }

    // Clear all pending operations
    clearPending() {
        this.priorityQueue = [];
        this.pendingVoltageSet = null;
        this.pendingCurrentSet = null;
        this.estopRequested = false;
        console.log('All pending operations cleared');
    }

    // Test functionality
    static runSelfTest() {
        const results = [];
        let lastCommand = null;
        
        const scheduler = new TxScheduler((cmd) => {
            lastCommand = cmd;
        });

        // Test basic polling cycle
        scheduler.start();
        
        // Let it run for a few ticks to test polling
        return new Promise((resolve) => {
            setTimeout(() => {
                const pollResults = [];
                
                // Capture 3 poll commands
                for (let i = 0; i < 3; i++) {
                    lastCommand = null;
                    scheduler.tick();
                    pollResults.push(lastCommand);
                }
                
                scheduler.stop();
                
                // Test setpoint commands
                scheduler.setVoltage(12.5);
                lastCommand = null;
                scheduler.tick();
                const voltageCommand = lastCommand;
                
                scheduler.setCurrent(3.2);
                lastCommand = null;
                scheduler.tick();
                const currentCommand = lastCommand;
                
                // Test E-STOP
                scheduler.requestEstop();
                lastCommand = null;
                scheduler.tick();
                const estopCommand = lastCommand;
                
                resolve({
                    pollCycle: pollResults,
                    voltageSet: voltageCommand,
                    currentSet: currentCommand,
                    estop: estopCommand,
                    stats: scheduler.getStats()
                });
            }, 350); // Wait for a few ticks
        });
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.TxScheduler = TxScheduler;
}