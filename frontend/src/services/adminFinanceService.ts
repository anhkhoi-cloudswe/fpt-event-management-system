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
}
