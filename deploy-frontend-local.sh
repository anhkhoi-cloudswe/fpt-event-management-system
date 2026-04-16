#!/bin/bash
set -e

# Define variables
FRONTEND_DIR="frontend"
S3_BUCKET="fpt-event-frontend-436756555762"

echo "=========================================================="
echo "    Building and Deploying Frontend Locally to S3"
echo "=========================================================="

echo "Step 1: Installing dependencies..."
cd "$FRONTEND_DIR"
npm ci

echo "Step 2: Building production bundle..."
# Make sure VITE_RECAPTCHA_SITE_KEY is available in your shell environment.
if [ -z "$VITE_RECAPTCHA_SITE_KEY" ]; then
    echo "Warning: VITE_RECAPTCHA_SITE_KEY is not set in your local environment."
    echo "The build might proceed without it or fail if required."
fi

npm run build
cd ..

echo "Step 3: Deploying to S3..."
# We sync from frontend/dist
DIST_DIR="$FRONTEND_DIR/dist"

if [ ! -d "$DIST_DIR" ]; then
    echo "Error: Build directory $DIST_DIR does not exist."
    exit 1
fi

echo "Syncing immutable assets (images, fonts, etc.)..."
aws s3 sync "$DIST_DIR/" "s3://$S3_BUCKET" --delete \
    --cache-control "public,max-age=31536000,immutable" \
    --exclude "index.html" \
    --exclude "*.css" \
    --exclude "*.js"

echo "Syncing HTML, CSS, and JS files with no-cache..."
aws s3 sync "$DIST_DIR/" "s3://$S3_BUCKET" --delete \
    --cache-control "no-cache,must-revalidate" \
    --include "index.html" \
    --include "*.css" \
    --include "*.js"

echo "Step 4: Getting CloudFront Distribution ID..."
DIST_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Origins.Items[?contains(DomainName, '$S3_BUCKET')]].Id | [0]" \
    --output text)

if [ "$DIST_ID" == "None" ] || [ -z "$DIST_ID" ]; then
    echo "Error: Could not find any CloudFront distribution mapping to $S3_BUCKET"
    exit 1
fi

echo "Found CloudFront Distribution ID: $DIST_ID"

echo "Step 5: Creating CloudFront invalidation..."
aws cloudfront create-invalidation \
    --distribution-id "$DIST_ID" \
    --paths "/*"

echo "=========================================================="
echo "    Deployment Complete!"
echo "=========================================================="
