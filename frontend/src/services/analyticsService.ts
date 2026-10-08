import { api } from '../config/api'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GA4Summary {
  pageViews: number
  activeUsers: number
  sessions: number
  bounceRate: number
  conversions: number
}

export interface GA4TimelinePoint {
  date: string // YYYYMMDD
  pageViews: number
  activeUsers: number
}

export interface GA4DeviceBreakdown {
  device: string // "mobile" | "desktop" | "tablet"
  users: number
}

export interface GA4TrafficSource {
  source: string
  users: number
}

export interface GA4Geography {
  country: string
  users: number
}

export interface GA4EventAnalytics {
  summary: GA4Summary
  timeline: GA4TimelinePoint[]
  deviceBreakdown: GA4DeviceBreakdown[]
  topSources: GA4TrafficSource[]
  geography: GA4Geography[]
  realtime?: { activeUsers: number }
}

export interface GA4SystemAnalytics extends GA4EventAnalytics {
  topPages: { page: string; views: number }[]
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const analyticsService = {
  /**
   * GET /api/v1/analytics/event/:id
   * Organizer PRO/BUSINESS + Admin - per-event page metrics
   */
  async getEventAnalytics(
    eventId: number,
    params?: { startDate?: string; endDate?: string }
  ): Promise<GA4EventAnalytics> {
    const res = await api.get(`/v1/analytics/event/${eventId}`, { params })
    return res.data?.data || res.data
  },

  /**
   * GET /api/v1/analytics/system
   * Admin only - system-wide metrics
   */
  async getSystemAnalytics(
    params?: { startDate?: string; endDate?: string }
  ): Promise<GA4SystemAnalytics> {
    const res = await api.get('/v1/analytics/system', { params })
    return res.data?.data || res.data
  },

  /**
   * GET /api/v1/analytics/realtime
   * Admin + BUSINESS Organizer - active users right now
   */
  async getRealtimeUsers(): Promise<{ activeUsers: number }> {
    const res = await api.get('/v1/analytics/realtime')
    return res.data?.data || res.data
  },
}
