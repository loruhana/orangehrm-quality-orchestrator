---
name: orangehrm-navigator
description: Explore OrangeHRM demo workflows and reproduce audit findings with this repository's Playwright Page Objects and four sequential Codex agents.
---

Read [navigation reference](../../../skills/orangehrm-skill.md), the canonical file at <repo>/skills/orangehrm-skill.md.
Use <repo>/agents/explorador.md, automatizador.md or revisor.md for the requested stage.
Run npm run audit for evidence collection without GitHub writes. Run npm run pipeline -- --authorized --publish only when publication is authorized and GITHUB_REPOSITORY identifies the intended repository.
Use npm run demo to validate infrastructure without contacting the public demo or GitHub. This fixture is synthetic and must never become a public product bug.
For new scenarios extend src/catalog.js and src/pages.js and validate a failing and passing control before publication.

Use agents/orquestrador.md and npm run pipeline -- --authorized to coordinate scope, prerequisites and downstream stages. Reports must distinguish blocked, partial, completed and skipped.
