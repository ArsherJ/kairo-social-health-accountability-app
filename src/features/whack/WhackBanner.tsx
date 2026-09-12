import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View } from 'react-native';
import { Button, Panel, Text } from '../../ui/index.ts';
import { font, space } from '../../theme.ts';
import { useTheme } from '../../ui/use-theme.ts';
import { WHACK_COPY, whackBackLine } from './whack-copy.ts';

/** The data owner decides when a received whack is unseen and can be answered. */
export function WhackBanner(
  { senderName, onWhackBack }: { senderName: string; onWhackBack?: () => void },
) {
  const { colors } = useTheme();
  return (
    <Panel variant='tint'>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <MaterialCommunityIcons
          name='feather'
          color={colors.accentDeep}
          size={24}
          accessibilityElementsHidden
          importantForAccessibility='no-hide-descendants'
        />
        <Text style={{ ...font.body.body, color: colors.text, flex: 1 }}>
          {whackBackLine(senderName)}
        </Text>
      </View>
      {onWhackBack && <Button label={WHACK_COPY.back} onPress={onWhackBack} />}
    </Panel>
  );
}
