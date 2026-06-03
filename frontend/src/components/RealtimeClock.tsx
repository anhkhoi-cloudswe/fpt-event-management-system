import { useState, useEffect, useMemo } from 'react'
import { Clock } from 'lucide-react'
import { getSystemTimeSync, syncSystemTime } from '../utils/systemTime'
import { useAuth } from '../contexts/AuthContext'

export function RealtimeClock() {
    const { user } = useAuth()
    const [time, setTime] = useState<string>('')
    const [userTimeZone, setUserTimeZone] = useState<string>('')
    const [isSyncing, setIsSyncing] = useState(true)

    // Sync with Backend on mount and periodically
    useEffect(() => {
        const syncWithBackend = async () => {
            setIsSyncing(true)
            try {
                await syncSystemTime()
                console.log('[RealtimeClock] Synced with Backend Time Machine')
            } catch (error) {
                console.error('[RealtimeClock] Failed to sync:', error)
            } finally {
                setIsSyncing(false)
            }
        }

        // Sync immediately on mount
        syncWithBackend()

        // Re-sync every 60 seconds
        const syncInterval = setInterval(syncWithBackend, 60000)
        return () => clearInterval(syncInterval)
    }, [])

    // Use selected user timezone first, then browser timezone as fallback.
    useEffect(() => {
        const resolveTimeZone = () => {
            const storedTimeZone = localStorage.getItem('user_timezone')
            return user?.timezone_id || storedTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh'
        }

        const updateTimeZone = () => {
            try {
                setUserTimeZone(resolveTimeZone())
            } catch (error) {
                console.error('Error detecting timezone:', error)
                setUserTimeZone('Asia/Ho_Chi_Minh')
            }
        }

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'user_timezone') {
                updateTimeZone()
            }
        }

        updateTimeZone()
        window.addEventListener('storage', handleStorageChange)
        window.addEventListener('timezone-change', updateTimeZone)
        return () => {
            window.removeEventListener('storage', handleStorageChange)
            window.removeEventListener('timezone-change', updateTimeZone)
        }
    }, [user?.timezone_id])

    useEffect(() => {
        if (!userTimeZone) return

        try {
            new Intl.DateTimeFormat('en-US', { timeZone: userTimeZone })
        } catch (error) {
            console.error('Invalid timezone selected:', error)
            setUserTimeZone('Asia/Ho_Chi_Minh')
        }
    }, [userTimeZone])

    // Calculate GMT offset once (memoized, doesn't change)
    const timezone = useMemo(() => {
        if (!userTimeZone) return 'GMT+0'

        const now = new Date()
        const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
        const tzDate = new Date(now.toLocaleString('en-US', { timeZone: userTimeZone }))
        const offset = Math.round((tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60))
        const sign = offset >= 0 ? '+' : ''
        return `GMT${sign}${offset}`
    }, [userTimeZone])

    // Update time every second using Time Machine offset
    useEffect(() => {
        if (!userTimeZone) return

        const updateTime = () => {
            // Use system time (respects Time Machine offset)
            const now = getSystemTimeSync()
            const formatter = new Intl.DateTimeFormat('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: userTimeZone
            })
            setTime(formatter.format(now))
        }

        updateTime() // Set immediately
        const interval = setInterval(updateTime, 1000)
        return () => clearInterval(interval)
    }, [userTimeZone])

    return (
        <div
            className={`flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200 hover:shadow-md transition-shadow ${isSyncing ? 'opacity-75' : ''
                } cursor-help`}
            title={`Timezone: ${userTimeZone}${isSyncing ? ' (syncing with Backend...)' : ''}`}
        >
            <Clock size={16} className={`${isSyncing ? 'animate-spin' : 'animate-pulse'
                } text-orange-600`} />
            <span className="text-sm font-semibold text-gray-900">
                {time || '--:-- --'}
            </span>
            <span className="text-xs font-medium text-orange-600">{timezone}</span>
        </div>
    )
}
