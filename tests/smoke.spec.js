import { test, expect } from '@playwright/test';
import { executeCase } from '../src/pages.js';
for (const id of ['login-required', 'login-invalid', 'login-valid', 'module-pim', 'module-leave', 'module-recruitment', 'module-time', 'module-performance']) {
  test(id, async ({ page }) => {
    const result = await executeCase(page, id);
    expect(result.actual).toEqual(result.expected);
  });
}
