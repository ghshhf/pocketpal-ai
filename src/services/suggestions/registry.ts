import {
  ModelSuggestion,
  SuggestionContext,
  SuggestionProducer,
  SuggestionSource,
} from './types';

// Producer-neutral registry. Adding a suggestion source is a new producer file
// plus a `register` call here — never an edit to the card or the view-model.
const producers = new Map<SuggestionSource, SuggestionProducer>();

export const registerSuggestionProducer = (producer: SuggestionProducer) => {
  producers.set(producer.id, producer);
};

export const unregisterSuggestionProducer = (id: SuggestionSource) => {
  producers.delete(id);
};

export const getAllSuggestions = (
  ctx: SuggestionContext,
): ModelSuggestion[] => {
  const all: ModelSuggestion[] = [];
  for (const producer of producers.values()) {
    all.push(...producer.getSuggestions(ctx));
  }
  return all;
};

// Exposed for tests; production wires producers at module load.
export const __resetSuggestionProducers = () => {
  producers.clear();
};
