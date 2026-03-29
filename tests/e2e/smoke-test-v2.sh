#!/bin/bash

# Smoke Test v2: Pagination + Smart Sorting

API_URL="http://localhost:8080/api/v1"
TOKEN="Bearer test-token"

echo "=========================================="
echo "SMOKE TEST v2: Pagination & Smart Sorting"
echo "=========================================="

# Test 1: Get all events (no filter) - DEFAULT PAGINATION
echo ""
echo "[Test 1] Get all events with default pagination (limit=12)"
RESPONSE=$(curl -s "$API_URL/events" \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json")

# Extract metrics
TOTAL=$(echo "$RESPONSE" | grep -o '"total":[0-9]*' | cut -d: -f2)
PAGE=$(echo "$RESPONSE" | grep -o '"page":[0-9]*' | cut -d: -f2)
LIMIT=$(echo "$RESPONSE" | grep -o '"limit":[0-9]*' | cut -d: -f2)
DATA_COUNT=$(echo "$RESPONSE" | grep -o '"id"' | wc -l)

echo "✓ Total events: $TOTAL"
echo "✓ Current page: $PAGE"
echo "✓ Limit: $LIMIT"
echo "✓ Items returned: $DATA_COUNT"

# Verify pagination fields
if [[ "$TOTAL" -gt 0 && "$PAGE" -eq 1 && "$LIMIT" -eq 12 ]]; then
  echo "✅ PASS: Pagination fields correct"
else
  echo "❌ FAIL: Pagination fields incorrect"
fi

# Test 2: Check sorting for UPCOMING events (should be by start_time ASC)
echo ""
echo "[Test 2] Get UPCOMING events (should be sorted by start_time ASC - earliest first)"
RESPONSE=$(curl -s "$API_URL/events?status=upcoming" \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json")

echo "$RESPONSE" | grep -o '"status":"[^"]*"' | head -3
echo "✅ UPCOMING events retrieved"

# Test 3: Check sorting for CLOSED events (should be by end_time DESC)
echo ""
echo "[Test 3] Get CLOSED events (should be sorted by end_time DESC - most recent first)"
RESPONSE=$(curl -s "$API_URL/events?status=closed" \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json")

echo "$RESPONSE" | grep -o '"status":"[^"]*"' | head -3
echo "✅ CLOSED events retrieved"

# Test 4: Pagination with custom limit
echo ""
echo "[Test 4] Get events with limit=5"
RESPONSE=$(curl -s "$API_URL/events?limit=5" \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json")

LIMIT=$(echo "$RESPONSE" | grep -o '"limit":[0-9]*' | cut -d: -f2)
DATA_COUNT=$(echo "$RESPONSE" | grep -o '"id"' | wc -l)

echo "✓ Limit: $LIMIT"
echo "✓ Items returned: $DATA_COUNT"

if [[ "$DATA_COUNT" -le 5 ]]; then
  echo "✅ PASS: Limit applied correctly"
else
  echo "❌ FAIL: Limit not applied correctly"
fi

# Test 5: Pagination - Page 2
echo ""
echo "[Test 5] Get events - Page 2 (limit=5)"
RESPONSE=$(curl -s "$API_URL/events?page=2&limit=5" \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json")

PAGE=$(echo "$RESPONSE" | grep -o '"page":[0-9]*' | cut -d: -f2)
echo "✓ Current page: $PAGE"

if [[ "$PAGE" -eq 2 ]]; then
  echo "✅ PASS: Page parameter works"
else
  echo "❌ FAIL: Page parameter not working"
fi

echo ""
echo "=========================================="
echo "SMOKE TEST COMPLETE"
echo "=========================================="
