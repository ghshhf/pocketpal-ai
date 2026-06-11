import type {Model} from '../../../utils/types';

import {dedupSuggestions} from '../dedup';
import {ModelSuggestion} from '../types';

const suggestion = (
  overrides: Partial<ModelSuggestion> = {},
): ModelSuggestion => ({
  key: {
    hfRepo: 'ggml-org/gemma-3-1b-it-GGUF',
    hfFilename: 'gemma-3-1b-it-Q4_K_M.gguf',
  },
  displayName: 'gemma-3-1b',
  quant: 'q4_k_m',
  badges: {},
  isPrimary: true,
  source: 'device-rules',
  fitsDevice: true,
  ...overrides,
});

const model = (overrides: Partial<Model> = {}): Model =>
  ({
    id: 'ggml-org/gemma-3-1b-it-GGUF/gemma-3-1b-it-Q4_K_M.gguf',
    author: 'ggml-org',
    repo: 'gemma-3-1b-it-GGUF',
    filename: 'gemma-3-1b-it-Q4_K_M.gguf',
    isDownloaded: true,
    ...overrides,
  }) as Model;

describe('dedupSuggestions', () => {
  it('keeps suggestions not present in the model store', () => {
    const out = dedupSuggestions([suggestion()], []);
    expect(out).toHaveLength(1);
  });

  it('suppresses a suggestion whose id matches a store model', () => {
    const out = dedupSuggestions([suggestion()], [model()]);
    expect(out).toHaveLength(0);
  });

  it('suppresses by reconciled {author,repo,filename} when ids differ', () => {
    const legacy = model({
      id: 'legacy-curated-id',
      author: 'ggml-org',
      repo: 'gemma-3-1b-it-GGUF',
      filename: 'gemma-3-1b-it-Q4_K_M.gguf',
    });
    const out = dedupSuggestions([suggestion()], [legacy]);
    expect(out).toHaveLength(0);
  });

  it('keeps a suggestion when only the filename collides but repo differs', () => {
    const other = model({
      id: 'other/repo/gemma-3-1b-it-Q4_K_M.gguf',
      author: 'other',
      repo: 'repo',
    });
    const out = dedupSuggestions([suggestion()], [other]);
    expect(out).toHaveLength(1);
  });
});
