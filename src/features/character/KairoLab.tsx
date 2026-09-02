import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import animations from '../../../data/animations.json';
import character from '../../../data/character.json';
import cosmetics from '../../../data/cosmetics.json';
import { colors, font, space } from '@/theme.ts';
import { Screen, STAT_NAMES, Text } from '@/ui/index.ts';
import { RecordsCard } from '@/features/profile/RecordsCard.tsx';
import { Diorama } from './Diorama.tsx';
import { ceilingLine, spreadLine } from './kairo-voice.ts';
import {
  MOTION_LOCATIONS,
  livingCharacterLabel,
  locationName,
  resolveLivingMirror,
  type LivingReaction,
  type MotionLocation,
} from './living-mirror.ts';
import { resolveStatDetail, statDetailLine } from './stat-detail.ts';
import {
  KAIRO_BASE_ASSET,
  KAIRO_COSMETIC_ASSETS,
  KAIRO_POSE_ASSETS,
  KAIRO_STATE_ASSETS,
} from './character-assets.ts';
import { cosmeticAnchorMetadata, KAIRO_STATIC_CATALOG } from './kairo-lab-contract.ts';

const PREVIEW_SIZES = [
  { label: '190 × 212', dimensions: { width: 190, height: 212 } },
  { label: '72 × 72', dimensions: { width: 72, height: 72 } },
];

function StaticPreviewSet({ source, name }: { source: ImageSourcePropType; name: string }) {
  return (
    <View style={styles.previews}>
      {PREVIEW_SIZES.map((size) => (
        <PreviewFrame key={`${size.label}-cream`} source={source} name={name} {...size} />
      ))}
    </View>
  );
}

