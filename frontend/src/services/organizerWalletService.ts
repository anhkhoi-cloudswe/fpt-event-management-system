import { api } from '../config/api'

export interface OrganizerWallet {
  walletId: number
  userId: number
  availableBalance: number
  pendingBalance: number
  lifetimeEarnings: number
  currency: string
  status: string
}

export interface WalletTransaction {
  transactionId: number
  walletId: number
  userId: number
  type: string // TOPUP, TICKET_SALE, COMMISSION_FEE, USAGE_FEE, WITHDRAWAL, EVENT_PAYOUT_RELEASE
  amount: number
  balanceBefore: number
  balanceAfter: number
  referenceType?: string
  referenceId?: string
  description?: string
  createdAt: string
}

export interface PaginatedTransactions {
  transactions: WalletTransaction[]
  totalRecords: number
  totalPages: number
  currentPage: number
  limit: number
}

export interface FinancialReportTicketClass {
  categoryTicketId: number
  name: string
  price: number
  quantitySold: number
  grossRevenue: number
  commissionFee: number
  netRevenue: number
}

export interface EventFinancialReport {
  eventId: number
  title: string
  orgType: string // SCHOOL hoặc FREE
  status: string
  isSettled: boolean
  totalTicketsSold: number
  grossRevenue: number
  totalCommissionFee: number
  netRevenue: number
  freeQuotaDeductions: number
  currency: string
  ticketClasses: FinancialReportTicketClass[]
}

export interface OrganizerBankAccount {
  accountId: number
  userId: number
  bankCode: string
  bankName: string
  accountNumber: string
  accountHolderName: string
  isVerified: boolean
  isDefault: boolean
  createdAt: string
}

export interface PayoutRequest {
  payoutId: number
  userId: number
  bankAccountId: number
  bankCode: string
  bankName: string
  accountNumber: string
  accountHolderName: string
  amount: number
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED'
  note?: string
  rejectReason?: string
  processedAt?: string
  createdAt: string
}

export interface TopupOrder {
  orderId: number
  amount: number
  transferContent: string
  bankCode: string
  accountNumber: string
  accountName: string
  qrCodeUrl: string
}

export const organizerWalletService = {
  // Lấy thông tin ví
  async getWallet(): Promise<OrganizerWallet> {
    const res = await api.get('/v1/organizer/wallet')
    return res.data
  },

  // Lịch sử giao dịch sổ cái
  async getTransactions(
    page = 1,
    limit = 20,
    type = '',
    startDate = '',
    endDate = ''
  ): Promise<PaginatedTransactions> {
    const params: Record<string, any> = { page, limit }
    if (type) params.type = type
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate

    const res = await api.get('/v1/organizer/wallet/transactions', { params })
    return res.data
  },

  // Báo cáo tài chính sự kiện
  async getEventFinancialReport(eventId: number): Promise<EventFinancialReport> {
    const res = await api.get(`/v1/organizer/events/${eventId}/financial-report`)
    return res.data
  },

  // Tạo đơn nạp tiền ví
  async topup(amount: number): Promise<TopupOrder> {
    const res = await api.post('/v1/organizer/wallet/topup', { amount })
    return res.data
  },

  // Thêm tài khoản ngân hàng thụ hưởng
  async addBankAccount(data: {
    bankCode: string
    bankName: string
    accountNumber: string
    accountHolderName: string
    isDefault?: boolean
  }): Promise<OrganizerBankAccount> {
    const res = await api.post('/v1/organizer/bank-accounts', data)
    return res.data
  },

  // Lấy danh sách tài khoản ngân hàng thụ hưởng
  async getBankAccounts(): Promise<OrganizerBankAccount[]> {
    const res = await api.get('/v1/organizer/bank-accounts')
    return res.data
  },

  // Yêu cầu rút tiền
  async requestPayout(data: {
    bankAccountId: number
    amount: number
    note?: string
  }): Promise<PayoutRequest> {
    const res = await api.post('/v1/organizer/wallet/payout', data)
    return res.data
  },

  // Lịch sử yêu cầu rút tiền
  async getPayouts(
    page = 1,
    limit = 20
  ): Promise<{ payouts: PayoutRequest[]; totalRecords: number; currentPage: number; limit: number }> {
    const res = await api.get('/v1/organizer/wallet/payouts', {
      params: { page, limit },
    })
    return res.data
  },

  // Quyết toán thủ công khi sự kiện đã FINISHED
  async settleEvent(eventId: number): Promise<{ status: string; message: string }> {
    const res = await api.post(`/v1/organizer/events/${eventId}/settle`)
    return res.data
  },
}
