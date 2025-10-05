// tests/rules.test.js
// Rules engine tests

import { isQuietHours } from '../src/services/rules.js';

describe('Rules.isQuietHours', () => {
  test('overnight window 21→9 returns true within quiet range', () => {
    const tz = 'Europe/Athens';

    // Create dates in local time for Athens timezone
    const evening = new Date('2025-01-01T22:00:00+02:00'); // 22:00 Athens time
    const morning = new Date('2025-01-01T07:00:00+02:00'); // 07:00 Athens time
    const noon = new Date('2025-01-01T12:00:00+02:00'); // 12:00 Athens time

    expect(isQuietHours(evening, { enabled: true, start: 21, end: 9 }, tz)).toBe(true);
    expect(isQuietHours(morning, { enabled: true, start: 21, end: 9 }, tz)).toBe(true);
    expect(isQuietHours(noon, { enabled: true, start: 21, end: 9 }, tz)).toBe(false);
  });
});
