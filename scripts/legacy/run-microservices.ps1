# ============================================================
# Run FPT Event Management Microservices Locally
# Unified Logging — all services stream into ONE terminal
# ============================================================

param(
    [string]$Service = "all",
    [switch]$Stop = $false,
    [switch]$Build = $false,
    [string]$ConfigFile = ".env"
)

$ErrorActionPreference = "Stop"

# ── Color helpers ────────────────────────────────────────────
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "[->] $msg" -ForegroundColor Cyan }
function Write-Warning { param($msg) Write-Host "[!!] $msg" -ForegroundColor Yellow }

# Per-service colors for unified log
$svcColors = @{
    "gateway"             = "White"
    "auth-lambda"         = "Green"
    "event-lambda"        = "Cyan"
    "ticket-lambda"       = "Yellow"
    "venue-lambda"        = "Magenta"
    "staff-lambda"        = "DarkCyan"
    "notification-lambda" = "DarkYellow"
}

# ── Service definitions ─────────────────────────────────────
$services = @{
    "gateway"             = @{ Port = 8080; Dir = "cmd\gateway"; Binary = "gateway.exe"; Name = "API Gateway"; Tag = "[GATEWAY]" }
    "auth-lambda"         = @{ Port = 8081; Dir = "services\auth-lambda"; Binary = "auth-service.exe"; Name = "Auth Service"; Tag = "[AUTH]" }
    "event-lambda"        = @{ Port = 8082; Dir = "services\event-lambda"; Binary = "event-service.exe"; Name = "Event Service"; Tag = "[EVENT]" }
    "ticket-lambda"       = @{ Port = 8083; Dir = "services\ticket-lambda"; Binary = "ticket-service.exe"; Name = "Ticket Service"; Tag = "[TICKET]" }
    "venue-lambda"        = @{ Port = 8084; Dir = "services\venue-lambda"; Binary = "venue-service.exe"; Name = "Venue Service"; Tag = "[VENUE]" }
    "staff-lambda"        = @{ Port = 8085; Dir = "services\staff-lambda"; Binary = "staff-service.exe"; Name = "Staff Service"; Tag = "[STAFF]" }
    "notification-lambda" = @{ Port = 8086; Dir = "services\notification-lambda"; Binary = "notification-service.exe"; Name = "Notification Service"; Tag = "[NOTIFY]" }
}

$projectRoot = $PSScriptRoot
$backendDir = Join-Path $projectRoot "backend"

Write-Host ""
Write-Host "+======================================================+" -ForegroundColor Cyan
Write-Host "|  FPT Event Management - Microservices Launcher      |" -ForegroundColor Cyan
Write-Host "|  Unified Logging Mode                               |" -ForegroundColor Cyan
Write-Host "+======================================================+" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# STOP MODE (FIXED: Quét sạch mọi tiến trình trên cổng)
# ============================================================
if ($Stop) {
    Write-Info "Stopping all microservices..."
    foreach ($svc in $services.Keys) {
        $port = $services[$svc].Port
        # Lấy danh sách PID duy nhất đang chiếm cổng
        $pids = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($foundPid in $pids) {
            if ($foundPid -gt 0) {
                try { 
                    Stop-Process -Id $foundPid -Force 
                    Write-Success "Stopped PID $foundPid on port $port ($svc)" 
                }
                catch {}
            }
        }
    }
    Write-Success "All services stopped!"
    exit 0
}

# ============================================================
# LOAD ENVIRONMENT VARIABLES
# ============================================================
$envFile = Join-Path $backendDir $ConfigFile

if (Test-Path $envFile) {
    Write-Info "Loading environment from $ConfigFile..."
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    Write-Success "Environment variables loaded"
}
else {
    Write-Warning "$ConfigFile not found. Using system environment variables."
}

