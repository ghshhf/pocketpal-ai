import {DeviceRulesStore} from '../DeviceRulesStore';
import {BUNDLED_SCHEMA_VERSION} from '../bundledModelSuggestions';

import {readDeviceSignals} from '../../services/deviceRules/signals';
import {DeviceRules} from '../../services/deviceRules/types';

jest.mock('../../services/deviceRules/signals', () => ({
  readDeviceSignals: jest.fn(),
}));

// Simulate mobx-persist-store rehydration: the persisted snapshot for the next
// constructed store is applied onto the instance, then the hydrate promise
// resolves (so the store's post-hydrate schema-version check runs against it).
let mockNextPersisted: Partial<DeviceRulesStore> | null = null;

jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn((target: any) => {
    if (mockNextPersisted) {
      Object.assign(target, mockNextPersisted);
      mockNextPersisted = null;
    }
    return Promise.resolve();
  }),
}));

const seedPersisted = (persisted: Partial<DeviceRulesStore>) => {
  mockNextPersisted = persisted;
};

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
    mockNextPersisted = null;
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
    global.fetch = okFetch(wire) as any;

    const store = new DeviceRulesStore();
    await store.ensureRules();

    expect(store.fetchState).toBe('ok');
    expect(store.rules?.tiers.mid.candidates[0].sizeBytes).toBeUndefined();
    expect(store.deviceTier).toBe('mid');
  });

  it('drops persisted rules whose schema_version differs from the bundle', async () => {
    const stale = makeRules({schemaVersion: '0.0.0-ancient'});
    await seedPersisted({
      rules: stale,
      rulesVersion: stale.rulesVersion,
      fetchedAt: Date.now(),
      deviceTier: 'mid',
    });
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

    const store = new DeviceRulesStore();
    await store.ensureRules();

    // Stale-schema cache is discarded; the picker still serves the bundled floor.
    expect(store.rules).toBeNull();
    expect(store.deviceTier).not.toBeNull();
    expect(store.tierSuggestions.length).toBeGreaterThan(0);
  });

  it('keeps persisted rules when schema_version matches the bundle', async () => {
    const cached = makeRules({schemaVersion: BUNDLED_SCHEMA_VERSION});
    await seedPersisted({
      rules: cached,
      rulesVersion: cached.rulesVersion,
      fetchedAt: Date.now(),
      deviceTier: 'mid',
    });
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

    const store = new DeviceRulesStore();
    await store.ensureRules();

    expect(store.rules).not.toBeNull();
    expect(store.rulesVersion).toBe(cached.rulesVersion);
  });

  it('serves bundled suggestions when cached rules lack the resolved tier', async () => {
    const cached = makeRules({schemaVersion: BUNDLED_SCHEMA_VERSION});
    // Simulate a partial/old cache: the resolved tier is absent from the map.
    delete (cached.tiers as any).mid;
    await seedPersisted({
      rules: cached,
      rulesVersion: cached.rulesVersion,
      fetchedAt: Date.now(),
      deviceTier: 'mid',
    });
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

    const store = new DeviceRulesStore();
    await store.ensureRules();

    expect(store.deviceTier).toBe('mid');
    // No throw on the missing tier; falls back to the bundled floor.
    expect(store.tierSuggestions.length).toBeGreaterThan(0);
  });

  it('does not let a late rehydrate overwrite freshly fetched rules', async () => {
    const fresh = makeRules({rulesVersion: '2026-06-11.fresh'});
    const stalePersisted = makeRules({
      rulesVersion: '2020-01-01.stale',
      schemaVersion: BUNDLED_SCHEMA_VERSION,
    });
    await seedPersisted({
      rules: stalePersisted,
      rulesVersion: stalePersisted.rulesVersion,
      fetchedAt: 1,
      deviceTier: 'mid',
    });
    global.fetch = okFetch(wireRules(fresh)) as any;

    const store = new DeviceRulesStore();
    await store.ensureRules();

    // ensureRules awaits hydration before fetching, so the fresh fetch wins.
    expect(store.rulesVersion).toBe('2026-06-11.fresh');
    expect(store.fetchState).toBe('ok');
  });
});
