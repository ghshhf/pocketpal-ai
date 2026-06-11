import {buildSuggestionsForTier, createDeviceRulesProducer} from '../producer';
import {DeviceRules, RuleCandidate} from '../types';

const candidate = (overrides: Partial<RuleCandidate> = {}): RuleCandidate => ({
  model: 'gemma-3-1b',
  quant: 'q4_k_m',
  hfRepo: 'ggml-org/gemma-3-1b-it-GGUF',
  hfFilename: 'gemma-3-1b-it-Q4_K_M.gguf',
  minRamGb: 2.0,
  obsTg: 10,
  sizeBytes: 806058240,
  sha256: 'abc',
  params: 999885952,
  ...overrides,
});

const GiB = 1024 * 1024 * 1024;

describe('buildSuggestionsForTier', () => {
  it('marks the first candidate per model as primary', () => {
    const out = buildSuggestionsForTier(
      [
        candidate({model: 'gemma-3-1b'}),
        candidate({
          model: 'qwen3-0.6b',
          hfRepo: 'bartowski/Qwen_Qwen3-0.6B-GGUF',
          hfFilename: 'Qwen_Qwen3-0.6B-Q4_K_M.gguf',
        }),
        candidate({
          model: 'gemma-3-1b',
          quant: 'q8_0',
          hfFilename: 'gemma-3-1b-it-Q8_0.gguf',
        }),
      ],
      8 * GiB,
    );

    expect(out.map(s => [s.displayName, s.isPrimary])).toEqual([
      ['gemma-3-1b', true],
      ['qwen3-0.6b', true],
      ['gemma-3-1b', false],
    ]);
  });

  it('dedups identical {repo,filename} keys (9j)', () => {
    const out = buildSuggestionsForTier([candidate(), candidate()], 8 * GiB);
    expect(out).toHaveLength(1);
  });

  it('sets fitsDevice from minRamGb vs device RAM (D11)', () => {
    const out = buildSuggestionsForTier(
      [
        candidate({model: 'big', minRamGb: 16, hfFilename: 'big.gguf'}),
        candidate({model: 'small', minRamGb: 1, hfFilename: 'small.gguf'}),
      ],
      8 * GiB,
    );
    expect(out.find(s => s.displayName === 'big')?.fitsDevice).toBe(false);
    expect(out.find(s => s.displayName === 'small')?.fitsDevice).toBe(true);
  });

  it('defaults fitsDevice true when minRamGb is absent (9k/9m)', () => {
    const out = buildSuggestionsForTier(
      [candidate({minRamGb: undefined})],
      8 * GiB,
    );
    expect(out[0].fitsDevice).toBe(true);
  });

  it('carries optional render fields and degrades when absent (9m draft)', () => {
    const withFields = buildSuggestionsForTier([candidate()], 8 * GiB)[0];
    expect(withFields.sizeBytes).toBe(806058240);
    expect(withFields.params).toBe(999885952);

    const draft = buildSuggestionsForTier(
      [candidate({sizeBytes: undefined, params: undefined, sha256: undefined})],
      8 * GiB,
    )[0];
    expect(draft.sizeBytes).toBeUndefined();
    expect(draft.params).toBeUndefined();
    expect(draft.displayName).toBe('gemma-3-1b');
  });

  it('maps badges from multimodal / native_low_bit flags', () => {
    const out = buildSuggestionsForTier(
      [candidate({multimodal: true, nativeLowBit: true})],
      8 * GiB,
    );
    expect(out[0].badges).toEqual({multimodal: true, nativeLowBit: true});
  });
});

describe('createDeviceRulesProducer', () => {
  const rules: DeviceRules = {
    schemaVersion: '1.1.0-draft',
    platform: 'android',
    rulesVersion: '2026-06-10.1',
    classifier: {ramBands: [], tierMatrix: []},
    tiers: {
      low: {candidates: [candidate()]},
      mid: {candidates: []},
      high: {candidates: []},
      flagship: {candidates: []},
    },
  };

  it('returns empty when rules or tier is null', () => {
    expect(
      createDeviceRulesProducer(() => ({
        rules: null,
        tier: null,
      })).getSuggestions({}),
    ).toEqual([]);
    expect(
      createDeviceRulesProducer(() => ({rules, tier: null})).getSuggestions({}),
    ).toEqual([]);
  });

  it('projects the resolved tier candidates', () => {
    const producer = createDeviceRulesProducer(() => ({rules, tier: 'low'}));
    const out = producer.getSuggestions({ramBytes: 8 * GiB});
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('device-rules');
    expect(out[0].displayName).toBe('gemma-3-1b');
  });
});
