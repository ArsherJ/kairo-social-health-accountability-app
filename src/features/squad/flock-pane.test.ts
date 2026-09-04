import { describe, expect, it } from 'vitest';
import {
  CONSUMED_PANE_PARAMS,
  flockPaneHref,
  requestedPane,
} from './flock-pane.ts';

describe('flock pane requests', () => {
  it('round-trips every pane it can ask for', () => {
    for (const pane of ['create', 'join'] as const) {
      const href = flockPaneHref(pane);
      const query = href.slice(href.indexOf('?') + 1).split('=');
      expect(query[0]).toBe(Object.keys(CONSUMED_PANE_PARAMS)[0]);
      expect(requestedPane(query[1])).toBe(pane);
    }
  });

  it('reads the value the tab clears to as no request', () => {
    // The whole reason both halves live in one module: the tab writes this
    // back to consume a request, and a parser that accepted it would reopen
    // the form on every later visit to the tab.
    for (const value of Object.values(CONSUMED_PANE_PARAMS)) {
      expect(requestedPane(value)).toBeNull();
    }
  });

  it('asks for nothing on anything it does not recognise', () => {
    for (const value of [undefined, 'choose', 'jion', ['join'], '']) {
      expect(requestedPane(value)).toBeNull();
    }
  });
});
