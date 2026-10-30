import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export class LoginPage {
  constructor(page) {
    this.page = page;
    this.username = page.getByRole('textbox', { name: 'Username' });
    this.password = page.locator('input[name="password"]');
    this.submit = page.getByRole('button', { name: 'Login', exact: true });
  }
  async open() {
    const response = await this.page.goto('/web/index.php/auth/login');
    if (!response || response.status() >= 500) throw new Error('Environment unavailable: login HTTP response');
    await this.submit.waitFor();
  }
  async login(username = process.env.ORANGEHRM_USERNAME || 'Admin', password = process.env.ORANGEHRM_PASSWORD || 'admin123') {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.submit.click();
  }
}

export class OrangeHRMPage {
  constructor(page) { this.page = page; }
  async openModule(name) {
    await this.page.getByRole('link', { name, exact: true }).click();
    await expect(this.page.locator('h6').first()).toBeVisible();
  }
}

// Shared oracle: probes and generated regression tests use the same observable contract.
export async function executeCase(page, id) {
  const login = new LoginPage(page);
  await login.open();
  if (id.startsWith('a11y-')) {
    const rule = { 'a11y-color-contrast': 'color-contrast', 'a11y-html-lang': 'html-has-lang', 'a11y-link-name': 'link-name' }[id];
    if (!rule) throw new Error(`Unsupported accessibility case: ${id}`);
    const result = await new AxeBuilder({ page }).withRules([rule]).analyze();
    if (result.incomplete.some(item => item.id === rule)) throw new Error(`Accessibility check incomplete: ${rule}`);
    return { actual: result.violations.length, expected: 0,
      details: result.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
        nodes: v.nodes.map(n => ({ target: n.target, failureSummary: n.failureSummary })) })) };
  }
  if (id === 'login-required') {
    await login.submit.click();
    const required = page.getByText('Required', { exact: true });
    // React/Vue rendering can finish after click resolves on a fast CI runner.
    // Preserve the observed defect when the UI still fails to validate after the deadline.
    await expect.poll(() => required.count(), { timeout: 5000 }).toBe(2).catch(() => {});
    return { actual: await required.count(), expected: 2 };
  }
  if (id === 'login-invalid') {
    await login.login('audit-invalid-user', 'audit-invalid-password');
    await page.getByText('Invalid credentials', { exact: true }).waitFor();
    return { actual: page.url().includes('/auth/login'), expected: true };
  }
  if (id === 'login-accessible-names') {
    const names = await Promise.all([login.username, login.password].map(async field => {
      const snapshot = await field.ariaSnapshot();
      return snapshot;
    }));
    return { actual: names.every(value => /textbox\s+"[^"\n]+"/.test(value)), expected: true, details: names };
  }
  await login.login();
  await page.waitForURL('**/dashboard/index');
  if (id === 'login-valid') return { actual: true, expected: true };
  const module = { 'module-pim': 'PIM', 'module-leave': 'Leave', 'module-recruitment': 'Recruitment', 'module-time': 'Time', 'module-performance': 'Performance' }[id];
  if (!module) throw new Error(`Unknown case: ${id}`);
  await new OrangeHRMPage(page).openModule(module);
  const heading = await page.locator('h6').first().innerText();
  return { actual: heading.toLowerCase().includes(module.toLowerCase()), expected: true, details: heading };
}
