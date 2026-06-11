import {resolveHFModelForDownload} from '../../utils/hfResolve';
import type {HuggingFaceModel, ModelFile} from '../../utils/types';

import {ModelSuggestion} from './types';

export interface DownloadSuggestionDeps {
  authToken?: string | null;
  downloadHFModel: (
    hfModel: HuggingFaceModel,
    modelFile: ModelFile,
    options?: {enableVision?: boolean},
  ) => Promise<unknown>;
}

// Materialise a suggestion into a downloading Model via the shared HF resolve +
// convert + download path — the same one PalsHub uses. No bespoke
// candidate-to-Model constructor; a suggestion only becomes a Model on tap.
export async function downloadSuggestion(
  suggestion: ModelSuggestion,
  deps: DownloadSuggestionDeps,
): Promise<void> {
  const {hfModel, modelFile} = await resolveHFModelForDownload(
    suggestion.key.hfRepo,
    suggestion.key.hfFilename,
    deps.authToken,
  );
  await deps.downloadHFModel(hfModel, modelFile, {enableVision: true});
}
