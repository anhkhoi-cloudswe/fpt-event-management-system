#!/bin/bash
# ============================================================
# Create MySQL Application User with Security Hardening
# ============================================================
# This script runs AFTER 01_schema.sql during MySQL initialization
# It implements defensive database security while maintaining usability:
#
# KEY SECURITY IMPROVEMENTS (VULN-01 Fix):
#  1. ✅ Removes root@'%' (blocks remote root access from hackers)
#  2. ✅ Keeps root@localhost & root@127.0.0.1 (secure local access)
#  3. ✅ Sets mysql_native_password (Workbench/Navicat compatibility)
#  4. ✅ Application user limited to localhost/127.0.0.1/docker network
#  5. ✅ Removes wildcard user@'%' for app (prevents lateral movement)
#
# HOST ACCESS (MySQL Workbench / Navicat):
#  From Windows host to Docker MySQL:
#    • Connection: SSH Tunnel or Port Forward 127.0.0.1:3306
#    • Username: root
#    • Password: ${MYSQL_ROOT_PASSWORD} (from .env)
#    • Auth Plugin: mysql_native_password (auto-detected)
#
# Environment Variables Required:
#   - DB_USER: Application user name (e.g., fpt_app)
#   - DB_PASSWORD: Application user password (REQUIRED - no hardcoding!)
#   - MYSQL_DATABASE: Target database (e.g., fpteventmanagement)
#   - MYSQL_ROOT_PASSWORD: Root password (REQUIRED - loaded from .env)
#
# SECURITY: Passwords are NEVER hardcoded in this script.
# They are read from .env via Docker Compose environment variables.
# ============================================================

set -e

# Strict: No default values - all variables MUST come from environment
DB_USER="$DB_USER"
DB_PASSWORD="$DB_PASSWORD"
DATABASE="$MYSQL_DATABASE"
MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD"

# Strict Validation: All variables MUST be set and non-empty
errors=0

if [ -z "$DB_USER" ]; then
  echo "❌ ERROR: DB_USER environment variable is required but not set"
  ((errors++))
fi

if [ -z "$DB_PASSWORD" ]; then
  echo "❌ ERROR: DB_PASSWORD environment variable is required but not set"
  ((errors++))
fi

if [ -z "$DATABASE" ]; then
  echo "❌ ERROR: MYSQL_DATABASE environment variable is required but not set"
  ((errors++))
fi

if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
  echo "❌ ERROR: MYSQL_ROOT_PASSWORD environment variable is required but not set"
  ((errors++))
fi

# If any validation failed, stop immediately
if [ $errors -gt 0 ]; then
  echo ""
  echo "❌ FATAL: $errors required environment variable(s) are missing or empty."
  echo "   Cannot proceed with MySQL user creation. Container initialization aborted."
  echo ""
  exit 1
fi

# Create MySQL user with limited privileges
# Using 'mysql' command which connects as root via Unix socket during initialization
echo "🔧 Creating MySQL application user: $DB_USER"

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<EOF
-- ============================================================
-- SECURITY: Remove remote root access (block hackers)
-- ============================================================
DELETE FROM mysql.user WHERE user='root' AND host='%';

-- ============================================================
-- Root Access Control
-- ============================================================
-- Ensure root@localhost exists with strong password
-- Using mysql_native_password for Workbench/Navicat compatibility
ALTER USER IF EXISTS 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$MYSQL_ROOT_PASSWORD';

-- Ensure root@127.0.0.1 local loopback access
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '$MYSQL_ROOT_PASSWORD';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;

-- ============================================================
-- Application User: Limited Privileges Only
-- ============================================================
-- Create application user for localhost (container internal)
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON $DATABASE.* TO '$DB_USER'@'localhost';

-- Create application user for 127.0.0.1 (loopback)
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON $DATABASE.* TO '$DB_USER'@'127.0.0.1';

-- Create application user for Docker internal network (service-to-service)
CREATE USER IF NOT EXISTS '$DB_USER'@'mysql' IDENTIFIED BY '$DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON $DATABASE.* TO '$DB_USER'@'mysql';

-- ============================================================
-- Security Cleanup: Remove dangerous wildcard users
-- ============================================================
DELETE FROM mysql.user WHERE user='$DB_USER' AND host='%';

-- ============================================================
-- Apply All Changes
-- ============================================================
FLUSH PRIVILEGES;
EOF

echo "✅ MySQL security hardened successfully:"
echo "   • Root remote access BLOCKED (user@'%' removed)"
echo "   • Root@localhost configured for Workbench/Navicat (mysql_native_password)"
echo "   • Application user '$DB_USER' restricted to:"
echo "     - localhost (container internal)"
echo "     - 127.0.0.1 (loopback)"
echo "     - mysql (Docker service network)"
echo "   • Privileges: SELECT, INSERT, UPDATE, DELETE on $DATABASE database"
