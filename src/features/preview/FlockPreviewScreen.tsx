import { useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
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
import { Button, Panel, Screen, SegmentedControl, Text, useTheme } from '../../ui/index.ts';
import { font, radius } from '../../theme.ts';
import { tw } from '../../ui/tailwind.ts';
import { PREVIEW_COPY as copy, type PreviewState } from './preview-copy.ts';
import { previewMembers, type PreviewFixture } from './preview-data.ts';
import { PreviewStateNotice } from './PreviewStateNotice.tsx';

export function FlockPreviewScreen(
  { state, fixture, onRetry }: {
    state: PreviewState;
    fixture: PreviewFixture;
    onRetry: () => void;
  },
) {
  const { colors, ramp } = useTheme();
  const [mode, setMode] = useState<'current' | 'completed'>('current');
  const [selected, setSelected] = useState<PerchMember | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const insets = useSafeAreaInsets();
  const members = previewMembers(state, mode, fixture);
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
    <Screen bleed>
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
              topInset={insets.top}
              leaderId={members.length > 1 ? members[0]?.user_id : undefined}
              onBirdPress={setSelected}
              onInvite={members.length < FREE_SQUAD_MAX_MEMBERS
                ? () => setInviting(true)
                : undefined}
              whackedIds={mode === 'current' && sentTo ? [sentTo] : []}
            />
            {inviting ? (
              <View style={tw`px-lg`}>
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
              </View>
            ) : null}
            <View style={tw`px-lg`}>
              <View style={tw`mt-sm`}>
                <SegmentedControl
                  options={[{ value: 'current', label: PERCH_COPY.today }, {
                    value: 'completed',
                    label: PERCH_COPY.yesterday,
                  }]}
                  value={mode}
                  onChange={setMode}
                  accessibilityLabel='Which day the board ranks'
                />
              </View>
              {walk ? (
                <View
                  style={tw.style('mt-sm p-md gap-sm', {
                    borderRadius: radius.lg,
                    borderCurve: 'continuous',
                    backgroundColor: ramp.sage[100],
                  })}
                >
                  <Text style={{ ...font.body.strong, color: colors.subtle }}>{walk.label}</Text>
                  <View accessibilityElementsHidden importantForAccessibility='no-hide-descendants'>
                    <FlockStrip marks={walk.marks} label={walk.label} />
                  </View>
                </View>
              ) : null}
              <Panel variant='lift' style={{ padding: 0 }}>
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
            </View>
            {selected ? (
              <PerchBirdSheet
                key={selected.user_id}
                member={selected}
                mode={mode}
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
            ) : null}
          </>
        )}
    </Screen>
  );
}
