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
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { OnboardingPreviewScreen } from './OnboardingPreviewScreen.tsx';
import { TodayPreviewScreen } from './TodayPreviewScreen.tsx';
import { FlockPreviewScreen } from './FlockPreviewScreen.tsx';
import { SkyPreviewScreen } from './SkyPreviewScreen.tsx';
import { YouPreviewScreen } from './YouPreviewScreen.tsx';
import { setNavHidden, Text } from '../../ui/index.ts';
import { TabBar } from '../../ui/TabBar.tsx';
import { ThemeScope } from '../../ui/use-theme.ts';
import { colors, font, radius, space, themes } from '../../theme.ts';
import {
  PREVIEW_COPY as copy,
  type PreviewState,
  type PreviewTab,
} from './preview-copy.ts';
import { PREVIEW_FIXTURES, type PreviewFixture } from './preview-data.ts';

const previewToRoute = {
  today: 'index',
  sky: 'sky',
  flock: 'flock',
  you: 'profile',
} as const;

const routeToPreview = {
  index: 'today',
  sky: 'sky',
  flock: 'flock',
  profile: 'you',
} as const;

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
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
  const [fixture, setFixture] = useState<PreviewFixture>('standard');
  const [showStates, setShowStates] = useState(false);
  const [showFixtures, setShowFixtures] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors, ramp } = themes[dark ? 'dark' : 'light'];
  const controls = { state, onRetry: () => setState('ready') };
  useEffect(() => {
    setNavHidden(onboarding);
    return () => setNavHidden(false);
  }, [onboarding]);

  return (
    <ThemeScope scheme={dark ? 'dark' : 'light'}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          backgroundColor: dark ? colors.night : ramp.neutral[200],
        }}
      >
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View
          style={{ width: '100%', flex: 1, maxWidth: 460, backgroundColor: colors.bg }}
        >
          <View
            style={{
              paddingHorizontal: space.md,
              paddingBottom: space.sm,
              gap: space.xs,
              paddingTop: insets.top + space.sm,
              backgroundColor: colors.surface,
            }}
          >
            <Text scale='chrome' style={{ ...font.display.small, color: colors.text }}>
              {copy.title}
            </Text>
            <Text scale='chrome' style={{ ...font.body.quiet, color: colors.subtle }}>
              {copy.sample}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
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
                {
                  label: copy.fixtures,
                  onPress: () => setShowFixtures((value) => !value),
                  selected: showFixtures,
                },
              ].map((control) => (
                <Pressable
                  key={control.label}
                  accessibilityRole='button'
                  accessibilityState={{ selected: control.selected }}
                  onPress={control.onPress}
                  style={({ pressed }) => ({
                      paddingHorizontal: space.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 44,
                      minHeight: 44,
                      borderRadius: radius.pill,
                      borderCurve: 'continuous',
                      backgroundColor: control.selected ? ramp.accent[200] : colors.bg,
                      opacity: pressed ? 0.6 : 1,
                    })}
                >
                  <Text
                    scale='chrome'
                    style={{
                      ...font.body.strong,
                      color: control.selected ? colors.accentDeep : colors.text,
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
                contentContainerStyle={{ gap: space.sm }}
              >
                {(['ready', 'loading', 'empty', 'withheld', 'error'] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole='button'
                    accessibilityState={{ selected: state === value }}
                    onPress={() => setState(value)}
                    style={{
                      paddingHorizontal: space.md,
                      justifyContent: 'center',
                      minHeight: 44,
                      borderRadius: radius.pill,
                      borderCurve: 'continuous',
                      backgroundColor: state === value ? colors.teal : colors.bg,
                    }}
                  >
                    <Text
                      scale='chrome'
                      style={{
                        ...font.body.strong,
                        color: state === value ? colors.onDeep : colors.text,
                      }}
                    >
                      {copy[value]}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {showFixtures && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: space.sm }}
              >
                {PREVIEW_FIXTURES.map((value) => (
                  <Pressable
                    key={value.id}
                    accessibilityRole='button'
                    accessibilityState={{ selected: fixture === value.id }}
                    onPress={() => setFixture(value.id)}
                    style={{
                      paddingHorizontal: space.md,
                      justifyContent: 'center',
                      minHeight: 44,
                      borderRadius: radius.pill,
                      borderCurve: 'continuous',
                      backgroundColor: fixture === value.id ? ramp.teal[200] : colors.bg,
                    }}
                  >
                    <Text scale='chrome' style={{ ...font.body.strong, color: colors.text }}>
                      {value.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
          <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
            <View style={{ flex: 1 }}>
              {onboarding
                ? (
                  <OnboardingPreviewScreen
                    onComplete={() => {
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
                      fixture={fixture}
                      onWhackBack={() => setTab('flock')}
                    />
                  )}
                  {tab === 'flock' && (
                    <FlockPreviewScreen key={state} {...controls} fixture={fixture} />
                  )}
                  {tab === 'sky' && (
                    <SkyPreviewScreen
                      key={state}
                      {...controls}
                      fixture={fixture}
                      onInvite={() => setTab('flock')}
                    />
                  )}
                  {tab === 'you' && (
                    <YouPreviewScreen key={state} {...controls} fixture={fixture} />
                  )}
                  <TabBar
                    value={previewToRoute[tab]}
                    bottomInset={insets.bottom}
                    onChange={(id) => setTab(routeToPreview[id])}
                  />
                  </>
                )}
            </View>
          </SafeAreaInsetsContext.Provider>
        </View>
      </View>
    </ThemeScope>
  );
}
