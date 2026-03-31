/**
 * systemTime.ts - Time Machine Environment Synchronization
 * 
 * Synchronizes Frontend clock with Backend's time (respects SYSTEM_TIME_OVERRIDE).
 * 
 * PRIORITY:
 * 1. If VITE_SYSTEM_TIME_OVERRIDE env var is set during Docker build → use it
 * 2. Otherwise, fetch time from Backend API via /api/system/time endpoint
 * 3. Fallback: use browser's local time.now()
 */

let systemTimeOffset: number | null = null
let lastSystemSyncTime: number = 0
const SYNC_INTERVAL_MS = 60000 // Re-sync with backend every 60 seconds

/**
 * Get timezone-aware time offset from environment or backend
 * Returns: UTC timestamp difference (backend time - browser time)
 */
export async function getSystemTimeOffset(): Promise<number> {
    const now = Date.now()

    // Return cached offset if recent enough
    if (systemTimeOffset !== null && (now - lastSystemSyncTime) < SYNC_INTERVAL_MS) {
        return systemTimeOffset
    }

    // Priority 1: Check VITE_SYSTEM_TIME_OVERRIDE (set during Docker build)
    const overrideTimeStr = import.meta.env.VITE_SYSTEM_TIME_OVERRIDE
    if (overrideTimeStr) {
        try {
            const overrideTime = new Date(overrideTimeStr).getTime()
            systemTimeOffset = overrideTime - now
            lastSystemSyncTime = now
            console.log('[systemTime] Using VITE_SYSTEM_TIME_OVERRIDE:', overrideTimeStr)
            return systemTimeOffset
        } catch (error) {
            console.error('[systemTime] Failed to parse VITE_SYSTEM_TIME_OVERRIDE:', error)
        }
    }

    // Priority 2: Fetch from Backend API
    try {
        const response = await fetch('/api/health', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        })

        if (response.ok) {
            const data = await response.json()

            // Backend returns timestamp in milliseconds AND ISO format
            let backendTime: number | null = null

            // Priority: use 'timestamp' (milliseconds) if available
            if (typeof data.timestamp === 'number') {
                backendTime = data.timestamp
                console.log('[systemTime] Found timestamp:', data.timestamp)
            }
            // Fallback: parse 'systemTime' (ISO string)
            else if (typeof data.systemTime === 'string') {
                backendTime = new Date(data.systemTime).getTime()
                console.log('[systemTime] Parsed systemTime:', data.systemTime)
            }
            // Legacy: try 'iso' field if present
            else if (typeof data.iso === 'string') {
                backendTime = new Date(data.iso).getTime()
                console.log('[systemTime] Parsed iso:', data.iso)
            }

            if (backendTime !== null && !isNaN(backendTime)) {
                systemTimeOffset = backendTime - Date.now()
                lastSystemSyncTime = Date.now()
                console.log('[systemTime] Synced from /api/health, offset:', systemTimeOffset, 'ms')
                return systemTimeOffset
            }
        }
    } catch (error) {
        console.warn('[systemTime] Failed to fetch from /api/health:', error)
    }

    // Fallback: no offset (use browser time)
    systemTimeOffset = 0
    lastSystemSyncTime = now
    console.log('[systemTime] Using browser local time (no override, no backend sync)')
    return 0
}

/**
 * Get current system time (respecting Time Machine override if set)
 * 
 * Usage:
 *   const now = await getSystemTime()
 *   console.log(now)  // Date object synced with backend
 */
export async function getSystemTime(): Promise<Date> {
    const offset = await getSystemTimeOffset()
    return new Date(Date.now() + offset)
}

/**
 * Get system time synchronously using last-known offset
 * Falls back to browser time if sync hasn't happened yet
 * 
 * Usage:
 *   const now = getSystemTimeSync()  // Non-blocking, instant
 */
export function getSystemTimeSync(): Date {
    const offset = systemTimeOffset ?? 0
    return new Date(Date.now() + offset)
}

/**
 * Force re-sync with backend immediately
 * Useful when user navigates to a new page or after app resume
 */
export async function syncSystemTime(): Promise<void> {
    systemTimeOffset = null
    lastSystemSyncTime = 0
    await getSystemTimeOffset()
    console.log('[systemTime] Force re-sync completed')
}

/**
 * Clear any cached offset and reset to browser time
 */
export function resetSystemTime(): void {
    systemTimeOffset = null
    lastSystemSyncTime = 0
}
