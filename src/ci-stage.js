import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createPlan, readReportFile, writeReportFile, validatePlan } from './orchestrator.js';
import { explore, automate, review, generateTest, issueBody } from './pipeline.js';
import { GitHub } from './github.js';
import { getCase } from './catalog.js';
const stage = process.argv[2];
const out = async (key, value) => { if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`); };
try {
  if (stage === 'orquestrador') {
    await createPlan({ authorized: true, module: process.env.AUDIT_MODULE || 'all', instruction: process.env.AUDIT_INSTRUCTION, provider: process.env.AUDIT_PROVIDER || 'rules', publish: process.env.AUDIT_PUBLISH === 'true', repository: process.env.GITHUB_REPOSITORY });
  } else if (stage === 'relatorio') {
    const statuses = JSON.parse(process.env.JOB_RESULTS || '{}');
    let plan = null, exploration = null, tests = [], reviews = [];
    for (const [name, assign] of [['plan', v => { plan=v; }], ['explore', v => { exploration=v; }], ['automate', v => { tests=v; }], ['review', v => { reviews=v; }]]) {
      try { assign(await readReportFile(name)); } catch { /* Missing artifact is displayed, not treated as success. */ }
    }
    const status = Object.values(statuses).some(v => v.result === 'failure' || v.result === 'cancelled') ? 'blocked' : exploration?.observations.some(o => o.status === 'inconclusive') ? 'partial' : exploration ? 'completed' : 'blocked';
    const summary = { status, provider: plan?.provider || 'not-executed', scope: plan?.module || 'unavailable', jobs: statuses, mapped: plan?.caseIds.length || 0, observed: exploration?.observations.length || 0, confirmed: exploration?.findings.length || 0, generated: tests.filter(t => t.filename).length, reviewed: reviews.length };
    await writeReportFile('summary', summary);
    const markdown = `# OrangeHRM — relatório da execução\n\nStatus: **${status}** | Provider: **${summary.provider}** | Escopo: **${summary.scope}**\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n\nEtapas skipped não foram executadas. Sem achados confirmados ou com publicação desligada, nenhuma PR é fabricada.\n`;
    await writeFile('audit-output/summary.md', markdown);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  } else {
    const plan = validatePlan(await readReportFile('plan'));
    const options = { ...plan, publish: false, artifacts: 'audit-output/evidence', outputDir: 'audit-output' };
    if (stage === 'explorador') {
      const report = await explore(options);
      await out('confirmed', report.findings.length);
      if (report.observations.every(o => o.status === 'inconclusive')) throw new Error('No mapped case could be evaluated');
    } else if (stage === 'publicar-issues') {
      if (!plan.publish) throw new Error('Publication disabled');
      const github = new GitHub({ repository: plan.repository });
      const exploration = await readReportFile('explore');
      const issues = [];
      for (const finding of exploration.findings) {
        if (!plan.caseIds.includes(finding.id) || finding.observations?.length !== 2 || !finding.observations.every(o => o.id === finding.id && o.status === 'finding' && o.baseURL === plan.baseURL) || JSON.stringify(finding.observations[0].actual) !== JSON.stringify(finding.observations[1].actual)) throw new Error('Unconfirmed evidence rejected');
        const item = getCase(finding.id);
        const issue = await github.ensureIssue(item, issueBody(item, finding.observations, exploration.decision.rationale));
        if (issue.state === 'open') issues.push(issue);
      }
      await writeReportFile('published-issues', issues);
      await out('count', issues.length);
    } else if (stage === 'automatizador') {
      const issues = await readReportFile('published-issues');
      const tests = await automate({ ...options, issues });
      await out('count', tests.filter(t => t.filename).length);
    } else if (stage === 'publicar-prs') {
      if (!plan.publish) throw new Error('Publication disabled');
      const github = new GitHub({ repository: plan.repository });
      const tests = await readReportFile('automate');
      const issues = await readReportFile('published-issues');
      const prs = [];
      for (const generated of tests.filter(t => t.filename)) {
        const issue = issues.find(i => i.number === generated.issue);
        const id = generated.decision.caseId;
        if (!issue || !plan.caseIds.includes(id) || generated.filename !== `tests/generated/issue-${issue.number}.spec.js` || !issue.body.includes(`<!-- orangehrm-case:${id} -->`)) throw new Error('Invalid generated test mapping');
        const source = generateTest(id);
        if (generated.source !== source) throw new Error('Noncanonical generated source');
        prs.push(await github.createPR(issue, generated.filename, source));
      }
      await writeReportFile('published-prs', prs);
      await out('count', prs.length);
    } else if (stage === 'revisor') {
      const github = new GitHub({ repository: plan.repository });
      const expected = await readReportFile('published-prs');
      const originalAll = github.all.bind(github);
      github.all = async suffix => {
        const rows = await originalAll(suffix);
        return suffix.startsWith('/pulls?') ? rows.filter(p => expected.some(e => e.number === p.number)) : rows;
      };
      await review({ ...options, github });
    } else if (stage === 'publicar-revisoes') {
      if (!plan.publish) throw new Error('Publication disabled');
      const github = new GitHub({ repository: plan.repository });
      const results = await readReportFile('review');
      const expected = await readReportFile('published-prs');
      for (const result of results) {
        if (result.verdict === 'inconclusive') continue;
        if (!['approve', 'wontfix'].includes(result.verdict) || !plan.caseIds.includes(result.caseId)) throw new Error('Invalid review');
        const pr = expected.find(p => p.number === result.pr && p.head.sha === result.head);
        if (!pr || (result.verdict === 'approve' && (!result.validSource || result.observation?.status !== 'finding'))) throw new Error('Unsupported approval');
        await github.commentReview(pr, `### Auditoria: ${result.verdict}\n\n${result.rationale}\n\nSHA: ${result.head}\n\nParecer técnico por comentário, sem aprovação formal ou merge.\n\n\`\`\`json\n${JSON.stringify(result.observation, null, 2)}\n\`\`\``);
      }
    } else throw new Error(`Unknown stage: ${stage}`);
  }
  await writeReportFile(`${stage}-status`, { status: 'completed', timestamp: new Date().toISOString() });
} catch (error) {
  await writeReportFile(`${stage}-status`, { status: 'blocked', reason: error.message });
  console.error(error.message); process.exitCode = 1;
}
