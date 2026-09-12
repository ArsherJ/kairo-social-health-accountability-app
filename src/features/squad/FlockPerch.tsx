import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, ScrollView, View } from 'react-native';
import { evolutionStageForLevel } from '@kairo/core';
import { CharacterFigure } from '../character/CharacterFigure.tsx';
import { font, radius, space } from '../../theme.ts';
import { Text, useTheme } from '../../ui/index.ts';
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

/** A whole roster, with exactly one invitation at the trailing edge. */
export function FlockPerch(
  {
    members,
    title = PERCH_COPY.title,
    onBirdPress,
    onInvite,
    leaderId,
    whackedIds = [],
    topInset = 0,
  }: {
    members: readonly PerchMember[];
    title?: string;
    onBirdPress: (member: PerchMember) => void;
    onInvite?: () => void;
    leaderId?: string;
    whackedIds?: readonly string[];
    topInset?: number;
  },
) {
  const { colors, ramp, earnedColor } = useTheme();
  const ink = colors.text;
  return (
    <View style={{ overflow: 'hidden', paddingBottom: space.md, paddingTop: topInset + space.md }}>
      <View style={{ paddingHorizontal: space.lg, gap: space.xs }}>
        <Text
          scale='chrome'
          style={{ ...font.body.label, color: colors.subtle }}
        >
          {PERCH_COPY.eyebrow}
        </Text>
        <Text accessibilityRole='header' style={{ ...font.display.major, color: ink }}>
          {title}
        </Text>
        <Text style={{ ...font.body.quiet, color: colors.subtle }}>
          {members.length < 2 ? PERCH_COPY.solo : PERCH_COPY.hint}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm, alignItems: 'flex-end' }}
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
            style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingHorizontal: space.sm,
                paddingBottom: space.md,
                minWidth: 96,
                minHeight: 152,
                borderRadius: radius.lg,
                borderCurve: 'continuous',
                backgroundColor: member.is_self ? ramp.accent[200] : ramp.sage[100],
                opacity: pressed ? 0.65 : 1,
              })}
          >
            <View {...hidden} style={{ alignItems: 'center' }}>
              <View style={{ height: 24, alignItems: 'center', justifyContent: 'center' }}>
                {members.length > 1 && member.user_id === leaderId && (
                  <MaterialCommunityIcons name='crown' size={23} color={earnedColor} />
                )}
              </View>
              <CharacterFigure
                level={member.level}
                stage={evolutionStageForLevel(member.level)}
                height={84}
                compact
                figure={{ kind: 'pose', pose: 'idle' }}
                body={{ tier: 'slim', shade: colors.sage, shadowWeight: 0 }}
                lifetimePoints={{
                  AGI: member.ratings.AGI ?? 0,
                  STR: member.ratings.STR ?? 0,
                  MND: member.ratings.MND ?? 0,
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <Text
                  scale='chrome'
                  style={{
                    ...font.display.small,
                    color: ink,
                    maxWidth: 144,
                    textAlign: 'center',
                  }}
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
                style={{ ...font.body.quiet, color: colors.muted }}
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
            style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.sm,
                marginBottom: space.md,
                minWidth: 80,
                minHeight: 132,
                opacity: pressed ? 0.65 : 1,
              })}
          >
            <View
              {...hidden}
              style={{
                width: 56,
                height: 56,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
                borderRadius: radius.pill,
                borderCurve: 'continuous',
              }}
            >
              <MaterialCommunityIcons
                name='plus'
                size={25}
                color={colors.tealInk}
              />
            </View>
            <Text
              {...hidden}
              scale='chrome'
              style={{ ...font.body.body, color: colors.tealInk }}
            >
              {PERCH_COPY.invite}
            </Text>
          </Pressable>
        )}
      </ScrollView>
      <View
        {...hidden}
        style={{
          marginHorizontal: space.lg,
          height: 3,
          borderRadius: radius.pill,
          borderCurve: 'continuous',
          backgroundColor: ramp.neutral[300],
        }}
      />
    </View>
  );
}
