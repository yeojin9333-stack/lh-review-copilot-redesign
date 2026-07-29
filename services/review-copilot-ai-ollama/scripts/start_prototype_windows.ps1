[CmdletBinding()]
param(
    [switch]$Yes,
    [switch]$SetupOnly,
    [switch]$DryRun,
    [string]$FrontendDir = $(
        if ($env:LH_FRONTEND_DIR) { $env:LH_FRONTEND_DIR }
        else { Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent }
    ),
    [string]$Model = $(if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "qwen3.5:4b" }),
    [string]$EmbeddingModel = $(if ($env:OLLAMA_EMBEDDING_MODEL) { $env:OLLAMA_EMBEDDING_MODEL } else { "embeddinggemma" })
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$projectDir = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $projectDir ".env"
$backendProcess = $null

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message"
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Confirm-Action([string]$Message) {
    if ($Yes -or $DryRun) { return }
    $answer = Read-Host "$Message [y/N]"
    if ($answer -notin @("y", "Y")) { throw "Cancelled." }
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
    if ($env:LOCALAPPDATA) {
        $env:Path += ";" + (Join-Path $env:LOCALAPPDATA "Programs\Ollama")
    }
}

function Ensure-WinGet {
    if (Test-Command "winget.exe") { return }
    if ($DryRun) {
        Write-Host "[DRY RUN] Register or repair Microsoft WinGet if missing."
        return
    }
    Confirm-Action "Microsoft WinGet is missing. Register or repair it now?"
    try {
        Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe -ErrorAction Stop
    }
    catch {
        Write-Host "App Installer registration was unavailable; repairing WinGet with Microsoft's module."
        Install-PackageProvider -Name NuGet -Force -Scope CurrentUser | Out-Null
        Install-Module -Name Microsoft.WinGet.Client -Force -Repository PSGallery -Scope CurrentUser | Out-Null
        Import-Module Microsoft.WinGet.Client
        Repair-WinGetPackageManager -Force -Latest | Out-Null
    }
    Refresh-Path
    if (-not (Test-Command "winget.exe")) { throw "WinGet installation failed. Install Microsoft App Installer and retry." }
}

function Install-WinGetPackage([string]$Id, [string]$Label) {
    if ($DryRun) {
        Write-Host "[DRY RUN] Install $Label with WinGet if missing or too old."
        return
    }
    Confirm-Action "$Label is missing or too old. Install it with WinGet?"
    & winget.exe install --exact --id $Id --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw "$Label installation failed." }
    Refresh-Path
}

function Test-NodeVersion {
    if (-not (Test-Command "node.exe")) { return $false }
    & node.exe -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)'
    return ($LASTEXITCODE -eq 0)
}

function Resolve-Python {
    if (Test-Command "py.exe") {
        $resolved = (& py.exe -3 -c "import sys; print(sys.executable)" 2>$null)
        if ($LASTEXITCODE -eq 0 -and $resolved) { return $resolved.Trim() }
    }
    if (Test-Command "python.exe") {
        $resolved = (& python.exe -c "import sys; print(sys.executable)" 2>$null)
        if ($LASTEXITCODE -eq 0 -and $resolved) { return $resolved.Trim() }
    }
    return $null
}

function Test-PythonVersion([string]$PythonExe) {
    if (-not $PythonExe) { return $false }
    & $PythonExe -c "import sys; raise SystemExit(sys.version_info < (3, 11))"
    return ($LASTEXITCODE -eq 0)
}

function Wait-ForUrl([string]$Url, [int]$Attempts = 30) {
    for ($attempt = 0; $attempt -lt $Attempts; $attempt += 1) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 | Out-Null
            return $true
        }
        catch { Start-Sleep -Seconds 1 }
    }
    return $false
}

function Test-Url([string]$Url) {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 | Out-Null
        return $true
    }
    catch { return $false }
}

function Set-FrontendEnvironment {
    $target = Join-Path $FrontendDir ".env.local"
    $key = "REVIEW_COPILOT_API_URL"
    $line = "$key=http://127.0.0.1:8000"
    if (-not (Test-Path -LiteralPath $target)) {
        [IO.File]::WriteAllText($target, "$line`r`n")
        return
    }
    $lines = [Collections.Generic.List[string]]::new()
    $found = $false
    foreach ($current in [IO.File]::ReadAllLines($target)) {
        if ($current -match "^$key=") {
            $lines.Add($line)
            $found = $true
        }
        else { $lines.Add($current) }
    }
    if (-not $found) { $lines.Add($line) }
    [IO.File]::WriteAllLines($target, $lines)
}

if ($env:OS -ne "Windows_NT") {
    throw "This script is for Windows. On macOS use start_prototype_mac.sh."
}

Write-Step "1/6 Check Windows package installer"
Ensure-WinGet
if ((Test-Command "winget.exe") -and -not $DryRun) { Write-Host "WinGet: $(& winget.exe --version)" }

