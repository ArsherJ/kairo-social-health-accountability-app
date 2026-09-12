import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CORE_STATS } from '@kairo/core';
import { Button, Glass, StatCoin, Text, useReduceMotion, useTheme } from '../../ui/index.ts';
import { claimModal, releaseModal } from '../../ui/modal-owner.ts';
import { font, radius, space } from '../../theme.ts';
import { KairoThumbnail } from '../character/KairoThumbnail.tsx';
import { WHACK_COPY } from '../whack/whack-copy.ts';
import { PERCH_COPY, perchDayLine, perchStatsLabel } from './perch-copy.ts';
import type { PerchMember } from './FlockPerch.tsx';

/** Mount for a selected bird only; one modal lease lasts for that selection. */
export function PerchBirdSheet(
  { member, mode = 'current', onClose, onWhack, showWhackHint = false, dayLine }: {
    member: PerchMember;
    mode?: 'current' | 'completed';
    onClose: () => void;
    onWhack?: () => Promise<void>;
    showWhackHint?: boolean;
    /** Solo readings can be pending; that is not a refusal to share. */
    dayLine?: string;
  },
) {
  const { colors, glass, ramp } = useTheme();
  const [ownsHost, setOwnsHost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const sheetWidth = Math.min(width - space.lg * 2, 460);
  const ink = colors.text;
  useEffect(() => {
    const claimed = claimModal('perch-bird');
    setOwnsHost(claimed);
    if (!claimed) onClose();
    return () => {
      if (claimed) releaseModal('perch-bird');
    };
  }, []);

  async function send() {
    if (!onWhack || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onWhack();
      onClose();
    } catch {
      setError(WHACK_COPY.failed);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={ownsHost}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingHorizontal: space.lg,
          backgroundColor: glass.dark.fill,
          paddingBottom: insets.bottom + space.md,
          paddingTop: insets.top + space.md,
        }}
      >
        <Glass
          tone='light'
          style={{ width: sheetWidth, maxHeight: height - insets.top - insets.bottom - space.xl }}
        >
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }}>
            <View accessibilityViewIsModal style={{ padding: space.lg, gap: space.md, width: sheetWidth }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <KairoThumbnail size={88} pose='idle' lifetimePoints={member.ratings} decorative />
                <View style={{ flex: 1, gap: space.xs }}>
                  <Text accessibilityRole='header' style={{ ...font.display.major, color: ink }}>
                    {member.character_name}
                  </Text>
                  <Text style={{ ...font.body.body, color: colors.subtle }}>
                    Level {member.level}
                  </Text>
                </View>
              </View>
              <View
                accessible
                accessibilityLabel={perchStatsLabel(member.ratings)}
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: space.lg,
                  padding: space.md,
                  borderRadius: radius.lg,
                  borderCurve: 'continuous',
                  backgroundColor: ramp.sage[100],
                }}
              >
                {CORE_STATS.map((stat) => (
                  <View
                    key={stat}
                    accessibilityElementsHidden
                    importantForAccessibility='no-hide-descendants'
                  >
                    <StatCoin stat={stat} points={member.ratings[stat] ?? 0} />
                  </View>
                ))}
              </View>
              <Text style={{ ...font.body.body, textAlign: 'center', color: ink }}>
                {dayLine ?? perchDayLine(member.steps, mode)}
              </Text>
              {error && (
                <Text
                  accessibilityRole='alert'
                  style={{ ...font.body.body, color: colors.damage }}
                >
                  {error}
                </Text>
              )}
              {onWhack && !member.is_self && mode === 'current'
                ? <Button label={WHACK_COPY.action} busy={busy} onPress={() => void send()} />
                : showWhackHint && !member.is_self && (
                  <Text
                    style={{ ...font.body.quiet, color: colors.subtle }}
                  >
                    {WHACK_COPY.earned}
                  </Text>
                )}
              <Button label={PERCH_COPY.close} variant='secondary' onPress={onClose} />
            </View>
          </ScrollView>
        </Glass>
      </View>
    </Modal>
  );
}
