import { useRef, useState } from 'react';
import { Button, Text } from '../../ui/index.ts';
import { font } from '../../theme.ts';
import { useTheme } from '../../ui/use-theme.ts';
import type { StatRecord } from './records.ts';
import { shareBestDay } from './share-best-day.ts';
import { BEST_DAY_COPY } from './share-copy.ts';

export function BestDayShareButton({ record }: { record: StatRecord }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const sharing = useRef(false);
  async function share() {
    if (sharing.current) return;
    sharing.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await shareBestDay(record);
    } catch {
      setFailed(true);
    } finally {
      sharing.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        label={BEST_DAY_COPY.share}
        variant='secondary'
        busy={busy}
        onPress={() => void share()}
      />
      {failed && (
        <Text accessibilityRole='alert' style={{ ...font.body.body, color: colors.damage }}>
          {BEST_DAY_COPY.shareError}
        </Text>
      )}
    </>
  );
}
