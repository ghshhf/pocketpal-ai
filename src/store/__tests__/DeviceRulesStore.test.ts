import {DeviceRulesStore} from '../DeviceRulesStore';

import {readDeviceSignals} from '../../services/deviceRules/signals';
import {DeviceRules} from '../../services/deviceRules/types';

jest.mock('../../services/deviceRules/signals', () => ({
  readDeviceSignals: jest.fn(),
}));

const makeRules = (overrides: Partial<DeviceRules> = {}): DeviceRules => ({
  schemaVersion: '1.1.0-draft',
  platform: 'ios',
  rulesVersion: '2026-06-10.1',
  classifier: {
    ramBands: [
      {id: '4-6', maxBytes: 6442450944},
      {id: '8-plus', maxBytes: null},
    ],
    deviceIdToChip: {'iPhone14,2': 'A15'},
    chipToClass: {A15: 'mid'},
    tierMatrix: [{ramBand: '4-6', socClass: 'mid', tier: 'mid'}],
  },
  tiers: {
    low: {candidates: []},
    mid: {
      candidates: [
        {
          model: 'gemma-3-1b',
          quant: 'q4_k_m',
          hfRepo: 'ggml-org/gemma-3-1b-it-GGUF',
          hfFilename: 'gemma-3-1b-it-Q4_K_M.gguf',
          minRamGb: 1.8,
          sizeBytes: 806058240,
          sha256: 'abc',
          params: 999885952,
        },
      ],
    },
    high: {candidates: []},
    flagship: {candidates: []},
  },
  ...overrides,
});

const wireRules = (rules: DeviceRules) => ({
  schema_version: rules.schemaVersion,
  platform: rules.platform,
  rules_version: rules.rulesVersion,
  classifier: {
    ram_bands: rules.classifier.ramBands.map(b => ({
      id: b.id,
      max_bytes: b.maxBytes,
    })),
    device_id_to_chip: rules.classifier.deviceIdToChip,
    chip_to_class: rules.classifier.chipToClass,
    tier_matrix: rules.classifier.tierMatrix.map(e => ({
      ram_band: e.ramBand,
      soc_class: e.socClass,
      tier: e.tier,
    })),
  },
  tiers: {
    mid: {
      candidates: rules.tiers.mid.candidates.map(c => ({
        model: c.model,
        quant: c.quant,
        hf_repo: c.hfRepo,
        hf_filename: c.hfFilename,
        min_ram_gb: c.minRamGb,
        size_bytes: c.sizeBytes,
        sha256: c.sha256,
        params: c.params,
      })),
    },
  },
});

const okFetch = (body: unknown) =>
  jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });

describe('DeviceRulesStore', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    (readDeviceSignals as jest.Mock).mockResolvedValue({
      ramBytes: 6 * 1e9,
      machine: 'iPhone14,2',
    });
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('fetches, parses, caches, and classifies a tier', async () => {
    const rules = makeRules();
    global.fetch = okFetch(wireRules(rules)) as any;

    const store = new DeviceRulesStore();
    await store.ensureRules();

    expect(store.fetchState).toBe('ok');
    expect(store.rulesVersion).toBe('2026-06-10.1');
    expect(store.deviceTier).toBe('mid');
    expect(store.fetchedAt).not.toBeNull();
  });

  it('keeps cached rules and reports error on fetch failure', async () => {
    const rules = makeRules();
    global.fetch = okFetch(wireRules(rules)) as any;
    const store = new DeviceRulesStore();
    await store.ensureRules();

    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;
    await store.ensureRules(true);

    expect(store.fetchState).toBe('error');
    expect(store.rules).not.toBeNull();
    expect(store.deviceTier).toBe('mid');
  });

  it('reports error and keeps no rules on malformed JSON with no cache', async () => {
    global.fetch = okFetch({garbage: true}) as any;
    const store = new DeviceRulesStore();
    await store.ensureRules();

    expect(store.fetchState).toBe('error');
    expect(store.rules).toBeNull();
  });

  it('errors on platform mismatch', async () => {
    const rules = makeRules({platform: 'android'});
    global.fetch = okFetch(wireRules(rules)) as any;
    const store = new DeviceRulesStore();
    await store.ensureRules();

    expect(store.fetchState).toBe('error');
    expect(store.rules).toBeNull();
  });

  it('does not re-fetch fresh rules but re-fetches when forced (TTL)', async () => {
    const rules = makeRules();
    const fetchMock = okFetch(wireRules(rules));
    global.fetch = fetchMock as any;
    const store = new DeviceRulesStore();

    await store.ensureRules();
    await store.ensureRules(); // fresh, no re-fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await store.ensureRules(true); // forced re-fetch
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('classifies and serves bundled suggestions when offline with no cache', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;
    const store = new DeviceRulesStore();
    await store.ensureRules();

    expect(store.fetchState).toBe('error');
    expect(store.rules).toBeNull();
    // classifier comes from the bundled snapshot, so a tier still resolves
    expect(store.deviceTier).not.toBeNull();
    // and suggestions come from the bundled snapshot for that tier
    expect(store.tierSuggestions.length).toBeGreaterThan(0);
    expect(store.tierSuggestions.every(s => s.source === 'device-rules')).toBe(
      true,
    );
  });

  it('tolerates draft rules without render fields', async () => {
    const rules = makeRules();
    const wire = wireRules(rules);
    delete (wire.tiers.mid.candidates[0] as any).size_bytes;
    delete (wire.tiers.mid.candidates[0] as any).params;
    delete (wire.tiers.mid.candidates[0] as any).sha256;
    global.fetch = okFetch(wire) as any;

    const store = new DeviceRulesStore();
    await store.ensureRules();

    expect(store.fetchState).toBe('ok');
    expect(store.rules?.tiers.mid.candidates[0].sizeBytes).toBeUndefined();
    expect(store.deviceTier).toBe('mid');
  });
});
