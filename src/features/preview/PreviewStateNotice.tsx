import { ActivityIndicator, View } from 'react-native';
import { Button, Panel, Text } from '../../ui/index.ts';
import { font, space } from '../../theme.ts';
import { useTheme } from '../../ui/use-theme.ts';
import { PREVIEW_COPY as copy, type PreviewState } from './preview-copy.ts';

export function PreviewStateNotice(
  { state, onRetry }: { state: PreviewState; onRetry: () => void },
) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: space.lg, paddingVertical: space.lg }}>
      {state === 'loading'
        ? (
          <ActivityIndicator
            accessibilityLabel={copy.waiting}
            color={colors.accentDeep}
            style={{ paddingVertical: space.lg }}
          />
        )
        : (
          <Panel>
            <Text accessibilityRole='alert' style={{ ...font.body.body, color: colors.damage }}>
              {copy.failed}
            </Text>
            <Button label={copy.retry} onPress={onRetry} variant='ghost' />
          </Panel>
        )}
    </View>
  );
}
