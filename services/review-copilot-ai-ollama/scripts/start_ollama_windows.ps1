[CmdletBinding()]
param(
    [switch]$Yes,
    [switch]$SetupOnly,
    [switch]$DryRun,
    [string]$Model = $(if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "qwen3.5:4b" }),
    [string]$EmbeddingModel = $(if ($env:OLLAMA_EMBEDDING_MODEL) { $env:OLLAMA_EMBEDDING_MODEL } else { "embeddinggemma" })
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$projectDir = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $projectDir ".env"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message"
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Confirm-Action([string]$Message) {
    if ($Yes) { return }
    $answer = Read-Host "$Message [y/N]"
    if ($answer -notin @("y", "Y")) { throw "Cancelled." }
}

if ($env:OS -ne "Windows_NT") {
    throw "This script is for Windows. On macOS/Linux use start_ollama_mac.sh."
}

Write-Step "1/5 Check Ollama"
if (-not (Test-Command "ollama.exe")) {
    Confirm-Action "Ollama is missing. Install it now?"
    if ($DryRun) {
        Write-Host "[DRY RUN] winget install --exact --id Ollama.Ollama"
    }
    else {
        if (-not (Test-Command "winget.exe")) {
            throw "winget is required. Install Ollama from https://ollama.com/download/windows"
        }
        & winget.exe install --exact --id Ollama.Ollama --source winget --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) { throw "Ollama installation failed." }
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        $env:Path += ";" + (Join-Path $env:LOCALAPPDATA "Programs\Ollama")
    }
}
elseif (-not $DryRun) {
    & ollama.exe --version
}

Write-Step "2/5 Start Ollama"
if ($DryRun) {
    Write-Host "[DRY RUN] Start Ollama and wait for port 11434."
}
else {
    try { Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2 | Out-Null }
    catch {
        Start-Process -FilePath "ollama.exe" -ArgumentList "serve" -WindowStyle Hidden
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
            try {
                Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2 | Out-Null
                $ready = $true
                break
            }
            catch { Start-Sleep -Seconds 1 }
        }
        if (-not $ready) { throw "Ollama did not start on port 11434." }
    }
}

Write-Step "3/5 Pull local models"
if ($DryRun) {
    Write-Host "[DRY RUN] ollama pull $Model"
    Write-Host "[DRY RUN] ollama pull $EmbeddingModel"
}
else {
    & ollama.exe pull $Model
    if ($LASTEXITCODE -ne 0) { throw "Failed to pull $Model." }
    & ollama.exe pull $EmbeddingModel
    if ($LASTEXITCODE -ne 0) { throw "Failed to pull $EmbeddingModel." }
}

Write-Step "4/5 Prepare FastAPI"
if ($DryRun) {
    Write-Host "[DRY RUN] Create .venv, install project, and create .env."
}
else {
    if (-not (Test-Command "py.exe")) { throw "Python 3.11 or later is required." }
    & py.exe -3 -c "import sys; raise SystemExit(sys.version_info < (3, 11))"
    if ($LASTEXITCODE -ne 0) { throw "Python 3.11 or later is required." }
    $venvPython = Join-Path $projectDir ".venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $venvPython)) { & py.exe -3 -m venv (Join-Path $projectDir ".venv") }
    & $venvPython -m pip install -e "${projectDir}[dev]"
    if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }
    if (-not (Test-Path -LiteralPath $envFile)) { Copy-Item (Join-Path $projectDir ".env.example") $envFile }
}

Write-Step "5/5 Complete"
if ($DryRun) {
    Write-Host "Dry run complete. Nothing was installed or started."
}
elseif ($SetupOnly) {
    Write-Host "Setup complete. Run this script again to start FastAPI."
}
else {
    foreach ($line in [System.IO.File]::ReadAllLines($envFile)) {
        if ($line -match "^([^#=]+)=(.*)$") { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] }
    }
    Write-Host "FastAPI: http://127.0.0.1:8000  Docs: http://127.0.0.1:8000/docs"
    & (Join-Path $projectDir ".venv\Scripts\python.exe") -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
}
