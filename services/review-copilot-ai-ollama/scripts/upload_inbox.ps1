[CmdletBinding()]
param(
    [string]$ApiUrl = $(if ($env:REVIEW_COPILOT_API_URL) { $env:REVIEW_COPILOT_API_URL } else { "http://127.0.0.1:8000" }),
    [string]$Inbox = $(if ($env:KNOWLEDGE_INBOX_DIR) { $env:KNOWLEDGE_INBOX_DIR } else { Join-Path (Split-Path $PSScriptRoot -Parent) "knowledge\inbox" }),
    [string]$ProjectId = $(if ($env:SEED_PROJECT_ID) { $env:SEED_PROJECT_ID } else { "mvp-ramp" }),
    [string]$SourceKind = $(if ($env:SEED_SOURCE_KIND) { $env:SEED_SOURCE_KIND } else { "seed_file" }),
    [switch]$DryRun
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$supportedExtensions = @(".csv", ".pdf", ".docx", ".pptx", ".xlsx", ".json", ".txt", ".md")
$endpoint = $ApiUrl.TrimEnd("/") + "/api/v1/knowledge/documents"
$healthEndpoint = $ApiUrl.TrimEnd("/") + "/api/v1/health"

if (-not (Test-Path -LiteralPath $Inbox -PathType Container)) {
    throw "Inbox folder does not exist: $Inbox"
}

$files = @(
    Get-ChildItem -LiteralPath $Inbox -File |
        Where-Object {
            -not $_.Name.StartsWith(".") -and
            $supportedExtensions -contains $_.Extension.ToLowerInvariant()
        } |
        Sort-Object Name
)

if ($files.Count -eq 0) {
    Write-Host "No supported files found in $Inbox"
    exit 0
}

if ($DryRun) {
    foreach ($file in $files) {
        Write-Host "[DRY RUN] $($file.FullName)"
    }
    Write-Host "Dry run complete: $($files.Count) supported file(s)."
    exit 0
}

try {
    Invoke-WebRequest -UseBasicParsing -Uri $healthEndpoint -TimeoutSec 10 | Out-Null
}
catch {
    throw "API is not ready at $ApiUrl. Start it with .\scripts\start_ollama_windows.ps1 first."
}

Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$uploaded = 0
$failed = 0

try {
    foreach ($file in $files) {
        Write-Host "Uploading: $($file.Name)"
        $form = New-Object System.Net.Http.MultipartFormDataContent
        $stream = $null
        $fileContent = $null
        $sourceContent = $null
        $projectContent = $null

        try {
            $stream = [System.IO.File]::OpenRead($file.FullName)
            $fileContent = New-Object System.Net.Http.StreamContent -ArgumentList $stream
            $fileContent.Headers.ContentType = New-Object System.Net.Http.Headers.MediaTypeHeaderValue -ArgumentList "application/octet-stream"
            $sourceContent = New-Object System.Net.Http.StringContent -ArgumentList $SourceKind
            $projectContent = New-Object System.Net.Http.StringContent -ArgumentList $ProjectId

            $form.Add($fileContent, "files", $file.Name)
            $form.Add($sourceContent, "source_kind")
            $form.Add($projectContent, "project_id")

            $response = $client.PostAsync($endpoint, $form).GetAwaiter().GetResult()
            $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            if ($response.IsSuccessStatusCode) {
                $uploaded += 1
                Write-Host "  OK: $body"
            }
            else {
                $failed += 1
                Write-Error "  FAILED (HTTP $([int]$response.StatusCode)): $body" -ErrorAction Continue
            }
            $response.Dispose()
        }
        catch {
            $failed += 1
            Write-Error "  FAILED: $($_.Exception.Message)" -ErrorAction Continue
        }
        finally {
            if ($form) { $form.Dispose() }
        }
    }
}
finally {
    $client.Dispose()
}

Write-Host "Upload complete: $uploaded succeeded, $failed failed."
if ($failed -gt 0) { exit 1 }
