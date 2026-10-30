import { chromium } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { executeCase } from './pages.js';
import { getCase } from './catalog.js';

export async function probe(id, { baseURL, artifacts = 'artifacts' } = {}) {
  getCase(id);
  await mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  const result = { id, timestamp: new Date().toISOString(), baseURL };
  try {
    const observation = await executeCase(page, id);
    Object.assign(result, observation, { status: isDeepStrictEqual(observation.actual, observation.expected) ? 'pass' : 'finding' });
    if (result.status === 'finding') {
      result.screenshot = `${artifacts}/${id}.png`;
      await page.screenshot({ path: result.screenshot });
    }
  } catch (error) {
    // Selector/timeouts/network failures are inconclusive, never automatic product bugs.
    Object.assign(result, { status: 'inconclusive', error: error.message.slice(0, 1500) });
  } finally { await context.close(); await browser.close(); }
  return result;
}
