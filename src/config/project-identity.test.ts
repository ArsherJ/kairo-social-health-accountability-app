import { describe, expect, it } from 'vitest';

import appConfig from '../../app.config';

describe('transferred Expo project identity', () => {
  it('uses the new organization without changing project or app identifiers', () => {
    expect(appConfig.owner).toBe('kairo-health');
    expect(appConfig.slug).toBe('kairo');
    expect(appConfig.extra?.eas?.projectId).toBe(
      'ccfa0966-3aa9-4548-b5a2-6e311816d8de',
    );
    expect(appConfig.ios?.bundleIdentifier).toBe('com.arsherj.kairo');
    expect(appConfig.android?.package).toBe('com.arsherj.kairo');
  });
});
