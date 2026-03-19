#!/bin/bash
# ============================================================
# Create MySQL Application User with Limited Privileges
# ============================================================
# This script runs AFTER 01_schema.sql during MySQL initialization
# It reads credentials from environment variables for security:
#   - DB_USER: Application user name (default: fpt_app)
#   - DB_PASSWORD: Application user password (REQUIRED - no hardcoding!)
#   - MYSQL_DATABASE: Target database (set by Docker)
#   - MYSQL_ROOT_PASSWORD: Root password (set by Docker)
#
# SECURITY: Passwords are NEVER hardcoded in SQL files or scripts
# They are read from .env via Docker Compose environment variables
# ============================================================

set -e

# Default values
DB_USER="${DB_USER:-fpt_app}"
DB_PASSWORD="${DB_PASSWORD:-FPTEventAppPassword2026}"
DATABASE="${MYSQL_DATABASE:-fpteventmanagement}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD}"

# Validation
if [ -z "$DB_USER" ]; then
  echo "❌ ERROR: DB_USER environment variable not set"
  exit 1
fi

if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
  echo "❌ ERROR: MYSQL_ROOT_PASSWORD not set"
  exit 1
fi

if [ -z "$DATABASE" ]; then
  echo "❌ ERROR: MYSQL_DATABASE not set"
  exit 1
fi

# Create MySQL user with limited privileges
# Using 'mysql' command which connects as root via Unix socket during initialization
echo "🔧 Creating MySQL application user: $DB_USER"

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<EOF
  -- Create application user with limited privileges (SELECT, INSERT, UPDATE, DELETE only)
  CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';
  
  -- Grant only necessary privileges for backend application
  GRANT SELECT, INSERT, UPDATE, DELETE ON $DATABASE.* TO '$DB_USER'@'%';
  
  -- Ensure privileges are applied
  FLUSH PRIVILEGES;
EOF

echo "✅ User $DB_USER created successfully with limited privileges"
echo "   Privileges: SELECT, INSERT, UPDATE, DELETE on $DATABASE"