# Set service URLs if not in .env
if (-not $env:AUTH_SERVICE_URL) { $env:AUTH_SERVICE_URL = "http://localhost:8081" }
if (-not $env:EVENT_SERVICE_URL) { $env:EVENT_SERVICE_URL = "http://localhost:8082" }
if (-not $env:TICKET_SERVICE_URL) { $env:TICKET_SERVICE_URL = "http://localhost:8083" }
if (-not $env:VENUE_SERVICE_URL) { $env:VENUE_SERVICE_URL = "http://localhost:8084" }
if (-not $env:STAFF_SERVICE_URL) { $env:STAFF_SERVICE_URL = "http://localhost:8085" }
if (-not $env:NOTIFICATION_SERVICE_URL) { $env:NOTIFICATION_SERVICE_URL = "http://localhost:8086" }

# Feature flags
$env:USE_API_COMPOSITION = "true"
$env:VENUE_API_ENABLED = "true"
$env:AUTH_API_ENABLED = "true"
$env:TICKET_API_ENABLED = "true"
$env:EVENT_API_ENABLED = "true"
$env:WALLET_SERVICE_ENABLED = "true"
$env:SAGA_ENABLED = "true"
$env:NOTIFICATION_API_ENABLED = "true"
$env:SERVICE_SPECIFIC_SCHEDULER = "true"
$env:SERVICE_SPECIFIC_DB = "true"

Write-Host ""
Write-Info "Environment:"
Write-Host "  DB_URL:        $(if ($env:DB_URL) { $env:DB_URL } else { 'NOT SET' })" -ForegroundColor DarkGray
Write-Host "  JWT_SECRET:    $(if ($env:JWT_SECRET) { $env:JWT_SECRET.Substring(0,4) + '...' } else { 'NOT SET' })" -ForegroundColor DarkGray
Write-Host "  Feature Flags: ALL ENABLED" -ForegroundColor DarkGray
Write-Host ""

# ============================================================
# BUILD SERVICES
# ============================================================
if ($Build) {
    # Kill stale processes that may lock .exe files on Windows
    Write-Info "Killing stale service processes (if any)..."
    $staleNames = @("gateway", "auth-service", "event-service", "ticket-service", "venue-service", "staff-service", "notification-service", "main")
    foreach ($name in $staleNames) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    try { & taskkill /f /im main.exe /t 2>&1 | Out-Null } catch {}
    try { & taskkill /f /im gateway.exe /t 2>&1 | Out-Null } catch {}
    Start-Sleep -Milliseconds 800

    Write-Info "Building services..."
    Write-Host ""

    $buildErrors = 0

    foreach ($svc in $services.Keys) {
        $svcInfo = $services[$svc]
        $svcDir = Join-Path $backendDir $svcInfo.Dir

        Write-Info "Building $($svcInfo.Name)..."

        Push-Location $svcDir
        try {
            $output = go build -o $svcInfo.Binary . 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Success "$($svcInfo.Name) built -> $($svcInfo.Binary)"
            }
            else {
                Write-Error "$($svcInfo.Name) build failed:"
                Write-Host $output -ForegroundColor Red
                $buildErrors++
            }
        }
        finally {
            Pop-Location
        }
    }

    Write-Host ""
    if ($buildErrors -gt 0) {
        Write-Error "$buildErrors service(s) failed to build. Fix errors and retry."
        exit 1
    }
    Write-Success "All services built successfully!"
    Write-Host ""
}

# ============================================================
# CHECK PREREQUISITES
# ============================================================
Write-Info "Checking prerequisites..."

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Error "Go is not installed. Download from https://go.dev/dl/"
    exit 1
}
Write-Success "Go: $(go version)"

if (-not (Test-Path $backendDir)) {
    Write-Error "backend/ directory not found. Run this script from project root."
    exit 1
}

Write-Host ""

# ============================================================
# RUN SERVICES — UNIFIED LOGGING (single terminal)
# ============================================================
$servicesToRun = if ($Service -eq "all") { $services.Keys } else { @($Service) }

# Track spawned process objects so we can monitor / Ctrl-C them
$runningProcesses = @{}

