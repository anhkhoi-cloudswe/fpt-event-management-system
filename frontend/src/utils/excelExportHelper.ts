import * as XLSX from 'xlsx'
import {
  EventAdvancedAnalyticsResponse,
  EventFinancialOverview,
  EventCheckInItem,
  FeeTierBreakdown,
} from '../services/reportService'
import { CurrentSubscription } from '../services/subscriptionService'
import { formatVndFull } from './currencyFormatter'

export interface ExportReportParams {
  eventId: number
  eventTitle: string
  organizerName?: string
  advancedData: EventAdvancedAnalyticsResponse
  financialOverview?: EventFinancialOverview | null
  currentSub?: CurrentSubscription | null
  checkIns?: EventCheckInItem[]
}

/**
 * Chuyển đổi chuỗi tiếng Việt có dấu thành không dấu an toàn cho tên tệp và định dạng văn bản
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/**
 * Tạo tên tệp báo cáo chuyên nghiệp: Bao_Cao_Ten_Su_Kien_YYYYMMDD.ext
 */
export function generateReportFileName(title: string, eventId: number, extension: 'xlsx' | 'csv'): string {
  const cleanTitle = removeVietnameseTones(title || `Event_${eventId}`)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`

  return `Bao_Cao_${cleanTitle || `Event_${eventId}`}_${dateStr}.${extension}`
}

/**
 * Xuất Báo Cáo Phân Tích Chuyên Sâu dạng Excel đa trang tính (.xlsx)
 * Bao gồm 5 Sheet:
 * 1. Tổng Quan & Tài Chính (KPIs & Đối Soát Phí Sàn)
 * 2. Cơ Cấu Hạng Vé
 * 3. Xu Hướng Doanh Thu Theo Ngày
 * 4. Phân Bố Check-in & Check-out
 * 5. Nhật Ký Hoàn Trả Vé (Audit Trail)
 */
export function exportEventAnalyticsToExcel({
  eventId,
  eventTitle,
  organizerName,
  advancedData,
  financialOverview,
  currentSub,
  checkIns = [],
}: ExportReportParams): void {
  const wb = XLSX.utils.book_new()

  // Dữ liệu tài chính hợp nhất
  const gross = advancedData?.totalGrossRevenue ?? financialOverview?.totalGrossRevenue ?? 0
  const platformFee = advancedData?.totalPlatformFee ?? financialOverview?.totalPlatformFee ?? 0
  const net = advancedData?.totalNetProfit ?? financialOverview?.totalNetProfit ?? 0
  const refundAmount = advancedData?.totalRefundAmount ?? financialOverview?.totalRefundAmount ?? 0
  const refundCount = (advancedData as any)?.totalTicketsRefunded ?? financialOverview?.totalTicketsRefunded ?? 0
  const originalGross = advancedData?.totalOriginalGross || financialOverview?.totalOriginalGross || (gross + refundAmount)
  const ticketsSold = advancedData?.totalTicketsSold ?? financialOverview?.totalTicketsSold ?? 0
  const capacity = advancedData?.totalCapacity || 0
  const fillRate = capacity > 0 ? (ticketsSold / capacity) * 100 : 0
  const checkedIn = advancedData?.checkedInTickets || 0
  const checkInRate = ticketsSold > 0 ? (checkedIn / ticketsSold) * 100 : 0
  const aov = ticketsSold > 0 ? Math.round(gross / ticketsSold) : 0

  // Chi tiết phí gói
  const rawTierCode = advancedData?.tierCode || financialOverview?.tierCode || currentSub?.tierCode || 'FREE'
  const tierCode = rawTierCode === 'LEGACY' ? (currentSub?.tierCode || 'FREE') : rawTierCode
  const commRate = tierCode === 'BUSINESS'
    ? 0.0
    : (advancedData?.commissionRatePercent ?? financialOverview?.commissionRatePercent ?? (currentSub?.commissionBps ? currentSub.commissionBps / 100 : 5.0))
  const fixedFee = (advancedData?.totalFixedFee !== undefined && advancedData.totalFixedFee > 0)
    ? advancedData.totalFixedFee
    : ((financialOverview?.totalFixedFee !== undefined && financialOverview.totalFixedFee > 0)
      ? financialOverview.totalFixedFee
      : (platformFee > 0 ? Math.min(platformFee, ticketsSold * 1000) : 0))
  const commFee = tierCode === 'BUSINESS'
    ? 0
    : (advancedData?.totalCommissionFee ?? Math.max(0, platformFee - fixedFee))

  // Đếm lượt check-in và check-out thực tế
  let totalInCount = checkedIn
  let totalOutCount = 0
  if (checkIns.length > 0) {
    let inCnt = 0
    let outCnt = 0
    checkIns.forEach((c) => {
      if (c.checkedInAt || c.status === 'CHECKED_IN' || c.status === 'CHECKED_OUT') inCnt++
      if (c.checkedOutAt || c.status === 'CHECKED_OUT') outCnt++
    })
    totalInCount = inCnt
    totalOutCount = outCnt
  }

  // ==========================================
  // SHEET 1: TỔNG QUAN & ĐỐI SOÁT TÀI CHÍNH
  // ==========================================
  const ws1Data = [
    ['HỆ THỐNG QUẢN LÝ SỰ KIỆN FEMS - FPT EVENT MANAGEMENT SYSTEM'],
    ['BÁO CÁO PHÂN TÍCH TỔNG QUAN VẬN HÀNH & ĐỐI SOÁT TÀI CHÍNH'],
    [],
    ['THÔNG TIN SỰ KIỆN'],
    ['Mã sự kiện', `#${eventId}`],
    ['Tên sự kiện', eventTitle],
    ['Đơn vị tổ chức', organizerName || 'Ban Tổ Chức'],
    ['Thời gian xuất báo cáo', new Date().toLocaleString('vi-VN')],
    ['Gói dịch vụ áp dụng', `Gói ${tierCode} (${tierCode === 'BUSINESS' ? 'Ưu đãi 0.0% hoa hồng sàn' : `${commRate}% hoa hồng sàn`})`],
    [],
    ['1. CHỈ SỐ VẬN HÀNH & KHÁCH THAM DỰ', 'GIÁ TRỊ', 'ĐƠN VỊ / GHI CHÚ'],
    ['Tổng sức chứa sự kiện (Capacity)', capacity, 'chỗ ngồi'],
    ['Tổng số vé đã bán (Tickets Sold)', ticketsSold, 'vé đã thanh toán thành công'],
    ['Tỷ lệ lấp đầy sức chứa (Fill Rate)', `${fillRate.toFixed(1)}%`, 'Tỷ lệ vé đã bán / Tổng sức chứa'],
    ['Lượt khách đã vào cổng (Đã có mặt)', totalInCount, 'lượt quét vé Check-in thành công'],
    ['Lượt khách đã rời sự kiện (Check-out)', totalOutCount, 'lượt quét vé Check-out'],
    ['Tỷ lệ khách có mặt thực tế', `${checkInRate.toFixed(1)}%`, 'Tỷ lệ khách Check-in / Vé đã bán'],
    ['Giá trị đơn hàng trung bình (AOV)', formatVndFull(aov), 'Doanh thu trung bình trên mỗi vé'],
    ['Số vé đã hoàn tiền (Refunded)', refundCount, 'vé đã hủy & hoàn tiền'],
    [],
    ['2. ĐỐI SOÁT TÀI CHÍNH & DOANH THU', 'SỐ TIỀN', 'DIỄN GIẢI CHI TIẾT'],
    ['Doanh thu thanh toán (Gross Revenue)', formatVndFull(gross), 'Tổng số tiền người tham dự đã thanh toán thực tế'],
    ['Doanh thu gốc ban đầu (Original Gross)', formatVndFull(originalGross), 'Doanh thu trước khi trừ các khoản hoàn trả vé'],
    ['Đã trừ hoàn trả vé (Total Refunded)', refundAmount > 0 ? `-${formatVndFull(refundAmount)}` : '0 đ', `${refundCount} vé hoàn trả hợp lệ`],
    ['Phí dịch vụ nền tảng (Platform Fee)', formatVndFull(platformFee), 'Tổng phí hệ thống khấu trừ vào đợt đối soát'],
    ['  - Trong đó: Hoa hồng sàn bán vé', formatVndFull(commFee), `Tỷ lệ ${commRate}% áp dụng theo gói ${tierCode}`],
    ['  - Trong đó: Phí cố định hệ thống', formatVndFull(fixedFee), `Phí xử lý giao dịch 1.000 đ / vé (${ticketsSold} vé)`],
    ['DOANH THU THỰC NHẬN CỦA BTC (Net Profit)', formatVndFull(net), 'Số tiền thực tế chuyển vào ví Ban Tổ Chức (Gross - Phí sàn)'],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data)
  ws1['!cols'] = [{ wch: 42 }, { wch: 28 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Tổng Quan & Tài Chính')

  // ==========================================
  // SHEET 2: CƠ CẤU THEO HẠNG VÉ
  // ==========================================
  const categories = advancedData?.categoryBreakdown || []
  const ws2Data = [
    ['BÁO CÁO CHI TIẾT CƠ CẤU DOANH THU & LẤP ĐẦY THEO HẠNG VÉ'],
    [`Sự kiện: ${eventTitle} (#${eventId})`],
    [],
    [
      'STT',
      'Tên Hạng Vé',
      'Giá Vé (VNĐ)',
      'Sức Chứa',
      'Vé Đã Bán',
      'Vé Còn Lại',
      'Đã Check-in',
      'Doanh Thu Gộp (Gross)',
      'Phí Sàn (Platform Fee)',
      'Thực Nhận (Net Profit)',
      'Tỷ Lệ Lấp Đầy',
    ],
    ...categories.map((c, i) => [
      i + 1,
      c.categoryName,
      formatVndFull(c.price),
      c.totalCapacity,
      c.soldSeats,
      c.remainingSeats,
      c.checkedInSeats,
      formatVndFull(c.grossRevenue),
      formatVndFull(c.platformFee),
      formatVndFull(c.netProfit),
      `${c.fillRatePercent.toFixed(1)}%`,
    ]),
    [],
    [
      'Tổng Cộng',
      `${categories.length} hạng vé`,
      '—',
      capacity,
      ticketsSold,
      Math.max(0, capacity - ticketsSold),
      totalInCount,
      formatVndFull(gross),
      formatVndFull(platformFee),
      formatVndFull(net),
      `${fillRate.toFixed(1)}%`,
    ],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data)
  ws2['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 26 },
    { wch: 24 },
    { wch: 26 },
    { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Cơ Cấu Hạng Vé')

  // ==========================================
  // SHEET 3: XU HƯỚNG DOANH THU THEO NGÀY
  // ==========================================
  const timeline = advancedData?.timeline || []
  const ws3Data = [
    ['BÁO CÁO XU HƯỚNG BÁN VÉ & DOANH THU THEO CHUỖI THỜI GIAN'],
    [`Sự kiện: ${eventTitle} (#${eventId})`],
    [],
    [
      'STT',
      'Ngày Ghi Nhận',
      'Số Vé Bán Ra',
      'Doanh Thu Gộp (Gross)',
      'Phí Nền Tảng (Platform Fee)',
      'Doanh Thu Thực Nhận (Net)',
      'Tính Chất Giao Dịch',
    ],
    ...timeline.map((t, i) => {
      const isNegative = t.ticketsSold < 0 || t.grossRevenue < 0
      return [
        i + 1,
        t.date,
        `${t.ticketsSold} vé`,
        formatVndFull(t.grossRevenue),
        formatVndFull(t.platformFee),
        formatVndFull(t.netProfit),
        isNegative ? 'Hoàn trả vé / Điều chỉnh' : 'Bán vé tham dự',
      ]
    }),
    [],
    [
      'Tổng Cộng',
      '—',
      `${ticketsSold} vé`,
      formatVndFull(gross),
      formatVndFull(platformFee),
      formatVndFull(net),
      'Toàn bộ chu kỳ sự kiện',
    ],
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(ws3Data)
  ws3['!cols'] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 16 },
    { wch: 26 },
    { wch: 26 },
    { wch: 28 },
    { wch: 26 },
  ]
  XLSX.utils.book_append_sheet(wb, ws3, 'Xu Hướng Bán Vé')

  // ==========================================
  // SHEET 4: CHECK-IN & KHUNG GIỜ (CHỈ LỌC GIỜ CÓ KHÁCH)
  // ==========================================
  // Gom nhóm khung giờ thực tế có khách
  const hourMap: Record<number, { checkIn: number; checkOut: number }> = {}
  for (let h = 0; h < 24; h++) {
    hourMap[h] = { checkIn: 0, checkOut: 0 }
  }

  if (checkIns.length > 0) {
    checkIns.forEach((c) => {
      const timeIn = c.checkedInAt || (c.status === 'CHECKED_IN' || c.status === 'CHECKED_OUT' ? c.createdAt : undefined)
      if (timeIn) {
        const d = new Date(timeIn)
        if (!isNaN(d.getTime())) {
          hourMap[d.getHours()].checkIn++
        }
      }
      if (c.checkedOutAt) {
        const d = new Date(c.checkedOutAt)
        if (!isNaN(d.getTime())) {
          hourMap[d.getHours()].checkOut++
        }
      }
    })
  } else {
    ;(advancedData?.hourlyCheckIns || []).forEach((h) => {
      if (hourMap[h.hour]) hourMap[h.hour].checkIn = h.count
    })
    ;(advancedData?.hourlyCheckOuts || []).forEach((h) => {
      if (hourMap[h.hour]) hourMap[h.hour].checkOut = h.count
    })
  }

  // Lọc chỉ những giờ THỰC TẾ có phát sinh khách vào hoặc ra (Loại bỏ 20 dòng số 0 rác)
  const activeHours = Object.entries(hourMap)
    .map(([h, val]) => ({
      hour: Number(h),
      checkIn: val.checkIn,
      checkOut: val.checkOut,
      total: val.checkIn + val.checkOut,
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => a.hour - b.hour)

  // Tổng hợp theo buổi
  const morning = { in: 0, out: 0 }
  const afternoon = { in: 0, out: 0 }
  const evening = { in: 0, out: 0 }
  const night = { in: 0, out: 0 }
  Object.entries(hourMap).forEach(([hStr, val]) => {
    const h = Number(hStr)
    if (h >= 6 && h < 12) {
      morning.in += val.checkIn
      morning.out += val.checkOut
    } else if (h >= 12 && h < 18) {
      afternoon.in += val.checkIn
      afternoon.out += val.checkOut
    } else if (h >= 18 && h < 24) {
      evening.in += val.checkIn
      evening.out += val.checkOut
    } else {
      night.in += val.checkIn
      night.out += val.checkOut
    }
  })

  const ws4Data: any[][] = [
    ['BÁO CÁO LƯU LƯỢNG KHÁCH CHECK-IN (VÀO) & CHECK-OUT (RA)'],
    [`Sự kiện: ${eventTitle} (#${eventId})`],
    [],
    ['TỔNG QUAN THEO BUỔI TRONG NGÀY'],
    ['Buổi Hoạt Động', 'Khung Giờ', 'Lượt Vào (Check-in)', 'Lượt Ra (Check-out)', 'Tần Suất Lưu Lượng'],
    ['Buổi Sáng', '06:00 - 11:59', `${morning.in} lượt`, `${morning.out} lượt`, morning.in > 0 ? 'Có hoạt động' : 'Yên ắng'],
    ['Buổi Chiều', '12:00 - 17:59', `${afternoon.in} lượt`, `${afternoon.out} lượt`, afternoon.in > 0 ? 'Giờ cao điểm' : 'Yên ắng'],
    ['Buổi Tối', '18:00 - 23:59', `${evening.in} lượt`, `${evening.out} lượt`, evening.in > 0 ? 'Có hoạt động' : 'Yên ắng'],
    ['Đêm & Rạng Sáng', '00:00 - 05:59', `${night.in} lượt`, `${night.out} lượt`, night.in > 0 ? 'Có hoạt động' : 'Ngoài giờ'],
    [],
    ['CHI TIẾT CÁC KHUNG GIỜ THỰC TẾ CÓ LƯỢT KHÁCH'],
    ['Khung Giờ', 'Lượt Check-in (Vào)', 'Lượt Check-out (Ra)', 'Tổng Lưu Lượng', 'Ghi Chú'],
  ]

  if (activeHours.length === 0) {
    ws4Data.push(['Toàn bộ khung giờ', '0 lượt', '0 lượt', '0 lượt', 'Chưa có lượt khách nào thực hiện check-in hoặc check-out'])
  } else {
    activeHours.forEach((item) => {
      const pad = (n: number) => String(n).padStart(2, '0')
      const timeRange = `${pad(item.hour)}:00 - ${pad(item.hour)}:59`
      const isPeak = item.total === Math.max(...activeHours.map((h) => h.total))
      ws4Data.push([
        timeRange,
        `${item.checkIn} lượt`,
        `${item.checkOut} lượt`,
        `${item.total} lượt`,
        isPeak ? 'Khung giờ cao điểm nhất (Peak Hour)' : 'Lưu lượng bình thường',
      ])
    })
  }

  const ws4 = XLSX.utils.aoa_to_sheet(ws4Data)
  ws4['!cols'] = [
    { wch: 22 },
    { wch: 22 },
    { wch: 24 },
    { wch: 24 },
    { wch: 38 },
  ]
  XLSX.utils.book_append_sheet(wb, ws4, 'Thống Kê Check-in')

  // ==========================================
  // SHEET 5: NHẬT KÝ ĐƠN HOÀN TRẢ VÉ (AUDIT TRAIL)
  // ==========================================
  const refundAudits = advancedData?.refundAuditList || []
  const ws5Data: any[][] = [
    ['NHẬT KÝ & PHÂN TÍCH ĐƠN HOÀN TRẢ VÉ (AUDIT TRAIL & RISK ANALYTICS)'],
    [`Sự kiện: ${eventTitle} (#${eventId})`],
    [],
    [
      'STT',
      'Mã Đơn',
      'Mã Vé',
      'Hạng Vé',
      'Người Làm Đơn',
      'Email Liên Hệ',
      'Tiền Hoàn (VNĐ)',
      'Lý Do Hoàn Trả',
      'Chi Tiết Yêu Cầu',
      'Người Phê Duyệt',
      'Thời Gian Duyệt',
      'Trạng Thái',
    ],
  ]

  if (refundAudits.length === 0) {
    ws5Data.push([
      '—',
      '—',
      '—',
      '—',
      'Không có đơn hoàn trả nào',
      '—',
      '0 đ',
      'Tất cả vé tham dự đều được giữ chỗ và thanh toán ổn định',
      '—',
      '—',
      '—',
      'KHÔNG PHÁT SINH',
    ])
  } else {
    refundAudits.forEach((audit, i) => {
      const pTime = audit.processedAt ? new Date(audit.processedAt).toLocaleString('vi-VN') : '—'
      ws5Data.push([
        i + 1,
        `#${audit.reportId}`,
        audit.ticketCode || `#${audit.ticketId}`,
        audit.categoryName,
        audit.requesterName || 'Người mua',
        audit.requesterEmail || '—',
        formatVndFull(audit.refundAmount),
        audit.reasonTitle || 'Hoàn vé',
        audit.reasonDetail || '—',
        audit.processedByName || 'Hệ thống / Staff',
        pTime,
        audit.status === 'APPROVED' ? 'Đã duyệt' : audit.status === 'REJECTED' ? 'Từ chối' : 'Chờ duyệt',
      ])
    })
  }

  const ws5 = XLSX.utils.aoa_to_sheet(ws5Data)
  ws5['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
    { wch: 26 },
    { wch: 18 },
    { wch: 26 },
    { wch: 35 },
    { wch: 22 },
    { wch: 22 },
    { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(wb, ws5, 'Nhật Ký Hoàn Trả')

  // Ghi tệp và kích hoạt tải về qua trình duyệt
  const fileName = generateReportFileName(eventTitle, eventId, 'xlsx')
  XLSX.writeFile(wb, fileName)
}

/**
 * Xuất Báo Cáo CSV chuẩn hóa với UTF-8 BOM, loại bỏ dòng số 0 rác, tên tệp đẹp
 */
export function exportEventAnalyticsToCSV({
  eventId,
  eventTitle,
  organizerName,
  advancedData,
  financialOverview,
  currentSub,
  checkIns = [],
}: ExportReportParams): void {
  const gross = advancedData?.totalGrossRevenue ?? financialOverview?.totalGrossRevenue ?? 0
  const platformFee = advancedData?.totalPlatformFee ?? financialOverview?.totalPlatformFee ?? 0
  const net = advancedData?.totalNetProfit ?? financialOverview?.totalNetProfit ?? 0
  const refundAmount = advancedData?.totalRefundAmount ?? financialOverview?.totalRefundAmount ?? 0
  const refundCount = (advancedData as any)?.totalTicketsRefunded ?? financialOverview?.totalTicketsRefunded ?? 0
  const originalGross = advancedData?.totalOriginalGross || financialOverview?.totalOriginalGross || (gross + refundAmount)
  const ticketsSold = advancedData?.totalTicketsSold ?? financialOverview?.totalTicketsSold ?? 0
  const capacity = advancedData?.totalCapacity || 0
  const fillRate = capacity > 0 ? (ticketsSold / capacity) * 100 : 0
  const checkedIn = advancedData?.checkedInTickets || 0
  const checkInRate = ticketsSold > 0 ? (checkedIn / ticketsSold) * 100 : 0
  const aov = ticketsSold > 0 ? Math.round(gross / ticketsSold) : 0

  const rawTierCode = advancedData?.tierCode || financialOverview?.tierCode || currentSub?.tierCode || 'FREE'
  const tierCode = rawTierCode === 'LEGACY' ? (currentSub?.tierCode || 'FREE') : rawTierCode
  const commRate = tierCode === 'BUSINESS' ? 0.0 : (advancedData?.commissionRatePercent ?? financialOverview?.commissionRatePercent ?? 5.0)

  const rows: string[][] = [
    ['HỆ THỐNG QUẢN LÝ SỰ KIỆN FEMS - BÁO CÁO PHÂN TÍCH CHUYÊN SÂU'],
    [`Sự kiện: ${eventTitle} (Mã: #${eventId})`],
    [`Đơn vị tổ chức: ${organizerName || 'Ban Tổ Chức'}`],
    [`Thời gian xuất: ${new Date().toLocaleString('vi-VN')}`],
    ['----------------------------------------------------------------------------------------------------'],
    ['1. DANH MỤC KPI VẬN HÀNH & ĐỐI SOÁT TÀI CHÍNH', 'GIÁ TRỊ', 'GHI CHÚ CHI TIẾT'],
    ['Mã sự kiện', `#${eventId}`, 'ID sự kiện'],
    ['Tên sự kiện', eventTitle, ''],
    ['Doanh Thu Thanh Toán (Gross)', formatVndFull(gross), 'Tổng tiền thực thu từ khách mua vé'],
    ['Doanh Thu Gốc Ban Đầu (Original Gross)', formatVndFull(originalGross), 'Doanh thu trước khi trừ hoàn trả'],
    ['Đã Trừ Hoàn Trả (Refund Amount)', refundAmount > 0 ? `-${formatVndFull(refundAmount)}` : '0 đ', `${refundCount} vé hoàn trả`],
    ['Phí Dịch Vụ Nền Tảng (Platform Fee)', formatVndFull(platformFee), `Khấu trừ đối soát (Gói ${tierCode} - Hoa hồng ${commRate}%)`],
    ['Doanh Thu Thực Nhận (Net Profit)', formatVndFull(net), 'Chuyển về ví Ban tổ chức'],
    ['Số Vé Đã Bán', `${ticketsSold}`, 'vé đã thanh toán thành công'],
    ['Lượt Khách Đã Vào Cổng (Check-in)', `${checkedIn}`, 'lượt khách có mặt'],
    ['Tỷ Lệ Check-in', `${checkInRate.toFixed(1)}%`, 'Khách có mặt / Vé đã bán'],
    ['Tổng Sức Chứa (Capacity)', `${capacity}`, 'chỗ ngồi'],
    ['Tỷ Lệ Lấp Đầy (Fill Rate)', `${fillRate.toFixed(1)}%`, 'Vé đã bán / Sức chứa'],
    ['Giá Trị Đơn Hàng Trung Bình (AOV)', formatVndFull(aov), 'Doanh thu / vé bán'],
    ['----------------------------------------------------------------------------------------------------'],
    ['2. BÁO CÁO CƠ CẤU VÉ THEO TỪNG HẠNG VÉ'],
    ['STT', 'Tên Hạng Vé', 'Giá Vé', 'Sức Chứa', 'Đã Bán', 'Còn Lại', 'Check-in', 'Doanh Thu Gross', 'Phí Sàn', 'Thực Nhận Net', 'Tỷ Lệ Lấp Đầy'],
  ]

  const categories = advancedData?.categoryBreakdown || []
  categories.forEach((c, i) => {
    rows.push([
      `${i + 1}`,
      c.categoryName,
      formatVndFull(c.price),
      `${c.totalCapacity}`,
      `${c.soldSeats}`,
      `${c.remainingSeats}`,
      `${c.checkedInSeats}`,
      formatVndFull(c.grossRevenue),
      formatVndFull(c.platformFee),
      formatVndFull(c.netProfit),
      `${c.fillRatePercent.toFixed(1)}%`,
    ])
  })

  rows.push(['----------------------------------------------------------------------------------------------------'])
  rows.push(['3. XU HƯỚNG BÁN VÉ THEO NGÀY'])
  rows.push(['STT', 'Ngày', 'Số Vé Bán', 'Doanh Thu Gộp (Gross)', 'Phí Sàn', 'Thực Nhận (Net)', 'Ghi Chú'])

  const timeline = advancedData?.timeline || []
  timeline.forEach((t, i) => {
    rows.push([
      `${i + 1}`,
      t.date,
      `${t.ticketsSold} vé`,
      formatVndFull(t.grossRevenue),
      formatVndFull(t.platformFee),
      formatVndFull(t.netProfit),
      t.ticketsSold < 0 ? 'Giao dịch hoàn trả vé' : 'Bán vé tham dự',
    ])
  })

  rows.push(['----------------------------------------------------------------------------------------------------'])
  rows.push(['4. KHUNG GIỜ CHECK-IN CÓ PHÁT SINH LƯỢT KHÁCH (Đã lọc bỏ các giờ yên ắng)'])
  rows.push(['Khung Giờ', 'Lượt Check-in (Vào)', 'Ghi Chú'])

  const activeCheckIns = (advancedData?.hourlyCheckIns || []).filter((h) => h.count > 0)
  if (activeCheckIns.length === 0) {
    rows.push(['Toàn bộ khung giờ', '0 lượt', 'Chưa có lượt khách nào thực hiện check-in'])
  } else {
    activeCheckIns.forEach((h) => {
      const pad = (n: number) => String(n).padStart(2, '0')
      rows.push([`${pad(h.hour)}:00 - ${pad(h.hour)}:59`, `${h.count} lượt`, 'Khung giờ có hoạt động'])
    })
  }

  // Chuyển mảng thành nội dung CSV RFC 4180 an toàn
  const csvContent = '\uFEFF' + rows.map((r) => r.map((cell) => {
    const str = String(cell ?? '')
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }).join(',')).join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const fileName = generateReportFileName(eventTitle, eventId, 'csv')
  link.setAttribute('download', fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
