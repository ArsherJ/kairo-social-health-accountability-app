import { useState } from 'react';
import { Pressable, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Glass, Text, useTheme } from '../../ui/index.ts';
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1, gap: space.xs }}>
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
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.65 : 1,
            })}
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
          style={({ pressed }) => ({
            width: 48,
            height: 48,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.65 : 1,
          })}
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
        <Text style={[{ paddingTop: space.md }, font.body.body, { color: colors.subtle, lineHeight: 22 }]}>
          {copy.explanation}
        </Text>
      )}
    </Glass>
  );
}
