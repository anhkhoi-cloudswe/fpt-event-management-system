#!/usr/bin/env bash
# =============================================================================
# FPT Event — full bootstrap after terraform destroy / fresh clone
#
# Runs (in order):
#   1. terraform init + apply (infrastructure/)
#   2. SSH tunnel via bastion → RDS:3306, then mysql < Database/initdb.d/01_fpt_event_full.sql
#   3. npm ci + npm run build (frontend/)
#   4. aws s3 sync dist/ → frontend bucket + CloudFront invalidation
#
# Prerequisites:
#   - aws CLI, terraform, npm, mysql client, ssh
#   - AWS credentials configured (same account/region as Terraform)
#
# Required for DB init:
#   export FPT_RDS_PASSWORD='...'   # must match password in infrastructure/database.tf
#
# Optional:
#   export AWS_REGION=ap-southeast-1          # default
#   export FPT_LOCAL_DB_PORT=13306            # local tunnel port
#   export SKIP_TERRAFORM_APPLY=1             # skip step 1 (infra already applied)
#   export SKIP_DB_INIT=1                     # skip step 2
#   export SKIP_FRONTEND=1                    # skip steps 3–4
#   export TF_APPLY_EXTRA_ARGS=''             # e.g. '-target=aws_instance.bastion'
#   TERRAFORM_APPLY_AUTO_APPROVE=0            # set to require manual "yes" on apply
#
# Usage:
#   chmod +x scripts/bootstrap-fpt-stack.sh
#   export FPT_RDS_PASSWORD='your-password'
#   ./scripts/bootstrap-fpt-stack.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$REPO_ROOT/infrastructure"
FRONTEND_DIR="$REPO_ROOT/frontend"
SQL_FILE="$REPO_ROOT/Database/initdb.d/01_fpt_event_full.sql"

AWS_REGION="${AWS_REGION:-ap-southeast-1}"
LOCAL_PORT="${FPT_LOCAL_DB_PORT:-13306}"
TERRAFORM_APPLY_AUTO_APPROVE="${TERRAFORM_APPLY_AUTO_APPROVE:-1}"

RDS_USER="${FPT_RDS_USER:-admin}"
RDS_DB="${FPT_RDS_DB:-fpteventmanagement}"

log() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

command -v terraform >/dev/null || die "terraform not found"
command -v aws >/dev/null || die "aws CLI not found"
command -v npm >/dev/null || die "npm not found"
command -v mysql >/dev/null || die "mysql client not found"
command -v ssh >/dev/null || die "ssh not found"

# --- 1. Terraform ---
if [[ "${SKIP_TERRAFORM_APPLY:-0}" != "1" ]]; then
  log "Terraform init ($TF_DIR)"
  (cd "$TF_DIR" && terraform init)

  APPLY_ARGS=()
  if [[ "$TERRAFORM_APPLY_AUTO_APPROVE" == "1" ]]; then
    APPLY_ARGS+=(-auto-approve)
  fi

  log "Terraform apply"
  if [[ -n "${TF_APPLY_EXTRA_ARGS:-}" ]]; then
    # shellcheck disable=SC2086
    (cd "$TF_DIR" && terraform apply "${APPLY_ARGS[@]}" $TF_APPLY_EXTRA_ARGS)
  else
    (cd "$TF_DIR" && terraform apply "${APPLY_ARGS[@]}")
  fi
else
  log "Skipping terraform apply (SKIP_TERRAFORM_APPLY=1)"
fi

# Read Terraform outputs
BASTION_IP="$(cd "$TF_DIR" && terraform output -raw bastion_public_ip)"
RDS_HOST="$(cd "$TF_DIR" && terraform output -raw rds_hostname)"
BUCKET="$(cd "$TF_DIR" && terraform output -raw frontend_s3_bucket)"
CF_ID="$(cd "$TF_DIR" && terraform output -raw cloudfront_distribution_id)"
SSH_KEY="$TF_DIR/fpt-bastion-ssh"

