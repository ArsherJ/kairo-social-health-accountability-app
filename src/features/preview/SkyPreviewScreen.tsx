import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { placeRacers, pointAt, RACE_FINISH_LINE, rankRacers, SKY_PATH_ASPECT } from '@kairo/core';
import { SkyCorridor } from '../squad/SkyCorridor.tsx';
import { SkyMarker } from '../squad/SkyMarker.tsx';
import { SkyControls } from '../squad/SkyControls.tsx';
import { SkyFlockRail } from '../squad/SkyFlockRail.tsx';
import { flightFrame } from '../squad/flight-frame.ts';
import { Button, Gradient, Panel, Screen, Text, useReduceMotion } from '../../ui/index.ts';
import { colors, flightSky, font, space } from '../../theme.ts';
import { PREVIEW_COPY as copy, type PreviewState } from './preview-copy.ts';
import { previewMembers } from './preview-data.ts';
import { PreviewStateNotice } from './PreviewStateNotice.tsx';

export function SkyPreviewScreen(
  { dark, state, onRetry, onInvite }: {
    dark: boolean;
    state: PreviewState;
    onRetry: () => void;
    onInvite: () => void;
  },
) {
  const scroll = useRef<ScrollView>(null);
  const opened = useRef(false);
  const [size, setSize] = useState({ width: 390, height: 680 });
  const [railHeight, setRailHeight] = useState(172);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const members = previewMembers(state);
  const racers = rankRacers(members.flatMap((member) =>
    member.steps === null ? [] : [{
      userId: member.user_id,
      characterName: member.character_name,
      species: member.species,
      steps: member.steps,
      total: member.total,
      isSelf: member.is_self,
    }]
  ));
  const me = racers.find((racer) => racer.isSelf);
  const boxHeight = size.width / SKY_PATH_ASPECT;
  const placements = placeRacers(racers.map((racer) => racer.progress));
  const frame = flightFrame({
    boxHeight,
    viewportHeight: size.height,
    chromeBottom: insets.top + space.md + railHeight,
    gap: space.md,
    focusY: me ? pointAt(me.progress).y * boxHeight : null,
  });
  const locate = () => scroll.current?.scrollTo({ y: frame.openAt, animated: !reduceMotion });

  return (
    <Screen bleed scroll={false} tone={dark ? 'dark' : 'light'}>
      <View style={StyleSheet.absoluteFill} onLayout={(event) => setSize(event.nativeEvent.layout)}>
        {state === 'loading' || state === 'error'
          ? (
            <View style={{ paddingTop: insets.top }}>
              <PreviewStateNotice state={state} onRetry={onRetry} />
            </View>
          )
          : (
            <>
              <ScrollView
                ref={scroll}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => {
                  if (!opened.current) {
                    opened.current = true;
                    scroll.current?.scrollTo({ y: frame.openAt, animated: false });
                  }
                }}
              >
                <View style={{ width: size.width, height: frame.contentHeight }}>
                  <Gradient stops={flightSky} steps={40} />
                  <View style={{ marginTop: frame.topInset, width: size.width, height: boxHeight }}>
                    <SkyCorridor width={size.width}>
                      {racers.map((racer, index) => (
                        <SkyMarker
                          key={racer.userId}
                          racer={racer}
                          placement={placements[index]!}
                          boxWidth={size.width}
                          boxHeight={boxHeight}
                        />
                      ))}
                    </SkyCorridor>
                    <View style={{ position: 'absolute', top: space.md, left: space.lg }}>
                      <Text style={{ ...font.display.minor, color: colors.text }}>
                        {RACE_FINISH_LINE.toLocaleString()} · ridge
                      </Text>
                    </View>
                  </View>
                </View>
              </ScrollView>
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
              {state === 'withheld' && (
                <View
                  style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: 120 }}
                >
                  <Panel>
                    <Text style={{ ...font.body.body, color: colors.text }}>{copy.privateSky}</Text>
                    <Button label={copy.boardTitle} variant='secondary' onPress={onInvite} />
                  </Panel>
                </View>
              )}
            </>
          )}
      </View>
    </Screen>
  );
}
