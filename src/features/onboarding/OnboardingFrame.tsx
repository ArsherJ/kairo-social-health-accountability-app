import type { ReactNode } from 'react';
import { StyleSheet, type ScrollViewProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@/theme.ts';
import { Screen } from '@/ui/index.ts';
import { OnboardingRail } from './OnboardingChrome.tsx';
import type { OnboardingBeat } from './beats.ts';

export type OnboardingFrameProps = {
  beat: OnboardingBeat;
  onBack?: () => void;
  onSkip?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
};

export function OnboardingFrame({
  beat,
  onBack,
  onSkip,
  children,
  footer,
  keyboardShouldPersistTaps,
}: OnboardingFrameProps) {
  const insets = useSafeAreaInsets();

  return (
    <Screen bleed keyboardShouldPersistTaps={keyboardShouldPersistTaps}>
      <View style={[styles.page, { paddingTop: insets.top + space.md }]}>
        <OnboardingRail
          filled={beat.filled}
          partial={beat.partial}
          onBack={onBack}
          onSkip={onSkip}
        />
        <View style={styles.content}>{children}</View>
        {footer !== undefined && footer !== null ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.lg, gap: space.lg },
  content: { flexGrow: 1, gap: space.lg },
  footer: { gap: space.sm },
});