function PreviewFrame({
  source,
  name,
  label,
  dimensions,
}: {
  source: ImageSourcePropType;
  name: string;
  label: string;
  dimensions: { width: number; height: number };
}) {
  return (
    <View style={[styles.previewFrame, dimensions, styles.creamGround]}>
      <Image
        source={source}
        resizeMode="contain"
        style={styles.previewImage}
        accessibilityIgnoresInvertColors
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${name}, ${label} static preview on app cream ground`}
      />
    </View>
  );
}

function CatalogEntry({
  children,
  source,
  title,
}: {
  children: ReactNode;
  source: ImageSourcePropType;
  title: string;
}) {
  return (
    <View style={styles.entry}>
      <Text style={styles.entryTitle}>{title}</Text>
      <StaticPreviewSet source={source} name={title} />
      <View style={styles.metadata}>{children}</View>
    </View>
  );
}

function Metadata({ children }: { children: ReactNode }) {
  return <Text style={styles.metadataText}>{children}</Text>;
}

/**
 * The 2026-08-29 copy and layout surfaces, with fixture props.
 *
 * **Here because they are otherwise unreachable without data.** Every one of
 * them needs a synced day, an expanded rail or a ceiling score to appear, so a
 * Dynamic Type pass over them meant driving the whole app first. This renders
 * them directly.
 *
 * The check they exist for is the one that found the permission sheet's silent
 * clipping on 2026-08-17: `xcrun simctl ui booted content_size
 * accessibility-extra-extra-extra-large`, then a screenshot. **Relaunch after
 * changing the size** — React Native caches text measurements, so a running app
 * renders correct text inside stale boxes and looks exactly like a regression.
 */
function CopySurfaces() {
  const spread = spreadLine({ activeHours: 8, goldSteps: 7_500, baseSteps: 10_000 });
  const nextUp = statDetailLine(
    resolveStatDetail({
      totals: {
        steps: 8_760,
        distanceM: 6_000,
        activeKcal: 210,
        activeMinutes: 40,
        activeHours: 3,
      },
      sleepMinutes: 400,
      lane: 'AGI',
    }),
    STAT_NAMES,
  );

  return (
    <Section title="Copy surfaces (2026-08-29)">
      <View style={styles.entry}>
        <Text style={styles.entryTitle}>Spread aside — Today</Text>
        <Text style={labStyles.aside}>{spread}</Text>
      </View>

      <View style={styles.entry}>
        <Text style={styles.entryTitle}>Guidance line — You, rail expanded</Text>
        <Text style={labStyles.nextUp}>{nextUp}</Text>
      </View>

      <View style={styles.entry}>
        <Text style={styles.entryTitle}>Ceiling line — Today, crest day</Text>
        <Text style={labStyles.sentence}>{ceilingLine('Dagit')}</Text>
      </View>

      <View style={styles.entry}>
        <Text style={styles.entryTitle}>Records — three set</Text>
        <RecordsCard
          today="2026-08-29"
          records={[
            { stat: 'AGI', value: 18_420, localDate: '2026-08-14' },
            { stat: 'STR', value: 812, localDate: '2026-07-02' },
            { stat: 'MND', value: 505, localDate: '2025-12-02' },
          ]}
        />
      </View>

      <View style={styles.entry}>
        <Text style={styles.entryTitle}>Records — none yet</Text>
        <RecordsCard today="2026-08-29" records={[]} />
      </View>

      <View style={styles.entry}>
        <Text style={styles.entryTitle}>Sky — ordinary day</Text>
        <MirrorSky location="treeline" />
      </View>

      <View style={styles.entry}>
        <Text style={styles.entryTitle}>Sky — crest day</Text>
        <MirrorSky location="ridge" crest />
      </View>
    </Section>
  );
}

/**
 * One Living Mirror preview, built the way Today builds it.
 *
 * **Every preview goes through `resolveLivingMirror`.** Hand-building renderer
 * props here would make the lab a second implementation of the thing it exists
 * to check, and it would keep passing after the resolver changed.
 */
function MirrorSky({
  location,
  hasSleepSource = true,
  sleepMinutes = 420,
  lifetimeBodyPoints = 3_000,
  reaction = null,
  crest = false,
}: {
  location: MotionLocation;
  hasSleepSource?: boolean;
  sleepMinutes?: number | null;
  lifetimeBodyPoints?: number;
  reaction?: LivingReaction | null;
  crest?: boolean;
}) {
  // The band's own floor, so the resolver picks the location rather than being
  // told it — that is the property the preview is checking.
  const steps = { branch: 0, treeline: 2_500, valley: 5_000, climb: 7_500, ridge: 10_000 }[location];
  const mirror = resolveLivingMirror({
    steps,
    hasSleepSource,
    sleepMinutes,
    lifetimeBodyPoints,
    nextStep: { kind: 'rest' },
    reaction,
  });

  return (
    <Diorama
      height={200}
      level={7}
      stage={2}
      location={mirror.motion.location}
      figure={mirror.figure}
      body={mirror.body}
      dominance="AGI"
      figureLabel={livingCharacterLabel({
        characterName: 'Dagit', level: 7, location: mirror.motion.location, mind: mirror.mind,
      })}
      crest={crest}
    />
  );
}

const LEVEL_UP: LivingReaction = {
  kind: 'level', occurrence: 'level:6->7', pose: 'race_victory', animation: 'level_up',
  sentence: 'Dagit noticed the change. Level 7 suits you.', priority: 50,
};

/**
 * The Living Mirror beta, as a **priority ladder** rather than a cross-product.
 *
 * Five locations × three Mind states × three Body tiers × six reaction states is
 * 270 cells nobody reads. What a simulator pass actually has to check is that
 * `staticFigureSelection` resolves in the right order, and that is four rows —
 * plus the five scenery bands and the no-capability state.
 *
 * It stays correct when Rive replaces the selection, because every row is
 * produced by the resolver rather than by hand.
 */
function LivingMirrorMatrix() {
  const ladder = [
    { title: '1 · Reaction present — the reaction pose wins over everything',
      props: { location: 'valley' as const, sleepMinutes: 300, reaction: LEVEL_UP } },
    { title: '2 · No reaction, sleepy Mind — the Mind image wins over the Motion pose',
      props: { location: 'valley' as const, sleepMinutes: 300 } },
    { title: '3 · No reaction, neutral Mind — the Motion pose wins',
      props: { location: 'valley' as const, sleepMinutes: 400 } },
    { title: '4 · No reaction, no capability, Branch — the base fallback',
      props: { location: 'branch' as const, hasSleepSource: false, sleepMinutes: null } },
  ];

  return (
    <Section title="Living Mirror beta — static selection ladder">
      {ladder.map((row) => (
        <View key={row.title} style={styles.entry}>
          <Text style={styles.entryTitle}>{row.title}</Text>
          <MirrorSky {...row.props} />
        </View>
      ))}

      <View style={styles.entry}>
        <Text style={styles.entryTitle}>
          No sleep source — Mind is absent, never rendered as zero
        </Text>
        <MirrorSky location="climb" hasSleepSource={false} sleepMinutes={null} />
      </View>

      <View style={styles.entry}>
        <Text style={styles.entryTitle}>
          Sleep source, no reading yet — same neutral presentation
        </Text>
        <MirrorSky location="climb" sleepMinutes={null} />
      </View>

      {MOTION_LOCATIONS.map((location) => (
        <View key={location} style={styles.entry}>
          <Text style={styles.entryTitle}>{`Scenery: ${locationName(location)}`}</Text>
          <MirrorSky location={location} />
        </View>
      ))}
    </Section>
  );
}

const labStyles = StyleSheet.create({
  aside: { ...font.body.body, fontSize: 14, lineHeight: 21, color: colors.muted },
  nextUp: { ...font.body.body, fontSize: 15, lineHeight: 22, color: colors.accentDeep },
  sentence: { ...font.body.body, fontSize: 16, lineHeight: 23, color: colors.subtle },
});

export function KairoLab() {
  return (
    <Screen>
      <Text style={styles.title}>KAIRO asset catalog</Text>
      <Text style={styles.status}>Static asset catalog — Rive parked</Text>
      <Text style={styles.intro}>
        This provisional v1 pack is a read-only static inventory. Cosmetic images are flattened QA
        previews, not equipable layers.
      </Text>
      <Text style={styles.parked}>
        Strength-tier rendering, reactions, live composition, Today and onboarding live rendering,
        and native runtime QA are parked for a future Rive handoff. This catalog does not claim to
        be a compositional renderer.
      </Text>

      <CopySurfaces />

      <LivingMirrorMatrix />

      <Section title="Base">
        <CatalogEntry source={KAIRO_BASE_ASSET} title="Base character">
          <Metadata>
            {`Character: ${character.characterId} · Asset: ${character.assetVersion}\nDefaults: ${character.defaults.sleepState} sleep · ${character.defaults.strengthTier} strength · ${character.defaults.pose} pose`}
          </Metadata>
        </CatalogEntry>
      </Section>

      <Section title="Poses">
        {KAIRO_STATIC_CATALOG.poses.map((poseId) => {
          const pose = animations.poses.find((entry) => entry.id === poseId);
          if (!pose) return null;
          return (
            <CatalogEntry key={poseId} source={KAIRO_POSE_ASSETS[poseId]} title={`Pose: ${poseId}`}>
              <Metadata>{`ID: ${pose.id} · ${pose.durationSeconds}s · ${pose.completion}`}</Metadata>
            </CatalogEntry>
          );
        })}
      </Section>

      <Section title="Sleep states">
        {KAIRO_STATIC_CATALOG.states.map((stateId) => (
          <CatalogEntry key={stateId} source={KAIRO_STATE_ASSETS[stateId]} title={`Sleep state: ${stateId}`}>
            <Metadata>{`ID: ${stateId} · Static preview semantics: neutral pose · fit strength tier`}</Metadata>
          </CatalogEntry>
        ))}
      </Section>

      <Section title="Cosmetic QA previews">
        {KAIRO_STATIC_CATALOG.cosmetics.map((cosmeticId) => {
          const cosmetic = cosmetics.items.find((item) => item.id === cosmeticId);
          if (!cosmetic) return null;
          return (
            <CatalogEntry
              key={cosmeticId}
              source={KAIRO_COSMETIC_ASSETS[cosmeticId]}
              title={cosmetic.displayName}
            >
              <Metadata>{`ID: ${cosmetic.id} · Slot: ${cosmetic.slot}\n${cosmeticAnchorMetadata(cosmetic)}\nCompatible poses: ${cosmetic.compatiblePoses.join(', ')}`}</Metadata>
            </CatalogEntry>
          );
        })}
      </Section>
    </Screen>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, ...font.body.title },
  status: {
    color: colors.accentDeep,
    ...font.body.label,
    marginTop: space.sm,
    textTransform: 'uppercase',
  },
  intro: { color: colors.text, ...font.body.body, lineHeight: 22, marginTop: space.md },
  parked: { color: colors.subtle, ...font.body.body, lineHeight: 21, marginTop: space.sm },
  section: { marginTop: space.xl },
  sectionTitle: { color: colors.text, ...font.display.minor },
  entry: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: space.md,
    paddingTop: space.md,
  },
  entryTitle: { color: colors.text, ...font.body.title },
  previews: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  previewFrame: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  creamGround: { backgroundColor: colors.bg },
  previewImage: { height: '100%', width: '100%' },
  metadata: { marginTop: space.sm },
  metadataText: { color: colors.subtle, ...font.body.body, lineHeight: 20 },
});
