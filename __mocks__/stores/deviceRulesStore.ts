import {makeAutoObservable} from 'mobx';

class MockDeviceRulesStore {
  rules: unknown = null;
  rulesVersion: string | null = null;
  fetchedAt: number | null = null;
  fetchState: 'idle' | 'fetching' | 'ok' | 'error' = 'idle';
  deviceTier: string | null = null;
  deviceSignals: {ramBytes: number} | null = null;

  ensureRules: jest.Mock;

  constructor() {
    makeAutoObservable(this, {ensureRules: false});
    this.ensureRules = jest.fn().mockResolvedValue(undefined);
  }

  get effectiveRules() {
    return this.rules;
  }
}

export const mockDeviceRulesStore = new MockDeviceRulesStore();
