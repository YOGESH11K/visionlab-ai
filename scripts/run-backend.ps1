# Empire — run backend (Windows PowerShell)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $root "backend")
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
Pop-Location