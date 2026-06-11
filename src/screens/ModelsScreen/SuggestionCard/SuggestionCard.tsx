import React, {useContext, useState} from 'react';
import {Alert, View} from 'react-native';

import {Button, Card, Chip, Text} from 'react-native-paper';

import {useTheme} from '../../../hooks';

import {createStyles} from './styles';

import {hfStore, modelStore} from '../../../store';
import {L10nContext} from '../../../utils';
import {t} from '../../../locales';
import {formatBytes, formatNumber} from '../../../utils/formatters';
import {downloadSuggestion} from '../../../services/suggestions/download';
import {ModelSuggestion} from '../../../services/suggestions/types';

// Resolving a suggestion requires the network (the HF repo is fetched on tap),
// so an offline tap fails here rather than queueing a download.
const isNetworkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|timeout|abort/i.test(message);
};

interface SuggestionCardProps {
  suggestion: ModelSuggestion;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({suggestion}) => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);

  const [isStarting, setIsStarting] = useState(false);

  const labels = l10n.models.suggestions;

  const handleDownload = async () => {
    if (isStarting) {
      return;
    }
    setIsStarting(true);
    try {
      await downloadSuggestion(suggestion, {
        authToken: hfStore.shouldUseToken ? hfStore.hfToken : undefined,
        downloadHFModel: modelStore.downloadHFModel,
      });
    } catch (error) {
      Alert.alert(
        l10n.errors.downloadSetupFailedTitle,
        isNetworkError(error)
          ? l10n.errors.downloadConnectRequiredMessage
          : t(l10n.errors.downloadSetupFailedMessage, {
              message: error instanceof Error ? error.message : String(error),
            }),
      );
    } finally {
      setIsStarting(false);
    }
  };

  const sizeLabel =
    suggestion.sizeBytes !== undefined
      ? formatBytes(suggestion.sizeBytes, 1)
      : undefined;
  const paramsLabel =
    suggestion.params !== undefined
      ? formatNumber(suggestion.params, 1, true)
      : undefined;

  return (
    <Card
      style={styles.card}
      testID={`suggestion-card-${suggestion.key.hfFilename}`}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.titleColumn}>
            <Text variant="titleMedium" style={styles.name}>
              {suggestion.displayName}
            </Text>
            <Text variant="bodySmall" style={styles.quant}>
              {suggestion.quant}
            </Text>
          </View>
          {suggestion.isPrimary && (
            <Chip compact testID="suggestion-primary-badge">
              {labels.primary}
            </Chip>
          )}
        </View>

        <View style={styles.badgeRow}>
          {suggestion.badges.multimodal && (
            <Chip compact testID="suggestion-multimodal-badge">
              {labels.multimodal}
            </Chip>
          )}
          {suggestion.badges.nativeLowBit && (
            <Chip compact testID="suggestion-lowbit-badge">
              {labels.lowBit}
            </Chip>
          )}
        </View>

        <View style={styles.metaRow}>
          {sizeLabel && (
            <Text variant="bodySmall" style={styles.metaText}>
              {sizeLabel}
            </Text>
          )}
          {paramsLabel && (
            <Text variant="bodySmall" style={styles.metaText}>
              {paramsLabel}
            </Text>
          )}
          {suggestion.obsTg !== undefined && (
            <Text variant="bodySmall" style={styles.metaText}>
              {labels.expectedSpeed.replace('{{tg}}', String(suggestion.obsTg))}
            </Text>
          )}
        </View>

        {!suggestion.fitsDevice && (
          <Text variant="bodySmall" style={styles.fitWarning}>
            {labels.mayNotFit}
          </Text>
        )}

        <Button
          mode="contained-tonal"
          onPress={handleDownload}
          loading={isStarting}
          disabled={isStarting}
          testID="suggestion-download-button">
          {labels.download}
        </Button>
      </View>
    </Card>
  );
};
