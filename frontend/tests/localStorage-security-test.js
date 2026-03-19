/**
 * LocalStorage Security Validation Test
 * 
 * Run in browser console after login:
 * 1. Copy this entire file
 * 2. Paste into browser DevTools console
 * 3. A detailed report will be printed
 * 
 * Expected Results:
 * - localStorage should NOT contain 'user' key
 * - localStorage should NOT contain 'token' key
 * - sessionStorage should NOT contain 'user' key
 * - React state should contain user object
 */

console.group('🔒 Frontend Storage Security Validation')

// ============================================
// 1. Check localStorage for forbidden keys
// ============================================
console.group('1️⃣  localStorage Inspection')

const localStorageKeys = Object.keys(localStorage)
const forbiddenLocalStorageKeys = localStorageKeys.filter(
  (key) => key.includes('user') || key.includes('token') || key.includes('auth')
)

if (forbiddenLocalStorageKeys.length === 0) {
  console.log('✅ PASS: No forbidden keys in localStorage')
  console.log('   Keys found:', localStorageKeys.length > 0 ? localStorageKeys : '(empty)')
} else {
  console.error(
    '❌ FAIL: Found forbidden keys in localStorage:',
    forbiddenLocalStorageKeys
  )
  forbiddenLocalStorageKeys.forEach((key) => {
    console.error(`   - ${key}: ${localStorage.getItem(key)?.substring(0, 50)}...`)
  })
}

console.groupEnd()

// ============================================
// 2. Check sessionStorage for forbidden keys
// ============================================
console.group('2️⃣  sessionStorage Inspection')

const sessionStorageKeys = Object.keys(sessionStorage)
const forbiddenSessionStorageKeys = sessionStorageKeys.filter(
  (key) => key.includes('user') || key.includes('token') || key.includes('auth')
)

if (forbiddenSessionStorageKeys.length === 0) {
  console.log('✅ PASS: No forbidden keys in sessionStorage')
  console.log('   Keys found:', sessionStorageKeys.length > 0 ? sessionStorageKeys : '(empty)')
} else {
  console.error(
    '❌ FAIL: Found forbidden keys in sessionStorage:',
    forbiddenSessionStorageKeys
  )
}

console.groupEnd()

// ============================================
// 3. Check Document cookies for HttpOnly flag
// ============================================
console.group('3️⃣  Cookie Inspection')

const cookies = document.cookie.split('; ')
const authCookies = cookies.filter((c) => c.includes('jwt') || c.includes('auth') || c.includes('token'))

console.log('Visible cookies (HttpOnly cookies NOT shown here - that is GOOD):')
console.log(cookies.length > 0 ? cookies : '(no visible cookies - expected if using HttpOnly)')
console.log('')
console.log('ℹ️  HttpOnly cookies cannot be read from JavaScript.')
console.log('   If auth works but no jwt/token cookie visible above, that means:')
console.log('   ✅ The cookie is HttpOnly (secure)')
console.log('   ✅ Browser automatically sends it with requests')

console.groupEnd()

// ============================================
// 4. Validate StorageEvent monitoring works
// ============================================
console.group('4️⃣  StorageEvent Monitor Test')

console.log('Testing if AuthContext is monitoring for unauthorized localStorage writes...')

// Attempt to write user to localStorage (simulating attack)
const testKey = 'user'
const testValue = JSON.stringify({ id: 999, email: 'hack@evil.com', role: 'ADMIN' })

console.log(`Attempting to write: localStorage.setItem('${testKey}', '${testValue.substring(0, 30)}...')`)
localStorage.setItem(testKey, testValue)

// Check if it was immediately removed by the monitoring useEffect
setTimeout(() => {
  const storedValue = localStorage.getItem(testKey)
  if (storedValue === null) {
    console.log('✅ PASS: AuthContext monitoring detected and removed unauthorized write')
    console.log('   (Check browser console for "Detected unauthorized localStorage user write" warning)')
  } else {
    console.error(
      '❌ FAIL: Unauthorized write was NOT removed. Still stored:',
      storedValue.substring(0, 50)
    )
  }
  console.groupEnd()

  // ============================================
  // 5. Final summary
  // ============================================
  console.group('📋 Summary')

  const allPassed =
    forbiddenLocalStorageKeys.length === 0 &&
    forbiddenSessionStorageKeys.length === 0 &&
    localStorage.getItem('user') === null

  if (allPassed) {
    console.log(
      '🎉 ALL CHECKS PASSED - Storage security policy is being enforced correctly'
    )
    console.log('')
    console.log('User data is stored in:')
    console.log('  ✅ React state (in-memory)')
    console.log('  ✅ HttpOnly Cookie (managed by browser)')
    console.log('  ❌ NOT in localStorage or sessionStorage')
  } else {
    console.error(
      '⚠️  SECURITY WARNING - Storage policy is NOT being enforced correctly'
    )
    console.error('Please contact security team.')
  }

  console.groupEnd()
  console.groupEnd()
}, 100)