foreach ($svc in $servicesToRun) {
    if (-not $services.ContainsKey($svc)) {
        Write-Error "Unknown service: $svc"
        Write-Info "Available: $($services.Keys -join ', ')"
        exit 1
    }

    $svcInfo = $services[$svc]
    $svcDir = Join-Path $backendDir $svcInfo.Dir
    $binary = Join-Path $svcDir $svcInfo.Binary
    $port = $svcInfo.Port

    # Check if port is already in use
    $existingPids = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($foundPid in $existingPids) {
        # Đổi $pId thành $foundPid
        if ($foundPid -gt 0) {
            Write-Warning "Port $port is busy (PID $foundPid). Killing it to restart..."
            try { Stop-Process -Id $foundPid -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
    Start-Sleep -Milliseconds 300 # Đợi 1 chút để Windows giải phóng cổng

    # Auto-build if binary missing
    if (-not (Test-Path $binary)) {
        Write-Warning "$($svcInfo.Binary) not found. Building..."
        Push-Location $svcDir
        try {
            go build -o $svcInfo.Binary . 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Build failed for $($svcInfo.Name)"
                continue
            }
        }
        finally {
            Pop-Location
        }
    }

    Write-Info "Starting $($svcInfo.Name) on port $port..."

    # Start process with redirected stdout/stderr
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $binary
    $psi.WorkingDirectory = $svcDir
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    # Copy current process env (includes .env vars + feature flags)
    # ProcessStartInfo inherits the current process environment automatically

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    $proc.EnableRaisingEvents = $true

    # Capture closure vars for event handlers
    $tag = $svcInfo.Tag
    $color = $svcColors[$svc]

    # Register async output handlers
    $outAction = {
        if ($EventArgs.Data) {
            Write-Host "$($Event.MessageData.Tag) $($EventArgs.Data)" -ForegroundColor $Event.MessageData.Color
        }
    }.GetNewClosure()

    Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action $outAction -MessageData @{ Tag = $tag; Color = $color } | Out-Null
    Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived  -Action $outAction -MessageData @{ Tag = $tag; Color = $color } | Out-Null

    $proc.Start() | Out-Null
    $proc.BeginOutputReadLine()
    $proc.BeginErrorReadLine()

    $runningProcesses[$svc] = $proc
    Write-Success "$($svcInfo.Name) started (PID $($proc.Id)) on http://localhost:$port"

    Start-Sleep -Milliseconds 300
}

Write-Host ""
Write-Host "+======================================================+" -ForegroundColor Green
Write-Host "|  All services started -- Unified Logging Active      |" -ForegroundColor Green
Write-Host "+======================================================+" -ForegroundColor Green
Write-Host ""
Write-Info "API Gateway: http://localhost:8080"
Write-Host ""
Write-Info "Service URLs:"
foreach ($svc in $services.Keys | Sort-Object) {
    $port = $services[$svc].Port
    Write-Host "  $($services[$svc].Tag) $($services[$svc].Name): " -ForegroundColor Cyan -NoNewline
    Write-Host "http://localhost:$port" -ForegroundColor Yellow
}
Write-Host ""
Write-Info "Press Ctrl+C to stop all services. Logs appear below."
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# ============================================================
# KEEP ALIVE — wait for Ctrl+C, then clean up
# ============================================================
try {
    # Block until a process exits or user presses Ctrl+C
    while ($true) {
        # Check if any process crashed
        foreach ($svc in @($runningProcesses.Keys)) {
            $proc = $runningProcesses[$svc]
            if ($proc.HasExited) {
                $code = $proc.ExitCode
                if ($code -ne 0) {
                    Write-Error "$($services[$svc].Name) exited with code $code"
                }
                else {
                    Write-Warning "$($services[$svc].Name) exited normally"
                }
                $runningProcesses.Remove($svc)
            }
        }
        if ($runningProcesses.Count -eq 0) {
            Write-Warning "All services have exited."
            break
        }
        Start-Sleep -Seconds 1
    }
}
finally {
    # Ctrl+C or loop exit — kill remaining processes
    Write-Host ""
    Write-Info "Shutting down services..."
    foreach ($svc in @($runningProcesses.Keys)) {
        $proc = $runningProcesses[$svc]
        if (-not $proc.HasExited) {
            try { $proc.Kill() } catch {}
            Write-Success "$($services[$svc].Name) stopped"
        }
    }
    # Clean up event subscriptions
    Get-EventSubscriber | Unregister-Event -ErrorAction SilentlyContinue
    Write-Success "All services stopped. Goodbye!"
}