[[ -n "$BASTION_IP" ]] || die "empty bastion_public_ip"
[[ -n "$RDS_HOST" ]] || die "empty rds_hostname"
[[ -n "$BUCKET" ]] || die "empty frontend_s3_bucket"
[[ -f "$SSH_KEY" ]] || die "missing SSH key: $SSH_KEY (run terraform apply to create it)"

chmod 600 "$SSH_KEY" 2>/dev/null || true

# --- 2. DB init via SSH tunnel ---
if [[ "${SKIP_DB_INIT:-0}" != "1" ]]; then
  [[ -f "$SQL_FILE" ]] || die "missing SQL file: $SQL_FILE"
  [[ -n "${FPT_RDS_PASSWORD:-}" ]] || die "set FPT_RDS_PASSWORD (must match infrastructure/database.tf)"

  log "Waiting for SSH on bastion $BASTION_IP ..."
  for i in $(seq 1 30); do
    if ssh -i "$SSH_KEY" \
        -o StrictHostKeyChecking=accept-new \
        -o ConnectTimeout=10 \
        -o BatchMode=yes \
        ec2-user@"$BASTION_IP" "echo ok" 2>/dev/null; then
      break
    fi
    if [[ "$i" -eq 30 ]]; then
      die "bastion SSH not ready after ~5 minutes"
    fi
    sleep 10
  done

  log "Opening SSH tunnel localhost:$LOCAL_PORT → $RDS_HOST:3306"
  ssh -i "$SSH_KEY" \
    -o StrictHostKeyChecking=accept-new \
    -o ServerAliveInterval=30 \
    -N -L "${LOCAL_PORT}:${RDS_HOST}:3306" \
    ec2-user@"$BASTION_IP" &
  TUNNEL_PID=$!
  sleep 3

  cleanup_tunnel() { kill "$TUNNEL_PID" 2>/dev/null || true; }
  trap cleanup_tunnel EXIT

  log "Loading schema into $RDS_DB (via tunnel)"
  export MYSQL_PWD="$FPT_RDS_PASSWORD"
  if ! mysql -h 127.0.0.1 -P "$LOCAL_PORT" -u "$RDS_USER" --default-character-set=utf8mb4 "$RDS_DB" <"$SQL_FILE"; then
    unset MYSQL_PWD
    die "mysql import failed"
  fi
  unset MYSQL_PWD

  cleanup_tunnel
  trap - EXIT
  log "Database init done"
else
  log "Skipping DB init (SKIP_DB_INIT=1)"
fi

# --- 3–4. Frontend build + S3 + invalidation ---
if [[ "${SKIP_FRONTEND:-0}" != "1" ]]; then
  log "npm ci (frontend)"
  (cd "$FRONTEND_DIR" && npm ci)

  log "npm run build"
  (cd "$FRONTEND_DIR" && npm run build)

  DIST="$FRONTEND_DIR/dist"
  [[ -d "$DIST" ]] || die "missing $DIST after build"

  log "aws s3 sync → s3://$BUCKET/"
  aws s3 sync "$DIST/" "s3://${BUCKET}/" --delete --region "$AWS_REGION" \
    --exclude "index.html" \
    --cache-control "public,max-age=31536000,immutable"

  aws s3 cp "$DIST/index.html" "s3://${BUCKET}/index.html" --region "$AWS_REGION" \
    --cache-control "max-age=0,no-cache,no-store,must-revalidate" \
    --content-type "text/html; charset=utf-8"

  log "CloudFront invalidation /* (distribution $CF_ID)"
  aws cloudfront create-invalidation \
    --distribution-id "$CF_ID" \
    --paths "/*" \
    --region us-east-1 \
    --output text \
    --query 'Invalidation.Id'

  log "Frontend deploy done"
else
  log "Skipping frontend (SKIP_FRONTEND=1)"
fi

CF_URL="$(cd "$TF_DIR" && terraform output -raw cloudfront_url)"
log "Done. Site: $CF_URL"
