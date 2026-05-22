#!/bin/sh
if [ -f /app/service ]; then
  exec /app/service
else
  echo "Starting all microservices for Render monolith..."
  LOCAL_PORT=8081 /app/auth-service &
  LOCAL_PORT=8082 /app/event-service &
  LOCAL_PORT=8083 /app/ticket-service &
  LOCAL_PORT=8084 /app/venue-service &
  LOCAL_PORT=8085 /app/staff-service &
  LOCAL_PORT=8086 /app/notification-service &
  
  # Gateway defaults to 8080 or process PORT
  exec /app/gateway
fi