Write-Step "2/6 Check Ollama and local models"
if (-not (Test-Command "ollama.exe")) { Install-WinGetPackage "Ollama.Ollama" "Ollama" }
elseif (-not $DryRun) { & ollama.exe --version }
if ($DryRun) {
    Write-Host "[DRY RUN] Start Ollama and pull $Model and $EmbeddingModel only when absent."
}
else {
    if (-not (Test-Url "http://127.0.0.1:11434/api/tags")) {
        Start-Process -FilePath "ollama.exe" -ArgumentList "serve" -WindowStyle Hidden
        if (-not (Wait-ForUrl "http://127.0.0.1:11434/api/tags" 30)) { throw "Ollama did not start on port 11434." }
    }
    & ollama.exe show $Model *> $null
    if ($LASTEXITCODE -ne 0) { & ollama.exe pull $Model }
    if ($LASTEXITCODE -ne 0) { throw "Failed to prepare $Model." }
    & ollama.exe show $EmbeddingModel *> $null
    if ($LASTEXITCODE -ne 0) { & ollama.exe pull $EmbeddingModel }
    if ($LASTEXITCODE -ne 0) { throw "Failed to prepare $EmbeddingModel." }
}

Write-Step "3/6 Check Python and prepare FastAPI"
$pythonExe = Resolve-Python
if (-not (Test-PythonVersion $pythonExe)) {
    Install-WinGetPackage "Python.Python.3.13" "Python 3.11 or later"
    $pythonExe = Resolve-Python
    if (-not $DryRun -and -not (Test-PythonVersion $pythonExe)) { throw "Python 3.11 or later was not found after installation." }
}
elseif (-not $DryRun) { Write-Host "Python: $(& $pythonExe --version)" }
if ($DryRun) {
    Write-Host "[DRY RUN] Create the backend virtual environment, install dependencies, and create .env when absent."
}
else {
    $venvPython = Join-Path $projectDir ".venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $venvPython)) { & $pythonExe -m venv (Join-Path $projectDir ".venv") }
    & $venvPython -c "import fastapi, uvicorn, pydantic, openpyxl, pypdf, docx, pptx, multipart" 2>$null
    if ($LASTEXITCODE -ne 0) {
        & $venvPython -m pip install -e "${projectDir}[dev]"
        if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }
    }
    else { Write-Host "FastAPI dependencies: already installed" }
    if (-not (Test-Path -LiteralPath $envFile)) { Copy-Item (Join-Path $projectDir ".env.example") $envFile }
}

Write-Step "4/6 Check Node.js and pnpm"
if (-not (Test-NodeVersion)) { Install-WinGetPackage "OpenJS.NodeJS.LTS" "Node.js 22.13 or later" }
elseif (-not $DryRun) { Write-Host "Node.js: $(& node.exe --version)" }
if (-not $DryRun -and -not (Test-NodeVersion)) { throw "Node.js 22.13 or later was not found after installation." }
if (-not (Test-Command "pnpm.cmd")) {
    if ($DryRun) { Write-Host "[DRY RUN] Install pnpm 11 globally with npm if missing." }
    else {
        Confirm-Action "pnpm is missing. Install pnpm 11 with npm?"
        & npm.cmd install --global pnpm@11
        if ($LASTEXITCODE -ne 0) { throw "pnpm installation failed." }
        Refresh-Path
    }
}
elseif (-not $DryRun) { Write-Host "pnpm: $(& pnpm.cmd --version)" }

Write-Step "5/6 Configure and install frontend"
if ($DryRun) {
    Write-Host "[DRY RUN] Validate $FrontendDir, set .env.local, verify approved package builds, and install locked dependencies."
}
else {
    if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "package.json")) -or
        -not (Test-Path -LiteralPath (Join-Path $FrontendDir "pnpm-lock.yaml"))) {
        throw "Frontend not found at $FrontendDir. Use -FrontendDir PATH."
    }
    Set-FrontendEnvironment
    Push-Location $FrontendDir
    try {
        & pnpm.cmd install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
    }
    finally { Pop-Location }
}

Write-Step "6/6 Complete"
if ($DryRun) {
    Write-Host "Dry run complete. Nothing was installed, changed, or started."
}
elseif ($SetupOnly) {
    Write-Host "Setup complete. Run this script again to start both servers."
}
else {
    try {
        if (Test-Url "http://127.0.0.1:8000/api/v1/health") {
            Write-Host "FastAPI: already running at http://127.0.0.1:8000"
        }
        else {
            $venvPython = Join-Path $projectDir ".venv\Scripts\python.exe"
            foreach ($line in [IO.File]::ReadAllLines($envFile)) {
                if ($line -match "^([^#=]+)=(.*)$") { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] }
            }
            $backendProcess = Start-Process -FilePath $venvPython `
                -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
                -WorkingDirectory $projectDir -PassThru -WindowStyle Hidden
            if (-not (Wait-ForUrl "http://127.0.0.1:8000/api/v1/health" 30)) { throw "FastAPI did not start." }
            Write-Host "FastAPI: http://127.0.0.1:8000  Docs: http://127.0.0.1:8000/docs"
        }
        Write-Host "Frontend is starting. Press Ctrl+C to stop this session."
        Push-Location $FrontendDir
        try { & pnpm.cmd dev }
        finally { Pop-Location }
    }
    finally {
        if ($backendProcess -and -not $backendProcess.HasExited) { Stop-Process -Id $backendProcess.Id -Force }
    }
}
