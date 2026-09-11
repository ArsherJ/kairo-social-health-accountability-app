import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { evolutionStageForLevel, type CoreStat } from '@kairo/core';

import animations from '../../../data/animations.json';
import character from '../../../data/character.json';
import { colors, font, space } from '@/theme.ts';
import { Screen, STAT_NAMES, Text } from '@/ui/index.ts';
import { RecordsCard } from '@/features/profile/RecordsCard.tsx';
import { Diorama } from './Diorama.tsx';
import { KairoThumbnail } from './KairoThumbnail.tsx';
import { ceilingLine, restedLine, spreadLine } from './kairo-voice.ts';
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
  KAIRO_POSE_ASSETS,
  KAIRO_STATE_ASSETS,
} from './character-assets.ts';
import { GROWTH_STAGE_NAMES } from './character-contract.ts';
import { firstLevelOfStage, KAIRO_STATIC_CATALOG } from './kairo-lab-contract.ts';

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
  // The peak of the rested ramp: Body's 400 kcal band at 350. Unreachable in
  // the app without a wearable and a synced night, which is exactly the sort of
  // surface this lab exists for.
  const rested = restedLine({ sleepMinutes: 480, goldKcal: 350, baseKcal: 400 });
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
        <Text style={styles.entryTitle}>Rested aside — Today</Text>
        <Text style={labStyles.aside}>{rested}</Text>
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
  level = 7,
  hasSleepSource = true,
  sleepMinutes = 420,
  lifetimeBodyPoints = 3_000,
  lifetimePoints,
  reaction = null,
  crest = false,
}: {
  location: MotionLocation;
  /** The stage is derived from it, exactly as Today derives it — never passed
   *  beside it, or the preview could show a body the level does not have. */
  level?: number;
  hasSleepSource?: boolean;
  sleepMinutes?: number | null;
  lifetimeBodyPoints?: number;
  /** Lifetime rollups — the presence ring, and the crest's hue (issue #33). */
  lifetimePoints?: Record<CoreStat, number>;
  reaction?: LivingReaction | null;
  crest?: boolean;
}) {
  // The band's own floor, so the resolver picks the location rather than being
  // told it — that is the property the preview is checking.
  const steps = { branch: 0, treeline: 2_500, valley: 5_000, climb: 7_500, ridge: 10_000 }[location];
  const stage = evolutionStageForLevel(level);
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
      level={level}
      stage={stage}
      location={mirror.motion.location}
      figure={mirror.figure}
      body={mirror.body}
      dominance="AGI"
      lifetimePoints={lifetimePoints}
      figureLabel={livingCharacterLabel({
        characterName: 'Dagit', level, location: mirror.motion.location, mind: mirror.mind,
      })}
      crest={crest}
    />
  );
}

/**
 * The figure at each growth stage — one body, four sizes.
 *
 * **There is no registry row any more** (deviation #73). It drew
 * `KAIRO_STAGE_ASSETS` cell by cell, and that table is gone: the v3 pack has one
 * body, so the stage reaches the figure as `figureResponse`'s `bodyScale` and
 * the ground shadow rather than as separate art. The resolver row is what is
 * left, and it is the reading that mattered — it drives `resolveLivingMirror`
 * from a level, so a stage that stops changing the figure's size is visible
 * here.
 */
function GrowthStages() {
  return (
    <Section title="Growth stages">
      <Text style={labStyles.sentence}>
        One eagle at four ages, each at the lowest level of its stage, standing at the Ridge. The
        body is the same drawing every time; what changes is how big it stands and how wide its
        shadow falls. A stage that drew at its neighbour's size would be a growth boundary a player
        crosses and cannot see.
      </Text>

      {KAIRO_STATIC_CATALOG.stages.map((stage) => (
        <View key={`resolver-${stage}`} style={styles.entry}>
          <Text style={styles.entryTitle}>
            {`Level ${firstLevelOfStage(stage)} at the Ridge — ${GROWTH_STAGE_NAMES[stage]}`}
          </Text>
          <MirrorSky location="ridge" level={firstLevelOfStage(stage)} />
        </View>
      ))}
    </Section>
  );
}

