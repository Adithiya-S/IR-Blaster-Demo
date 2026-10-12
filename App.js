import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  SafeAreaView,
} from 'react-native';

// Import IR Manager library handling Android's ConsumerIrManager bindings
// Using wildcard + default import to safely handle common packaging formats
import IrManager, * as IrModule from '@sachin-acharya-projects/ir-manager';

/**
 * -----------------------------------------------------------------------------
 * SRWC (Short Range Wireless Communication) Timing Constants
 * -----------------------------------------------------------------------------
 * Carrier Frequency: Standard 38 kHz (38,000 Hz) used by consumer IR sensors (e.g. TSOP38238)
 * Modulation Scheme: Pulse-Width Modulation (PWM) with active carrier bursts (ON)
 *                    and space intervals (OFF) measured in microseconds (µs).
 *
 * Pattern convention for Android ConsumerIrManager.transmit:
 * [onDuration, offDuration, onDuration, offDuration, ...]
 */
const CARRIER_FREQUENCY_HZ = 38000;

// Pulse timings in microseconds (µs)
const TIMINGS = {
  PREAMBLE_MARK: 2000, // 2.0 ms Leader Burst (ON) for receiver AGC calibration
  PREAMBLE_SPACE: 1000, // 1.0 ms Leader Gap (OFF)
  BIT_1_MARK: 1200, // Binary '1': Long pulse (1.2 ms ON)
  BIT_0_MARK: 600, // Binary '0': Short pulse (0.6 ms ON)
  BIT_SPACE: 600, // Standard inter-bit pause (0.6 ms OFF)
  STOP_MARK: 600, // Trailing stop pulse (0.6 ms ON) to close final space
};

