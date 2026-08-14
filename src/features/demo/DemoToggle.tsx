import { StyleSheet } from 'react-native';
import { font, ramp, space } from '@/theme.ts';
import { Button, Text } from '@/ui/index.ts';
import { useDemoStore, toggleDemo } from './store.ts';

/**
 * Switches the fixtures on. Simulator affordance only — the caller keeps this
 * inside a `{__DEV__ && …}` block, beside "Seed Apple Health (dev)".
 *
 * Says what it is *doing* rather than what it is called: a toggle labelled
 * "Demo mode" leaves you guessing which way it currently points.
 */
export function DemoToggle() {
  const on = useDemoStore((s) => s.on);

  return (
    <>
      <Button
        label={on ? 'Turn off demo data (dev)' : 'Show demo data (dev)'}
        onPress={toggleDemo}
        variant="secondary"
      />
      {on && (
        <Text style={styles.note}>
          Squad, streak, score and hits are local fixtures. Nothing is written
          to Supabase, and nothing you do here reaches the real board.
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  note: {
    ...font.body.body,
    fontSize: 12,
    lineHeight: 18,
    color: ramp.neutral[600],
    marginTop: space.sm,
  },
});
