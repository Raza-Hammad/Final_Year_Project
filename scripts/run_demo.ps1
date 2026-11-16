<#
.SYNOPSIS
  One-command Cascadyx demo (Windows PowerShell).

.DESCRIPTION
  Builds the React UI if frontend/dist is missing, activates backend/venv,
  and starts uvicorn on port 8000 so the SPA + /api + /ws share one origin.

.EXAMPLE
  .\scripts\run_demo.ps1
#>
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$DistIndex = Join-Path $Root "frontend\dist\index.html"
if (-not (Test-Path $DistIndex)) {
    Write-Host "==> frontend/dist missing — building production UI..." -ForegroundColor Cyan
    Push-Location (Join-Path $Root "frontend")
    if (-not (Test-Path "node_modules")) {
        npm install
    }
    npm run build
    Pop-Location
    if (-not (Test-Path $DistIndex)) {
        throw "frontend/dist/index.html still missing after npm run build"
    }
} else {
    Write-Host "==> Using existing frontend/dist" -ForegroundColor DarkGray
}

$VenvActivate = Join-Path $Root "backend\venv\Scripts\Activate.ps1"
if (-not (Test-Path $VenvActivate)) {
    throw "backend\venv not found. Create it first: cd backend; python -m venv venv; .\venv\Scripts\Activate.ps1; pip install -r requirements.txt"
}

Write-Host "==> Starting Cascadyx on http://127.0.0.1:8000 (Ctrl+C to stop)" -ForegroundColor Cyan
Write-Host "    UI:      http://127.0.0.1:8000/" -ForegroundColor Gray
Write-Host "    Health:  http://127.0.0.1:8000/api/health" -ForegroundColor Gray
Write-Host "    Docs:    http://127.0.0.1:8000/docs" -ForegroundColor Gray

& $VenvActivate
Set-Location (Join-Path $Root "backend")
# No --reload: stable demo process; models stay loaded once.
uvicorn app.main:app --host 127.0.0.1 --port 8000
