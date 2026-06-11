import type {Model} from '../../utils/types';

import {ModelSuggestion} from './types';

// The HF id assembled by hfAsModel is `author/repo/filename`, i.e. the
// suggestion's `hfRepo/hfFilename`. Legacy/preset ids may differ, so we also
// reconcile by `{repo,filename}` derived from the model's own fields.
const modelKeys = (model: Model): string[] => {
  const keys: string[] = [model.id];
  if (model.author && model.repo && model.filename) {
    keys.push(`${model.author}/${model.repo}/${model.filename}`);
  }
  return keys;
};

const suggestionId = (s: ModelSuggestion): string =>
  `${s.key.hfRepo}/${s.key.hfFilename}`;

// Suppress any suggestion whose {repo,filename} already exists in the model
// store, so a model never appears as both a suggestion and a downloaded card.
export function dedupSuggestions(
  suggestions: ModelSuggestion[],
  models: Model[],
): ModelSuggestion[] {
  const existing = new Set<string>();
  for (const model of models) {
    for (const key of modelKeys(model)) {
      existing.add(key);
    }
  }
  return suggestions.filter(s => !existing.has(suggestionId(s)));
}
