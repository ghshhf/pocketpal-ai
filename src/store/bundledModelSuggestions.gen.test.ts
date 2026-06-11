import * as fs from 'fs';
import * as path from 'path';

import prettier from 'prettier';

import {parseDeviceRules} from '../services/deviceRules/parse';
import {buildSuggestionsForTier} from '../services/deviceRules/producer';
import {Classifier, DeviceRules, Tier} from '../services/deviceRules/types';
import {ModelSuggestion} from '../services/suggestions/types';

import androidRulesRaw from './bundledDeviceRules/rules.android.json';
import iosRulesRaw from './bundledDeviceRules/rules.ios.json';

// Generator-as-test. `hfAsModel` and its module graph pull react-native at
// import, so this snapshot can only be generated under jest (RN mocked), never
// plain Node/ts-node. The offline floor needs only render fields, all of which
// the rules JSON already carries (size_bytes/sha256/params); the download
// url/LFS are resolved fresh at tap, so no build-time HF call is needed here.
//
// Run `BUNDLED_GEN_WRITE=1 yarn test bundledModelSuggestions.gen` to rewrite
// the committed artifact. Default mode asserts the committed file matches.

type Platform = 'android' | 'ios';

interface GeneratedSnapshot {
  version: string;
  classifiers: Record<Platform, Classifier>;
  tierSuggestions: Record<Platform, Record<Tier, ModelSuggestion[]>>;
}

const TIERS: Tier[] = ['low', 'mid', 'high', 'flagship'];

const requireRenderFields = (rules: DeviceRules, platform: Platform) => {
  for (const tier of TIERS) {
    for (const c of rules.tiers[tier].candidates) {
      // Fail loud: a render-incomplete candidate must not silently ship in the
      // offline floor.
      if (
        c.sizeBytes === undefined ||
        c.params === undefined ||
        c.minRamGb === undefined
      ) {
        throw new Error(
          `bundled snapshot candidate ${platform}/${tier}/${c.hfRepo}/${c.hfFilename} ` +
            'is missing required render fields (size_bytes / params / min_ram_gb)',
        );
      }
    }
  }
};

const buildTierSuggestions = (
  rules: DeviceRules,
): Record<Tier, ModelSuggestion[]> => {
  const out = {} as Record<Tier, ModelSuggestion[]>;
  for (const tier of TIERS) {
    // Device-independent bake: ramBytes omitted so fitsDevice defaults true and
    // is recomputed at runtime against the actual device.
    out[tier] = buildSuggestionsForTier(
      rules.tiers[tier].candidates,
      undefined,
    );
  }
  return out;
};

export const generateBundledSuggestions = (
  androidRaw: unknown,
  iosRaw: unknown,
): GeneratedSnapshot => {
  const android = parseDeviceRules(androidRaw);
  const ios = parseDeviceRules(iosRaw);
  requireRenderFields(android, 'android');
  requireRenderFields(ios, 'ios');

  return {
    version: `${android.rulesVersion}+${ios.rulesVersion}`,
    classifiers: {android: android.classifier, ios: ios.classifier},
    tierSuggestions: {
      android: buildTierSuggestions(android),
      ios: buildTierSuggestions(ios),
    },
  };
};

const ARTIFACT_PATH = path.join(__dirname, 'bundledModelSuggestions.ts');

const serializeArtifact = async (
  snapshot: GeneratedSnapshot,
): Promise<string> => {
  const json = JSON.stringify(snapshot, null, 2);
  const source = `// GENERATED FILE — do not edit by hand.
// Regenerate: BUNDLED_GEN_WRITE=1 yarn test bundledModelSuggestions.gen
import {Classifier, Tier} from '../services/deviceRules/types';
import {ModelSuggestion} from '../services/suggestions/types';

type Platform = 'android' | 'ios';

interface BundledSnapshot {
  version: string;
  classifiers: Record<Platform, Classifier>;
  tierSuggestions: Record<Platform, Record<Tier, ModelSuggestion[]>>;
}

export const bundledModelSuggestions: BundledSnapshot = ${json};

export const BUNDLED_RULES_VERSION = bundledModelSuggestions.version;
`;
  // Format with the repo prettier config so the committed artifact is
  // lint-clean and the golden comparison is stable.
  const config = await prettier.resolveConfig(ARTIFACT_PATH);
  return prettier.format(source, {...config, parser: 'typescript'});
};

describe('bundled model suggestions generator', () => {
  it('throws when a candidate is missing required render fields', () => {
    const broken = JSON.parse(JSON.stringify(androidRulesRaw));
    delete broken.tiers.low.candidates[0].size_bytes;
    expect(() => generateBundledSuggestions(broken, iosRulesRaw)).toThrow(
      /missing required render fields/,
    );
  });

  it('bakes device-independent fitsDevice=true (recomputed at runtime)', () => {
    const snapshot = generateBundledSuggestions(androidRulesRaw, iosRulesRaw);
    const all = [
      ...snapshot.tierSuggestions.android.mid,
      ...snapshot.tierSuggestions.ios.mid,
    ];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every(s => s.fitsDevice === true)).toBe(true);
  });

  it('carries render fields into every baked suggestion', () => {
    const snapshot = generateBundledSuggestions(androidRulesRaw, iosRulesRaw);
    const mid = snapshot.tierSuggestions.android.mid;
    expect(mid[0].sizeBytes).toBeGreaterThan(0);
    expect(mid[0].params).toBeGreaterThan(0);
    expect(mid[0].displayName).toBeTruthy();
  });

  it('matches the committed artifact (golden) or rewrites it in write mode', async () => {
    const snapshot = generateBundledSuggestions(androidRulesRaw, iosRulesRaw);
    const serialized = await serializeArtifact(snapshot);

    if (process.env.BUNDLED_GEN_WRITE === '1') {
      fs.writeFileSync(ARTIFACT_PATH, serialized);
      return;
    }

    const committed = fs.readFileSync(ARTIFACT_PATH, 'utf8');
    expect(serialized).toBe(committed);
  });
});
