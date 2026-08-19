# Empire — one-time setup (Windows PowerShell)
# Installs Python + Node dependencies.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> Installing backend Python dependencies" -ForegroundColor Cyan
Push-Location (Join-Path $root "backend")
python -m pip install -r requirements.txt
Pop-Location

Write-Host "==> Installing frontend Node dependencies" -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
npm install
Pop-Location

Write-Host "==> Optional: copy .env.example to backend/.env and set EMPIRE_AI_API_KEY for LLM mode" -ForegroundColor Yellow
Write-Host "Setup complete." -ForegroundColor Green