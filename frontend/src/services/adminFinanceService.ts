import { api } from '../config/api'

export interface AdminFinanceOverview {
  totalCommission: number
  totalUsageFees: number
  totalEscrowLocked: number
  totalWalletsBalance: number
}

export interface AdminPayoutItem {
  payoutId: number
  userId: number
  organizerName: string
  organizerEmail: string
  bankAccountId: number
  bankCode: string
  bankName: string
  accountNumber: string
  accountHolderName: string
  amount: number
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED'
  note?: string
  rejectReason?: string
  processedBy?: number
  processorName?: string
  processedAt?: string
  createdAt: string
}

export interface AdminPayoutsResponse {
  payouts: AdminPayoutItem[]
  totalRecords: number
  currentPage: number
  limit: number
  totalPages: number
}

export interface AdminReceiptItem {
  receiptId: number
  orderId: number
  billId?: number
  ticketId?: number
  eventId: number
  eventTitle: string
  organizerId: number
  organizerName: string
  grossAmount: number
  systemFeePercentage: number
  fixedFee: number
  commissionAmount: number
  netAmount: number
  currency: string
  createdAt: string
}

export interface AdminReceiptsResponse {
  receipts: AdminReceiptItem[]
  totalRecords: number
  currentPage: number
  limit: number
  totalPages: number
}

export interface SubscriptionSubscriberItem {
  subscriptionId: number
  userId: number
  fullName: string
  email: string
  tierCode: string
  tierName: string
  status: string
  amountPaidVnd: number
  autoRenew: boolean
  startDate: string
  endDate: string
  createdAt: string
}

export interface SubscriptionTierBreakdown {
  tierCode: string
  tierName: string
  totalBought: number
  activeUsers: number
  totalRevenue: number
}

export interface SubscriptionTrendPoint {
  date: string
  totalCount: number
  totalRevenue: number
}

export interface AdminSubscriptionAnalyticsResponse {
  totalSubscribers: number
  totalRevenueVnd: number
  totalActivePackages: number
  totalExpiredPackages: number
  tierBreakdown: SubscriptionTierBreakdown[]
  timeline: SubscriptionTrendPoint[]
  subscribers: SubscriptionSubscriberItem[]
}

export const adminFinanceService = {
  // Lấy tổng quan 4 chỉ số KPI tài chính sàn
  async getOverview(): Promise<AdminFinanceOverview> {
    const res = await api.get('/v1/admin/finance/overview')
    return res.data
  },

  // Lấy danh sách yêu cầu rút tiền phân trang
  async getPayouts(
    status = '',
    page = 1,
    limit = 20
  ): Promise<AdminPayoutsResponse> {
    const params: Record<string, any> = { page, limit }
    if (status && status !== 'ALL') {
      params.status = status
    }
    const res = await api.get('/v1/admin/finance/payouts', { params })
    return res.data
  },

  // Xử lý phê duyệt hoặc từ chối lệnh rút tiền
  async processPayout(
    payoutId: number,
    data: {
      action: 'APPROVE' | 'COMPLETE' | 'REJECT'
      bankReferenceCode?: string
      note?: string
      rejectReason?: string
    }
  ): Promise<{ status: string; message: string }> {
    const res = await api.post(`/v1/admin/finance/payouts/${payoutId}/process`, data)
    return res.data
  },

  // Lấy danh sách biên lai tài chính phân trang
  async getReceipts(
    page = 1,
    limit = 20,
    search = ''
  ): Promise<AdminReceiptsResponse> {
    const params: Record<string, any> = { page, limit }
    if (search) {
      params.search = search
    }
    const res = await api.get('/v1/admin/finance/receipts', { params })
    return res.data
  },

  // Xuất file CSV danh sách biên lai tài chính
  async exportReceiptsCSV(): Promise<Blob> {
    const res = await api.get('/v1/admin/finance/receipts/export', {
      responseType: 'blob',
    })
    return res.data
  },

  // Lấy toàn bộ phân tích số liệu gói Subscription dành riêng cho Admin
  async getSubscriptionAnalytics(): Promise<AdminSubscriptionAnalyticsResponse> {
    const res = await api.get('/v1/admin/finance/subscriptions')
    return res.data
  },

  // Lấy danh sách cấu hình các gói dịch vụ (Admin)
  async getSubscriptionTiers(): Promise<any[]> {
    const res = await api.get('/v1/admin/subscription-tiers')
    return res.data
  },

  // Cập nhật cấu hình gói dịch vụ (Admin CRUD)
  async updateSubscriptionTier(data: {
    tierId: number
    priceVnd: number
    commissionBps: number
    maxCapacityLimit: number
    hasAdvancedReports: boolean
    isActive: boolean
    reason: string
  }): Promise<{ message: string }> {
    const res = await api.put('/v1/admin/subscription-tiers', data)
    return res.data
  },

  // Tạo gói dịch vụ mới (Admin CRUD)
  async createSubscriptionTier(data: {
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
  }): Promise<any> {
    const res = await api.post('/v1/admin/subscription-tiers', data)
    return res.data
  },

  // Xóa gói dịch vụ (Admin CRUD)
  async deleteSubscriptionTier(tierId: number, reason?: string): Promise<{ message: string }> {
    const res = await api.delete('/v1/admin/subscription-tiers', {
      params: { tierId, reason }
    })
    return res.data
  },
}


