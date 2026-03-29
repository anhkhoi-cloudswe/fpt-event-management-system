import { useState, useEffect, useMemo } from 'react'
import { Clock } from 'lucide-react'

export function RealtimeClock() {
    const [time, setTime] = useState<string>('')
    const [userTimeZone, setUserTimeZone] = useState<string>('')

    // Detect user's timezone on mount
    useEffect(() => {
        try {
            const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
            setUserTimeZone(detectedTimeZone)
        } catch (error) {
            console.error('Error detecting timezone:', error)
            setUserTimeZone('Asia/Ho_Chi_Minh')
        }
    }, [])

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

    // Update time every second
    useEffect(() => {
        if (!userTimeZone) return

        const updateTime = () => {
            const now = new Date()
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
            className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200 hover:shadow-md transition-shadow cursor-help"
            title={`Timezone: ${userTimeZone}`}
        >
            <Clock size={16} className="text-orange-600 animate-pulse" />
            <span className="text-sm font-semibold text-gray-900">
                {time || '--:-- --'}
            </span>
            <span className="text-xs font-medium text-orange-600">{timezone}</span>
        </div>
    )
}
