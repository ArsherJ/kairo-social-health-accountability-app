import { useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RACE_FINISH_LINE, SKY_PATH_ASPECT } from '@kairo/core';
import { SkyCorridor } from '../squad/SkyCorridor.tsx';
import { SkyMinimap } from '../squad/SkyMinimap.tsx';
import { minimapHeight } from '../squad/minimap.ts';
import { SkyMarker } from '../squad/SkyMarker.tsx';
import { SkyControls } from '../squad/SkyControls.tsx';
import { SkyFlockRail } from '../squad/SkyFlockRail.tsx';
import { SKY_FIGURE, SKY_SELF_FIGURE, flightFrame } from '../squad/flight-frame.ts';
import {
  skyFlightBottomClearance,
  skyFlightFocusY,
  skyFlightPlacements,
} from '../squad/sky-flight.ts';
import {
  Button,
  Gradient,
  Panel,
  Screen,
  TAB_PILL_CLEARANCE,
  Text,
  useReduceMotion,
  useStyles,
  useTheme,
} from '../../ui/index.ts';
import { flightSky, font, radius, space, type Theme } from '../../theme.ts';
import { PREVIEW_COPY as copy, type PreviewState } from './preview-copy.ts';
import { previewSkyRacers, type PreviewFixture } from './preview-data.ts';
import { PreviewStateNotice } from './PreviewStateNotice.tsx';

