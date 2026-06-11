import {ModelFile} from '../../utils/types';

import {
  Classifier,
  CpuHeuristicRule,
  DeviceFamilyRule,
  DeviceRules,
  RamBand,
  RuleHFModel,
  RuleModelEntry,
  Tier,
  TierMatrixEntry,
} from './types';

// Parse-guard: turns the raw wire JSON into a typed DeviceRules or throws on a
// structurally invalid file. Unknown/extra fields are ignored. A tier entry
// missing a field hfAsModel requires is skipped; an old-schema or empty tier
// parses to an empty model list (does not throw).

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
      typeof raw.tier !== 'string' ||
      !TIERS.includes(raw.tier as Tier)
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

const parseLfs = (v: unknown): ModelFile['lfs'] | undefined => {
  if (!isObject(v)) {
    return undefined;
  }
  const oid = asString(v.oid);
  const size = asNumber(v.size);
  const pointerSize = asNumber(v.pointerSize ?? v.pointer_size);
  if (oid === undefined || size === undefined || pointerSize === undefined) {
    return undefined;
  }
  return {oid, size, pointerSize};
};

const parseModelFile = (v: unknown): ModelFile | null => {
  if (
    !isObject(v) ||
    typeof v.rfilename !== 'string' ||
    typeof v.url !== 'string'
  ) {
    return null;
  }
  return {
    rfilename: v.rfilename,
    url: v.url,
    size: asNumber(v.size),
    oid: asString(v.oid),
    lfs: parseLfs(v.lfs),
  };
};

const parseSibling = (v: unknown): ModelFile | null => {
  if (!isObject(v) || typeof v.rfilename !== 'string') {
    return null;
  }
  return {
    rfilename: v.rfilename,
    url: asString(v.url),
    size: asNumber(v.size),
    oid: asString(v.oid),
    lfs: parseLfs(v.lfs),
  };
};

const parseHFModel = (v: unknown): RuleHFModel | null => {
  if (
    !isObject(v) ||
    typeof v.id !== 'string' ||
    typeof v.author !== 'string' ||
    typeof v.url !== 'string'
  ) {
    return null;
  }
  const specsRaw = isObject(v.specs) && isObject(v.specs.gguf) ? v.specs : null;
  const specs = specsRaw
    ? {
        ...(specsRaw as object),
        gguf: {
          total:
            asNumber((specsRaw.gguf as Record<string, unknown>).total) ?? 0,
          bos_token: asString(
            (specsRaw.gguf as Record<string, unknown>).bos_token,
          ),
          eos_token: asString(
            (specsRaw.gguf as Record<string, unknown>).eos_token,
          ),
        },
      }
    : undefined;
  const siblings = Array.isArray(v.siblings)
    ? v.siblings.map(parseSibling).filter((s): s is ModelFile => s !== null)
    : undefined;
  return {
    id: v.id,
    author: v.author,
    url: v.url,
    specs: specs as RuleHFModel['specs'],
    siblings,
  };
};

const parseRuleModelEntry = (v: unknown): RuleModelEntry | null => {
  if (!isObject(v)) {
    return null;
  }
  const hfModel = parseHFModel(v.hfModel);
  const modelFile = parseModelFile(v.modelFile);
  if (!hfModel || !modelFile) {
    return null;
  }
  return {name: asString(v.name), hfModel, modelFile};
};

const parseTiers = (v: unknown): DeviceRules['tiers'] => {
  if (!isObject(v)) {
    throw new Error('tiers missing');
  }
  const tiers = {} as DeviceRules['tiers'];
  for (const tier of TIERS) {
    const raw = v[tier];
    const models =
      isObject(raw) && Array.isArray(raw.models)
        ? raw.models
            .map(parseRuleModelEntry)
            .filter((e): e is RuleModelEntry => e !== null)
        : [];
    tiers[tier] = {models};
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
