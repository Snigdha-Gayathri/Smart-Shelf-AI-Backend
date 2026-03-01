<#
start_local.ps1
Automates local startup of backend and frontend for SmartShelf AI on Windows PowerShell.

Usage (from project root):
  powershell -ExecutionPolicy Bypass -File .\scripts\start_local.ps1

This script (safe to run locally) will:
- Unset external API env vars for child processes to enforce local-only operation (OPENAI_API_KEY, HARDCOVER_API_KEY)
- Create a Python virtualenv in backend/.venv (if missing) and install backend/requirements.txt
- Optionally remove caches to force rebuild
- Start backend (uvicorn) in a new PowerShell window using the venv
- Start frontend (Vite) in another PowerShell window with VITE_BACKEND_URL pointing to the backend
- Poll the backend /ready endpoint until ready=true (10 minute timeout)
- Run verification requests against /api/v1/recommend, /api/v1/select_book, /api/v1/history, /api/v1/analytics

Notes:
- The script intentionally removes OPENAI_API_KEY and HARDCOVER_API_KEY from the child environments to keep everything local.
- Installing ML packages may take a long time and requires disk space.
#>

param(
    [switch]$ForceRebuildCaches
)

try {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
    $repoRoot = (Resolve-Path (Join-Path $scriptDir ".." )).ProviderPath
} catch {
    Write-Error "Failed to determine script path: $_"
    exit 2
}

Write-Host "Repo root:" $repoRoot

$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
$venvDir = Join-Path $backendDir '.venv'
$uvicornHost = '127.0.0.1'
$uvicornPort = 8000
$backendUrl = "http://$uvicornHost`:$uvicornPort"

# Ensure child processes won't see external API keys
Remove-Item Env:\OPENAI_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\HARDCOVER_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\SKIP_ML -ErrorAction SilentlyContinue

# Create venv if missing
if (-not (Test-Path $venvDir)) {
    Write-Host "Creating Python virtualenv at $venvDir..."
    python -m venv $venvDir
} else {
    Write-Host "Using existing virtualenv at $venvDir"
}

# Activate venv in this session and install requirements
Write-Host "Activating venv and installing backend requirements (may take a while)..."
& (Join-Path $venvDir 'Scripts\Activate.ps1')
Set-Location $backendDir
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if ($ForceRebuildCaches) {
    Write-Host "Removing caches to force rebuild..."
    Remove-Item -Path (Join-Path $backendDir 'book_embeddings_cache.json') -Force -ErrorAction SilentlyContinue
    Remove-Item -Path (Join-Path $backendDir 'quantum_similarity_cache.json') -Force -ErrorAction SilentlyContinue
}

# Build backend child command via concatenation to avoid parsing problems
$backendStartCommand = 'Remove-Item Env:\OPENAI_API_KEY -ErrorAction SilentlyContinue; Remove-Item Env:\HARDCOVER_API_KEY -ErrorAction SilentlyContinue; Remove-Item Env:\SKIP_ML -ErrorAction SilentlyContinue; '
$backendStartCommand += 'Set-Location -Path "' + $backendDir + '"; '
$backendStartCommand += '. "' + ($venvDir + '\\Scripts\\Activate.ps1') + '"; '
$backendStartCommand += 'Write-Host "Starting uvicorn (backend) on ' + $uvicornHost + ':' + ($uvicornPort.ToString()) + ' ..."; '
$backendStartCommand += 'python -m uvicorn app:app --reload --host ' + $uvicornHost + ' --port ' + ($uvicornPort.ToString())

Write-Host 'Starting backend in a new PowerShell window...'
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit','-Command',$backendStartCommand -WorkingDirectory $backendDir

# Prepare and start frontend
Set-Location $frontendDir
if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Write-Host 'Installing frontend npm packages...'
    npm install
} else {
    Write-Host 'Frontend dependencies present.'
}

