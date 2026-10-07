import { api } from '../config/api'

export interface SubscriptionTier {
  tierId: number
  tierCode: string
  name: string
  description?: string
  priceVnd: number
  billingCycle: string
  commissionBps: number
  maxCapacityLimit: number // -1 = Unlimited
  hasAdvancedReports: boolean
  isActive: boolean
  fixedFeePerTicket?: number
  ticketPriceThreshold?: number
}

export interface CurrentSubscription {
  organizerId: number
  role: string
  tierCode: string
  tierName: string
  maxCapacityLimit: number
  commissionBps: number
  hasAdvancedReports: boolean
  feeSource: string
  status: string // ACTIVE, EXPIRED, CANCELLED
  startDate: string
  endDate: string
  daysRemaining: number
  autoRenew: boolean
  scheduledDowngradeTierCode?: string | null
}

export interface SubscribeRequest {
  tierCode: string
  requestId: string
  autoRenew?: boolean
  action?: 'BUY' | 'RENEW' | 'UPGRADE'
}

export interface SubscribeResponse {
  subscriptionId: number
  tierCode: string
  amountPaid: number
  proratedCredit: number
  startDate: string
  endDate: string
  message: string
}

export interface CreateSubscriptionTierRequest {
  tierCode: string
  name: string
  description?: string
  priceVnd: number
  billingCycle?: string
  commissionBps: number
  maxCapacityLimit: number
  hasAdvancedReports: boolean
  isActive: boolean
  reason?: string
}

export const subscriptionService = {
  // GET /api/v1/subscription/tiers
  async getTiers(): Promise<SubscriptionTier[]> {
    const res = await api.get('/v1/subscription/tiers')
    const data = res.data
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.tiers)) return data.tiers
    if (Array.isArray(data?.data)) return data.data
    return []
  },

  // GET /api/v1/subscription/current
  async getCurrentSubscription(): Promise<CurrentSubscription> {
    const res = await api.get('/v1/subscription/current')
    return res.data?.data || res.data
  },

  // POST /api/v1/subscription/subscribe
  async subscribeOrUpgrade(payload: SubscribeRequest): Promise<SubscribeResponse> {
    const res = await api.post('/v1/subscription/subscribe', payload)
    return res.data?.data || res.data
  },

  // POST /api/v1/subscription/downgrade
  async scheduleDowngrade(targetTierCode: string): Promise<{ message: string }> {
    const res = await api.post('/v1/subscription/downgrade', { targetTierCode })
    return res.data?.data || res.data
  },

  // POST /api/v1/subscription/auto-renew
  async setAutoRenew(autoRenew: boolean): Promise<{ message: string }> {
    const res = await api.post('/v1/subscription/auto-renew', { autoRenew })
    return res.data?.data || res.data
  },

  // POST /api/v1/subscription/cancel
  async cancelSubscription(): Promise<{ message: string }> {
    const res = await api.post('/v1/subscription/cancel')
    return res.data?.data || res.data
  },

  // POST /api/v1/admin/subscription-tiers
  async createTier(payload: CreateSubscriptionTierRequest): Promise<SubscriptionTier> {
    const res = await api.post('/v1/admin/subscription-tiers', payload)
    return res.data?.data || res.data
  },

  // PUT /api/v1/admin/subscription-tiers
  async updateTier(payload: {
    tierId: number
    priceVnd: number
    commissionBps: number
    maxCapacityLimit: number
    hasAdvancedReports: boolean
    isActive: boolean
    reason?: string
  }): Promise<{ message: string }> {
    const res = await api.put('/v1/admin/subscription-tiers', payload)
    return res.data?.data || res.data
  },

  // DELETE /api/v1/admin/subscription-tiers
  async deleteTier(tierId: number, reason?: string): Promise<{ message: string }> {
    const res = await api.delete('/v1/admin/subscription-tiers', {
      params: { tierId, reason }
    })
    return res.data?.data || res.data
  },
}
