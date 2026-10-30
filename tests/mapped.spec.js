import { test, expect } from '@playwright/test';
import { cases } from '../src/catalog.js';
import { executeCase } from '../src/pages.js';
// Generated from the entire catalog, so new mapped cases join the schedule automatically.
for (const item of cases) {
  test(`[${item.id}] ${item.title}`, async ({ page }) => {
    const observation = await executeCase(page, item.id);
    expect(observation.actual, JSON.stringify(observation.details ?? observation)).toEqual(observation.expected);
  });
}
