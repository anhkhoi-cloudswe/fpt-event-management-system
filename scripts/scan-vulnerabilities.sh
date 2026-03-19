#!/bin/bash
# Security & Performance Vulnerability Scanner for Frontend
# Usage: chmod +x scan-vulnerabilities.sh && ./scan-vulnerabilities.sh

echo "🔍 Frontend Security & Performance Scanner"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counter
CRITICAL=0
HIGH=0
MEDIUM=0

echo -e "${BLUE}[1/8] Scanning for Hardcoded Secrets...${NC}"
echo "---"

# Check for RECAPTCHA key
if grep -r "6LdvPQIsAAAAAG7glbICpFiBR9o5MhboFU4JvxAJ" frontend/src/ 2>/dev/null; then
    echo -e "${RED}❌ CRITICAL: RECAPTCHA Site Key hardcoded in source${NC}"
    echo "   Files:"
    grep -r "6LdvPQIsAAAAAG7glbICpFiBR9o5MhboFU4JvxAJ" frontend/src/ | cut -d: -f1 | sort -u | sed 's/^/     /'
    ((CRITICAL++))
else
    echo -e "${GREEN}✅ No hardcoded RECAPTCHA key found${NC}"
fi

# Check for token hardcoding
echo ""
if grep -r "const token = 'cookie-auth'" frontend/src/ >/dev/null 2>&1; then
    COUNT=$(grep -r "const token = 'cookie-auth'" frontend/src/ | wc -l)
    echo -e "${RED}❌ CRITICAL: Hardcoded 'cookie-auth' token found in $COUNT locations${NC}"
    echo "   Files:"
    grep -r "const token = 'cookie-auth'" frontend/src/ | cut -d: -f1 | sort -u | sed 's/^/     /'
    ((CRITICAL++))
else
    echo -e "${GREEN}✅ No hardcoded token strings found${NC}"
fi

echo ""
echo -e "${BLUE}[2/8] Scanning for Console Logs...${NC}"
echo "---"

CONSOLE_COUNT=$(grep -r "console\.\(log\|debug\|warn\)" frontend/src/ --include="*.tsx" --include="*.ts" | grep -v "node_modules" | wc -l)

if [ "$CONSOLE_COUNT" -gt 30 ]; then
    echo -e "${RED}❌ CRITICAL: Found $CONSOLE_COUNT console logs (acceptable: <10)${NC}"
    echo "   Top offenders:"
    grep -r "console\.\(log\|debug\|warn\)" frontend/src/ --include="*.tsx" | cut -d: -f1 | sort | uniq -c | sort -rn | head -5 | sed 's/^/     /'
    ((CRITICAL++))
elif [ "$CONSOLE_COUNT" -gt 10 ]; then
    echo -e "${YELLOW}⚠️  HIGH: Found $CONSOLE_COUNT console logs${NC}"
    ((HIGH++))
else
    echo -e "${GREEN}✅ Minimal console logging ($CONSOLE_COUNT found)${NC}"
fi

echo ""
echo -e "${BLUE}[3/8] Scanning for Code Splitting...${NC}"
echo "---"

LAZY_COUNT=$(grep -r "lazy(" frontend/src/ --include="*.tsx" --include="*.ts" | wc -l)
IMPORT_COUNT=$(grep -r "import.*from" frontend/src/App.tsx | wc -l)

if [ "$LAZY_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ CRITICAL: No code splitting found ($IMPORT_COUNT static imports in App.tsx)${NC}"
    ((CRITICAL++))
else
    echo -e "${GREEN}✅ Code splitting detected ($LAZY_COUNT lazy imports)${NC}"
fi

echo ""
echo -e "${BLUE}[4/8] Scanning Vite Config for Source Maps...${NC}"
echo "---"

if grep -q "sourcemap.*false" frontend/vite.config.ts; then
    echo -e "${GREEN}✅ Source maps disabled in production${NC}"
else
    echo -e "${YELLOW}⚠️  HIGH: Source maps may be enabled in production${NC}"
    echo "   Current vite.config.ts build config:"
    grep -A 10 "build:" frontend/vite.config.ts | sed 's/^/     /'
    ((HIGH++))
fi

echo ""
echo -e "${BLUE}[5/8] Scanning for CORS Configuration...${NC}"
echo "---"

if grep -q "Access-Control-Allow-Origin.*\*" backend/main.go; then
    echo -e "${RED}❌ CRITICAL: CORS allows all origins (*)${NC}"
    grep "Access-Control-Allow-Origin" backend/main.go | sed 's/^/     /'
    ((CRITICAL++))
else
    echo -e "${GREEN}✅ CORS properly restricted${NC}"
fi

echo ""
echo -e "${BLUE}[6/8] Scanning TypeScript Config...${NC}"
echo "---"

if grep -q '"noUnusedLocals": false' frontend/tsconfig.json; then
    echo -e "${YELLOW}⚠️  MEDIUM: TypeScript strict mode disabled${NC}"
    ((MEDIUM++))
else
    echo -e "${GREEN}✅ TypeScript strict mode enabled${NC}"
fi

echo ""
echo -e "${BLUE}[7/8] Scanning for Input Validation...${NC}"
echo "---"

VALIDATION=$(grep -r "if.*length < \|if.*required" frontend/src/pages/ --include="*.tsx" | wc -l)

if [ "$VALIDATION" -lt 5 ]; then
    echo -e "${YELLOW}⚠️  MEDIUM: Minimal input validation (found: $VALIDATION checks)${NC}"
    ((MEDIUM++))
else
    echo -e "${GREEN}✅ Input validation present ($VALIDATION checks found)${NC}"
fi

echo ""
echo -e "${BLUE}[8/8] Checking for Exposed API Endpoints...${NC}"
echo "---"

ENDPOINTS=$(grep -r "'/api/" frontend/src/ --include="*.tsx" --include="*.ts" | cut -d"'" -f2 | sort -u | head -10)

echo -e "${YELLOW}⚠️  HIGH: Exposed API endpoints visible in Network tab:${NC}"
echo "$ENDPOINTS" | sed 's/^/     /'
((HIGH++))

echo ""
echo "=========================================="
echo -e "${RED}Summary:${NC}"
echo -e "  🔴 CRITICAL Issues: $CRITICAL"
echo -e "  🟠 HIGH Issues:     $HIGH"
echo -e "  🟡 MEDIUM Issues:   $MEDIUM"
echo "=========================================="

if [ "$CRITICAL" -gt 0 ]; then
    echo -e "${RED}⚠️  ACTION REQUIRED: Critical security issues detected!${NC}"
    exit 1
elif [ "$HIGH" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Please address high-priority issues.${NC}"
    exit 0
else
    echo -e "${GREEN}✅ No critical issues found.${NC}"
    exit 0
fi
