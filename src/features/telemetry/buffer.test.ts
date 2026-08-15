import { describe, expect, it } from 'vitest';
import {
  MAX_BUFFERED_EVENTS,
  bufferEvent,
  drainBuffer,
  type BufferedEvent,
} from './buffer.ts';

function event(type: string, occurredAt: number): BufferedEvent {
  return { type, payload: {}, occurredAt };
}

describe('bufferEvent', () => {
  it('appends in order', () => {
    const one = bufferEvent([], event('a', 1));
    const two = bufferEvent(one, event('b', 2));

    expect(two.map((e) => e.type)).toEqual(['a', 'b']);
  });

  it('does not mutate the buffer it is given', () => {
    const initial: BufferedEvent[] = [event('a', 1)];
    bufferEvent(initial, event('b', 2));

    expect(initial).toHaveLength(1);
  });

  // The buffer exists for a handful of pre-auth screens. An unbounded one is a
  // memory leak for anyone who opens the app and never signs in.
  it('drops the oldest past the cap', () => {
    let buffer: BufferedEvent[] = [];
    for (let i = 0; i < MAX_BUFFERED_EVENTS + 5; i += 1) {
      buffer = bufferEvent(buffer, event(`e${i}`, i));
    }

    expect(buffer).toHaveLength(MAX_BUFFERED_EVENTS);
    expect(buffer[0]?.type).toBe('e5');
  });
});

describe('drainBuffer', () => {
  it('returns everything and empties the buffer', () => {
    const buffer = [event('a', 1), event('b', 2)];
    const { drained, next } = drainBuffer(buffer);

    expect(drained.map((e) => e.type)).toEqual(['a', 'b']);
    expect(next).toEqual([]);
  });

  it('is safe on an empty buffer', () => {
    expect(drainBuffer([])).toEqual({ drained: [], next: [] });
  });

  // The whole point of buffering: the row must record when the user was on the
  // screen, not when the flush happened after sign-in.
  it('preserves original timestamps', () => {
    const { drained } = drainBuffer([event('a', 1_000)]);

    expect(drained[0]?.occurredAt).toBe(1_000);
  });
});
