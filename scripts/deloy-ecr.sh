#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

ACCOUNT_ID="436756555762"
REGION="ap-southeast-1"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo -e "${CYAN}🔐 Logging in to ECR...${NC}"
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${REGISTRY} || {
    echo -e "${RED}❌ Failed to login to ECR. Check AWS credentials.${NC}"
    exit 1
}
echo -e "${GREEN}✅ ECR login successful!${NC}"

SERVICES=("auth-service" "event-service" "ticket-service" "venue-service" "staff-service" "notification-service")

# Auto-detect backend directory (one level up from scripts folder)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"

echo -e "${YELLOW}📂 Backend directory: $BACKEND_DIR${NC}"
cd "$BACKEND_DIR" || {
    echo -e "${RED}❌ Failed to change to backend directory: $BACKEND_DIR${NC}"
    exit 1
}

for SVC in "${SERVICES[@]}"; do
    echo -e "\n${CYAN}🔨 Building $SVC...${NC}"
    BUILD_PATH="./services/${SVC%-service}-lambda"
    
    docker build --target local \
      --build-arg BUILD_PATH=${BUILD_PATH} \
      --build-arg GOARCH=amd64 \
      -t ${REGISTRY}/${SVC}:latest . || {
        echo -e "${RED}❌ Failed to build $SVC${NC}"
        exit 1
    }
      
    echo -e "${CYAN}📤 Pushing $SVC to ECR...${NC}"
    docker push ${REGISTRY}/${SVC}:latest || {
        echo -e "${RED}❌ Failed to push $SVC${NC}"
        exit 1
    }
    echo -e "${GREEN}✅ $SVC pushed successfully!${NC}"
done

echo -e "\n${CYAN}🚀 Force deploying ECS services...${NC}"
CLUSTER="fpt-event-cluster"
for SVC in "${SERVICES[@]}"; do
    echo -e "${YELLOW}Updating $SVC...${NC}"
    aws ecs update-service --cluster ${CLUSTER} --service ${SVC} --force-new-deployment --region ${REGION} > /dev/null || {
        echo -e "${RED}❌ Failed to update $SVC in ECS${NC}"
        exit 1
    }
done

echo -e "\n${GREEN}✨ Deployment triggered successfully!${NC}"
echo -e "${CYAN}📊 Check deployment status in AWS Console:${NC}"
echo -e "${CYAN}   https://console.aws.amazon.com/ecs/v2/clusters/${CLUSTER}${NC}"
