import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { font, space, type Theme } from '@/theme.ts';
import { Meter } from '@/ui/Meter.tsx';
import { Panel } from '@/ui/Panel.tsx';
import { Text } from '@/ui/Text.tsx';
import { useStyles, useTheme } from '@/ui/use-theme.ts';
import { stackDashboard } from './dashboard-layout.ts';
import type { TileReading } from './today-board.ts';

/** Motion and KAIRO, paired as the dashboard's single focused reading. */
export function TodayProgressHero({
  motion,
  character,
}: {
  motion: TileReading;
  character: ReactNode;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = stackDashboard(width, fontScale);
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();

  return (
    <Panel style={styles.panel}>
      <View style={[styles.content, stacked && styles.stacked]}>
        <View accessible accessibilityLabel={motion.label} style={styles.reading}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text scale="chrome" style={styles.eyebrow}>{motion.eyebrow}</Text>
            <Text
              scale="fixed"
              style={styles.figure}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {motion.figure}
            </Text>
            {motion.unit ? <Text scale="chrome" style={styles.unit}>{motion.unit}</Text> : null}
            {motion.fraction !== null
              ? <Meter fraction={motion.fraction} color={colors.accent} height={8} />
              : null}
            {motion.caption ? <Text style={styles.caption}>{motion.caption}</Text> : null}
          </View>
        </View>
        <View style={[styles.character, stacked && styles.characterStacked]}>{character}</View>
      </View>
    </Panel>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    panel: { marginTop: 0 },
    content: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    stacked: { flexDirection: 'column', alignItems: 'stretch' },
    reading: { flex: 1, minWidth: 0 },
    eyebrow: {
      ...font.body.label,
      color: colors.accentDeep,
      textTransform: 'uppercase',
    },
    figure: {
      ...font.display.hero,
      fontSize: 44,
      lineHeight: 50,
      color: colors.text,
      marginTop: space.xs,
    },
    unit: { ...font.body.strong, color: colors.muted, marginBottom: space.sm },
    caption: { ...font.body.body, color: colors.subtle, marginTop: space.sm },
    character: { width: 148 },
    characterStacked: { width: '100%' },
  });
