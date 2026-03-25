#!/bin/bash
set -e

ACCOUNT_ID="436756555762"
REGION="ap-southeast-1"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "Logging in to ECR..."
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${REGISTRY}

SERVICES=("auth-service" "event-service" "ticket-service" "venue-service" "staff-service" "notification-service")

cd /home/sen/projects/FPT_EVENT_MANAGEMENT_Microservices/backend

for SVC in "${SERVICES[@]}"; do
    echo "Building $SVC..."
    BUILD_PATH="./services/${SVC%-service}-lambda"
    
    docker build --target local \
      --build-arg BUILD_PATH=${BUILD_PATH} \
      --build-arg GOARCH=amd64 \
      -t ${REGISTRY}/${SVC}:latest .
      
    echo "Pushing $SVC..."
    docker push ${REGISTRY}/${SVC}:latest
done

echo "Force deploying ECS services..."
CLUSTER="fpt-event-cluster"
for SVC in "${SERVICES[@]}"; do
    echo "Updating $SVC..."
    aws ecs update-service --cluster ${CLUSTER} --service ${SVC} --force-new-deployment --region ${REGION} > /dev/null
done

echo "Deployment triggered successfully!"
