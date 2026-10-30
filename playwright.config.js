import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 60000, retries: 0, workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.ORANGEHRM_BASE_URL || 'https://opensource-demo.orangehrmlive.com',
    browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' }
});
