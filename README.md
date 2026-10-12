# SRWC IR App (Short Range Wireless Optical Transmitter)

A lightweight Expo / React Native prototype app for Android that interfaces with the physical Infrared (IR) emitter (`ConsumerIrManager`) to transmit binary data streams (e.g., `0101`) over a 38 kHz carrier frequency using microsecond pulse-width modulation (PWM).

---

## Hardware & Modulation Specifications

- **Carrier Frequency**: `38,000 Hz` (38 kHz)
- **Preamble / Sync Header**: `2000 µs` ON, `1000 µs` OFF
- **Bit 1**: `1200 µs` ON, `600 µs` OFF (Long Pulse)
- **Bit 0**: `600 µs` ON, `600 µs` OFF (Short Pulse)
- **Stop Burst**: `600 µs` ON

---

## Setup & Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Standalone APK Compilation via EAS Build
> **Important**: The physical IR Blaster (`ConsumerIrManager`) requires native Android module bindings and cannot be accessed inside standard Expo Go. You must compile a standalone APK.

1. Ensure EAS CLI is installed and logged in:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. Build the standalone preview APK:
   ```bash
   eas build -p android --profile preview
   ```
3. Once the build finishes on EAS, download and install the generated `.apk` file directly onto your IR-equipped Android phone.

### 3. Local Development Build (Alternative)
If you have Android Studio & Android SDK configured locally:
```bash
npx expo run:android
```
