import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { startFixture } from './fixture.js';
import { probe } from '../src/browser.js';
import { generateTest } from '../src/pipeline.js';
const provider = process.argv.includes('--codex') ? 'codex' : 'rules';
const { decide, schemas } = await import('../src/ai.js');
await mkdir('tests/generated', { recursive: true });
const file = 'tests/generated/local-control.spec.js';
await writeFile(file, generateTest('login-required'));
try {
  for (const buggy of [true, false]) {
    const fixture = await startFixture({ buggy });
    try {
      const observation = await probe('login-required', { baseURL: fixture.baseURL });
      assert.equal(observation.status, buggy ? 'finding' : 'pass');
      const exploration = await decide('explorador', { observations: [observation] }, schemas.explorador, { provider });
      assert.deepEqual(exploration.selected, buggy ? ['login-required'] : []);
      const generation = await decide('automatizador', { case: { id: 'login-required' }, observation }, schemas.automatizador, { provider });
      assert.equal(generation.caseId, 'login-required');
      const review = await decide('revisor', { validSource: true, reproduced: buggy, observation }, schemas.revisor, { provider });
      assert.equal(review.verdict, buggy ? 'approve' : 'wontfix');
      const exit = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', file, '--reporter=list'], { env: { ...process.env, ORANGEHRM_BASE_URL: fixture.baseURL }, stdio: 'inherit', windowsHide: true });
        child.on('error', reject); child.on('close', resolve);
      });
      assert.equal(exit, buggy ? 1 : 0, 'Canonical regression must fail on the defect and pass on the corrected fixture');
      console.log(`CONTROL ${buggy ? 'DEFECT' : 'FIXED'}: validated (${provider})`);
    } finally { await fixture.close(); }
  }
} finally { await unlink(file); }
console.log('Local controls passed. No public issues or PRs created.');
