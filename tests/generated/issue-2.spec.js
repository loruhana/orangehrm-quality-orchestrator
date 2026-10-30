import { test, expect } from '@playwright/test';
import { executeCase } from '../../src/pages.js';

test("Links sociais do login não têm nome acessível", async ({ page }) => {
  const result = await executeCase(page, "a11y-link-name");
  expect(result.actual, JSON.stringify(result.details ?? result)).toEqual(result.expected);
});
