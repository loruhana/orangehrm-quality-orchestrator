import { test, expect } from '@playwright/test';
import { executeCase } from '../../src/pages.js';

test("Documento do login não declara idioma", async ({ page }) => {
  const result = await executeCase(page, "a11y-html-lang");
  expect(result.actual, JSON.stringify(result.details ?? result)).toEqual(result.expected);
});
