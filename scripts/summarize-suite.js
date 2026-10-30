import { readFile, appendFile, mkdir, writeFile } from 'node:fs/promises';
let markdown;
try {
  const report = JSON.parse(await readFile('audit-output/mapped-results.json', 'utf8'));
  const stats = report.stats;
  markdown = `# Todos os testes mapeados\n\nAgendamento: 08:30 e 16:00 — America/Sao_Paulo.\n\n| Resultado | Quantidade |\n|---|---:|\n| Passaram | ${stats.expected} |\n| Falharam | ${stats.unexpected} |\n| Ignorados | ${stats.skipped} |\n| Instáveis | ${stats.flaky} |\n\nFalhas conhecidas continuam falhando: não são convertidas em sucesso. Consulte screenshots, traces e relatório HTML no artifact.\n`;
} catch {
  markdown = '# Execução bloqueada\n\nRelatório Playwright indisponível. Os testes não foram classificados como aprovados.\n';
}
await mkdir('audit-output', { recursive: true });
await writeFile('audit-output/mapped-summary.md', markdown);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
