import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, ScrollView, View } from 'react-native';
import { evolutionStageForLevel } from '@kairo/core';
import { CharacterFigure } from '../character/CharacterFigure.tsx';
import { colors, earnedColor, font, radius, ramp, space } from '../../theme.ts';
import { Gradient, Text } from '../../ui/index.ts';
import { tw } from '../../ui/tailwind.ts';
import { birdLabel, PERCH_COPY } from './perch-copy.ts';

export interface PerchMember {
  user_id: string;
  character_name: string;
  level: number;
  is_self: boolean;
  ratings: Record<string, number>;
  steps: number | null;
}

const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;
const FIELD = [{ color: ramp.sky[200], at: 0 }, { color: ramp.sage[100], at: 0.65 }, {
  color: colors.bg,
  at: 1,
}];
const NIGHT = [{ color: colors.night, at: 0 }, { color: colors.midnight, at: 1 }];

/** A whole roster, with exactly one invitation at the trailing edge. */
export function FlockPerch(
  {
    members,
    title = PERCH_COPY.title,
    onBirdPress,
    onInvite,
    leaderId,
    whackedIds = [],
    dark = false,
    topInset = 0,
  }: {
    members: readonly PerchMember[];
    title?: string;
    onBirdPress: (member: PerchMember) => void;
    onInvite?: () => void;
    leaderId?: string;
    whackedIds?: readonly string[];
    dark?: boolean;
    topInset?: number;
  },
) {
  const ink = dark ? colors.bg : colors.text;
  return (
    <View style={tw.style('overflow-hidden pb-lg', { paddingTop: topInset + space.lg })}>
      <Gradient stops={dark ? NIGHT : FIELD} direction='vertical' />
      <View style={tw`px-lg gap-sm`}>
        <Text
          scale='chrome'
          style={{ ...font.body.label, color: dark ? ramp.sage[300] : colors.subtle }}
        >
          {PERCH_COPY.eyebrow}
        </Text>
        <Text accessibilityRole='header' style={{ ...font.display.major, color: ink }}>
          {title}
        </Text>
        <Text style={{ ...font.body.quiet, color: dark ? ramp.sage[300] : colors.subtle }}>
          {members.length < 2 ? PERCH_COPY.solo : PERCH_COPY.hint}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={tw`px-lg pt-lg pb-sm gap-sm items-end`}
      >
        {members.map((member) => (
          <Pressable
            key={member.user_id}
            accessible
            accessibilityRole='button'
            accessibilityLabel={birdLabel(member.character_name, member.level, false, {
              leader: members.length > 1 && member.user_id === leaderId,
              whacked: whackedIds.includes(member.user_id),
            })}
            onPress={() => onBirdPress(member)}
            style={({ pressed }) =>
              tw.style('items-center justify-end px-sm pb-md', {
                width: 104,
                minHeight: 184,
                borderRadius: radius.xl,
                borderCurve: 'continuous',
                backgroundColor: member.is_self
                  ? (dark ? ramp.neutral[800] : ramp.accent[200])
                  : 'transparent',
                opacity: pressed ? 0.65 : 1,
              })}
          >
            <View {...hidden} style={tw`items-center`}>
              <View style={tw`h-6 items-center justify-center`}>
                {members.length > 1 && member.user_id === leaderId && (
                  <MaterialCommunityIcons name='crown' size={23} color={earnedColor} />
                )}
              </View>
              <CharacterFigure
                level={member.level}
                stage={evolutionStageForLevel(member.level)}
                height={100}
                compact
                figure={{
                  kind: 'stage',
                  stage: evolutionStageForLevel(member.level),
                  pose: 'idle',
                }}
                body={{ tier: 'slim', shade: colors.sage, shadowWeight: 0 }}
                lifetimePoints={{
                  AGI: member.ratings.AGI ?? 0,
                  STR: member.ratings.STR ?? 0,
                  MND: member.ratings.MND ?? 0,
                }}
              />
              <View style={tw`flex-row items-center gap-xs`}>
                <Text
                  scale='chrome'
                  numberOfLines={1}
                  style={{ ...font.display.small, color: ink, maxWidth: 82 }}
                >
                  {member.character_name}
                </Text>
                {whackedIds.includes(member.user_id) && (
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: radius.pill,
                      borderCurve: 'continuous',
                      backgroundColor: colors.coral,
                    }}
                  />
                )}
              </View>
              <Text
                scale='chrome'
                style={{ ...font.body.quiet, color: dark ? ramp.sage[300] : colors.muted }}
              >
                Lv. {member.level}
              </Text>
            </View>
          </Pressable>
        ))}
        {onInvite && (
          <Pressable
            accessible
            accessibilityRole='button'
            accessibilityLabel={PERCH_COPY.inviteLabel}
            onPress={onInvite}
            style={({ pressed }) =>
              tw.style('items-center justify-center gap-sm mb-md', {
                minWidth: 80,
                minHeight: 132,
                opacity: pressed ? 0.65 : 1,
              })}
          >
            <View
              {...hidden}
              style={tw.style('w-14 h-14 items-center justify-center', {
                backgroundColor: dark ? ramp.neutral[800] : colors.surface,
                borderRadius: radius.pill,
                borderCurve: 'continuous',
              })}
            >
              <MaterialCommunityIcons
                name='plus'
                size={25}
                color={dark ? colors.bg : colors.teal}
              />
            </View>
            <Text
              {...hidden}
              scale='chrome'
              style={{ ...font.body.body, color: dark ? colors.bg : colors.tealInk }}
            >
              {PERCH_COPY.invite}
            </Text>
          </Pressable>
        )}
      </ScrollView>
      <View
        {...hidden}
        style={tw.style('mx-lg h-2', {
          borderRadius: radius.pill,
          borderCurve: 'continuous',
          backgroundColor: dark ? ramp.neutral[700] : ramp.sage[300],
        })}
      />
    </View>
  );
}
