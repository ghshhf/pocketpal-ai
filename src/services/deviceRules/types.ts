// Parsed wire shape of `rules.<platform>.json` plus the device signals the
// classifier consumes. Render fields (`sizeBytes`/`params`) are optional: older
// draft rules omit them and the app degrades gracefully.

export type Tier = 'low' | 'mid' | 'high' | 'flagship';

export type SocClass = string; // 'budget'|'mid'|'flagship' (Android) | 'entry'|'mid'|'flagship' (iOS)

export interface RamBand {
  id: string;
  maxBytes: number | null; // null = top (unbounded) band
}

export interface TierMatrixEntry {
  ramBand: string;
  socClass: SocClass;
  tier: Tier;
}

export interface DeviceFamilyRule {
  match: {
    idPrefix?: string;
    idMajorMin?: number;
    minRamBytes?: number;
  };
  class: SocClass;
}

export interface CpuHeuristicRule {
  match: {
    featuresAny?: string[];
    featuresAll?: string[];
    maxFreqMhzMin?: number;
  };
  class: SocClass;
}

export interface Classifier {
  ramBands: RamBand[];
  tierMatrix: TierMatrixEntry[];
  // iOS
  deviceIdToChip?: Record<string, string>;
  chipToClass?: Record<string, SocClass>;
  deviceFamilyFallback?: DeviceFamilyRule[];
  // Android
  socModelToClass?: Record<string, SocClass>;
  hardwareToClass?: Record<string, SocClass>;
  cpuHeuristic?: CpuHeuristicRule[];
}

export interface RuleCandidate {
  model: string;
  quant: string;
  hfRepo: string;
  hfFilename: string;
  minRamGb?: number;
  obsTg?: number;
  nativeLowBit?: boolean;
  multimodal?: boolean;
  sizeBytes?: number;
  params?: number;
}

export interface DeviceRules {
  schemaVersion: string;
  platform: string;
  rulesVersion: string;
  classifier: Classifier;
  tiers: Record<Tier, {candidates: RuleCandidate[]}>;
}

export interface DeviceSignals {
  ramBytes: number;
  machine?: string; // iOS utsname.machine (RNDeviceInfo.getDeviceId)
  socModel?: string; // Android Build.SOC_MODEL
  hardware?: string; // Android Build.HARDWARE
  cpuFeatures?: string[]; // i8mm / sve2 / dotprod
  maxFreqMhz?: number; // Android big-core max freq
}
