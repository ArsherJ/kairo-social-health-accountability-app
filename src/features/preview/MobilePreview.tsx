import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WelcomeScreen } from '../onboarding/WelcomeScreen.tsx';
import { TodayPreviewScreen } from './TodayPreviewScreen.tsx';
import { FlockPreviewScreen } from './FlockPreviewScreen.tsx';
import { SkyPreviewScreen } from './SkyPreviewScreen.tsx';
import { YouPreviewScreen } from './YouPreviewScreen.tsx';
import { setNavHidden, Text } from '../../ui/index.ts';
import { tw } from '../../ui/tailwind.ts';
import { colors, font, radius, ramp, screenPalette, space } from '../../theme.ts';
import {
  PREVIEW_COPY as copy,
  PREVIEW_TABS,
  type PreviewState,
  type PreviewTab,
} from './preview-copy.ts';

export function MobilePreview() {
  const { fontScale } = useWindowDimensions();
  const [loaded, error] = useFonts({
    'Fredoka-SemiBold': require('../../../assets/fonts/Fredoka-SemiBold.ttf'),
    'Fredoka-Bold': require('../../../assets/fonts/Fredoka-Bold.ttf'),
    'Nunito-SemiBold': require('../../../assets/fonts/Nunito-SemiBold.ttf'),
    'Nunito-Bold': require('../../../assets/fonts/Nunito-Bold.ttf'),
    'Nunito-ExtraBold': require('../../../assets/fonts/Nunito-ExtraBold.ttf'),
    ...MaterialCommunityIcons.font,
  });
  if (!loaded && !error) {
    return (
      <View style={tw`flex-1 items-center justify-center bg-bg`}>
        <ActivityIndicator color={colors.accentDeep} />
      </View>
    );
  }
  // Re-measure the preview chrome when Simulator changes Dynamic Type live.
  return (
    <SafeAreaProvider>
      <PreviewCanvas key={fontScale} />
    </SafeAreaProvider>
  );
}

function PreviewCanvas() {
  const scheme = useColorScheme();
  const [dark, setDark] = useState(scheme === 'dark');
  const [tab, setTab] = useState<PreviewTab>('today');
  const [onboarding, setOnboarding] = useState(false);
  const [state, setState] = useState<PreviewState>('ready');
  const [showStates, setShowStates] = useState(false);
  const insets = useSafeAreaInsets();
  const palette = screenPalette[dark ? 'dark' : 'light'];
  const controls = { dark, state, onRetry: () => setState('ready') };
  useEffect(() => {
    setNavHidden(onboarding);
    return () => setNavHidden(false);
  }, [onboarding]);

  return (
    <View
      style={tw.style('flex-1 items-center', {
        backgroundColor: dark ? colors.night : ramp.neutral[200],
      })}
    >
      <StatusBar style={dark || onboarding ? 'light' : 'dark'} />
      <View
        style={tw.style('w-full flex-1', { maxWidth: 460, backgroundColor: palette.background })}
      >
        <View
          style={tw.style('px-md pb-sm gap-xs', {
            paddingTop: insets.top + space.sm,
            backgroundColor: palette.surface,
          })}
        >
          <Text scale='chrome' style={{ ...font.display.small, color: palette.text }}>
            {copy.title}
          </Text>
          <Text scale='chrome' style={{ ...font.body.quiet, color: palette.muted }}>
            {copy.sample}
          </Text>
          <View style={tw`flex-row flex-wrap gap-sm`}>
            {[
              {
                label: dark ? copy.dark : copy.light,
                onPress: () => setDark((value) => !value),
                selected: dark,
              },
              {
                label: copy.onboarding,
                onPress: () => setOnboarding((value) => !value),
                selected: onboarding,
              },
              {
                label: copy.state,
                onPress: () => setShowStates((value) => !value),
                selected: showStates,
              },
            ].map((control) => (
              <Pressable
                key={control.label}
                accessibilityRole='button'
                accessibilityState={{ selected: control.selected }}
                onPress={control.onPress}
                style={({ pressed }) =>
                  tw.style('px-md items-center justify-center', {
                    minWidth: 44,
                    minHeight: 44,
                    borderRadius: radius.pill,
                    borderCurve: 'continuous',
                    backgroundColor: control.selected ? colors.accent : palette.background,
                    opacity: pressed ? 0.6 : 1,
                  })}
              >
                <Text
                  scale='chrome'
                  style={{
                    ...font.body.strong,
                    color: control.selected ? colors.text : palette.text,
                  }}
                >
                  {control.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {showStates && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={tw`gap-sm`}
            >
              {(['ready', 'loading', 'empty', 'withheld', 'error'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole='button'
                  accessibilityState={{ selected: state === value }}
                  onPress={() => setState(value)}
                  style={tw.style('px-md justify-center', {
                    minHeight: 44,
                    borderRadius: radius.pill,
                    borderCurve: 'continuous',
                    backgroundColor: state === value ? colors.teal : palette.background,
                  })}
                >
                  <Text
                    scale='chrome'
                    style={{
                      ...font.body.strong,
                      color: state === value ? colors.bg : palette.text,
                    }}
                  >
                    {copy[value]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
        <View style={tw`flex-1`}>
          {onboarding
            ? (
              <WelcomeScreen
                onContinue={() => {
                  setOnboarding(false);
                  setTab('today');
                }}
                onSkip={() => {
                  setOnboarding(false);
                  setTab('today');
                }}
              />
            )
            : (
              <>
                {tab === 'today' && (
                  <TodayPreviewScreen
                    key={state}
                    {...controls}
                    onWhackBack={() => setTab('flock')}
                  />
                )}
                {tab === 'flock' && <FlockPreviewScreen key={state} {...controls} />}
                {tab === 'sky' && (
                  <SkyPreviewScreen
                    key={state}
                    {...controls}
                    onInvite={() => setTab('flock')}
                  />
                )}
                {tab === 'you' && <YouPreviewScreen key={state} {...controls} />}
                <View
                  style={tw.style('absolute flex-row items-center p-sm', {
                    bottom: insets.bottom + space.md,
                    left: space.md,
                    right: space.md,
                    minHeight: 80,
                    backgroundColor: palette.surface,
                    borderRadius: radius.xxl,
                    borderCurve: 'continuous',
                  })}
                >
                  {PREVIEW_TABS.map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole='tab'
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected: tab === item.id }}
                      onPress={() => setTab(item.id)}
                      style={({ pressed }) =>
                        tw.style('flex-1 items-center justify-center gap-xs py-sm', {
                          minHeight: 60,
                          borderRadius: radius.lg,
                          borderCurve: 'continuous',
                          backgroundColor: tab === item.id ? colors.accent : 'transparent',
                          opacity: pressed ? 0.65 : 1,
                        })}
                    >
                      <MaterialCommunityIcons
                        name={item.icon}
                        size={23}
                        color={tab === item.id ? colors.text : palette.muted}
                        accessibilityElementsHidden
                        importantForAccessibility='no-hide-descendants'
                      />
                      <Text
                        scale='chrome'
                        accessibilityElementsHidden
                        importantForAccessibility='no-hide-descendants'
                        style={{
                          ...font.display.label,
                          color: tab === item.id ? colors.text : palette.text,
                        }}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
        </View>
      </View>
    </View>
  );
}
