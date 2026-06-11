import {Platform} from 'react-native';
import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';

import {classify, ClassifyPlatform} from '../services/deviceRules/classify';
import {parseDeviceRules} from '../services/deviceRules/parse';
import {
  buildSuggestionsForTier,
  createDeviceRulesProducer,
} from '../services/deviceRules/producer';
import {getRulesUrl} from '../services/deviceRules/rulesUrls';
import {readDeviceSignals} from '../services/deviceRules/signals';
import {
  Classifier,
  DeviceRules,
  DeviceSignals,
  Tier,
} from '../services/deviceRules/types';
import {ModelSuggestion} from '../services/suggestions/types';
import {registerSuggestionProducer} from '../services/suggestions/registry';

import {
  BUNDLED_SCHEMA_VERSION,
  bundledModelSuggestions,
} from './bundledModelSuggestions';

type FetchState = 'idle' | 'fetching' | 'ok' | 'error';

const FETCH_TIMEOUT_MS = 10_000;
const RULES_TTL_MS = 24 * 60 * 60 * 1000; // re-fetch at most once a day

class DeviceRulesStore {
  rules: DeviceRules | null = null;
  rulesVersion: string | null = null;
  fetchedAt: number | null = null;
  fetchState: FetchState = 'idle';
  deviceTier: Tier | null = null;
  deviceSignals: DeviceSignals | null = null;

  private inFlight: Promise<void> | null = null;
  private hydrationComplete: Promise<void>;

  constructor() {
    makeAutoObservable(this);

    this.hydrationComplete = makePersistable(this, {
      name: 'DeviceRulesStore',
      properties: ['rules', 'rulesVersion', 'fetchedAt', 'deviceTier'],
      storage: AsyncStorage,
    })
      .then(() => {
        // Persisted rules from an older wire schema can be shaped differently
        // (e.g. missing tiers); drop them so we re-fetch / fall back to the
        // bundled snapshot rather than render a stale, mismatched cache.
        if (this.rules && this.rules.schemaVersion !== BUNDLED_SCHEMA_VERSION) {
          runInAction(() => {
            this.rules = null;
            this.rulesVersion = null;
            this.fetchedAt = null;
            this.fetchState = 'idle';
          });
        }
      })
      // A native storage rejection on cold start (DB corrupt/locked, bridge
      // error) must not block ensureRules; degrade to "no cached rules" so the
      // fetch + bundled-floor fallback still runs instead of throwing.
      .catch(() => {});

    registerSuggestionProducer(
      createDeviceRulesProducer(() => this.tierSuggestions),
    );
  }

  private get platformKey(): 'android' | 'ios' {
    return Platform.OS === 'ios' ? 'ios' : 'android';
  }

  // Online (remote/cached) rules are the override; the bundled snapshot is the
  // offline floor for classification when no rules are present.
  private get effectiveClassifier(): Classifier {
    return (
      this.rules?.classifier ??
      bundledModelSuggestions.classifiers[this.platformKey]
    );
  }

  // Suggestions for the resolved tier: from remote/cached rules when present,
  // otherwise from the bundled snapshot (offline floor). Never merged.
  get tierSuggestions(): ModelSuggestion[] {
    if (!this.deviceTier) {
      return [];
    }
    const bundledTier =
      bundledModelSuggestions.tierSuggestions[this.platformKey][
        this.deviceTier
      ];
    if (this.rules) {
      // Tolerate a cached rules object whose tier map is shaped unexpectedly
      // (older/partial wire schema) by falling back to the bundled floor.
      const candidates = this.rules.tiers?.[this.deviceTier]?.candidates;
      if (candidates) {
        return buildSuggestionsForTier(candidates, undefined);
      }
    }
    return bundledTier;
  }

  private get isStale(): boolean {
    if (this.fetchedAt === null) {
      return true;
    }
    return Date.now() - this.fetchedAt > RULES_TTL_MS;
  }

  // Read signals once, fetch+cache rules with TTL, classify into a tier. Safe
  // to call repeatedly; concurrent calls share one in-flight fetch.
  async ensureRules(force = false): Promise<void> {
    // Let rehydration settle before fetching so a late-resolving hydrate can't
    // overwrite freshly fetched rules with a stale persisted snapshot.
    await this.hydrationComplete;

    if (this.inFlight) {
      return this.inFlight;
    }
    if (!force && this.fetchState === 'ok' && !this.isStale) {
      // Still ensure a tier is resolved from cached rules.
      this.resolveTier();
      return;
    }

    this.inFlight = this.refresh();
    try {
      await this.inFlight;
    } finally {
      runInAction(() => {
        this.inFlight = null;
      });
    }
  }

  private async refresh(): Promise<void> {
    await this.ensureSignals();
    runInAction(() => {
      this.fetchState = 'fetching';
    });

    try {
      const rules = await this.fetchRules();
      runInAction(() => {
        this.rules = rules;
        this.rulesVersion = rules.rulesVersion;
        this.fetchedAt = Date.now();
        this.fetchState = 'ok';
      });
    } catch {
      // Keep last cached rules (if any); never surface an error when cache or
      // the offline floor can serve the picker.
      runInAction(() => {
        this.fetchState = 'error';
      });
    }

    this.resolveTier();
  }

  private async ensureSignals(): Promise<void> {
    if (this.deviceSignals) {
      return;
    }
    const signals = await readDeviceSignals();
    runInAction(() => {
      this.deviceSignals = signals;
    });
  }

  private async fetchRules(): Promise<DeviceRules> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(getRulesUrl(), {signal: controller.signal});
      if (!response.ok) {
        throw new Error(`rules fetch failed: ${response.status}`);
      }
      const json = await response.json();
      const parsed = parseDeviceRules(json);
      if (parsed.platform !== Platform.OS) {
        throw new Error(
          `rules platform "${parsed.platform}" != "${Platform.OS}"`,
        );
      }
      return parsed;
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveTier(): void {
    const signals = this.deviceSignals;
    if (!signals) {
      return;
    }
    const tier = classify(
      signals,
      this.effectiveClassifier,
      Platform.OS as ClassifyPlatform,
    );
    runInAction(() => {
      this.deviceTier = tier;
    });
  }
}

export const deviceRulesStore = new DeviceRulesStore();
export {DeviceRulesStore};
