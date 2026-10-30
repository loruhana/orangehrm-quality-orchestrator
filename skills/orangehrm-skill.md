# OrangeHRM Navigator
Base: https://opensource-demo.orangehrmlive.com
Login: /web/index.php/auth/login. Credenciais públicas do demo: Admin / admin123; variáveis ORANGEHRM_USERNAME e ORANGEHRM_PASSWORD permitem substituição local.
Após login: /web/index.php/dashboard/index.
Menu lateral: PIM (funcionários), Leave (férias), Time (horas), Recruitment (candidatos), Performance (avaliações).
Use locators por papel e nome; senha usa input[name="password"]. H6 identifica o módulo aberto.
Não confunda os rótulos visuais com nomes acessíveis: examine a árvore de acessibilidade.
Use contextos de navegador isolados em cada caso. Timeout e indisponibilidade são inconclusivos.
No login, axe-core verifica color-contrast, html-has-lang e link-name. Cada regra é um caso; múltiplos elementos afetados pela mesma regra ficam na mesma issue. Resultados incomplete do axe são inconclusivos, não ausência de defeito.
Os casos e contratos executáveis vivem em src/catalog.js e src/pages.js. Não publique um caso sem reprodução repetida consistente.
Não persistir alterações de dados no demo compartilhado. Personas são perspectivas, não diferentes identidades autenticadas.
Evidências brutas ficam em artifacts (ignorado pelo Git). Antes de publicar evidência nova, remova dados pessoais e segredos; os probes atuais de login não extraem registros de RH.
