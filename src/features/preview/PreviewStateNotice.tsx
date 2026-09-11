import { ActivityIndicator, View } from 'react-native';
import { Button, Panel, Text } from '../../ui/index.ts';
import { font } from '../../theme.ts';
import { useTheme } from '../../ui/use-theme.ts';
import { tw } from '../../ui/tailwind.ts';
import { PREVIEW_COPY as copy, type PreviewState } from './preview-copy.ts';

export function PreviewStateNotice(
  { state, onRetry }: { state: PreviewState; onRetry: () => void },
) {
  const { colors } = useTheme();
  return (
    <View style={tw`px-lg py-lg`}>
      {state === 'loading'
        ? (
          <ActivityIndicator
            accessibilityLabel={copy.waiting}
            color={colors.accentDeep}
            style={tw`py-lg`}
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
