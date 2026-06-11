import {parseDeviceRules} from '../parse';

const validRaw = {
  schema_version: '1.1.0-draft',
  platform: 'android',
  rules_version: '2026-06-10.1',
  classifier: {
    ram_bands: [
      {id: '6-8', max_bytes: 8589934592, label: '6-8 GiB'},
      {id: '12-plus', max_bytes: null, label: '12+ GiB'},
    ],
    soc_model_to_class: {'Tensor G3': 'mid'},
    hardware_to_class: {shiba: 'mid'},
    cpu_heuristic: {
      rules: [
        {match: {features_any: ['i8mm']}, class: 'flagship'},
        {match: {}, class: 'budget'},
      ],
    },
    tier_matrix: [{ram_band: '6-8', soc_class: 'mid', tier: 'mid'}],
  },
  tiers: {
    mid: {
      candidates: [
        {
          model: 'gemma-3-1b',
          quant: 'q4_k_m',
          hf_repo: 'ggml-org/gemma-3-1b-it-GGUF',
          hf_filename: 'gemma-3-1b-it-Q4_K_M.gguf',
          min_ram_gb: 2.0,
          obs_tg: 11.2,
          size_bytes: 806058240,
          sha256: 'deadbeef',
          params: 999885952,
        },
      ],
    },
  },
};

describe('parseDeviceRules', () => {
  it('parses a render-complete file into camelCase types', () => {
    const rules = parseDeviceRules(validRaw);
    expect(rules.platform).toBe('android');
    expect(rules.rulesVersion).toBe('2026-06-10.1');
    expect(rules.classifier.socModelToClass).toEqual({'Tensor G3': 'mid'});
    expect(rules.classifier.ramBands[1].maxBytes).toBeNull();
    expect(rules.classifier.cpuHeuristic).toHaveLength(2);

    const c = rules.tiers.mid.candidates[0];
    expect(c.hfRepo).toBe('ggml-org/gemma-3-1b-it-GGUF');
    expect(c.sizeBytes).toBe(806058240);
    expect(c.params).toBe(999885952);
    expect(c.sha256).toBe('deadbeef');
  });

  it('tolerates a draft file missing size_bytes/sha256/params (9m)', () => {
    const draft = JSON.parse(JSON.stringify(validRaw));
    delete draft.tiers.mid.candidates[0].size_bytes;
    delete draft.tiers.mid.candidates[0].sha256;
    delete draft.tiers.mid.candidates[0].params;

    const rules = parseDeviceRules(draft);
    const c = rules.tiers.mid.candidates[0];
    expect(c.sizeBytes).toBeUndefined();
    expect(c.sha256).toBeUndefined();
    expect(c.params).toBeUndefined();
    expect(c.hfRepo).toBe('ggml-org/gemma-3-1b-it-GGUF');
  });

  it('ignores unknown top-level / candidate fields (D7)', () => {
    const extra = {
      ...validRaw,
      $schema: 'http://x',
      generated_at: 'now',
      _status: 'draft',
    };
    expect(() => parseDeviceRules(extra)).not.toThrow();
  });

  it('throws on a structurally invalid file (9f)', () => {
    expect(() => parseDeviceRules(null)).toThrow();
    expect(() => parseDeviceRules({})).toThrow();
    expect(() =>
      parseDeviceRules({
        schema_version: '1',
        platform: 'android',
        rules_version: '1',
        classifier: {tier_matrix: []},
      }),
    ).toThrow(/ram_bands/);
  });

  it('defaults all four tiers even when only some are present', () => {
    const rules = parseDeviceRules(validRaw);
    expect(rules.tiers.low.candidates).toEqual([]);
    expect(rules.tiers.mid.candidates).toHaveLength(1);
    expect(rules.tiers.high.candidates).toEqual([]);
    expect(rules.tiers.flagship.candidates).toEqual([]);
  });

  it('drops candidates missing required keys', () => {
    const broken = JSON.parse(JSON.stringify(validRaw));
    broken.tiers.mid.candidates.push({model: 'x', quant: 'q4'}); // no repo/filename
    const rules = parseDeviceRules(broken);
    expect(rules.tiers.mid.candidates).toHaveLength(1);
  });
});
