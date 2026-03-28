#!/usr/bin/env pwsh
# Deploy services to AWS ECR and ECS
# Windows PowerShell version of deploy-ecr.sh

$ErrorActionPreference = "Stop"

$ACCOUNT_ID = "436756555762"
$REGION = "ap-southeast-1"
$REGISTRY = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
$CLUSTER = "fpt-event-cluster"

$SERVICES = @("auth-service", "event-service", "ticket-service", "venue-service", "staff-service", "notification-service")

# Get the backend directory (where script is run from)
$BACKEND_DIR = (Get-Item -Path $PSScriptRoot).Parent.FullName + "\backend"

try {
    # Step 1: Login to ECR
    Write-Host "🔐 Logging in to ECR..." -ForegroundColor Cyan
    $loginToken = aws ecr get-login-password --region $REGION
    if ($LASTEXITCODE -ne 0) {
        throw "❌ Failed to get ECR login token. Make sure AWS CLI is installed and credentials are configured."
    }
    
    $loginToken | docker login --username AWS --password-stdin $REGISTRY
    if ($LASTEXITCODE -ne 0) {
        throw "❌ Docker login failed. Make sure Docker is running."
    }
    Write-Host "✅ ECR login successful!" -ForegroundColor Green

    # Step 2: Build and push services
    Set-Location $BACKEND_DIR
    
    foreach ($SVC in $SERVICES) {
        $BUILD_PATH = "./services/$($SVC -replace '-service', '-lambda')"
        
        Write-Host "`n🔨 Building $SVC..." -ForegroundColor Cyan
        docker build --target local `
            --build-arg BUILD_PATH=$BUILD_PATH `
            --build-arg GOARCH=amd64 `
            -t "$REGISTRY/$SVC`:latest" .
        
        if ($LASTEXITCODE -ne 0) {
            throw "❌ Failed to build $SVC"
        }
        
        Write-Host "📤 Pushing $SVC to ECR..." -ForegroundColor Cyan
        docker push "$REGISTRY/$SVC`:latest"
        
        if ($LASTEXITCODE -ne 0) {
            throw "❌ Failed to push $SVC"
        }
        Write-Host "✅ $SVC pushed successfully!" -ForegroundColor Green
    }

    # Step 3: Force redeploy ECS services
    Write-Host "`n🚀 Force deploying ECS services..." -ForegroundColor Cyan
    
    foreach ($SVC in $SERVICES) {
        Write-Host "Updating $SVC..." -ForegroundColor Yellow
        aws ecs update-service `
            --cluster $CLUSTER `
            --service $SVC `
            --force-new-deployment `
            --region $REGION `
            --no-cli-pager | Out-Null
        
        if ($LASTEXITCODE -ne 0) {
            throw "❌ Failed to update $SVC in ECS"
        }
    }
    
    Write-Host "`n✨ Deployment triggered successfully!" -ForegroundColor Green
    Write-Host "📊 Check deployment status in AWS ECS Console:" -ForegroundColor Cyan
    Write-Host "   https://console.aws.amazon.com/ecs/v2/clusters/$CLUSTER" -ForegroundColor Blue
}
catch {
    Write-Host "`n❌ Error: $_" -ForegroundColor Red
    exit 1
}
