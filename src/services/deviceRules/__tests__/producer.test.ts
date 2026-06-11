import {
  buildSuggestionsForTier,
  createDeviceRulesProducer,
  recomputeFitsDevice,
} from '../producer';
import {RuleCandidate} from '../types';

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

  it('dedups identical {repo,filename} keys', () => {
    const out = buildSuggestionsForTier([candidate(), candidate()], 8 * GiB);
    expect(out).toHaveLength(1);
  });

  it('sets fitsDevice from minRamGb vs device RAM', () => {
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

  it('defaults fitsDevice true when minRamGb is absent', () => {
    const out = buildSuggestionsForTier(
      [candidate({minRamGb: undefined})],
      8 * GiB,
    );
    expect(out[0].fitsDevice).toBe(true);
  });

  it('carries optional render fields and degrades when absent', () => {
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

describe('recomputeFitsDevice', () => {
  it('recomputes fitsDevice against the actual device RAM', () => {
    const base = buildSuggestionsForTier(
      [candidate({minRamGb: 16})],
      undefined,
    );
    expect(base[0].fitsDevice).toBe(true); // device-independent bake

    const recomputed = recomputeFitsDevice(base, 8 * GiB);
    expect(recomputed[0].fitsDevice).toBe(false);
  });
});

describe('createDeviceRulesProducer', () => {
  const tierSuggestions = buildSuggestionsForTier(
    [candidate({minRamGb: 16})],
    undefined,
  );

  it('returns empty when there are no tier suggestions', () => {
    expect(createDeviceRulesProducer(() => []).getSuggestions({})).toEqual([]);
  });

  it('projects suggestions and recomputes fitsDevice', () => {
    const producer = createDeviceRulesProducer(() => tierSuggestions);
    const out = producer.getSuggestions({ramBytes: 8 * GiB});
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('device-rules');
    expect(out[0].fitsDevice).toBe(false);
  });
});
