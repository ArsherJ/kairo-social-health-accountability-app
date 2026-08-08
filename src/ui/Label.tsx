import { StyleSheet, Text } from 'react-native';
import { colors, font } from '../theme.ts';

export function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: { ...font.body.label, color: colors.muted, textTransform: 'uppercase' },
});
