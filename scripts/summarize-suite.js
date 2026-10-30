import { readFile, appendFile, mkdir, writeFile } from 'node:fs/promises';
let markdown;
try {
  const report = JSON.parse(await readFile('audit-output/mapped-results.json', 'utf8'));
  const stats = report.stats;
  const rows = [];
  const visit = suite => {
    for (const spec of suite.specs || []) for (const test of spec.tests || []) {
      const result = test.results.at(-1);
      const errors = (result?.errors || []).map(e => e.message || '').join('\n');
      const status = result?.status === 'passed' ? 'aprovado' : result?.status === 'skipped' ? 'não executado' : /incomplete|Timeout|Environment unavailable|net::/.test(errors) ? 'inconclusivo/bloqueado' : 'falha de asserção';
      rows.push(`| ${spec.title.replaceAll('|', '/')} | ${status} |`);
    }
    for (const child of suite.suites || []) visit(child);
  };
  for (const suite of report.suites || []) visit(suite);
  markdown = `# Todos os testes mapeados\n\nAgendamento: 08:30 e 16:00 — America/Sao_Paulo.\n\n| Resultado Playwright | Quantidade |\n|---|---:|\n| Passaram | ${stats.expected} |\n| Não passaram | ${stats.unexpected} |\n| Ignorados | ${stats.skipped} |\n| Instáveis | ${stats.flaky} |\n\n| Caso | Classificação |\n|---|---|\n${rows.join('\n')}\n\nResultados inconclusivos não confirmam bugs e não são convertidos em sucesso. Consulte screenshots, traces e relatório HTML no artifact.\n`;
} catch {
  markdown = '# Execução bloqueada\n\nRelatório Playwright indisponível. Os testes não foram classificados como aprovados.\n';
}
await mkdir('audit-output', { recursive: true });
await writeFile('audit-output/mapped-summary.md', markdown);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
