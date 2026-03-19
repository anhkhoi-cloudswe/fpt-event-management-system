# Frontend Storage Security Policy

## Overview
User authentication data in this application is stored **ONLY** in:
1. **React State** (in-memory, lost on page refresh)
2. **HttpOnly Cookie** (managed by browser, inaccessible to JavaScript)

**localStorage and sessionStorage are BANNED for user-related data.**

## Security Rationale

### Why HttpOnly Cookies?
- Immune to XSS attacks - JavaScript cannot access HttpOnly cookies
- Automatically sent by browser to API on each request
- Server controls expiration and refresh
- No client-side token management burden

### Why NOT localStorage?
- Vulnerable to XSS attacks - any malicious script can read/write user data
- Persists across sessions, increasing attack surface
- Requires manual refresh logic and cache invalidation
- Cannot implement automatic expiration

## Enforcement Mechanisms

### 1. Cleanup on App Bootstrap (AuthContext.tsx, ~line 103)
```typescript
useEffect(() => {
  // Remove any legacy token/user entries from localStorage.
  // User state is stored in React state + HttpOnly cookie, NEVER in localStorage.
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  sessionStorage.removeItem('user')
}, [])
```
**Purpose:** On app startup, automatically clear any stale entries from previous sessions.

### 2. Continuous Monitoring (AuthContext.tsx, ~line 173)
```typescript
// Defensive: Monitor and clear any user entries in localStorage.
// User state must ONLY exist in React state + HttpOnly cookie, never localStorage.
useEffect(() => {
  // Clear on mount and whenever user state changes
  localStorage.removeItem('user')
  sessionStorage.removeItem('user')

  // Also monitor window storage events from other tabs that might try to set user
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'user' && e.newValue) {
      console.warn('Detected unauthorized localStorage user write. Removing.')
      localStorage.removeItem('user')
    }
  }

  window.addEventListener('storage', handleStorageChange)
  return () => window.removeEventListener('storage', handleStorageChange)
}, [user])
```
**Purpose:** 
- Actively clears user entries whenever user state changes
- Monitors storage events from other tabs attempting to write user data
- Logs warnings if unauthorized writes are detected
- Self-heals by immediately removing any localStorage user entries

### 3. 401 Interceptor (AuthContext.tsx, ~line 126)
```typescript
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      setUser(null)  // Clear React state
      setToken(null)  // Clear token state
      // Redirect to login if needed
    }
    return Promise.reject(error)
  }
)
```
**Purpose:** On session expiration (401), immediately clear all client-side user state.

### 4. Safe Login Flow (Login.tsx, ~line 160)
```typescript
// After successful API login response:
setUser(user)  // React state ONLY
// NO localStorage.setItem call
```
**Status:** ✅ Verified - no localStorage writes in Login.tsx

### 5. Removed Comment (Login.tsx, ~line 117)
**Removed:** Misleading comment that claimed "usually auto-saves to localStorage"
**Reason:** Prevents future developers from adding localStorage writes

## Testing Checklist

Before deploying any changes:

- [ ] Run `npm run build` to compile TypeScript (catches type errors)
- [ ] Search codebase: `grep -r "localStorage.setItem('user'" frontend/src/` → should return 0 results
- [ ] Search codebase: `grep -r "localStorage.setItem(\"user\"" frontend/src/` → should return 0 results
- [ ] Search codebase: `grep -r "sessionStorage.setItem.*user" frontend/src/` → should return 0 results
- [ ] Manual browser test:
  1. Open DevTools → Application tab
  2. Login successfully
  3. Check localStorage and sessionStorage
  4. Verify only `__Secure-jwt` (or similar) cookie exists, NOT user data
  5. Verify React DevTools shows user in state
  6. Refresh page - React state clears (as expected), user data should be re-fetched from API

## Code Review Checklist

When reviewing PRs involving auth:

- ❌ Reject any code adding `localStorage.setItem` for user/auth data
- ❌ Reject any code adding `sessionStorage.setItem` for user/auth data
- ✅ Accept only `localStorage.removeItem()` or `localStorage.clear()` calls
- ✅ Verify login responses call `setUser()` (React state), not localStorage
- ✅ Verify logout calls `setUser(null)` and clears all state

## Historical Audit

**Verified No localStorage User Writes In:**
- ✅ Login.tsx - only setUser() React state
- ✅ AuthContext.tsx - only removeItem() cleanup
- ✅ ResetPassword.tsx - no localStorage writes
- ✅ PaymentSuccess.tsx - only setUser() React state  
- ✅ EventDetail.tsx - uses user?.role from context only
- ✅ All other files - comprehensive grep search: 0 matches

## Emergency Procedures

If a user reports user data in localStorage:

1. Check browser DevTools → Application tab → localStorage
2. If user object exists:
   - Immediately add to issue tracker
   - Review recent commits for setItem calls
   - Clear localStorage manually: `localStorage.clear()` in console
   - Force hard refresh: `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
3. This is likely a leftover from old code - AuthContext now auto-clears on mount

## Future Development

DO NOT add localStorage for:
- User ID, email, role, or any PII
- Auth tokens or JWT claims
- Session identifiers
- Permissions or capabilities

USE ONLY for:
- Non-critical UI preferences (theme, language, visible columns)
- Analytics opt-out flags
- Non-sensitive feature flags
- Temporary editor/form state

ALWAYS use sessionStorage for:
- Ephemeral tokens (like reCAPTCHA response tokens)
- Cross-tab communication flags
- Temporary state during multi-step flows
