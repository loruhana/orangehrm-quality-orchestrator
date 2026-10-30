import { parseArgs } from 'node:util';
import { orchestrate, createPlan } from './orchestrator.js';
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  module: { type: 'string', default: 'all' }, instruction: { type: 'string' },
  authorized: { type: 'boolean', default: false }, publish: { type: 'boolean', default: false }, rules: { type: 'boolean', default: false }
} });
const options = { ...values, provider: values.rules ? 'rules' : 'codex', repository: process.env.GITHUB_REPOSITORY || 'loruhana/orangehrm-quality-orchestrator', baseURL: process.env.ORANGEHRM_BASE_URL || 'https://opensource-demo.orangehrmlive.com' };
try {
  const command = positionals[0] || 'pipeline';
  if (command === 'plan') console.log(await createPlan(options));
  else if (command === 'pipeline') console.log(await orchestrate(options));
  else throw new Error('Use plan|pipeline --authorized [--module PIM|all|auto] [--instruction text] [--publish] [--rules]');
} catch (error) { console.error(error.message); process.exitCode = 1; }
