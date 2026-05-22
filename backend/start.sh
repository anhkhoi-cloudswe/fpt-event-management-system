#!/bin/sh

# Load environment variables from .env file if it exists (e.g. Render Secret File)
ENV_PATH=""
if [ -f "/app/.env" ]; then
  ENV_PATH="/app/.env"
elif [ -f ".env" ]; then
  ENV_PATH=".env"
fi

if [ -n "$ENV_PATH" ]; then
  echo "Loading environment variables from $ENV_PATH..."
  while read -r line || [ -n "$line" ]; do
    # Trim leading/trailing whitespace and strip carriage returns
    clean_line=$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/\r$//')
    case "$clean_line" in
      "" | "#"*) continue ;;
    esac
    
    # Split on first '='
    key=$(echo "$clean_line" | cut -d'=' -f1 | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    val=$(echo "$clean_line" | cut -d'=' -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    
    # Trim quotes from value
    val=$(echo "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    
    if [ -n "$key" ]; then
      export "$key=$val"
    fi
  done < "$ENV_PATH"
fi

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