export function SkyPreviewScreen(
  { state, fixture, onRetry, onInvite }: {
    state: PreviewState;
    fixture: PreviewFixture;
    onRetry: () => void;
    onInvite: () => void;
  },
) {
  const { colors, scheme } = useTheme();
  const styles = useStyles(makeStyles);
  const [footHeight, setFootHeight] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const opened = useRef(false);

  const [size, setSize] = useState({ width: 390, height: 680 });
  const [railHeight, setRailHeight] = useState(172);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { members, racers, ghostIndexes } = previewSkyRacers(state, fixture);
  const me = racers.find((racer) => racer.isSelf);
  const boxHeight = size.width / SKY_PATH_ASPECT;
  const flightBottomClearance = skyFlightBottomClearance({
    insetBottom: insets.bottom,
    tabClearance: TAB_PILL_CLEARANCE,
    footerHeight: footHeight,
    gap: space.sm,
  });
  const placements = skyFlightPlacements(
    racers.map((racer) => ({
      identity: racer.userId,
      progress: racer.progress,
      figureSize: racer.isSelf ? SKY_SELF_FIGURE : SKY_FIGURE,
    })),
    size.width,
    flightBottomClearance,
  );
  const selfIndex = racers.findIndex((racer) => racer.isSelf);
  const frame = flightFrame({
    boxHeight,
    viewportHeight: size.height,
    chromeBottom: insets.top + space.md + railHeight,
    gap: space.md,
    focusY: me ? skyFlightFocusY(placements, selfIndex, boxHeight) : null,
  });
  const locate = () => scroll.current?.scrollTo({ y: frame.openAt, animated: !reduceMotion });

  const scrollY = useRef(new Animated.Value(frame.openAt)).current;
  const offsetRef = useRef(frame.openAt);
  const onScroll = useMemo(() =>
    Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      {
        useNativeDriver: true,
        listener: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
          offsetRef.current = event.nativeEvent.contentOffset.y;
        },
      },
    ), [scrollY]);
  const mapHeight = minimapHeight({
    viewportHeight: size.height,
    chromeBottom: insets.top + space.md + railHeight,
    footTop: size.height - insets.bottom - TAB_PILL_CLEARANCE - footHeight,
    gap: space.md,
  });
  const geometry = useMemo(() => ({
    contentHeight: frame.contentHeight,
    viewportHeight: size.height,
    topInset: frame.topInset,
    boxWidth: size.width,
    boxHeight,
    mapHeight,
  }), [frame.contentHeight, frame.topInset, size.height, size.width, boxHeight, mapHeight]);

  return (
    <Screen bleed scroll={false}>
      <View style={StyleSheet.absoluteFill} onLayout={(event) => setSize(event.nativeEvent.layout)}>
        {state === 'loading' || state === 'error'
          ? (
            <View style={{ paddingTop: insets.top }}>
              <PreviewStateNotice state={state} onRetry={onRetry} />
            </View>
          )
          : (
            <>
              <Animated.ScrollView
                ref={scroll}
                showsVerticalScrollIndicator={false}
                contentOffset={{ x: 0, y: frame.openAt }}
                onContentSizeChange={() => {
                  // RN Web ignores contentOffset. Open explicitly after the
                  // content exists, and start the map at that same offset.
                  if (opened.current || !scroll.current) return;
                  opened.current = true;
                  offsetRef.current = frame.openAt;
                  scrollY.setValue(frame.openAt);
                  scroll.current.scrollTo({ y: frame.openAt, animated: false });
                }}
                onScroll={onScroll}
                scrollEventThrottle={16}
              >
                <View style={{ width: size.width, height: frame.contentHeight }}>
                  <Gradient stops={flightSky[scheme]} steps={40} />
                  <View style={{ marginTop: frame.topInset, width: size.width, height: boxHeight }}>
                    <SkyCorridor
                      width={size.width}
                      progress={me?.progress ?? null}
                      motionActive
                    >
                      {racers.map((racer, index) => (
                        <SkyMarker
                          key={racer.userId}
                          racer={racer}
                          placement={placements[index]!}
                          boxWidth={size.width}
                          boxHeight={boxHeight}
                          bottomClearance={flightBottomClearance}
                        />
                      ))}
                    </SkyCorridor>
                    <View style={[styles.ridge, { top: space.md, left: space.lg }]}>
                      <Text style={styles.ridgeText}>
                        {RACE_FINISH_LINE.toLocaleString()} · ridge
                      </Text>
                    </View>
                  </View>
                </View>
              </Animated.ScrollView>
              {mapHeight > 0 ? (
                <SkyMinimap
                  geometry={geometry}
                  placements={placements}
                  selfIndex={selfIndex >= 0 ? selfIndex : null}
                  ghostIndexes={ghostIndexes}
                  selfProgress={me?.progress ?? null}
                  scrollY={scrollY}
                  offsetRef={offsetRef}
                  onScrollTo={(y) => scroll.current?.scrollTo({ y, animated: false })}
                  style={{ top: insets.top + space.md + railHeight + space.md, right: space.sm }}
                />
              ) : null}
              <View
                style={{
                  position: 'absolute',
                  top: insets.top + space.md,
                  left: space.md,
                  right: space.md,
                }}
                onLayout={(event) => setRailHeight(event.nativeEvent.layout.height)}
              >
                <SkyControls onLocate={me ? locate : undefined} />
                <SkyFlockRail
                  racers={racers}
                  withheld={members.filter((member) => member.steps === null)}
                  onInvite={onInvite}
                />
              </View>
              {state === 'withheld' ? (
                <View
                  style={{
                    position: 'absolute',
                    left: space.lg,
                    right: space.lg,
                    bottom: insets.bottom + TAB_PILL_CLEARANCE,
                  }}
                  onLayout={(event) => setFootHeight(event.nativeEvent.layout.height)}
                >
                  <Panel>
                    <Text style={{ ...font.body.body, color: colors.text }}>{copy.privateSky}</Text>
                    <Button label={copy.boardTitle} variant='secondary' onPress={onInvite} />
                  </Panel>
                </View>
              ) : null}
            </>
          )}
      </View>
    </Screen>
  );
}

const makeStyles = ({ colors, ramp }: Theme) => StyleSheet.create({
  ridge: {
    position: 'absolute',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: ramp.gold[400],
  },
  ridgeText: { ...font.display.minor, color: colors.ink },
});
