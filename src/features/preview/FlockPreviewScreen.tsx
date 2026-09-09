import { useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FREE_SQUAD_MAX_MEMBERS } from '@kairo/core';
import { FlockPerch, type PerchMember } from '../squad/FlockPerch.tsx';
import { PerchBirdSheet } from '../squad/PerchBirdSheet.tsx';
import { FlockStrip } from '../squad/FlockStrip.tsx';
import { flockWalk } from '../squad/flock-walk.ts';
import { LeaderboardRow } from '../squad/LeaderboardRow.tsx';
import { leaderboardGaps } from '../squad/row-gap.ts';
import { LockedSlot } from '../squad/LockedSlot.tsx';
import { PERCH_COPY } from '../squad/perch-copy.ts';
import { whackAnnouncement, whackRowMark } from '../whack/whack-copy.ts';
import { Button, Panel, Screen, Text } from '../../ui/index.ts';
import { colors, font, radius, ramp } from '../../theme.ts';
import { tw } from '../../ui/tailwind.ts';
import { PREVIEW_COPY as copy, type PreviewState } from './preview-copy.ts';
import { previewMembers } from './preview-data.ts';
import { PreviewStateNotice } from './PreviewStateNotice.tsx';

export function FlockPreviewScreen(
  { dark, state, onRetry }: { dark: boolean; state: PreviewState; onRetry: () => void },
) {
  const [mode, setMode] = useState<'current' | 'completed'>('current');
  const [selected, setSelected] = useState<PerchMember | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const insets = useSafeAreaInsets();
  const members = previewMembers(state, mode);
  const gaps = leaderboardGaps(members);
  const walk = flockWalk({
    members: members.map((member) => ({
      characterName: member.character_name,
      steps: member.steps,
    })),
    mode,
  });
  const available = state === 'ready' && mode === 'current' && sentTo === null;
  return (
    <Screen bleed tone={dark ? 'dark' : 'light'}>
      {state === 'loading' || state === 'error'
        ? (
          <View style={{ paddingTop: insets.top }}>
            <PreviewStateNotice state={state} onRetry={onRetry} />
          </View>
        )
        : (
          <>
            <FlockPerch
              members={members}
              title={copy.flockName}
              dark={dark}
              topInset={insets.top}
              leaderId={members.length > 1 ? members[0]?.user_id : undefined}
              onBirdPress={setSelected}
              onInvite={members.length < FREE_SQUAD_MAX_MEMBERS
                ? () => setInviting(true)
                : undefined}
              whackedIds={mode === 'current' && sentTo ? [sentTo] : []}
            />
            <View style={tw`px-lg`}>
              {walk && (
                <Panel style={{ backgroundColor: colors.night }}>
                  <Text style={{ ...font.display.small, color: colors.bg }}>{walk.label}</Text>
                  <View accessibilityElementsHidden importantForAccessibility='no-hide-descendants'>
                    <FlockStrip marks={walk.marks} label={walk.label} />
                  </View>
                </Panel>
              )}
              <View
                style={tw.style('flex-row p-xs mt-lg', {
                  borderRadius: radius.pill,
                  borderCurve: 'continuous',
                  backgroundColor: dark ? ramp.neutral[800] : ramp.neutral[200],
                })}
              >
                {(['current', 'completed'] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole='button'
                    accessibilityState={{ selected: mode === value }}
                    onPress={() => setMode(value)}
                    style={({ pressed }) =>
                      tw.style('flex-1 items-center justify-center p-sm', {
                        minHeight: 48,
                        borderRadius: radius.pill,
                        borderCurve: 'continuous',
                        backgroundColor: value === mode ? colors.accent : 'transparent',
                        opacity: pressed ? 0.7 : 1,
                      })}
                  >
                    <Text
                      scale='chrome'
                      style={{
                        ...font.display.small,
                        color: value === mode || !dark ? colors.text : colors.bg,
                      }}
                    >
                      {value === 'current' ? PERCH_COPY.today : PERCH_COPY.yesterday}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Panel style={{ padding: 8 }}>
                {members.map((member) => (
                  <LeaderboardRow
                    key={member.user_id}
                    row={member}
                    mode={mode}
                    gap={gaps.get(member.user_id) ?? null}
                    ranked={members.length > 1}
                    whackMark={mode === 'current' && sentTo === member.user_id
                      ? whackRowMark(copy.name)
                      : undefined}
                  />
                ))}
              </Panel>
              <LockedSlot
                remaining={FREE_SQUAD_MAX_MEMBERS - members.length}
                onPress={() => setInviting(true)}
              />
              {inviting && (
                <Panel>
                  <Text
                    accessibilityRole='header'
                    style={{ ...font.display.minor, color: colors.text }}
                  >
                    {copy.inviteTitle}
                  </Text>
                  <Text style={tw.style('py-md', font.body.body, { color: colors.subtle })}>
                    {copy.inviteBody}
                  </Text>
                  <Button
                    label={copy.inviteClose}
                    variant='secondary'
                    onPress={() => setInviting(false)}
                  />
                </Panel>
              )}
            </View>
            {selected && (
              <PerchBirdSheet
                key={selected.user_id}
                member={selected}
                mode={mode}
                dark={dark}
                onClose={() => setSelected(null)}
                showWhackHint={!available && !sentTo}
                onWhack={available && !selected.is_self
                  ? async () => {
                    setSentTo(selected.user_id);
                    AccessibilityInfo.announceForAccessibility(
                      whackAnnouncement(copy.name, selected.character_name),
                    );
                  }
                  : undefined}
              />
            )}
          </>
        )}
    </Screen>
  );
}
