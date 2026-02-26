# ============================================
# CLEAN BUILD SCRIPT - FPT Event Services
# Đảm bảo tắt hoàn toàn backend cũ trước khi chạy bản mới
# ============================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CLEAN BUILD - FPT Event Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill all existing backend processes
Write-Host "[1/4] Stopping all backend processes..." -ForegroundColor Yellow
$backendProcesses = Get-Process -Name "backend" -ErrorAction SilentlyContinue
if ($backendProcesses) {
    $backendProcesses | Stop-Process -Force
    Write-Host "✅ Stopped $($backendProcesses.Count) backend process(es)" -ForegroundColor Green
    Start-Sleep -Seconds 2
} else {
    Write-Host "✅ No backend processes running" -ForegroundColor Green
}

# Also kill backend.exe if running
$backendExeProcesses = Get-Process -Name "backend.exe" -ErrorAction SilentlyContinue
if ($backendExeProcesses) {
    $backendExeProcesses | Stop-Process -Force
    Write-Host "✅ Stopped backend.exe process(es)" -ForegroundColor Green
    Start-Sleep -Seconds 2
}

Write-Host ""

# Step 2: Delete old executables
Write-Host "[2/4] Removing old executables..." -ForegroundColor Yellow
if (Test-Path ".\backend.exe") {
    Remove-Item ".\backend.exe" -Force
    Write-Host "✅ Deleted old backend.exe" -ForegroundColor Green
} else {
    Write-Host "✅ No old backend.exe found" -ForegroundColor Green
}

if (Test-Path ".\backend") {
    Remove-Item ".\backend" -Force
    Write-Host "✅ Deleted old backend" -ForegroundColor Green
}

Write-Host ""

# Step 3: Clean build cache
Write-Host "[3/4] Cleaning build cache..." -ForegroundColor Yellow
go clean -cache
Write-Host "✅ Build cache cleaned" -ForegroundColor Green

Write-Host ""

# Step 4: Build new executable
Write-Host "[4/4] Building new backend..." -ForegroundColor Yellow
$buildOutput = go build -o backend.exe main.go 2>&1
$buildExitCode = $LASTEXITCODE

if ($buildExitCode -eq 0) {
    Write-Host "✅ Build successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "BUILD COMPLETED SUCCESSFULLY" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To run the backend, execute:" -ForegroundColor Yellow
    Write-Host "    .\backend.exe" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    Write-Host $buildOutput
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "BUILD FAILED - Check errors above" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Cyan
    exit 1
}
