# Software Description Request (SDR)
## Nanox Controller Software v1.0

### 1. Executive Summary

**Project Name:** Nanox Controller Software  
**Document Version:** 1.0  
**Date:** September 2, 2025  
**Purpose:** Development of a web-based control interface for debugging and reverse-engineering the Nanox HVPS device communication protocol via serial communication.

### 2. Project Overview

#### 2.1 Objective
Develop a browser-based application to control and debug a Nanox HVPS (High Voltage Power Supply) device using serial communication. The software will facilitate protocol analysis, command testing, and device control through an intuitive graphical user interface.

#### 2.2 Technology Stack
- **Programming Languages:** JavaScript, HTML5, CSS3
- **API:** Web Serial API
- **Platform:** Modern web browsers (Chrome 89+, Edge 89+, Opera 75+)
- **Communication:** Serial over USB
- **Protocol:** Binary, 2-byte command structure

### 3. Functional Requirements

#### 3.1 Serial Communication
- **Connection Management**
  - Connect to serial devices via Web Serial API
  - Disconnect from connected devices
  - Display connection status
  - Handle connection errors gracefully

- **Configuration**
  - Configurable baud rate (common rates: 9600, 19200, 38400, 57600, 115200)
  - Fixed data format: 8 data bits, 1 stop bit, no parity
  - Flow control: None

#### 3.2 Command Protocol
- **Structure:** Binary protocol with 2-byte commands
  - Byte 1: Instruction (hex)
  - Byte 2: Argument (hex)
- **Command validation before transmission**
- **Support for all documented protocol commands**

#### 3.3 User Interface Components

##### 3.3.1 Serial Control Panel
- **Connect/Disconnect button** (changes state based on connection)
- **Baud rate selector** (dropdown with standard rates)
- **Connection status indicator** (visual feedback)

##### 3.3.2 Command Control Table
Interactive table displaying all available commands with the following columns:
- **Select** (Radio button for command selection)
- **Instruction** (Hex value)
- **Function** (Description/hint)
- **Arguments** (Dropdown or radio buttons for available arguments)

Commands to be implemented:

| Instruction | Function | Available Arguments (hex) |
|------------|----------|-------------------------|
| 0x4F | Start-0 | 0x00 |
| 0x8D | Start-1 | 0x27 |
| 0x81 | Configuration | 0x04, 0x05, 0x0D, 0x0F |
| 0x87 | Select | 0x00, 0x07, 0x0A, 0x0B, 0x0E, 0x0F |
| 0x47 | Read | 0x00 |
| 0x4E | Pulse-0 | 0x00 |
| 0x8F | Pulse-1/End | 0x09, 0x0B, 0x0F, 0x1F |
| 0x84 | Pulse-2 | 0x2F |
| 0x86 | Pulse-3 | 0x1A |
| 0x83 | Pulse-4 | 0x1A |
| 0x91 | Pulse-5 | 0x50 |
| 0x8A | Pulse-6 | 0x40 |
| 0x85 | Pulse-7 | 0x01 |
| 0x55 | Pulse-8 | 0x00 |
| 0x40 | Unknown/Debug | 0x00 |

##### 3.3.3 Command Execution
- **Send Button:** Prominent button to transmit selected command

##### 3.3.4 Communication Log
- **Display Format:**
  - Timestamps for each entry
  - Direction indicator (TX/RX)
  - Hex representation of data

- **Features:**
  - Scrollable area with auto-scroll to latest
  - Clear log button

### 4. Non-Functional Requirements

#### 4.3 Reliability
- Graceful error handling for:
  - Serial connection failures
  - Invalid command sequences
  - Device disconnection
  - Browser compatibility issues

### 6. User Interface Design

#### 6.1 Layout
- **Header:** Application title and connection status
- **Top Panel:** Serial controls and connection settings
- **Center Panel:** Command table with selection controls
- **Buttom Panel:** Communication log


#### 6.2 Visual Design
- Clean, professional interface
- Monospace font for hex values
- Clear visual feedback for all actions


