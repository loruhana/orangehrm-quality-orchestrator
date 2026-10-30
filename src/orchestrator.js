import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { cases } from './catalog.js';
import { decide, schemas } from './ai.js';
import { explore, automate, review } from './pipeline.js';
import { GitHub } from './github.js';

export const modules = ['all', 'Login', 'PIM', 'Leave', 'Time', 'Recruitment', 'Performance'];
export const personas = ['rh-admin', 'funcionario-junior', 'gestor-time'];
export function selectCases(module, personaIds = personas) {
  if (!modules.includes(module) || !personaIds.length || personaIds.some(p => !personas.includes(p))) throw new Error('Unsupported module/personas');
  return cases.filter(c => (module === 'all' || (module === 'Login' ? !c.id.startsWith('module-') : c.id === `module-${module.toLowerCase()}` || c.id === 'login-valid')) && (personaIds.includes(c.persona) || c.id === 'login-valid')).map(c => c.id);
}
export async function writeReportFile(name, value, outputDir = 'audit-output') {
  await mkdir(outputDir, { recursive: true });
  await writeFile(`${outputDir}/${name}.json`, JSON.stringify(value, null, 2));
}
export async function readReportFile(name, outputDir = 'audit-output') { return JSON.parse(await readFile(`${outputDir}/${name}.json`, 'utf8')); }
export async function createPlan(options = {}) {
  const module = options.module || 'all';
  if (!['auto', ...modules].includes(module)) throw new Error('Unsupported module');
  const baseURL = options.baseURL || 'https://opensource-demo.orangehrmlive.com';
  const target = new URL(baseURL);
  if (target.origin !== 'https://opensource-demo.orangehrmlive.com') throw new Error('Only the authorized public OrangeHRM demo is supported');
  if (!options.authorized) throw new Error('Confirm authorized demo scope with --authorized');
  if (options.provider === 'rules' && module === 'auto') throw new Error('Natural-language scope requires Codex; select an explicit module for rules');
  const input = { module, instruction: options.instruction || 'Auditar os casos mapeados, sem alterar dados do demo.', personaIds: options.personaIds || personas, availableCases: cases, limitations: ['read-only workflows', 'public shared demo', 'no merge', 'no destructive actions'] };
  const decision = await (options.decide || decide)('orquestrador', input, schemas.orquestrador, options);
  if (module !== 'auto' && decision.module !== module) throw new Error('Agent changed explicit module');
  if (!Array.isArray(decision.personaIds) || decision.personaIds.some(p => !input.personaIds.includes(p))) throw new Error('Agent expanded persona scope');
  const caseIds = selectCases(decision.module, decision.personaIds);
  if (!caseIds.length) throw new Error('No mapped cases for this scope');
  const plan = { version: 1, timestamp: new Date().toISOString(), provider: options.provider || 'codex', module: decision.module, objective: decision.objective, rationale: decision.rationale, personaIds: decision.personaIds, caseIds, baseURL: target.origin, authorized: true, publish: !!options.publish, repository: options.repository || 'loruhana/orangehrm-quality-orchestrator', limitations: input.limitations };
  if (plan.repository !== 'loruhana/orangehrm-quality-orchestrator') throw new Error('Publishing repository must belong to loruhana and match this project');
  await writeReportFile('plan', plan, options.outputDir);
  return plan;
}
export function validatePlan(plan) {
  if (!plan || !plan.authorized || plan.repository !== 'loruhana/orangehrm-quality-orchestrator' || plan.baseURL !== 'https://opensource-demo.orangehrmlive.com') throw new Error('Invalid plan identity/target');
  const expected = selectCases(plan.module, plan.personaIds);
  if (JSON.stringify(plan.caseIds) !== JSON.stringify(expected)) throw new Error('Plan cases differ from mapped scope');
  return plan;
}
export async function preflight(options) {
  if (!existsSync(chromium.executablePath())) throw new Error('Chromium missing: npx playwright install chromium');
  if (options.publish) {
    const github = options.github || new GitHub({ repository: options.repository });
    const user = await github.request('GET', '/user');
    if (user.login !== 'loruhana') throw new Error('Local publishing must authenticate as loruhana');
    options.github = github;
  }
}
export async function orchestrate(options, stages = { createPlan, preflight, explore, automate, review }) {
  const summary = { startedAt: new Date().toISOString(), stages: {}, status: 'running' };
  const stage = async (name, fn) => {
    try { const result = await fn(); summary.stages[name] = { status: 'completed' }; return result; }
    catch (error) { summary.stages[name] = { status: 'blocked', reason: error.message }; throw error; }
  };
  let problem;
  try {
    await stage('preflight', () => stages.preflight(options));
    const plan = await stage('orquestrador', () => stages.createPlan(options));
    Object.assign(options, { caseIds: plan.caseIds, baseURL: plan.baseURL, artifacts: 'audit-output/evidence', outputDir: options.outputDir || 'audit-output' });
    // Exploration records evidence first. Publishing only happens after a confirmed result.
    const findings = await stage('explorador', () => stages.explore(options));
    summary.counts = { executed: findings.observations.length, confirmed: findings.findings.length, inconclusive: findings.observations.filter(o => o.status === 'inconclusive').length };
    if (!findings.findings.length) {
      summary.stages.automatizador = { status: 'skipped', reason: 'No confirmed findings in this run' };
      summary.stages.revisor = { status: 'skipped', reason: 'No tests/PRs generated in this run' };
    } else if (!options.publish) {
      summary.stages.automatizador = { status: 'skipped', reason: 'Dry run: findings recorded; GitHub publication disabled' };
      summary.stages.revisor = { status: 'skipped', reason: 'No published PRs in dry run' };
    } else {
      // GitHub's list endpoint can lag behind freshly created issues. Fetch the
      // exact IDs returned by creation rather than rediscovering them through a cached list.
      const issues = [];
      for (const created of findings.issues) {
        const issue = await options.github.request('GET', options.github.path(`/issues/${created.number}`));
        if (issue.state === 'open' && !issue.pull_request) issues.push(issue);
      }
      const tests = await stage('automatizador', () => stages.automate({ ...options, issues }));
      summary.counts.tests = tests.filter(t => t.filename).length;
      if (tests.some(t => t.pr)) {
        const results = await stage('revisor', () => stages.review({ ...options, caseIds: findings.findings.map(f => f.id) }));
        summary.counts.reviews = results.length;
      } else summary.stages.revisor = { status: 'skipped', reason: 'No generated PRs' };
    }
    summary.status = summary.counts.inconclusive ? 'partial' : 'completed';
  } catch (error) { summary.status = 'blocked'; summary.error = error.message; problem = error; }
  finally {
    summary.finishedAt = new Date().toISOString();
    for (const name of ['orquestrador', 'explorador', 'automatizador', 'revisor']) summary.stages[name] ||= { status: 'skipped', reason: 'Upstream stage blocked' };
    await writeReportFile('summary', summary, options.outputDir);
    await writeFile(`${options.outputDir || 'audit-output'}/summary.md`, `# Auditoria OrangeHRM\n\nStatus: **${summary.status}**\n\n${Object.entries(summary.stages).map(([k,v]) => `- ${k}: ${v.status}${v.reason ? ` — ${v.reason}` : ''}`).join('\n')}\n\n\`\`\`json\n${JSON.stringify(summary.counts || {}, null, 2)}\n\`\`\`\n`);
  }
  if (problem) throw problem;
  return summary;
}
