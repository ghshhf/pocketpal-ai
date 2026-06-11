import {
  __resetSuggestionProducers,
  getAllSuggestions,
  registerSuggestionProducer,
  unregisterSuggestionProducer,
} from '../registry';
import {ModelSuggestion, SuggestionProducer} from '../types';

const makeSuggestion = (
  overrides: Partial<ModelSuggestion> = {},
): ModelSuggestion => ({
  key: {hfRepo: 'org/repo', hfFilename: 'model.gguf'},
  displayName: 'model',
  quant: 'q4_k_m',
  badges: {},
  isPrimary: true,
  source: 'device-rules',
  fitsDevice: true,
  ...overrides,
});

describe('suggestion registry', () => {
  beforeEach(() => {
    __resetSuggestionProducers();
  });

  it('returns an empty list with no producers registered', () => {
    expect(getAllSuggestions({})).toEqual([]);
  });

  it('aggregates suggestions across registered producers', () => {
    const producerA: SuggestionProducer = {
      id: 'device-rules',
      getSuggestions: () => [makeSuggestion({displayName: 'a'})],
    };
    const producerB: SuggestionProducer = {
      id: 'palshub-pal',
      getSuggestions: () => [
        makeSuggestion({displayName: 'b', source: 'palshub-pal'}),
      ],
    };

    registerSuggestionProducer(producerA);
    registerSuggestionProducer(producerB);

    const names = getAllSuggestions({}).map(s => s.displayName);
    expect(names).toEqual(expect.arrayContaining(['a', 'b']));
    expect(names).toHaveLength(2);
  });

  it('replaces a producer registered under the same id', () => {
    registerSuggestionProducer({
      id: 'device-rules',
      getSuggestions: () => [makeSuggestion({displayName: 'old'})],
    });
    registerSuggestionProducer({
      id: 'device-rules',
      getSuggestions: () => [makeSuggestion({displayName: 'new'})],
    });

    expect(getAllSuggestions({}).map(s => s.displayName)).toEqual(['new']);
  });

  it('drops a producer once unregistered', () => {
    registerSuggestionProducer({
      id: 'device-rules',
      getSuggestions: () => [makeSuggestion()],
    });
    unregisterSuggestionProducer('device-rules');

    expect(getAllSuggestions({})).toEqual([]);
  });

  it('passes the context through to producers', () => {
    const getSuggestions = jest.fn(() => [] as ModelSuggestion[]);
    registerSuggestionProducer({id: 'device-rules', getSuggestions});

    getAllSuggestions({ramBytes: 8 * 1e9});

    expect(getSuggestions).toHaveBeenCalledWith({ramBytes: 8 * 1e9});
  });
});
