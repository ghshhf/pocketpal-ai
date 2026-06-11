import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import NativeHardwareInfo from '../../specs/NativeHardwareInfo';

import {DeviceSignals} from './types';

// Read the device signals the classifier needs, once. Missing native fields are
// tolerated (e.g. Android < S has no SOC_MODEL); the classifier degrades.
export async function readDeviceSignals(): Promise<DeviceSignals> {
  const ramBytes = await DeviceInfo.getTotalMemory();

  if (Platform.OS === 'ios') {
    const machine = await DeviceInfo.getDeviceId();
    return {ramBytes, machine};
  }

  try {
    const cpu = await NativeHardwareInfo.getCPUInfo();
    return {
      ramBytes,
      socModel: cpu.socModel,
      hardware: cpu.hardware,
      cpuFeatures: cpu.features,
      maxFreqMhz: cpu.maxFreqMhz,
    };
  } catch {
    return {ramBytes};
  }
}