# Build the command for the frontend window. Set VITE_BACKEND_URL env var so React dev server points to the backend
$frontendStartCommand = 'Remove-Item Env:\OPENAI_API_KEY -ErrorAction SilentlyContinue; Remove-Item Env:\HARDCOVER_API_KEY -ErrorAction SilentlyContinue; '
$frontendStartCommand += 'Set-Location -Path "' + $frontendDir + '"; '
$frontendStartCommand += '`$env:VITE_BACKEND_URL = "' + $backendUrl + '"; '
$frontendStartCommand += 'Write-Host "Starting Vite dev server (frontend) and pointing to ' + $backendUrl + '..."; npm run dev'

Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit","-Command",$frontendStartCommand -WorkingDirectory $frontendDir

# 6) Poll /ready until ready=true (timeout after 600s)
Write-Host "Polling $backendUrl/ready until the backend reports ready=true (timeout 10 minutes)..."
$readyUri = "$backendUrl/ready"
$maxWaitSeconds = 600
$elapsed = 0
$interval = 3
while ($elapsed -lt $maxWaitSeconds) {
    Start-Sleep -Seconds $interval
    try {
        $resp = Invoke-RestMethod -Uri $readyUri -Method Get -ErrorAction Stop
        if ($null -ne $resp -and $resp.ready -eq $true) {
            Write-Host "Backend is ready:" ($resp | ConvertTo-Json -Depth 5)
            break
        } else {
            Write-Host "Backend not ready yet. Current status:" ($resp | ConvertTo-Json -Depth 3)
        }
    } catch {
        Write-Host "No response yet from $readyUri. Waiting..."
    }
    $elapsed += $interval
}
if ($elapsed -ge $maxWaitSeconds) {
    Write-Host "Timed out waiting for backend readiness. Check the backend window for errors." -ForegroundColor Yellow
    Exit 1
}

# 7) Run verification requests
Write-Host "Running verification requests against the backend..."
$recommendBody = @{ prompt = "I want a cozy mystery set in a library"; top_k = 5 }
try {
    $rec = Invoke-RestMethod -Uri "$backendUrl/api/v1/recommend" -Method Post -Body ($recommendBody | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
    Write-Host "Recommendations (top results):" -ForegroundColor Green
    $rec | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Failed to call /api/v1/recommend:" $_ -ForegroundColor Red
}

if ($rec -and $rec.Count -gt 0) {
    $first = $rec[0]
    $sel = @{
        book_id = ($first.book_id -or $first.id -or $first.title)
        title = $first.title
        author = ($first.author -or 'Unknown')
        genre = ($first.genre -or 'Unknown')
        theme = ($first.theme -or 'Unknown')
        timestamp = (Get-Date).ToString('o')
    }
    try {
        $selResp = Invoke-RestMethod -Uri "$backendUrl/api/v1/select_book" -Method Post -Body ($sel | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
        Write-Host "Selection saved response:" -ForegroundColor Green
        $selResp | ConvertTo-Json -Depth 5
    } catch {
        Write-Host "Failed to call /api/v1/select_book:" $_ -ForegroundColor Red
    }
}

try {
    $hist = Invoke-RestMethod -Uri "$backendUrl/api/v1/history" -Method Get -ErrorAction Stop
    Write-Host "History:" -ForegroundColor Green
    $hist | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Failed to call /api/v1/history:" $_ -ForegroundColor Red
}

try {
    $analytics = Invoke-RestMethod -Uri "$backendUrl/api/v1/analytics" -Method Get -ErrorAction Stop
    Write-Host "Analytics:" -ForegroundColor Green
    $analytics | ConvertTo-Json -Depth 6
} catch {
    Write-Host "Failed to call /api/v1/analytics:" $_ -ForegroundColor Red
}

Write-Host "Automation script finished. Backend and frontend windows are left open for logs and interaction." -ForegroundColor Cyan
Write-Host "Open the frontend URL reported by Vite (in the frontend window) to use the UI."

# End of script