/**
 * The crest by dominance — the other half of issue #33's verification surface.
 *
 * Two readings again, and again because they fail differently. The **thumbnail**
 * row is the flock row's own size, where the question is whether the hue reads
 * at 44pt at all; the **figure** row drives `resolveLivingMirror` and the real
 * component, where the question is whether the mask lands on the head feathers
 * rather than beside them. A swatch would answer neither.
 *
 * The balanced entry is not padding: a player whose stats are level takes no
 * hue, and "no tint" is a state somebody has to be able to look at.
 */
function Plumage() {
  const cases: { title: string; points: Record<CoreStat, number> | undefined }[] = [
    { title: 'Motion-dominant', points: { AGI: 9_000, STR: 1_200, MND: 800 } },
    { title: 'Body-dominant', points: { AGI: 1_200, STR: 9_000, MND: 800 } },
    { title: 'Mind-dominant', points: { AGI: 1_200, STR: 800, MND: 9_000 } },
    { title: 'Balanced — no hue at all', points: { AGI: 3_000, STR: 2_800, MND: 2_700 } },
    { title: 'Unstarted — nothing earned, nothing tinted', points: undefined },
  ];

  return (
    <Section title="Plumage by dominance">
      <Text style={labStyles.sentence}>
        The crest takes the dominant stat's hue from `STAT_COLORS`, at every surface that draws a
        particular player. It reads lifetime points rather than the fortnight `useDominantStat`
        measures, because a flock row can only see the lifetime rollups and one player must not
        wear two crests. A balanced character takes none.
      </Text>

      <View style={styles.entry}>
        <Text style={styles.entryTitle}>Flock row — 44pt, the size it has to read at</Text>
        <View style={styles.previews}>
          {cases.map((entry) => (
            <KairoThumbnail
              key={entry.title}
              pose="idle"
              size={44}
              decorative
              lifetimePoints={entry.points}
            />
          ))}
        </View>
      </View>

      {cases.map((entry) => (
        <View key={entry.title} style={styles.entry}>
          <Text style={styles.entryTitle}>{`Figure: ${entry.title}`}</Text>
          <MirrorSky location="valley" lifetimePoints={entry.points} />
        </View>
      ))}
    </Section>
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
 * `staticFigureSelection` resolves in the right order, and that is five rows —
 * the fifth added with the growth stage, since a pre-adult reaction resolves
 * differently from an adult one — plus the five scenery bands and the
 * no-capability state.
 *
 * It stays correct when Rive replaces the selection, because every row is
 * produced by the resolver rather than by hand.
 */
function LivingMirrorMatrix() {
  const ladder = [
    { title: '1 · Reaction present, adult — the reaction pose wins over everything',
      props: { location: 'valley' as const, level: 25, sleepMinutes: 300, reaction: LEVEL_UP } },
    // The rule the growth stage adds: `race_victory` is adult art, so a young
    // bird celebrating keeps the body it was standing in rather than turning
    // into an adult for the length of the animation.
    { title: '2 · The same reaction, pre-adult — the stage keeps its own body',
      props: { location: 'valley' as const, level: 7, sleepMinutes: 300, reaction: LEVEL_UP } },
    { title: '3 · No reaction, sleepy Mind — the Mind image wins over the Motion pose',
      props: { location: 'valley' as const, sleepMinutes: 300 } },
    { title: '4 · No reaction, neutral Mind — the Motion pose wins',
      props: { location: 'valley' as const, sleepMinutes: 400 } },
    // Not the base fallback, and it never was: `motionPose()` always answers,
    // so `{ kind: 'base' }` is unreachable from the resolver. That is exactly
    // why the growth stage rides on idle, walk and run rather than on the base
    // render — a stage applied there would be a change nobody could see.
    { title: '5 · No reaction, no capability, Branch — idle at its stage, never the base render',
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
        This pack is a read-only static inventory. The
        previews, not equipable layers.
      </Text>
      <Text style={styles.parked}>
        Strength-tier rendering, reactions, live composition, Today and onboarding live rendering,
        and native runtime QA are parked for a future Rive handoff. This catalog does not claim to
        be a compositional renderer.
      </Text>

      <CopySurfaces />

      <GrowthStages />

      <Plumage />

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
