import {parseDeviceRules} from '../parse';

const modelEntry = {
  name: 'Gemma-3-1b-it (Q4_K_M)',
  hfModel: {
    id: 'ggml-org/gemma-3-1b-it-GGUF',
    author: 'ggml-org',
    url: 'https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF',
    specs: {gguf: {total: 999885952, bos_token: '<bos>', eos_token: '<eos>'}},
  },
  modelFile: {
    rfilename: 'gemma-3-1b-it-Q4_K_M.gguf',
    url: 'https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf',
    size: 806058240,
    oid: 'abc123',
    lfs: {oid: 'lfs-oid', size: 806058240, pointerSize: 135},
  },
};

const validRaw = {
  schema_version: '2.0.0-draft',
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
    mid: {models: [modelEntry]},
  },
};

describe('parseDeviceRules', () => {
  it('parses the classifier into camelCase types', () => {
    const rules = parseDeviceRules(validRaw);
    expect(rules.platform).toBe('android');
    expect(rules.rulesVersion).toBe('2026-06-10.1');
    expect(rules.classifier.socModelToClass).toEqual({'Tensor G3': 'mid'});
    expect(rules.classifier.ramBands[1].maxBytes).toBeNull();
    expect(rules.classifier.cpuHeuristic).toHaveLength(2);
  });

  it('parses a tier model entry as a baked {hfModel, modelFile} pair', () => {
    const rules = parseDeviceRules(validRaw);
    const e = rules.tiers.mid.models[0];
    expect(e.name).toBe('Gemma-3-1b-it (Q4_K_M)');
    expect(e.hfModel.id).toBe('ggml-org/gemma-3-1b-it-GGUF');
    expect(e.hfModel.author).toBe('ggml-org');
    expect(e.hfModel.specs?.gguf?.total).toBe(999885952);
    expect(e.modelFile.rfilename).toBe('gemma-3-1b-it-Q4_K_M.gguf');
    expect(e.modelFile.url).toContain('/resolve/main/');
    expect(e.modelFile.size).toBe(806058240);
    expect(e.modelFile.oid).toBe('abc123');
    expect(e.modelFile.lfs).toEqual({
      oid: 'lfs-oid',
      size: 806058240,
      pointerSize: 135,
    });
  });

  it('parses vision siblings when present', () => {
    const vision = JSON.parse(JSON.stringify(validRaw));
    vision.tiers.mid.models[0].hfModel.siblings = [
      {rfilename: 'mmproj-model-f16.gguf', size: 100, oid: 'p1'},
    ];
    const rules = parseDeviceRules(vision);
    expect(rules.tiers.mid.models[0].hfModel.siblings).toHaveLength(1);
    expect(rules.tiers.mid.models[0].hfModel.siblings?.[0].rfilename).toBe(
      'mmproj-model-f16.gguf',
    );
  });

  it('omits an optional name when absent', () => {
    const noName = JSON.parse(JSON.stringify(validRaw));
    delete noName.tiers.mid.models[0].name;
    const rules = parseDeviceRules(noName);
    expect(rules.tiers.mid.models[0].name).toBeUndefined();
  });

  it('drops tier_matrix entries with a non-canonical tier', () => {
    const withBadTier = JSON.parse(JSON.stringify(validRaw));
    withBadTier.classifier.tier_matrix = [
      {ram_band: '6-8', soc_class: 'mid', tier: 'mid'},
      {ram_band: '6-8', soc_class: 'flagship', tier: 'ultra'},
    ];
    const rules = parseDeviceRules(withBadTier);
    expect(rules.classifier.tierMatrix).toEqual([
      {ramBand: '6-8', socClass: 'mid', tier: 'mid'},
    ]);
  });

  it('ignores unknown top-level fields', () => {
    const extra = {
      ...validRaw,
      $schema: 'http://x',
      generated_at: 'now',
      _status: 'draft',
    };
    expect(() => parseDeviceRules(extra)).not.toThrow();
  });

  it('throws on a structurally invalid file', () => {
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
    expect(rules.tiers.low.models).toEqual([]);
    expect(rules.tiers.mid.models).toHaveLength(1);
    expect(rules.tiers.high.models).toEqual([]);
    expect(rules.tiers.flagship.models).toEqual([]);
  });

  it('skips an entry missing a required field hfAsModel needs', () => {
    const broken = JSON.parse(JSON.stringify(validRaw));
    broken.tiers.mid.models.push({
      hfModel: {id: 'a/b', author: 'a', url: 'u'},
      modelFile: {rfilename: 'x.gguf'}, // no url
    });
    const rules = parseDeviceRules(broken);
    expect(rules.tiers.mid.models).toHaveLength(1);
  });

  it('yields empty tiers for an old candidates[] schema doc', () => {
    const old = JSON.parse(JSON.stringify(validRaw));
    old.tiers = {
      mid: {
        candidates: [
          {
            model: 'x',
            quant: 'q4',
            hf_repo: 'a/b',
            hf_filename: 'x.gguf',
          },
        ],
      },
    };
    const rules = parseDeviceRules(old);
    expect(rules.tiers.mid.models).toEqual([]);
  });
});
