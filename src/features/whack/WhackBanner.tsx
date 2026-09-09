import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View } from 'react-native';
import { Button, Panel, Text } from '../../ui/index.ts';
import { colors, font } from '../../theme.ts';
import { tw } from '../../ui/tailwind.ts';
import { WHACK_COPY, whackBackLine } from './whack-copy.ts';

/** The data owner decides when a received whack is unseen and can be answered. */
export function WhackBanner(
  { senderName, onWhackBack }: { senderName: string; onWhackBack?: () => void },
) {
  return (
    <Panel variant='tint'>
      <View style={tw`flex-row items-center gap-md`}>
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
