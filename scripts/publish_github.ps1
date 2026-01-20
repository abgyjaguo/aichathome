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

Write-Host "Fetching GitHub user ..."
$user = Invoke-RestMethod -Method Get -Uri "https://api.github.com/user" -Headers $headers
$owner = $user.login
if (-not $owner) {
  throw "GitHub API did not return user login"
}

Write-Host "Creating GitHub repo: $RepoName (private=$([bool]$Private)) ..."
try {
  $repo = Invoke-RestMethod -Method Post -Uri "https://api.github.com/user/repos" -Headers $headers -Body $body
} catch {
  Write-Host "Create failed, trying to fetch existing repo: $owner/$RepoName"
  $repo = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$owner/$RepoName" -Headers $headers
}

$remoteUrl = $repo.clone_url
if (-not $remoteUrl) {
  throw "GitHub API did not return clone_url"
}

Write-Host "Remote: $remoteUrl"

if ((git rev-parse --verify HEAD 2>$null) -and $LASTEXITCODE -eq 0) {
  # ok
} else {
  throw "This repository has no commits. Commit something first, then run again."
}

$currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -ne "main") {
  Write-Host "Renaming branch '$currentBranch' to 'main'"
  git branch -M main | Out-Null
}

$remotes = @(git remote)
if ($remotes -contains "origin") {
  git remote set-url origin $remoteUrl | Out-Null
} else {
  git remote add origin $remoteUrl | Out-Null
}

if ($remoteUrl -match "^https://github\\.com/([^/]+)/([^/]+)\\.git$") {
  $owner = $matches[1]
  $repoSlug = $matches[2]
} else {
  $repoSlug = $RepoName
}

$escaped = [uri]::EscapeDataString($token)
$pushUrl = "https://x-access-token:$escaped@github.com/$owner/$repoSlug.git"
git remote set-url --push origin $pushUrl | Out-Null

Write-Host "Pushing branch: main"
git push -u origin main

git remote set-url --push origin $remoteUrl | Out-Null

Write-Host "Done: $($repo.html_url)"
