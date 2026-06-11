import {HuggingFaceModel, ModelFile} from '../../utils/types';

// Parsed wire shape of `rules.<platform>.json` plus the device signals the
// classifier consumes. Each tier entry is a baked subset of an HF fetch — the
// exact fields `hfAsModel` reads — so the app feeds it through that transform
// with no remapping.

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

// The HuggingFaceModel subset a baked rule entry carries — exactly the fields
// hfAsModel reads. Cast to HuggingFaceModel at the call boundary.
export type RuleHFModel = Pick<HuggingFaceModel, 'id' | 'author' | 'url'> & {
  specs?: Pick<HuggingFaceModel, 'specs'>['specs'];
  siblings?: ModelFile[]; // vision repos only; each carries url+oid+lfs since the mmproj sibling is materialized into a downloadable Model
};

// One baked {hfModel, modelFile} pair from `tiers[T].models[]`. Fed verbatim to
// hfAsModel to yield an origin:HF Model identical to an HF-browser add.
export interface RuleModelEntry {
  name?: string; // optional curated display name; app uses name ?? derived
  hfModel: RuleHFModel;
  modelFile: ModelFile;
}

export interface DeviceRules {
  schemaVersion: string;
  platform: string;
  rulesVersion: string;
  classifier: Classifier;
  tiers: Record<Tier, {models: RuleModelEntry[]}>;
}

export interface DeviceSignals {
  ramBytes: number;
  machine?: string; // iOS utsname.machine (RNDeviceInfo.getDeviceId)
  socModel?: string; // Android Build.SOC_MODEL
  hardware?: string; // Android Build.HARDWARE
  cpuFeatures?: string[]; // i8mm / sve2 / dotprod
  maxFreqMhz?: number; // Android big-core max freq
}
