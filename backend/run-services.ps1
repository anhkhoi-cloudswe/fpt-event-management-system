# =============================================================================
# run-services.ps1 — FPT Event Management System Local Runner
# Compiles and runs all 6 microservices and the API Gateway concurrently.
# =============================================================================

# Ensure we run from the backend directory
$ScriptDir = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  FPT Event Management System — Local Runner" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Step 1: Create bin folder
if (-not (Test-Path "bin")) {
    New-Item -ItemType Directory -Path "bin" | Out-Null
}

$services = @(
    @{ Name = "Auth Service"; Path = "./services/auth-service"; Binary = "bin/auth-service.exe" },
    @{ Name = "Event Service"; Path = "./services/event-service"; Binary = "bin/event-service.exe" },
    @{ Name = "Ticket Service"; Path = "./services/ticket-service"; Binary = "bin/ticket-service.exe" },
    @{ Name = "Venue Service"; Path = "./services/venue-service"; Binary = "bin/venue-service.exe" },
    @{ Name = "Staff Service"; Path = "./services/staff-service"; Binary = "bin/staff-service.exe" },
    @{ Name = "Notification Service"; Path = "./services/notification-service"; Binary = "bin/notification-service.exe" },
    @{ Name = "Gateway"; Path = "./cmd/gateway"; Binary = "bin/gateway-service.exe" }
)

# Step 2: Build services
Write-Host "[1/3] Building all services..." -ForegroundColor Yellow
$buildFailed = $false
foreach ($svc in $services) {
    Write-Host "Building $($svc.Name)..." -ForegroundColor DarkGray
    go build -o $($svc.Binary) $($svc.Path)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to build $($svc.Name)" -ForegroundColor Red
        $buildFailed = $true
    }
}

if ($buildFailed) {
    Write-Host "❌ Build failed. Aborting startup." -ForegroundColor Red
    exit 1
}
Write-Host "✅ All services built successfully!" -ForegroundColor Green

# Step 3: Run services
Write-Host ""
Write-Host "[2/3] Launching all services..." -ForegroundColor Yellow
$processes = @()
foreach ($svc in $services) {
    Write-Host "Starting $($svc.Name)..." -ForegroundColor DarkGray
    $proc = Start-Process -FilePath $($svc.Binary) -PassThru -NoNewWindow
    $processes += $proc
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  🚀 All services are running! Gateway: http://localhost:8080" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Ports mapping:" -ForegroundColor Gray
Write-Host "  - Gateway: 8080" -ForegroundColor Gray
Write-Host "  - Auth:    8081" -ForegroundColor Gray
Write-Host "  - Event:   8082" -ForegroundColor Gray
Write-Host "  - Ticket:  8083" -ForegroundColor Gray
Write-Host "  - Venue:   8084" -ForegroundColor Gray
Write-Host "  - Staff:   8085" -ForegroundColor Gray
Write-Host "  - Notify:  8086" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Press Enter to stop all services..." -ForegroundColor Yellow
Write-Host ""

try {
    # Wait for user input
    [void][System.Console]::ReadLine()
}
finally {
    Write-Host ""
    Write-Host "[3/3] Stopping all services..." -ForegroundColor Yellow
    foreach ($proc in $processes) {
        if ($proc -and -not $proc.HasExited) {
            Write-Host "Stopping $($proc.ProcessName) (PID $($proc.Id))..." -ForegroundColor DarkGray
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "🧹 Cleaning temporary binaries..." -ForegroundColor DarkGray
    Remove-Item -Path "bin" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✅ All services stopped." -ForegroundColor Green
}
