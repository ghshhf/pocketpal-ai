import {
  Classifier,
  CpuHeuristicRule,
  DeviceFamilyRule,
  DeviceRules,
  RamBand,
  RuleCandidate,
  Tier,
  TierMatrixEntry,
} from './types';

// Parse-guard: turns the raw wire JSON into a typed DeviceRules or throws on a
// structurally invalid file. Unknown/extra fields are ignored; the new
// render/identity fields (size_bytes/sha256/params) are optional so draft files
// without them still parse.

const TIERS: Tier[] = ['low', 'mid', 'high', 'flagship'];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;

const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const asStringMap = (v: unknown): Record<string, string> | undefined => {
  if (!isObject(v)) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    const s = asString(val);
    if (s !== undefined) {
      out[k] = s;
    }
  }
  return out;
};

const parseRamBands = (v: unknown): RamBand[] => {
  if (!Array.isArray(v)) {
    throw new Error('classifier.ram_bands missing or not an array');
  }
  return v.map(raw => {
    if (!isObject(raw) || typeof raw.id !== 'string') {
      throw new Error('invalid ram_band entry');
    }
    const maxBytes =
      raw.max_bytes === null ? null : (asNumber(raw.max_bytes) ?? null);
    return {id: raw.id, maxBytes};
  });
};

const parseTierMatrix = (v: unknown): TierMatrixEntry[] => {
  if (!Array.isArray(v)) {
    throw new Error('classifier.tier_matrix missing or not an array');
  }
  const out: TierMatrixEntry[] = [];
  for (const raw of v) {
    if (
      !isObject(raw) ||
      typeof raw.ram_band !== 'string' ||
      typeof raw.soc_class !== 'string' ||
      typeof raw.tier !== 'string'
    ) {
      continue;
    }
    out.push({
      ramBand: raw.ram_band,
      socClass: raw.soc_class,
      tier: raw.tier as Tier,
    });
  }
  return out;
};

const parseDeviceFamily = (v: unknown): DeviceFamilyRule[] | undefined => {
  if (!isObject(v) || !Array.isArray(v.rules)) {
    return undefined;
  }
  const out: DeviceFamilyRule[] = [];
  for (const raw of v.rules) {
    if (
      !isObject(raw) ||
      !isObject(raw.match) ||
      typeof raw.class !== 'string'
    ) {
      continue;
    }
    out.push({
      match: {
        idPrefix: asString(raw.match.id_prefix),
        idMajorMin: asNumber(raw.match.id_major_min),
        minRamBytes: asNumber(raw.match.min_ram_bytes),
      },
      class: raw.class,
    });
  }
  return out;
};

const parseCpuHeuristic = (v: unknown): CpuHeuristicRule[] | undefined => {
  if (!isObject(v) || !Array.isArray(v.rules)) {
    return undefined;
  }
  const out: CpuHeuristicRule[] = [];
  for (const raw of v.rules) {
    if (
      !isObject(raw) ||
      !isObject(raw.match) ||
      typeof raw.class !== 'string'
    ) {
      continue;
    }
    const featuresAny = Array.isArray(raw.match.features_any)
      ? (raw.match.features_any.filter(f => typeof f === 'string') as string[])
      : undefined;
    const featuresAll = Array.isArray(raw.match.features_all)
      ? (raw.match.features_all.filter(f => typeof f === 'string') as string[])
      : undefined;
    out.push({
      match: {
        featuresAny,
        featuresAll,
        maxFreqMhzMin: asNumber(raw.match.max_freq_mhz_min),
      },
      class: raw.class,
    });
  }
  return out;
};

const parseClassifier = (v: unknown): Classifier => {
  if (!isObject(v)) {
    throw new Error('classifier missing');
  }
  return {
    ramBands: parseRamBands(v.ram_bands),
    tierMatrix: parseTierMatrix(v.tier_matrix),
    deviceIdToChip: asStringMap(v.device_id_to_chip),
    chipToClass: asStringMap(v.chip_to_class),
    deviceFamilyFallback: parseDeviceFamily(v.device_family_fallback),
    socModelToClass: asStringMap(v.soc_model_to_class),
    hardwareToClass: asStringMap(v.hardware_to_class),
    cpuHeuristic: parseCpuHeuristic(v.cpu_heuristic),
  };
};

const parseCandidate = (v: unknown): RuleCandidate | null => {
  if (
    !isObject(v) ||
    typeof v.model !== 'string' ||
    typeof v.quant !== 'string' ||
    typeof v.hf_repo !== 'string' ||
    typeof v.hf_filename !== 'string'
  ) {
    return null;
  }
  return {
    model: v.model,
    quant: v.quant,
    hfRepo: v.hf_repo,
    hfFilename: v.hf_filename,
    minRamGb: asNumber(v.min_ram_gb),
    obsTg: asNumber(v.obs_tg),
    nativeLowBit: v.native_low_bit === true,
    multimodal: v.multimodal === true,
    sizeBytes: asNumber(v.size_bytes),
    sha256: asString(v.sha256),
    params: asNumber(v.params),
  };
};

const parseTiers = (v: unknown): DeviceRules['tiers'] => {
  if (!isObject(v)) {
    throw new Error('tiers missing');
  }
  const tiers = {} as DeviceRules['tiers'];
  for (const tier of TIERS) {
    const raw = v[tier];
    const candidates =
      isObject(raw) && Array.isArray(raw.candidates)
        ? raw.candidates
            .map(parseCandidate)
            .filter((c): c is RuleCandidate => c !== null)
        : [];
    tiers[tier] = {candidates};
  }
  return tiers;
};

export function parseDeviceRules(raw: unknown): DeviceRules {
  if (!isObject(raw)) {
    throw new Error('rules root is not an object');
  }
  const platform = asString(raw.platform);
  const rulesVersion = asString(raw.rules_version);
  const schemaVersion = asString(raw.schema_version);
  if (!platform || !rulesVersion || !schemaVersion) {
    throw new Error('rules missing platform / rules_version / schema_version');
  }
  return {
    platform,
    rulesVersion,
    schemaVersion,
    classifier: parseClassifier(raw.classifier),
    tiers: parseTiers(raw.tiers),
  };
}
