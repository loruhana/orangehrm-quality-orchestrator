import { createServer } from 'node:http';
export async function startFixture({ buggy = false } = {}) {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="en"><title>LOCAL SYNTHETIC FIXTURE</title><body>
      <h1>Local fixture, not OrangeHRM</h1>
      <form><input name="username" placeholder="Username" aria-label="Username"><input name="password" type="password" placeholder="Password" aria-label="Password"><button>Login</button></form><div id="errors"></div>
      <script>document.querySelector('form').onsubmit = e => {e.preventDefault();
      const u=document.querySelector('[name=username]').value,p=document.querySelector('[name=password]').value;
      document.querySelector('#errors').innerHTML=(!u||!p)?'${buggy ? '' : '<span>Required</span><span>Required</span>'}':'<span>Invalid credentials</span>';};</script>
      </body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { baseURL: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}
