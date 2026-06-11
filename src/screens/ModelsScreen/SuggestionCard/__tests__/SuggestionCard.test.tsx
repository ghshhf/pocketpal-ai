import React from 'react';

import {fireEvent, render, waitFor} from '../../../../../jest/test-utils';

import {modelStore} from '../../../../store';
import {resolveHFModelForDownload} from '../../../../utils/hfResolve';
import {ModelSuggestion} from '../../../../services/suggestions/types';

import {SuggestionCard} from '../SuggestionCard';

jest.mock('../../../../utils/hfResolve', () => ({
  resolveHFModelForDownload: jest.fn(),
}));

const suggestion = (
  overrides: Partial<ModelSuggestion> = {},
): ModelSuggestion => ({
  key: {
    hfRepo: 'ggml-org/gemma-3-1b-it-GGUF',
    hfFilename: 'gemma-3-1b-it-Q4_K_M.gguf',
  },
  displayName: 'gemma-3-1b',
  quant: 'q4_k_m',
  sizeBytes: 806058240,
  params: 999885952,
  minRamGb: 2,
  obsTg: 11.2,
  badges: {},
  isPrimary: true,
  source: 'device-rules',
  fitsDevice: true,
  ...overrides,
});

describe('SuggestionCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveHFModelForDownload as jest.Mock).mockResolvedValue({
      hfModel: {id: 'ggml-org/gemma-3-1b-it-GGUF'},
      modelFile: {rfilename: 'gemma-3-1b-it-Q4_K_M.gguf'},
    });
  });

  it('renders name, quant, and the primary badge', () => {
    const {getByText, getByTestId} = render(
      <SuggestionCard suggestion={suggestion()} />,
    );
    expect(getByText('gemma-3-1b')).toBeTruthy();
    expect(getByText('q4_k_m')).toBeTruthy();
    expect(getByTestId('suggestion-primary-badge')).toBeTruthy();
  });

  it('shows a fit warning when the model may not fit', () => {
    const {getByText} = render(
      <SuggestionCard suggestion={suggestion({fitsDevice: false})} />,
    );
    expect(getByText('May not fit this device')).toBeTruthy();
  });

  it('renders multimodal and low-bit badges from flags', () => {
    const {getByTestId} = render(
      <SuggestionCard
        suggestion={suggestion({
          badges: {multimodal: true, nativeLowBit: true},
        })}
      />,
    );
    expect(getByTestId('suggestion-multimodal-badge')).toBeTruthy();
    expect(getByTestId('suggestion-lowbit-badge')).toBeTruthy();
  });

  it('resolves then downloads on tap (I3 path)', async () => {
    const {getByTestId} = render(<SuggestionCard suggestion={suggestion()} />);

    fireEvent.press(getByTestId('suggestion-download-button'));

    await waitFor(() => {
      expect(resolveHFModelForDownload).toHaveBeenCalledWith(
        'ggml-org/gemma-3-1b-it-GGUF',
        'gemma-3-1b-it-Q4_K_M.gguf',
        undefined,
      );
    });
    await waitFor(() => {
      expect(modelStore.downloadHFModel).toHaveBeenCalledWith(
        {id: 'ggml-org/gemma-3-1b-it-GGUF'},
        {rfilename: 'gemma-3-1b-it-Q4_K_M.gguf'},
        {enableVision: true},
      );
    });
  });
});
