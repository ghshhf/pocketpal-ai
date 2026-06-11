import {fetchRules} from '../rules';

const modelEntry = {
  hfModel: {
    id: 'ggml-org/gemma-3-1b-it-GGUF',
    author: 'ggml-org',
    url: 'https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF',
  },
  modelFile: {
    rfilename: 'gemma-3-1b-it-Q4_K_M.gguf',
    url: 'https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf',
  },
};

const newSchemaDoc = {
  schema_version: '2.0.0-draft',
  platform: 'android',
  rules_version: '2026-06-10.1',
  classifier: {
    ram_bands: [{id: 'all', max_bytes: null}],
    tier_matrix: [{ram_band: 'all', soc_class: 'mid', tier: 'mid'}],
  },
  tiers: {mid: {models: [modelEntry]}},
};

const oldCandidatesDoc = {
  schema_version: '1.0.0-draft',
  platform: 'android',
  rules_version: '2026-06-09.1',
  classifier: {
    ram_bands: [{id: 'all', max_bytes: null}],
    tier_matrix: [{ram_band: 'all', soc_class: 'mid', tier: 'mid'}],
  },
  tiers: {
    mid: {
      candidates: [
        {model: 'x', quant: 'q4', hf_repo: 'a/b', hf_filename: 'x.gguf'},
      ],
    },
  },
};

const mockFetch = (
  impl: () => Partial<Response> | Promise<Partial<Response>>,
) => {
  (global as unknown as {fetch: jest.Mock}).fetch = jest
    .fn()
    .mockImplementation(async () => impl());
};

describe('fetchRules', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as unknown as {fetch?: unknown}).fetch;
  });

  it('returns parsed rules for a valid new-schema doc', async () => {
    mockFetch(() => ({ok: true, json: async () => newSchemaDoc}));
    const rules = await fetchRules('android');
    expect(rules).not.toBeNull();
    expect(rules?.tiers.mid.models).toHaveLength(1);
  });

  it('returns null (→ bundled floor) for an old candidates[] schema doc', async () => {
    mockFetch(() => ({ok: true, json: async () => oldCandidatesDoc}));
    expect(await fetchRules('android')).toBeNull();
  });

  it('returns null for garbage JSON that fails to parse', async () => {
    mockFetch(() => ({ok: true, json: async () => ({not: 'rules'})}));
    expect(await fetchRules('android')).toBeNull();
  });

  it('returns null on a non-2xx response', async () => {
    mockFetch(() => ({ok: false, status: 404, json: async () => ({})}));
    expect(await fetchRules('android')).toBeNull();
  });

  it('returns null on a network error', async () => {
    (global as unknown as {fetch: jest.Mock}).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline'));
    expect(await fetchRules('android')).toBeNull();
  });

  it('returns null on a platform mismatch', async () => {
    mockFetch(() => ({
      ok: true,
      json: async () => ({...newSchemaDoc, platform: 'ios'}),
    }));
    expect(await fetchRules('android')).toBeNull();
  });
});
