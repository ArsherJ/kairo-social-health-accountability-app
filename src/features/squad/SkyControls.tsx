import { useState } from 'react';
import { Pressable, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Glass, Text, useTheme } from '../../ui/index.ts';
import { tw } from '../../ui/tailwind.ts';
import { font, space } from '../../theme.ts';
import { SKY_SCREEN_COPY as copy } from './sky-screen-copy.ts';

export function SkyControls({ onLocate }: { onLocate?: () => void }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <Glass
      tone='light'
      style={{ paddingVertical: space.sm, paddingHorizontal: space.md, marginBottom: space.sm }}
    >
      <View style={tw`flex-row items-center gap-sm`}>
        <View style={tw`flex-1 gap-xs`}>
          <Text scale='chrome' style={{ ...font.body.label, color: colors.subtle }}>
            {copy.eyebrow}
          </Text>
          <Text style={{ ...font.display.minor, color: colors.text }}>{copy.title}</Text>
        </View>
        {onLocate && (
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={copy.locate}
            onPress={onLocate}
            style={({ pressed }) =>
              tw.style('w-12 h-12 items-center justify-center', { opacity: pressed ? 0.65 : 1 })}
          >
            <MaterialCommunityIcons
              name='crosshairs-gps'
              size={24}
              color={colors.subtle}
              accessibilityElementsHidden
              importantForAccessibility='no-hide-descendants'
            />
          </Pressable>
        )}
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={copy.explain}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={({ pressed }) =>
            tw.style('w-12 h-12 items-center justify-center', { opacity: pressed ? 0.65 : 1 })}
        >
          <MaterialCommunityIcons
            name={expanded ? 'close' : 'information-outline'}
            size={24}
            color={colors.subtle}
            accessibilityElementsHidden
            importantForAccessibility='no-hide-descendants'
          />
        </Pressable>
      </View>
      {expanded && (
        <Text style={tw.style('pt-md', font.body.body, { color: colors.subtle, lineHeight: 22 })}>
          {copy.explanation}
        </Text>
      )}
    </Glass>
  );
}
