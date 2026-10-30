import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cases, getCase } from './catalog.js';
import { probe } from './browser.js';
import { decide, schemas } from './ai.js';

export function generateTest(id) {
  const item = getCase(id);
  return `import { test, expect } from '@playwright/test';\nimport { executeCase } from '../../src/pages.js';\n\ntest(${JSON.stringify(item.title)}, async ({ page }) => {\n  const result = await executeCase(page, ${JSON.stringify(id)});\n  expect(result.actual, JSON.stringify(result.details ?? result)).toEqual(result.expected);\n});\n`;
}
export function issueBody(item, observations, rationale) {
  return `Persona: ${item.persona} (perspectiva; credencial real: Admin do demo).\n\n### Passos\n${item.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n### Esperado\n${item.expected}\n\n### Observado (duas execuções independentes)\n\`\`\`json\n${JSON.stringify(observations, null, 2)}\n\`\`\`\n\n### Análise\n${rationale}\n\n<!-- orangehrm-case:${item.id} -->`;
}
export function parseIssue(issue) {
  const id = issue.body?.match(/<!-- orangehrm-case:([a-z0-9-]+) -->/)?.[1];
  if (!id) return null;
  const item = getCase(id);
  if (!issue.body.includes(`<!-- orangehrm-audit:${id} -->`)) return null;
  return item;
}
export async function explore(options) {
  const observations = [];
  for (const item of cases.filter(item => !options.caseIds || options.caseIds.includes(item.id))) {
    console.log(`Explore: ${item.id}`);
    observations.push(await (options.probe || probe)(item.id, options));
  }
  const decision = await (options.decide || decide)('explorador', { observations, cases }, schemas.explorador, options);
  if (!Array.isArray(decision.selected) || !decision.selected.every(id => observations.some(o => o.id === id && o.status === 'finding'))) throw new Error('Agent selected an unsupported/unobserved finding');
  const findings = [], issues = [];
  for (const id of [...new Set(decision.selected)]) {
    const first = observations.find(o => o.id === id);
    const second = await (options.probe || probe)(id, options);
    if (second.status !== 'finding' || JSON.stringify(first.actual) !== JSON.stringify(second.actual)) continue;
    const item = getCase(id);
    const body = issueBody(item, [first, second], decision.rationale);
    findings.push({ id, body, observations: [first, second] });
    if (options.publish) issues.push(await options.github.ensureIssue(item, body));
  }
  const report = { stage: 'explore', provider: options.provider, observations, decision, findings, issues: issues.map(i => ({ number: i.number, url: i.html_url })) };
  await save('explore', report, options);
  return report;
}
export async function automate(options) {
  const issues = options.issues || (await options.github.all('/issues?state=open')).filter(i => !i.pull_request);
  const results = [];
  for (const issue of issues) {
    const item = parseIssue(issue);
    if (!item || (options.caseIds && !options.caseIds.includes(item.id))) continue;
    const fresh = await (options.probe || probe)(item.id, options);
    if (fresh.status !== 'finding') { results.push({ issue: issue.number, status: fresh.status }); continue; }
    const decision = await (options.decide || decide)('automatizador', { case: item, issue: { number: issue.number, body: issue.body }, observation: fresh }, schemas.automatizador, options);
    if (decision.caseId !== item.id) throw new Error('Agent changed issue case');
    const filename = `tests/generated/issue-${issue.number}.spec.js`;
    const source = generateTest(item.id);
    await mkdir('tests/generated', { recursive: true });
    await writeFile(filename, source);
    const pr = options.publish ? await options.github.createPR(issue, filename, source) : null;
    results.push({ issue: issue.number, filename, source, pr: pr?.html_url, decision });
  }
  await save('automate', results, options);
  return results;
}
export async function review(options) {
  const prs = await options.github.all('/pulls?state=open');
  const results = [];
  for (const pr of prs) {
    const issueNumber = Number(pr.body?.match(/<!-- orangehrm-issue:(\d+) -->/)?.[1]);
    if (!issueNumber || pr.head.repo?.full_name !== options.github.repository || pr.head.ref !== `audit/issue-${issueNumber}`) continue;
    const issue = await options.github.request('GET', options.github.path(`/issues/${issueNumber}`));
    const item = parseIssue(issue);
    if (!item || (options.caseIds && !options.caseIds.includes(item.id))) continue;
    const files = await options.github.all(`/pulls/${pr.number}/files`);
    const filename = `tests/generated/issue-${issueNumber}.spec.js`;
    let valid = files.length === 1 && files[0].filename === filename && files[0].status === 'added';
    if (valid) {
      const content = await options.github.request('GET', options.github.path(`/contents/${filename}?ref=${pr.head.sha}`));
      valid = Buffer.from(content.content, 'base64').toString() === generateTest(item.id);
    }
    // Never execute arbitrary PR code with the publishing token. Verify exact canonical source,
    // then independently run its shared POM oracle from the trusted default branch.
    const observation = valid ? await (options.probe || probe)(item.id, options) : null;
    if (observation?.status === 'inconclusive') { results.push({ pr: pr.number, verdict: 'inconclusive' }); continue; }
    const reproduced = valid && observation?.status === 'finding';
    const decision = await (options.decide || decide)('revisor', { case: item, validSource: valid, reproduced, observation }, schemas.revisor, options);
    if (!['approve', 'wontfix'].includes(decision.verdict) || (decision.verdict === 'approve' && !reproduced)) throw new Error('Invalid or unsupported approval');
    if (options.publish) await options.github.commentReview(pr, `### Auditoria: ${decision.verdict}\n\n${decision.rationale}\n\nCommit: ${pr.head.sha}\nFonte canônica validada: ${valid}\nReprodução independente: ${reproduced}\n\nEsta é uma revisão técnica por comentário; não é uma aprovação formal de PR nem realiza merge.\n\n\`\`\`json\n${JSON.stringify(observation, null, 2)}\n\`\`\``);
    results.push({ pr: pr.number, head: pr.head.sha, caseId: item.id, validSource: valid, ...decision, observation });
  }
  await save('review', results, options);
  return results;
}
async function save(stage, report, options) {
  if (options.persist === false) return;
  const directory = options.outputDir || 'audit-output';
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${stage}.json`, JSON.stringify(report, null, 2));
}
