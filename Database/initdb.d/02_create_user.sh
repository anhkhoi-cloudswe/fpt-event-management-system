#!/bin/bash
# ============================================================
# Create MySQL Application User with Security Hardening
# ============================================================
# This script runs AFTER 01_schema.sql during MySQL initialization
# It implements defensive database security while maintaining usability:
#
# SECURITY ARCHITECTURE (Internal Credential Card):
#  1. ✅ Removes root@'%' (blocks unlimited remote root access)
#  2. ✅ Keeps root@localhost & root@127.0.0.1 (secure local only)
#  3. ✅ Adds root@'172.%.%.%' (Docker Bridge - Workbench access)
#  4. ✅ Keeps root@'mysql' (internal service discovery name)
#  5. ✅ App user fpt_app limited to designated internal networks only
#  6. ✅ Removes wildcard user@'%' for both root and app (prevents lateral movement)
#
# NETWORK ACCESS LEVELS:
#  Level 1 - Localhost (Always):
#    └─ root@localhost, root@127.0.0.1
#    └─ fpt_app@localhost, fpt_app@127.0.0.1
#    └─ fpt_app@mysql (Docker internal service name)
#
#  Level 2 - Docker Bridge (Workbench/Tools via Host):
#    └─ root@'172.%.%.%' (Docker Bridge network, e.g., 172.18.0.1 for Workbench)
#    └─ fpt_app@'172.%.%.%' (App access from Docker Bridge, e.g., nginx reverse proxy)
#
# HOST ACCESS (MySQL Workbench / Navicat):
#  From Windows host to Docker MySQL via Workbench SSH tunnel or port forward:
#    • Connection: 127.0.0.1:3306 (port forward) or SSH tunnel
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
# SECURITY PRINCIPLE: Passwords are NEVER hardcoded in this script.
# All credentials are read from .env via Docker Compose environment variables.
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

# Create MySQL user with security hardening
# Using 'mysql' command which connects as root via Unix socket during initialization
echo "🔧 Setting up MySQL security hardening with internal credential levels..."

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<EOF
-- ============================================================
-- VULN-01 FIX: Remove unlimited remote access
-- ============================================================
-- Block any root user with wildcard host (hackers may find accounts)
DELETE FROM mysql.user WHERE user='root' AND host='%';
-- Block any app user with wildcard host (prevents lateral movement)
DELETE FROM mysql.user WHERE user='$DB_USER' AND host='%';

-- ============================================================
-- LEVEL 1: ROOT ACCESS (Localhost Only - Highest Privilege)
-- ============================================================
-- Ensure root@localhost exists with mysql_native_password
-- (Workbench/Navicat compatibility, container internal)
ALTER USER IF EXISTS 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$MYSQL_ROOT_PASSWORD';
ALTER USER IF EXISTS 'root'@'localhost' WITH MAX_QUERIES_PER_HOUR 0 MAX_CONNECTIONS_PER_HOUR 0 MAX_UPDATES_PER_HOUR 0 MAX_USER_CONNECTIONS 0;

-- Ensure root@127.0.0.1 for loopback access (internal VM/container only)
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '$MYSQL_ROOT_PASSWORD';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;

-- Ensure root@mysql for Docker internal service discovery
CREATE USER IF NOT EXISTS 'root'@'mysql' IDENTIFIED WITH mysql_native_password BY '$MYSQL_ROOT_PASSWORD';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'mysql' WITH GRANT OPTION;

-- ============================================================
-- LEVEL 2: ROOT ACCESS (Docker Bridge Network - For Workbench)
-- ============================================================
-- Allow root access from Docker Bridge network range (172.16.0.0/12)
-- This enables Workbench to connect via Docker host IP (e.g., 172.18.0.1)
-- Pattern '172.%.%.%' matches any IP in Docker Bridge range
CREATE USER IF NOT EXISTS 'root'@'172.%.%.%' IDENTIFIED WITH mysql_native_password BY '$MYSQL_ROOT_PASSWORD';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'172.%.%.%' WITH GRANT OPTION;

-- ============================================================
-- LEVEL 1: APPLICATION USER (Localhost Only - Normal Operations)
-- ============================================================
-- Create app user for localhost (container internal service communication)
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON $DATABASE.* TO '$DB_USER'@'localhost';

-- Create app user for 127.0.0.1 (loopback fallback)
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON $DATABASE.* TO '$DB_USER'@'127.0.0.1';

-- Create app user for Docker 'mysql' service hostname (recommended for compose)
CREATE USER IF NOT EXISTS '$DB_USER'@'mysql' IDENTIFIED BY '$DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON $DATABASE.* TO '$DB_USER'@'mysql';

-- ============================================================
-- LEVEL 2: APPLICATION USER (Docker Bridge Network - For Tools/Proxies)
-- ============================================================
-- Allow app user access from Docker Bridge network range
-- Enables nginx reverse proxy, other docker services to connect safely
CREATE USER IF NOT EXISTS '$DB_USER'@'172.%.%.%' IDENTIFIED BY '$DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON $DATABASE.* TO '$DB_USER'@'172.%.%.%';

-- ============================================================
-- Apply All Changes
-- ============================================================
FLUSH PRIVILEGES;
EOF

echo "✅ MySQL security hardening complete:"
echo ""
echo "   ACCESS LEVELS CONFIGURED:"
echo "   ├─ Level 1 (Localhost):"
echo "   │  ├─ root@localhost       (mysql_native_password - Workbench direct)"
echo "   │  ├─ root@127.0.0.1       (Loopback)"
echo "   │  ├─ root@mysql           (Docker internal)"
echo "   │  └─ $DB_USER@{localhost,127.0.0.1,mysql}  (App normal ops)"
echo "   │"
echo "   └─ Level 2 (Docker Bridge):"
echo "      ├─ root@172.%.%.%        (Workbench via Docker host)"
echo "      └─ $DB_USER@172.%.%.%    (App via services/reverse proxy)"
echo ""
echo "   SECURITY POLICIES ENFORCED:"
echo "   • ❌ root@'%' BLOCKED       (prevents unlimited remote root)"
echo "   • ❌ $DB_USER@'%' BLOCKED   (prevents wildcard lateral movement)"
echo "   • ✅ mysql_native_password (Workbench/Navicat compatibility)"
echo "   • ✅ No hardcoded passwords (all from env variables)"
echo ""
echo "   DATABASE: $DATABASE"
echo "   APP USER: $DB_USER has SELECT, INSERT, UPDATE, DELETE privileges"
