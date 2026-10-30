export const cases = [
  { id: 'a11y-color-contrast', title: 'Login apresenta contraste de texto insuficiente (WCAG AA)', persona: 'funcionario-junior', steps: ['Abrir login', 'Executar axe-core com a regra color-contrast', 'Inspecionar botão Login e instruções de credenciais'], expected: 'Nenhuma violação de contraste WCAG AA na tela de login' },
  { id: 'a11y-html-lang', title: 'Documento do login não declara idioma', persona: 'funcionario-junior', steps: ['Abrir login', 'Inspecionar atributo lang do elemento html com axe-core html-has-lang'], expected: 'Documento declara idioma para tecnologias assistivas' },
  { id: 'a11y-link-name', title: 'Links sociais do login não têm nome acessível', persona: 'funcionario-junior', steps: ['Abrir login', 'Executar axe-core link-name', 'Inspecionar links sociais no rodapé'], expected: 'Todo link tem nome acessível não vazio' },
  { id: 'login-required', title: 'Login informa obrigatoriedade dos dois campos vazios', persona: 'funcionario-junior', steps: ['Abrir login', 'Clicar Login sem preencher campos'], expected: 'Exibir duas mensagens Required' },
  { id: 'login-invalid', title: 'Login rejeita credenciais inválidas', persona: 'funcionario-junior', steps: ['Abrir login', 'Preencher usuário e senha inválidos', 'Clicar Login'], expected: 'Exibir Invalid credentials e permanecer no login' },
  { id: 'login-accessible-names', title: 'Campos de login têm nomes acessíveis', persona: 'funcionario-junior', steps: ['Abrir login', 'Inspecionar nomes dos campos na árvore de acessibilidade'], expected: 'Username e Password têm nomes acessíveis não vazios' },
  { id: 'login-valid', title: 'Administrador acessa dashboard', persona: 'rh-admin', steps: ['Abrir login', 'Entrar com credenciais do demo'], expected: 'Dashboard exibido' },
  ...[['pim', 'PIM', 'rh-admin'], ['leave', 'Leave', 'gestor-time'], ['recruitment', 'Recruitment', 'rh-admin'], ['time', 'Time', 'gestor-time'], ['performance', 'Performance', 'gestor-time']].map(([id, name, persona]) => ({ id: `module-${id}`, title: `Módulo ${name} abre pelo menu`, persona, steps: ['Entrar no demo', `Selecionar ${name} no menu lateral`], expected: `Cabeçalho contém ${name}` }))
];
export function getCase(id) {
  const result = cases.find(item => item.id === id);
  if (!result) throw new Error(`Unsupported case: ${id}`);
  return result;
}