export default function App() {
  // Application State
  const [hasHardware, setHasHardware] = useState(null); // null = checking, true/false = status
  const [hardwareMessage, setHardwareMessage] = useState('Verifying IR emitter...');
  const [binaryData, setBinaryData] = useState('0101');
  const [isBlasting, setIsBlasting] = useState(false);
  const [lastTransmission, setLastTransmission] = useState(null);

  /**
   * Helper to resolve the native binding functions across various export styles
   */
  const getNativeIrMethods = useCallback(() => {
    const hasIrEmitterFn =
      (typeof IrManager?.hasIrEmitter === 'function' && IrManager.hasIrEmitter) ||
      (typeof IrModule?.hasIrEmitter === 'function' && IrModule.hasIrEmitter);

    const transmitFn =
      (typeof IrManager?.transmit === 'function' && IrManager.transmit) ||
      (typeof IrModule?.transmit === 'function' && IrModule.transmit);

    return { hasIrEmitterFn, transmitFn };
  }, []);

  /**
   * 1. Hardware Verification Logic
   * Checks whether the physical device is equipped with an active IR blaster.
   */
  const verifyHardware = useCallback(async () => {
    setHasHardware(null);
    setHardwareMessage('Checking ConsumerIrManager...');

    try {
      const { hasIrEmitterFn } = getNativeIrMethods();

      if (!hasIrEmitterFn) {
        setHasHardware(false);
        setHardwareMessage(
          'IR Native module not linked. Note: IR Blaster APIs require a custom native build (EAS APK) and cannot run inside standard Expo Go.'
        );
        return;
      }

      const available = await hasIrEmitterFn();
      const isAvailable = Boolean(available);

      setHasHardware(isAvailable);
      setHardwareMessage(
        isAvailable
          ? 'Physical IR Emitter detected and ready for transmission.'
          : 'No IR Blaster hardware found on this Android device.'
      );
    } catch (error) {
      console.error('Error during hasIrEmitter check:', error);
      setHasHardware(false);
      setHardwareMessage(`Hardware check failed: ${error?.message || 'Unknown error'}`);
    }
  }, [getNativeIrMethods]);

  // Run hardware verification on component mount
  useEffect(() => {
    verifyHardware();
  }, [verifyHardware]);

  /**
   * 2. Translation Loop
   * Maps a raw binary string (e.g., "0101") into an alternating microsecond integer array:
   * [onDuration, offDuration, onDuration, offDuration, ...]
   */
  const translateBinaryToPulses = useCallback((binaryString) => {
    const pattern = [];

    // Step A: Synchronization Preamble (Header)
    pattern.push(TIMINGS.PREAMBLE_MARK);
    pattern.push(TIMINGS.PREAMBLE_SPACE);

    // Step B: Translation Loop for each individual bit
    for (let i = 0; i < binaryString.length; i++) {
      const bit = binaryString[i];

      if (bit === '1') {
        // Bit 1: Long Mark (1200 µs ON) + Inter-bit space (600 µs OFF)
        pattern.push(TIMINGS.BIT_1_MARK);
        pattern.push(TIMINGS.BIT_SPACE);
      } else if (bit === '0') {
        // Bit 0: Short Mark (600 µs ON) + Inter-bit space (600 µs OFF)
        pattern.push(TIMINGS.BIT_0_MARK);
        pattern.push(TIMINGS.BIT_SPACE);
      }
      // Non-binary characters are skipped safely
    }

    // Step C: Trailing Stop Burst (delimit final space for receiver)
    pattern.push(TIMINGS.STOP_MARK);

    return pattern;
  }, []);

  // Compute microsecond pulse sequence dynamically whenever binaryData changes
  const computedPattern = useMemo(() => {
    const sanitized = binaryData.replace(/[^01]/g, '');
    return sanitized ? translateBinaryToPulses(sanitized) : [];
  }, [binaryData, translateBinaryToPulses]);

  // Total transmission duration in milliseconds
  const totalDurationMs = useMemo(() => {
    if (!computedPattern.length) return '0.00';
    const totalMicros = computedPattern.reduce((acc, curr) => acc + curr, 0);
    return (totalMicros / 1000).toFixed(2);
  }, [computedPattern]);

  /**
   * 3. Hardware Invocation (transmit)
   * Invokes native Android ConsumerIrManager.transmit with 38kHz carrier & pulse timings.
   */
  const handleFireIrSignal = async () => {
    const sanitized = binaryData.replace(/[^01]/g, '');

    // Input Validation
    if (!sanitized) {
      Alert.alert('Invalid Payload', 'Please input a valid binary data stream consisting of 0s and 1s.');
      return;
    }

    // Hardware Availability Guard
    if (hasHardware !== true) {
      Alert.alert(
        'IR Emitter Unavailable',
        'Cannot transmit: Physical IR hardware is not available on this device or the app is running in standard Expo Go without native build modules.\n\nBuild the APK using EAS to test on real IR hardware.'
      );
      return;
    }

    const { transmitFn } = getNativeIrMethods();
    if (!transmitFn) {
      Alert.alert('Native Binding Error', 'The transmit() method is missing from the IR library.');
      return;
    }

    setIsBlasting(true);

    try {
      const pattern = translateBinaryToPulses(sanitized);

      // Hardware invocation firing at 38000 Hz carrier frequency
      await transmitFn(CARRIER_FREQUENCY_HZ, pattern);

      const timestamp = new Date().toLocaleTimeString();
      setLastTransmission({
        binary: sanitized,
        pulsesCount: pattern.length,
        durationMs: totalDurationMs,
        time: timestamp,
      });

      Alert.alert(
        'IR Transmission Successful',
        `Signal fired over 38 kHz carrier frequency!\n\nPayload: ${sanitized}\nPulses Array: [${pattern.join(', ')}]\nTotal Duration: ${totalDurationMs} ms\nTimestamp: ${timestamp}`
      );
    } catch (err) {
      console.error('Error firing IR signal:', err);
      Alert.alert(
        'Transmission Error',
        `Failed to fire IR blaster: ${err?.message || 'Hardware transmission fault'}`
      );
    } finally {
      setIsBlasting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0d1117" />
      <ScrollView contentContainerStyle={styles.scrollContainer} bounces={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.badge}>SRWC PROTOTYPE</Text>
          <Text style={styles.title}>IR Optical Transmitter</Text>
          <Text style={styles.subtitle}>
            38 kHz Microsecond Pulse-Width Modulation (PWM)
          </Text>
        </View>

        {/* Hardware Status Banner */}
        <View
          style={[
            styles.card,
            styles.hardwareCard,
            hasHardware === true
              ? styles.cardBorderSuccess
              : hasHardware === false
              ? styles.cardBorderDanger
              : styles.cardBorderPending,
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View
              style={[
                styles.statusIndicator,
                hasHardware === true
                  ? styles.statusOnline
                  : hasHardware === false
                  ? styles.statusOffline
                  : styles.statusPending,
              ]}
            />
            <Text style={styles.cardTitle}>HARDWARE VERIFICATION</Text>
            <TouchableOpacity onPress={verifyHardware} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Re-check</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hardwareText}>{hardwareMessage}</Text>
        </View>

        {/* Binary Payload Input */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>BINARY DATA STREAM</Text>
          <Text style={styles.inputLabel}>
            Enter binary string (0 = 600µs short pulse, 1 = 1200µs long pulse):
          </Text>
          <TextInput
            style={styles.textInput}
            value={binaryData}
            onChangeText={(text) => setBinaryData(text.replace(/[^01]/g, ''))}
            placeholder="e.g. 0101"
            placeholderTextColor="#484f58"
            keyboardType="numeric"
            autoCapitalize="none"
            maxLength={32}
            editable={!isBlasting}
          />

          {/* Quick-select binary presets */}
          <View style={styles.presetRow}>
            <Text style={styles.presetLabel}>Presets:</Text>
            {['0101', '1010', '1100', '0011', '01010101'].map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[
                  styles.presetChip,
                  binaryData === preset && styles.presetChipActive,
                ]}
                onPress={() => setBinaryData(preset)}
                disabled={isBlasting}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    binaryData === preset && styles.presetChipTextActive,
                  ]}
                >
                  {preset}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Pulse Modulation Specifications Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>SIGNAL SPECIFICATIONS</Text>
          <View style={styles.specGrid}>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Carrier Frequency</Text>
              <Text style={styles.specValue}>{CARRIER_FREQUENCY_HZ / 1000} kHz</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Leader Sync Burst</Text>
              <Text style={styles.specValue}>2000µs ON / 1000µs OFF</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Bit "1" Timing</Text>
              <Text style={styles.specValue}>1200µs ON / 600µs OFF</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Bit "0" Timing</Text>
              <Text style={styles.specValue}>600µs ON / 600µs OFF</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Total Intervals</Text>
              <Text style={styles.specValue}>{computedPattern.length} timings</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Calculated Frame Time</Text>
              <Text style={styles.specValue}>{totalDurationMs} ms</Text>
            </View>
          </View>

          {/* Microsecond Pattern Array Inspector */}
          <Text style={[styles.inputLabel, { marginTop: 12 }]}>
            Generated Microsecond Pulse Array [ON, OFF, ON...]:
          </Text>
          <View style={styles.patternBox}>
            <Text style={styles.patternText}>
              {computedPattern.length > 0
                ? `[ ${computedPattern.join(', ')} ]`
                : '(No binary stream provided)'}
            </Text>
          </View>
        </View>

        {/* Main Action Trigger */}
        <TouchableOpacity
          style={[
            styles.fireButton,
            isBlasting && styles.fireButtonBlasting,
            hasHardware === false && styles.fireButtonDisabled,
          ]}
          onPress={handleFireIrSignal}
          disabled={isBlasting}
          activeOpacity={0.8}
        >
          {isBlasting ? (
            <View style={styles.buttonContentRow}>
              <ActivityIndicator color="#ffffff" size="small" />
              <Text style={styles.fireButtonText}>TRANSMITTING IR PULSE...</Text>
            </View>
          ) : (
            <Text style={styles.fireButtonText}>⚡ FIRE IR SIGNAL</Text>
          )}
        </TouchableOpacity>

        {/* Last Transmission Telemetry */}
        {lastTransmission && (
          <View style={styles.telemetryCard}>
            <Text style={styles.telemetryTitle}>LAST TRANSMISSION LOG</Text>
            <Text style={styles.telemetryText}>Payload: {lastTransmission.binary}</Text>
            <Text style={styles.telemetryText}>
              Intervals: {lastTransmission.pulsesCount} alternating pulses
            </Text>
            <Text style={styles.telemetryText}>
              Duration: {lastTransmission.durationMs} ms
            </Text>
            <Text style={styles.telemetryText}>Fired At: {lastTransmission.time}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * -----------------------------------------------------------------------------
 * Dark Mode Styling
 * -----------------------------------------------------------------------------
 */
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  badge: {
    color: '#58a6ff',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    backgroundColor: '#1f6feb22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1f6feb55',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f0f6fc',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#8b949e',
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  hardwareCard: {
    backgroundColor: '#161b22',
  },
  cardBorderSuccess: {
    borderColor: '#238636',
  },
  cardBorderDanger: {
    borderColor: '#da3633',
  },
  cardBorderPending: {
    borderColor: '#d29922',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusOnline: {
    backgroundColor: '#3fb950',
  },
  statusOffline: {
    backgroundColor: '#f85149',
  },
  statusPending: {
    backgroundColor: '#e3b341',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8b949e',
    letterSpacing: 1.2,
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#21262d',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  retryBtnText: {
    color: '#58a6ff',
    fontSize: 11,
    fontWeight: '600',
  },
  hardwareText: {
    color: '#c9d1d9',
    fontSize: 13,
    lineHeight: 18,
  },
  inputLabel: {
    color: '#8b949e',
    fontSize: 12,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    color: '#58a6ff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'center',
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  presetLabel: {
    color: '#8b949e',
    fontSize: 12,
    marginRight: 4,
  },
  presetChip: {
    backgroundColor: '#21262d',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  presetChipActive: {
    backgroundColor: '#1f6feb',
    borderColor: '#58a6ff',
  },
  presetChipText: {
    color: '#c9d1d9',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  presetChipTextActive: {
    color: '#ffffff',
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  specItem: {
    width: '48%',
    backgroundColor: '#0d1117',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#21262d',
  },
  specLabel: {
    color: '#8b949e',
    fontSize: 11,
  },
  specValue: {
    color: '#f0f6fc',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  patternBox: {
    backgroundColor: '#0d1117',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#21262d',
  },
  patternText: {
    color: '#a5d6ff',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  fireButton: {
    backgroundColor: '#238636',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: '#238636',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  fireButtonBlasting: {
    backgroundColor: '#9e6a03',
  },
  fireButtonDisabled: {
    backgroundColor: '#21262d',
    borderColor: '#30363d',
    borderWidth: 1,
  },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fireButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  telemetryCard: {
    backgroundColor: '#161b22',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  telemetryTitle: {
    color: '#58a6ff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  telemetryText: {
    color: '#8b949e',
    fontSize: 12,
    lineHeight: 18,
  },
});
