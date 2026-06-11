import {StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      borderRadius: 24,
      margin: 6,
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.outline,
      borderWidth: 1,
    },
    content: {
      padding: 16,
      gap: 8,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    titleColumn: {
      flex: 1,
      gap: 2,
    },
    name: {
      color: theme.colors.onSurface,
    },
    quant: {
      color: theme.colors.onSurfaceVariant,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
    },
    metaText: {
      color: theme.colors.onSurfaceVariant,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    fitWarning: {
      color: theme.colors.error,
    },
  });
