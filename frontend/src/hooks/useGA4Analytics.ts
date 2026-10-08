import { useState, useEffect, useCallback, useRef } from 'react'
import {
  analyticsService,
  GA4EventAnalytics,
  GA4SystemAnalytics,
} from '../services/analyticsService'

export type GA4Tier = 'FREE' | 'PRO' | 'BUSINESS' | 'SCHOOL_ORGANIZER' | 'ADMIN'

interface DateRange {
  startDate: string // 'YYYY-MM-DD'
  endDate: string   // 'YYYY-MM-DD'
}

// ─── Event-level analytics hook (Organizer / Admin per-event) ────────────────
export function useGA4EventAnalytics(
  eventId: number | null,
  tier: GA4Tier,
  dateRange?: DateRange
) {
  const [data, setData] = useState<GA4EventAnalytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realtimeUsers, setRealtimeUsers] = useState<number | null>(null)
  const cacheRef = useRef<{ key: string; data: GA4EventAnalytics; ts: number } | null>(null)

  const isLocked = tier === 'FREE'
  const hasAdvanced = tier === 'BUSINESS' || tier === 'SCHOOL_ORGANIZER' || tier === 'ADMIN'

  const fetch = useCallback(async () => {
    if (!eventId || isLocked) return
    const cacheKey = `${eventId}-${dateRange?.startDate || ''}-${dateRange?.endDate || ''}`
    const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

    // Return from cache if fresh
    if (
      cacheRef.current &&
      cacheRef.current.key === cacheKey &&
      Date.now() - cacheRef.current.ts < CACHE_TTL
    ) {
      setData(cacheRef.current.data)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await analyticsService.getEventAnalytics(eventId, {
        startDate: dateRange?.startDate,
        endDate: dateRange?.endDate,
      })
      cacheRef.current = { key: cacheKey, data: result, ts: Date.now() }
      setData(result)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không thể tải dữ liệu Analytics.')
    } finally {
      setLoading(false)
    }
  }, [eventId, tier, dateRange?.startDate, dateRange?.endDate, isLocked])

  useEffect(() => {
    fetch()
  }, [fetch])

  // Poll realtime users every 30s for BUSINESS/ADMIN
  useEffect(() => {
    if (!hasAdvanced || !eventId) return
    const pollRealtime = async () => {
      try {
        const rt = await analyticsService.getRealtimeUsers()
        setRealtimeUsers(rt.activeUsers)
      } catch {
        // silently fail
      }
    }
    pollRealtime()
    const interval = window.setInterval(pollRealtime, 30_000)
    return () => clearInterval(interval)
  }, [hasAdvanced, eventId])

  return { data, loading, error, isLocked, hasAdvanced, realtimeUsers, refetch: fetch }
}

// ─── System-level analytics hook (Admin only) ────────────────────────────────
export function useGA4SystemAnalytics(dateRange?: DateRange) {
  const [data, setData] = useState<GA4SystemAnalytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realtimeUsers, setRealtimeUsers] = useState<number | null>(null)
  const cacheRef = useRef<{ key: string; data: GA4SystemAnalytics; ts: number } | null>(null)

  const fetch = useCallback(async () => {
    const cacheKey = `system-${dateRange?.startDate || ''}-${dateRange?.endDate || ''}`
    const CACHE_TTL = 5 * 60 * 1000

    if (
      cacheRef.current &&
      cacheRef.current.key === cacheKey &&
      Date.now() - cacheRef.current.ts < CACHE_TTL
    ) {
      setData(cacheRef.current.data)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await analyticsService.getSystemAnalytics({
        startDate: dateRange?.startDate,
        endDate: dateRange?.endDate,
      })
      cacheRef.current = { key: cacheKey, data: result, ts: Date.now() }
      setData(result)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không thể tải dữ liệu Analytics.')
    } finally {
      setLoading(false)
    }
  }, [dateRange?.startDate, dateRange?.endDate])

  useEffect(() => {
    fetch()
  }, [fetch])

  // Poll realtime users every 30s
  useEffect(() => {
    const pollRealtime = async () => {
      try {
        const rt = await analyticsService.getRealtimeUsers()
        setRealtimeUsers(rt.activeUsers)
      } catch {
        // silently fail
      }
    }
    pollRealtime()
    const interval = window.setInterval(pollRealtime, 30_000)
    return () => clearInterval(interval)
  }, [])

  return { data, loading, error, realtimeUsers, refetch: fetch }
}
