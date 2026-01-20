param(
  [Parameter(Mandatory = $true)]
  [string]$RepoName,

  [string]$Description = "Pure frontend viewer for ChatGPT exported conversation JSON (mapping/current_node)",

  [switch]$Private
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Missing required command: $Name"
  }
}

Require-Command git

if (-not (Test-Path ".git")) {
  throw "This folder is not a git repository. Run: git init"
}

$token = $env:GITHUB_TOKEN
if (-not $token) {
  throw "Missing GITHUB_TOKEN. Create a GitHub Personal Access Token and set it, e.g.: `$env:GITHUB_TOKEN='...'"
}

$body = @{
  name        = $RepoName
  description = $Description
  private     = [bool]$Private
  auto_init   = $false
  has_issues  = $true
  has_wiki    = $false
} | ConvertTo-Json

$headers = @{
  Authorization        = "Bearer $token"
  Accept               = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
  "User-Agent"         = "chatgpt-export-viewer"
}

Write-Host "Creating GitHub repo: $RepoName (private=$([bool]$Private)) ..."
$repo = Invoke-RestMethod -Method Post -Uri "https://api.github.com/user/repos" -Headers $headers -Body $body

$remoteUrl = $repo.clone_url
if (-not $remoteUrl) {
  throw "GitHub API did not return clone_url"
}

Write-Host "Remote: $remoteUrl"

$existing = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
  git remote set-url origin $remoteUrl | Out-Null
} else {
  git remote add origin $remoteUrl | Out-Null
}

Write-Host "Pushing branch: main"
git push -u origin main

Write-Host "Done: $($repo.html_url)"

