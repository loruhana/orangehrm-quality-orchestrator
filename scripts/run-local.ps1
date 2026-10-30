param([string]$Module = 'all', [string]$Instruction = 'Auditar todos os casos mapeados sem alterar registros do demo')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$previousToken = $env:GITHUB_TOKEN
$previousRepository = $env:GITHUB_REPOSITORY
try {
  $env:GITHUB_REPOSITORY = 'loruhana/orangehrm-quality-orchestrator'
  if (!$env:GITHUB_TOKEN) {
    $credentialLines = "protocol=https`nhost=github.com`nusername=loruhana`n`n" | git credential fill
    if ($LASTEXITCODE -ne 0) { throw 'Autentique loruhana no Git Credential Manager.' }
    foreach ($line in $credentialLines) { if ($line -match '^password=(.*)$') { $env:GITHUB_TOKEN = $matches[1] } }
    if (!$env:GITHUB_TOKEN) { throw 'Credencial loruhana indisponível.' }
  }
  node src/cli.js pipeline --authorized --module $Module --instruction $Instruction --publish
  if ($LASTEXITCODE -ne 0) { throw 'Pipeline bloqueado; consulte audit-output/summary.md' }
} finally {
  if ($previousToken) { $env:GITHUB_TOKEN=$previousToken } else { Remove-Item Env:GITHUB_TOKEN -ErrorAction SilentlyContinue }
  if ($previousRepository) { $env:GITHUB_REPOSITORY=$previousRepository } else { Remove-Item Env:GITHUB_REPOSITORY -ErrorAction SilentlyContinue }
}
