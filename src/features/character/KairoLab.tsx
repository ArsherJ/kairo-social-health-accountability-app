import type { ReactNode } from 'react';
import { Image, ImageBackground, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import animations from '../../../data/animations.json';
import character from '../../../data/character.json';
import cosmetics from '../../../data/cosmetics.json';
import { colors, font, radius, space } from '@/theme.ts';
import { Screen, Text } from '@/ui/index.ts';
import {
  KAIRO_BASE_ASSET,
  KAIRO_COSMETIC_ASSETS,
  KAIRO_POSE_ASSETS,
  KAIRO_STATE_ASSETS,
} from './character-assets.ts';
import { cosmeticAnchorMetadata, KAIRO_STATIC_CATALOG } from './kairo-lab-contract.ts';
import { SPECIES_HABITATS } from './species-art.ts';

const PREVIEW_SIZES = [
  { label: '190 × 212', dimensions: { width: 190, height: 212 } },
  { label: '72 × 72', dimensions: { width: 72, height: 72 } },
];

function StaticPreviewSet({ source, name }: { source: ImageSourcePropType; name: string }) {
  return (
    <View style={styles.previews}>
      {PREVIEW_SIZES.flatMap((size) => [
        <PreviewFrame
          key={`${size.label}-cream`}
          source={source}
          name={name}
          ground="app cream"
          {...size}
        />,
        <PreviewFrame
          key={`${size.label}-habitat`}
          source={source}
          name={name}
          ground="eagle habitat"
          {...size}
        />,
      ])}
    </View>
  );
}

function PreviewFrame({
  source,
  name,
  ground,
  label,
  dimensions,
}: {
  source: ImageSourcePropType;
  name: string;
  ground: 'app cream' | 'eagle habitat';
  label: string;
  dimensions: { width: number; height: number };
}) {
  const frameStyle = [styles.previewFrame, dimensions];
  const accessibilityLabel = `${name}, ${label} static preview on ${ground} ground`;

  if (ground === 'app cream') {
    return (
      <View style={[frameStyle, styles.creamGround]}>
        <Image
          source={source}
          resizeMode="contain"
          style={styles.previewImage}
          accessibilityIgnoresInvertColors
          accessible
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
        />
      </View>
    );
  }

  return (
    <ImageBackground
      source={SPECIES_HABITATS.eagle}
      resizeMode="cover"
      style={frameStyle}
      imageStyle={styles.habitatImage}
      accessible={false}
    >
      <Image
        source={source}
        resizeMode="contain"
        style={styles.previewImage}
        accessibilityIgnoresInvertColors
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      />
    </ImageBackground>
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
  habitatImage: { borderRadius: radius.sm },
  previewImage: { height: '100%', width: '100%' },
  metadata: { marginTop: space.sm },
  metadataText: { color: colors.subtle, ...font.body.body, lineHeight: 20 },
});
