#!/bin/sh

# Load environment variables from .env file if it exists (e.g. Render Secret File)
ENV_PATH=""
if [ -f "/etc/secrets/.env" ]; then
  ENV_PATH="/etc/secrets/.env"
elif [ -f "/app/.env" ]; then
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
  
  # Supervisor helper function to keep microservices running
  run_service() {
    name=$1
    port=$2
    bin=$3
    while true; do
      echo "[SUPERVISOR] Starting $name on port $port..."
      LOCAL_PORT=$port $bin
      echo "[SUPERVISOR] ⚠️  $name exited with code $?. Restarting in 2 seconds..."
      sleep 2
    done
  }

  run_service "auth-service" 8081 /app/auth-service &
  run_service "event-service" 8082 /app/event-service &
  run_service "ticket-service" 8083 /app/ticket-service &
  run_service "venue-service" 8084 /app/venue-service &
  run_service "staff-service" 8085 /app/staff-service &
  run_service "notification-service" 8086 /app/notification-service &
  
  # Gateway defaults to 8080 or process PORT
  exec /app/gateway
fi
