import { useContext, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { SKY_PATH_ASPECT } from '@kairo/core';
import type { Theme } from '@/theme.ts';
import { useStyles } from '@/ui/use-theme.ts';
import { SkyDriftActiveContext, SkyDriftProvider, useSkyDrift } from './sky-drift.tsx';
import { skyFlightPoint } from './sky-flight.ts';

/**
 * The shared open flight. Progress is intentionally not painted as a track:
 * birds move straight toward the ridge while atmosphere supplies the depth.
 */
export function SkyCorridor({
  width,
  motionActive = false,
  children,
}: {
  width: number;
  progress?: number | null;
  motionActive?: boolean;
  children?: ReactNode;
}) {
  const styles = useStyles(makeStyles);
  const height = width / SKY_PATH_ASPECT;
  const ridge = skyFlightPoint(1);

  return (
    // The corridor says nothing on its own — the markers inside it carry every
    // word. Hidden rather than labelled.
    <View style={[styles.box, { width, height }]}>
      <SkyDriftProvider active={motionActive}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, styles.scenery]}
        >
          {RIDGES.map((layer, index) => {
            const layerHeight = layer.height * width / 393;
            const color = index % 2 === 0
              ? styles.ridgeFar.backgroundColor
              : styles.ridgeNear.backgroundColor;
            return (
              <View
                key={layer.at}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: layer.at * height - layerHeight,
                  bottom: 0,
                  opacity: layer.opacity,
                }}
              >
                {PEAKS.map((peak) => (
                  <View
                    key={peak.left}
                    style={{
                      position: 'absolute',
                      left: peak.left * width,
                      top: 0,
                      width: 0,
                      height: 0,
                      borderLeftWidth: peak.width * width / 2,
                      borderRightWidth: peak.width * width / 2,
                      borderBottomWidth: layerHeight,
                      borderLeftColor: 'transparent',
                      borderRightColor: 'transparent',
                      borderBottomColor: color,
                    }}
                  />
                ))}
                <View
                  style={[
                    styles.ridgeBody,
                    { top: Math.max(0, layerHeight - 2), backgroundColor: color },
                  ]}
                />
              </View>
            );
          })}

          {CLOUDS.map((cloud, index) => (
            <CloudWisp
              key={cloud.at}
              cloud={cloud}
              identity={`cloud-${index}`}
              width={width}
              height={height}
              styles={styles}
            />
          ))}

          <View
            style={[
              styles.finish,
              {
                left: ridge.x * width - 38,
                top: ridge.y * height,
              },
            ]}
          />
        </View>

        {children}
      </SkyDriftProvider>
    </View>
  );
}

const RIDGES = [
  { at: 0.055, height: 64, opacity: 0.48 },
  { at: 0.31, height: 52, opacity: 0.22 },
  { at: 0.56, height: 58, opacity: 0.25 },
  { at: 0.81, height: 50, opacity: 0.2 },
] as const;

const PEAKS = [
  { left: -0.19, width: 0.62 },
  { left: 0.19, width: 0.5 },
  { left: 0.52, width: 0.7 },
] as const;

const CLOUDS = [
  { at: 0.2, left: 0.09, scale: 0.82, opacity: 0.22 },
  { at: 0.43, left: 0.67, scale: 0.68, opacity: 0.17 },
  { at: 0.68, left: 0.16, scale: 0.74, opacity: 0.18 },
  { at: 0.88, left: 0.62, scale: 0.62, opacity: 0.15 },
] as const;

function CloudWisp({
  cloud,
  identity,
  width,
  height,
  styles,
}: {
  cloud: (typeof CLOUDS)[number];
  identity: string;
  width: number;
  height: number;
  styles: ReturnType<typeof makeStyles>;
}) {
  const active = useContext(SkyDriftActiveContext);
  const translateX = useSkyDrift(identity, active);
  return (
    <Animated.View
      style={[
        styles.cloud,
        {
          top: cloud.at * height,
          left: cloud.left * width,
          opacity: cloud.opacity,
          transform: [{ translateX }, { scale: cloud.scale }],
        },
      ]}
    >
      <View style={[styles.cloudLobe, styles.cloudLeft]} />
      <View style={[styles.cloudLobe, styles.cloudMiddle]} />
      <View style={[styles.cloudLobe, styles.cloudRight]} />
    </Animated.View>
  );
}

const makeStyles = ({ colors, earnedColor, ramp }: Theme) =>
  StyleSheet.create({
    box: { alignSelf: 'center' },
    scenery: { overflow: 'hidden' },
    ridgeFar: { backgroundColor: ramp.sky[300] },
    ridgeNear: { backgroundColor: ramp.sage[200] },
    ridgeBody: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    cloud: { position: 'absolute', width: 76, height: 28 },
    cloudLobe: { position: 'absolute', backgroundColor: colors.onDeep },
    cloudLeft: { left: 0, top: 12, width: 34, height: 10, borderRadius: 7, borderCurve: 'continuous' },
    cloudMiddle: { left: 23, top: 3, width: 28, height: 20, borderRadius: 13, borderCurve: 'continuous' },
    cloudRight: { left: 43, top: 11, width: 33, height: 11, borderRadius: 7, borderCurve: 'continuous' },
    finish: {
      position: 'absolute',
      width: 76,
      height: 3,
      borderRadius: 2,
      borderCurve: 'continuous',
      backgroundColor: earnedColor,
    },
  });
