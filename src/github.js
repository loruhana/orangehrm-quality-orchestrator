export class GitHub {
  constructor({ repository = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN, fetcher = fetch } = {}) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Set GITHUB_REPOSITORY=owner/repo');
    if (!token) throw new Error('Set GITHUB_TOKEN with contents, issues and pull requests write permissions');
    this.repository = repository; this.token = token; this.fetcher = fetcher;
  }
  async request(method, path, body) {
    const response = await this.fetcher(`https://api.github.com${path}`, {
      method, headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  path(suffix) { return `/repos/${this.repository}${suffix}`; }
  async all(suffix) {
    const results = [];
    for (let page = 1; ; page++) {
      const rows = await this.request('GET', this.path(`${suffix}${suffix.includes('?') ? '&' : '?'}per_page=100&page=${page}`));
      results.push(...rows);
      if (rows.length < 100) return results;
    }
  }
  async ensureIssue(finding, body) {
    const marker = `<!-- orangehrm-audit:${finding.id} -->`;
    const existing = (await this.all('/issues?state=all')).find(i => !i.pull_request && i.body?.includes(marker));
    if (existing) return existing;
    return this.request('POST', this.path('/issues'), { title: `[Audit] ${finding.title}`, body: `${marker}\n${body}` });
  }
  async createPR(issue, filename, source) {
    const branch = `audit/issue-${issue.number}`;
    const existing = (await this.all('/pulls?state=all')).find(p => p.head.ref === branch);
    if (existing) return existing;
    const repo = await this.request('GET', this.path(''));
    const base = repo.default_branch;
    const ref = await this.request('GET', this.path(`/git/ref/heads/${base}`));
    try { await this.request('POST', this.path('/git/refs'), { ref: `refs/heads/${branch}`, sha: ref.object.sha }); }
    catch (error) {
      // Resume a partial run only if the branch exists; do not swallow permission errors.
      if (!error.message.endsWith('HTTP 422')) throw error;
      await this.request('GET', this.path(`/git/ref/heads/${branch}`));
    }
    let existingFile;
    try { existingFile = await this.request('GET', this.path(`/contents/${filename}?ref=${branch}`)); }
    catch (error) { if (!error.message.endsWith('HTTP 404')) throw error; }
    if (!existingFile || Buffer.from(existingFile.content, 'base64').toString() !== source) {
      const author = { name: 'loruhana', email: '118454846+loruhana@users.noreply.github.com' };
      await this.request('PUT', this.path(`/contents/${filename}`), { author, committer: author, message: `test: reproduce issue #${issue.number}`, branch, content: Buffer.from(source).toString('base64'), ...(existingFile ? { sha: existingFile.sha } : {}) });
    }
    return this.request('POST', this.path('/pulls'), { title: `test: reproduce #${issue.number}`, head: branch, base,
      body: `Regression test in Page Object Model for #${issue.number}.\n\nThe test asserts correct behavior and is expected to fail while the external product defect remains. This PR does not fix OrangeHRM.\n\n<!-- orangehrm-issue:${issue.number} -->` });
  }
  async commentReview(pr, body) {
    const marker = `<!-- orangehrm-review:${pr.head.sha} -->`;
    const comments = await this.all(`/issues/${pr.number}/comments`);
    if (comments.some(c => c.body?.includes(marker))) return;
    const fresh = await this.request('GET', this.path(`/pulls/${pr.number}`));
    if (fresh.head.sha !== pr.head.sha) throw new Error('PR head changed during review; rerun review');
    return this.request('POST', this.path(`/issues/${pr.number}/comments`), { body: `${marker}\n${body}` });
  }
}
