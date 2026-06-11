import React from 'react';

import {Alert} from 'react-native';

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

  it('resolves then downloads on tap', async () => {
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

  it('surfaces an alert and re-enables the button when resolve rejects', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (resolveHFModelForDownload as jest.Mock).mockRejectedValue(
      new Error('boom'),
    );

    const {getByTestId} = render(<SuggestionCard suggestion={suggestion()} />);
    const button = getByTestId('suggestion-download-button');

    fireEvent.press(button);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Download Setup Failed',
        expect.stringContaining('boom'),
      );
    });
    // Button is interactive again (not stuck disabled/loading).
    await waitFor(() => {
      expect(button.props.accessibilityState?.disabled).toBeFalsy();
    });
    expect(modelStore.downloadHFModel).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('shows a connect-to-download message on a network failure', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (resolveHFModelForDownload as jest.Mock).mockRejectedValue(
      new Error('Network request failed'),
    );

    const {getByTestId} = render(<SuggestionCard suggestion={suggestion()} />);
    fireEvent.press(getByTestId('suggestion-download-button'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Download Setup Failed',
        'Connect to the internet to download this model.',
      );
    });

    alertSpy.mockRestore();
  });
});
