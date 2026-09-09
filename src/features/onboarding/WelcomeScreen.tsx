import { evolutionStageForLevel } from '@kairo/core';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CharacterFigure } from '../character/CharacterFigure.tsx';
import { Gradient, Panel, Screen, Text } from '../../ui/index.ts';
import { tw } from '../../ui/tailwind.ts';
import { colors, font, radius, ramp, space } from '../../theme.ts';
import { OnboardingDots, OnboardingRail } from './OnboardingChrome.tsx';
import { OnboardingCta } from './OnboardingCta.tsx';
import { beatCta, type OnboardingBeat, onboardingBeat, valueCardPosition } from './beats.ts';
import { WELCOME_SCREEN_COPY as copy } from './welcome-screen-copy.ts';

const FIELD = [{ color: colors.night, at: 0 }, { color: colors.midnight, at: 1 }];

export function WelcomeScreen(
  { onContinue, onSkip, beat = onboardingBeat('welcome') }: {
    onContinue: () => void;
    onSkip: () => void;
    beat?: OnboardingBeat;
  },
) {
  const [expanded, setExpanded] = useState(false);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <Screen bleed tone='dark'>
      <Gradient stops={FIELD} />
      <View style={tw.style('px-lg gap-lg', { paddingTop: insets.top + space.md })}>
        <OnboardingRail filled={beat.filled} partial={beat.partial} onSkip={onSkip} />
        <Text
          scale='chrome'
          style={{ ...font.display.brandSmall, color: colors.bg, textAlign: 'center' }}
        >
          KAIRO
        </Text>
        <View
          accessibilityElementsHidden
          importantForAccessibility='no-hide-descendants'
          style={tw`items-center justify-center py-md`}
        >
          <View
            style={{
              position: 'absolute',
              width: 250,
              height: 250,
              borderRadius: radius.pill,
              borderCurve: 'continuous',
              backgroundColor: ramp.neutral[800],
            }}
          />
          <View style={tw`flex-row items-end justify-center`}>
            <View style={{ marginRight: -28, opacity: 0.85 }}>
              <CharacterFigure
                height={Math.min(width * 0.28, 120)}
                level={1}
                stage={evolutionStageForLevel(1)}
                compact
                figure={{ kind: 'stage', stage: evolutionStageForLevel(1), pose: 'idle' }}
                body={{ tier: 'slim', shade: colors.sage, shadowWeight: 0 }}
              />
            </View>
            <CharacterFigure
              height={Math.min(width * 0.52, 220)}
              level={21}
              stage={evolutionStageForLevel(21)}
              compact
              figure={{ kind: 'stage', stage: evolutionStageForLevel(21), pose: 'idle' }}
              body={{ tier: 'fit', shade: colors.sage, shadowWeight: 0 }}
            />
          </View>
        </View>
        <View style={tw`gap-md items-center`}>
          <Text scale='chrome' style={{ ...font.body.label, color: ramp.sage[300] }}>
            {copy.eyebrow}
          </Text>
          <Text
            accessibilityRole='header'
            style={{ ...font.display.major, color: colors.bg, textAlign: 'center' }}
          >
            {copy.title}
          </Text>
          <Text
            style={{
              ...font.body.body,
              fontSize: 16,
              lineHeight: 25,
              color: ramp.sage[200],
              textAlign: 'center',
            }}
          >
            {copy.body}
          </Text>
        </View>
        <OnboardingDots {...valueCardPosition(beat)} />
        <OnboardingCta
          label={beatCta(beat)}
          tone='bright'
          icon='arrow-right'
          lines={2}
          onPress={onContinue}
        />
        <Pressable
          accessibilityRole='button'
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={({ pressed }) =>
            tw.style('items-center justify-center px-md', {
              minHeight: 48,
              opacity: pressed ? 0.7 : 1,
            })}
        >
          <Text scale='chrome' style={{ ...font.body.body, color: colors.bg }}>
            {expanded ? copy.less : copy.detail}
          </Text>
        </Pressable>
        {expanded && (
          <Panel style={{ marginTop: 0 }}>
            <Text style={{ ...font.display.small, color: colors.text }}>{copy.solo}</Text>
            <Text style={tw.style('pt-sm pb-lg', font.body.body, { color: colors.subtle })}>
              {copy.soloBody}
            </Text>
            <Text style={{ ...font.display.small, color: colors.text }}>{copy.flock}</Text>
            <Text style={tw.style('pt-sm', font.body.body, { color: colors.subtle })}>
              {copy.flockBody}
            </Text>
          </Panel>
        )}
      </View>
    </Screen>
  );
}
