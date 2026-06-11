// Source-agnostic model-suggestion primitive. Every suggestion producer
// (device rules, PalsHub pals, built-in pals) projects its own data into this
// shared shape; the suggestion card and the model picker only ever see
// `ModelSuggestion`, never a producer-specific type.

export type SuggestionSource = 'device-rules' | 'palshub-pal' | 'builtin-pal';

export interface SuggestionKey {
  hfRepo: string;
  hfFilename: string;
}

export interface SuggestionBadges {
  multimodal?: boolean;
  nativeLowBit?: boolean;
}

export interface ModelSuggestion {
  key: SuggestionKey;
  sha256?: string;
  displayName: string;
  quant: string;
  sizeBytes?: number;
  params?: number;
  minRamGb?: number;
  obsTg?: number;
  badges: SuggestionBadges;
  isPrimary: boolean;
  source: SuggestionSource;
  fitsDevice: boolean;
}

// Context handed to every producer when suggestions are rebuilt. Producers read
// only what they need; new fields are added here additively.
export interface SuggestionContext {
  ramBytes?: number;
}

export interface SuggestionProducer {
  id: SuggestionSource;
  getSuggestions(ctx: SuggestionContext): ModelSuggestion[];
}
