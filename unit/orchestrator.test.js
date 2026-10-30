import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cases } from '../src/catalog.js';
import { selectCases, createPlan, validatePlan, orchestrate } from '../src/orchestrator.js';

test('all covers every mapped case, PIM excludes unrelated modules', () => {
  assert.equal(selectCases('all').length, cases.length);
  assert.deepEqual(selectCases('PIM'), ['login-valid','module-pim']);
  assert.throws(() => selectCases('Payroll'));
});
test('reject unauthorized environment and expanded scope', async () => {
  await assert.rejects(createPlan({authorized:false}), /authorized/);
  await assert.rejects(createPlan({authorized:true,baseURL:'https://example.com'}), /Only/);
  await assert.rejects(createPlan({authorized:true,module:'auto',provider:'rules'}), /requires Codex/);
  await assert.rejects(createPlan({authorized:true,module:'PIM',decide:async()=>({module:'all',personaIds:['rh-admin']})}), /changed explicit/);
});
test('natural language plan is validated against implemented cases', async () => {
  const outputDir = await mkdtemp(join(tmpdir(),'orchestrator-plan-'));
  const plan = await createPlan({authorized:true,module:'auto',instruction:'Audite funcionários',outputDir,decide:async()=>({module:'PIM',personaIds:['rh-admin'],objective:'Funcionários',rationale:'PIM'})});
  assert.deepEqual(plan.caseIds,['login-valid','module-pim']);
  assert.throws(()=>validatePlan({...plan,caseIds:['module-time']}),/differ/);
});
test('no findings skips downstream agents and still creates report', async () => {
  const outputDir = await mkdtemp(join(tmpdir(),'orchestrator-empty-'));
  const summary = await orchestrate({outputDir}, {
    preflight:async()=>{},createPlan:async()=>({caseIds:['login-valid'],baseURL:'https://opensource-demo.orangehrmlive.com'}),
    explore:async()=>({observations:[{status:'pass'}],findings:[]}),
    automate:async()=>{throw new Error('Must not run');},review:async()=>{throw new Error('Must not run');}
  });
  assert.equal(summary.stages.automatizador.status,'skipped');
  assert.equal(summary.status,'completed');
  assert.match(await readFile(join(outputDir,'summary.md'),'utf8'),/skipped/);
});
test('blocked precondition reports failure, never success', async () => {
  const outputDir = await mkdtemp(join(tmpdir(),'orchestrator-blocked-'));
  await assert.rejects(orchestrate({outputDir},{preflight:async()=>{throw new Error('Missing browser');}}),/Missing browser/);
  const summary=JSON.parse(await readFile(join(outputDir,'summary.json'),'utf8'));
  assert.equal(summary.status,'blocked');
  assert.equal(summary.stages.explorador.status,'skipped');
});
test('inconclusive execution is partial and does not create empty PRs', async () => {
  const outputDir=await mkdtemp(join(tmpdir(),'orchestrator-partial-'));
  const result=await orchestrate({outputDir},{preflight:async()=>{},createPlan:async()=>({caseIds:['login-valid']}),explore:async()=>({observations:[{status:'inconclusive'}],findings:[]})});
  assert.equal(result.status,'partial');
  assert.equal(result.stages.revisor.status,'skipped');
});
