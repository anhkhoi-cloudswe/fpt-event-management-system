import ExcelJS from 'exceljs'
import {
  EventAdvancedAnalyticsResponse,
  EventFinancialOverview,
  EventCheckInItem,
} from '../services/reportService'
import { CurrentSubscription } from '../services/subscriptionService'
import { formatVndFull } from './currencyFormatter'

export interface EventSummaryItem {
  id: number
  title: string
  startTime?: string
  endTime?: string
  status?: string
  organizerName?: string
  organizerEmail?: string
  capacity?: number
  ticketsSold?: number
  grossRevenue?: number
  platformFee?: number
  netProfit?: number
  fillRatePercent?: number
}

export interface ExportReportParams {
  isAllEvents?: boolean
  eventId?: number | string
  eventTitle: string
  eventStartTime?: string
  eventEndTime?: string
  eventStatus?: string
  organizerName?: string
  allEventsList?: EventSummaryItem[]
  advancedData: EventAdvancedAnalyticsResponse
  financialOverview?: EventFinancialOverview | null
  currentSub?: CurrentSubscription | null
  checkIns?: EventCheckInItem[]
}

/**
 * Chuyển đổi chuỗi tiếng Việt có dấu thành không dấu an toàn cho tên tệp
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
 * Định dạng ngày giờ chuẩn Việt Nam: HH:mm DD/MM/YYYY
 */
export function formatDateTimeVN(dateStr?: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/**
 * Tạo tên tệp báo cáo chuyên nghiệp có ngày xuất ISO
 */
export function generateReportFileName(
  title: string,
  eventId: number | string,
  extension: 'xlsx' | 'csv',
  isAll?: boolean
): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`

  if (isAll || eventId === 'ALL') {
    return `Bao_Cao_Tong_Hop_Toan_Bo_Su_Kien_${dateStr}.${extension}`
  }

  const cleanTitle = removeVietnameseTones(title || `Event_${eventId}`)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return `Bao_Cao_${cleanTitle || `Event_${eventId}`}_${dateStr}.${extension}`
}

// ===================== STYLING TOKENS CHO EXCELJS =====================
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
}

const doubleBottomBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'double', color: { argb: 'FF0F172A' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
}

const headerFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEA580C' }, // FPT Orange
}

const navyFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E293B' }, // Dark Navy
}

const zebraFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF8FAFC' }, // Light Gray
}

const highlightEmeraldFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFECFDF5' }, // Emerald Light
}

const totalAmberFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFEF3C7' }, // Amber Light
}

const titleFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF0F172A' } }
const subtitleFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF475569' } }
const sectionHeaderFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } }
const headerFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
const normalFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } }
const boldFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } }

/**
 * Xuất Báo Cáo Phân Tích Chuyên Sâu dạng Excel đa trang tính (.xlsx) được kẻ bảng và định dạng chuyên nghiệp
 */
export async function exportEventAnalyticsToExcel({
  isAllEvents = false,
  eventId,
  eventTitle,
  eventStartTime,
  eventEndTime,
  eventStatus,
  organizerName,
  allEventsList = [],
  advancedData,
  financialOverview,
  currentSub,
  checkIns = [],
}: ExportReportParams): Promise<void> {
  const isAll = isAllEvents || eventId === 'ALL'
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'FEMS - FPT Event Management System'
  workbook.created = new Date()

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

  // =========================================================================
  // SHEET 1: TỔNG QUAN & TÀI CHÍNH (ĐƯỢC KẺ BẢNG VÀ CANH LỀ ĐỒNG NHẤT 100%)
  // =========================================================================
  const sheet1Name = isAll ? 'Tổng Quan Hệ Thống' : 'Tổng Quan & Tài Chính'
  const ws1 = workbook.addWorksheet(sheet1Name, {
    views: [{ showGridLines: true }],
  })
  ws1.columns = [
    { key: 'colA', width: 44 },
    { key: 'colB', width: 28 },
    { key: 'colC', width: 48 },
  ]

  // Header Titles
  const r1 = ws1.addRow(['HỆ THỐNG QUẢN LÝ SỰ KIỆN FEMS - FPT EVENT MANAGEMENT SYSTEM'])
  r1.font = titleFont
  const r2 = ws1.addRow([isAll ? 'BÁO CÁO PHÂN TÍCH TỔNG HỢP TOÀN BỘ SỰ KIỆN' : 'BÁO CÁO PHÂN TÍCH TỔNG QUAN VẬN HÀNH & ĐỐI SOÁT TÀI CHÍNH'])
  r2.font = subtitleFont
  ws1.addRow([])

  // Block Thông Tin Sự Kiện
  const rInfoHead = ws1.addRow(['THÔNG TIN CHUNG SỰ KIỆN', '', ''])
  rInfoHead.font = sectionHeaderFont

  const addInfoRow = (label: string, val: string) => {
    const row = ws1.addRow([label, val, ''])
    row.getCell(1).font = boldFont
    row.getCell(2).font = normalFont
    row.getCell(1).border = thinBorder
    row.getCell(2).border = thinBorder
    row.getCell(1).fill = zebraFill
  }

  if (isAll) {
    addInfoRow('Phạm vi báo cáo', 'Toàn bộ sự kiện trên hệ thống')
    addInfoRow('Tổng số sự kiện', `${allEventsList.length} sự kiện`)
    addInfoRow('Người lập báo cáo', organizerName || 'Ban Quản Trị Hệ Thống')
    addInfoRow('Thời gian trích xuất dữ liệu', formatDateTimeVN(new Date().toISOString()))
    addInfoRow('Trạng thái tổng hợp', 'Đã đối soát toàn sàn')
  } else {
    addInfoRow('Mã sự kiện', `#${eventId}`)
    addInfoRow('Tên sự kiện', eventTitle)
    addInfoRow('Đơn vị tổ chức', organizerName || 'Ban Tổ Chức')
    addInfoRow('Thời gian sự kiện bắt đầu', formatDateTimeVN(eventStartTime))
    addInfoRow('Thời gian sự kiện kết thúc', formatDateTimeVN(eventEndTime))
    addInfoRow('Trạng thái sự kiện', eventStatus === 'OPEN' ? 'Đang mở bán vé (OPEN)' : (eventStatus || 'Hoàn tất'))
    addInfoRow('Thời gian trích xuất báo cáo', formatDateTimeVN(new Date().toISOString()))
    addInfoRow('Gói dịch vụ áp dụng', `Gói ${tierCode} (${tierCode === 'BUSINESS' ? 'Ưu đãi 0.0% hoa hồng sàn' : `${commRate}% hoa hồng sàn`})`)
  }
  ws1.addRow([])

  // Bảng 1: Chỉ Số Vận Hành
  const rSec1 = ws1.addRow(['1. CHỈ SỐ VẬN HÀNH & KHÁCH THAM DỰ', '', ''])
  rSec1.font = sectionHeaderFont

  const rHead1 = ws1.addRow(['CHỈ SỐ ĐÁNH GIÁ', 'GIÁ TRỊ', 'ĐƠN VỊ / DIỄN GIẢI CHI TIẾT'])
  rHead1.eachCell((cell) => {
    cell.fill = headerFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder
  })

  const addMetricRow = (metric: string, val: string, note: string) => {
    const row = ws1.addRow([metric, val, note])
    row.getCell(1).font = normalFont
    row.getCell(2).font = boldFont
    row.getCell(3).font = normalFont

    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' }
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' } // Canh giữa đồng nhất toàn bộ giá trị
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' }

    row.getCell(1).border = thinBorder
    row.getCell(2).border = thinBorder
    row.getCell(3).border = thinBorder
  }

  addMetricRow('Tổng sức chứa sự kiện (Capacity)', `${capacity.toLocaleString('vi-VN')} chỗ ngồi`, 'Tổng số ghế/vé tối đa được thiết lập')
  addMetricRow('Tổng số vé đã bán (Tickets Sold)', `${ticketsSold.toLocaleString('vi-VN')} vé`, 'Số vé đã thanh toán thành công')
  addMetricRow('Tỷ lệ lấp đầy sức chứa (Fill Rate)', `${fillRate.toFixed(1)}%`, 'Tỷ lệ vé đã bán / Tổng sức chứa')
  addMetricRow('Lượt khách đã vào cổng (Đã có mặt)', `${totalInCount.toLocaleString('vi-VN')} lượt`, 'Lượt khách quét mã Check-in thành công')
  addMetricRow('Lượt khách đã rời sự kiện (Check-out)', `${totalOutCount.toLocaleString('vi-VN')} lượt`, 'Lượt khách quét mã Check-out rời sự kiện')
  addMetricRow('Tỷ lệ khách có mặt thực tế', `${checkInRate.toFixed(1)}%`, 'Tỷ lệ khách Check-in / Vé đã bán')
  addMetricRow('Giá trị đơn hàng trung bình (AOV)', formatVndFull(aov), 'Doanh thu trung bình trên mỗi vé bán ra')
  addMetricRow('Số vé đã hoàn tiền (Refunded)', `${refundCount.toLocaleString('vi-VN')} vé`, 'Số vé đã xử lý hoàn trả tiền hợp lệ')
  ws1.addRow([])

  // Bảng 2: Đối Soát Tài Chính
  const rSec2 = ws1.addRow(['2. ĐỐI SOÁT TÀI CHÍNH & DOANH THU', '', ''])
  rSec2.font = sectionHeaderFont

  const rHead2 = ws1.addRow(['HẠNG MỤC TÀI CHÍNH', 'SỐ TIỀN', 'DIỄN GIẢI CHI TIẾT'])
  rHead2.eachCell((cell) => {
    cell.fill = navyFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder
  })

  const addFinanceRow = (item: string, amount: string, desc: string, isHighlight = false) => {
    const row = ws1.addRow([item, amount, desc])
    row.getCell(1).font = isHighlight ? boldFont : normalFont
    row.getCell(2).font = isHighlight ? boldFont : boldFont
    row.getCell(3).font = normalFont

    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' }
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' } // Tiền tệ canh phải chuẩn kế toán
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' }

    row.getCell(1).border = isHighlight ? doubleBottomBorder : thinBorder
    row.getCell(2).border = isHighlight ? doubleBottomBorder : thinBorder
    row.getCell(3).border = isHighlight ? doubleBottomBorder : thinBorder

    if (isHighlight) {
      row.getCell(1).fill = highlightEmeraldFill
      row.getCell(2).fill = highlightEmeraldFill
      row.getCell(3).fill = highlightEmeraldFill
    }
  }

  addFinanceRow('Doanh thu thanh toán (Gross Revenue)', formatVndFull(gross), 'Tổng tiền thực thu từ khách tham dự sau khi đã trừ hoàn trả')
  addFinanceRow('Doanh thu gốc ban đầu (Original Gross)', formatVndFull(originalGross), 'Tổng tiền ban đầu trước khi phát sinh đơn hoàn trả')
  addFinanceRow('Đã trừ hoàn trả vé (Total Refunded)', refundAmount > 0 ? `-${formatVndFull(refundAmount)}` : '0 đ', `${refundCount} vé hoàn trả hợp lệ`)
  addFinanceRow('Phí dịch vụ nền tảng (Platform Fee)', formatVndFull(platformFee), 'Tổng phí hệ thống khấu trừ vào đợt đối soát')
  addFinanceRow('  - Trong đó: Hoa hồng sàn bán vé', formatVndFull(commFee), `Tỷ lệ ${commRate}% áp dụng theo gói ${tierCode}`)
  addFinanceRow('  - Trong đó: Phí cố định hệ thống', formatVndFull(fixedFee), `Phí xử lý giao dịch 1.000 đ / vé (${ticketsSold} vé)`)
  addFinanceRow('DOANH THU THỰC NHẬN CỦA BTC (Net Profit)', formatVndFull(net), 'Số tiền thực tế chuyển vào ví Ban Tổ Chức (Gross - Phí sàn)', true)

  // =========================================================================
  // SHEET 2: KHI LÀ 'ALL' -> DANH SÁCH CHI TIẾT TẤT CẢ SỰ KIỆN (CÓ KẺ BẢNG ĐẦY ĐỦ)
  // =========================================================================
  if (isAll && allEventsList.length > 0) {
    const wsAllList = workbook.addWorksheet('Danh Sách Sự Kiện', {
      views: [{ showGridLines: true }],
    })
    wsAllList.columns = [
      { key: 'stt', width: 6 },
      { key: 'id', width: 10 },
      { key: 'title', width: 34 },
      { key: 'organizer', width: 24 },
      { key: 'start', width: 20 },
      { key: 'end', width: 20 },
      { key: 'status', width: 16 },
      { key: 'capacity', width: 14 },
      { key: 'sold', width: 14 },
      { key: 'gross', width: 24 },
      { key: 'fee', width: 22 },
      { key: 'net', width: 24 },
      { key: 'fill', width: 16 },
    ]

    const rAllTitle = wsAllList.addRow(['DANH SÁCH TỔNG HỢP TOÀN BỘ SỰ KIỆN TRÊN HỆ THỐNG'])
    rAllTitle.font = titleFont
    wsAllList.addRow([])

    const rHeadAll = wsAllList.addRow([
      'STT',
      'Mã SK',
      'Tên Sự Kiện',
      'Ban Tổ Chức',
      'Thời Gian Bắt Đầu',
      'Thời Gian Kết Thúc',
      'Trạng Thái',
      'Sức Chứa',
      'Vé Đã Bán',
      'Doanh Thu Gross',
      'Phí Nền Tảng',
      'Thực Nhận Net',
      'Tỷ Lệ Bán',
    ])
    rHeadAll.eachCell((cell) => {
      cell.fill = headerFill
      cell.font = headerFont
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = thinBorder
    })

    let sumCap = 0
    let sumSold = 0
    let sumGross = 0
    let sumFee = 0
    let sumNet = 0

    allEventsList.forEach((ev, i) => {
      const cCap = ev.capacity || 0
      const cSold = ev.ticketsSold || 0
      const cGross = ev.grossRevenue || 0
      const cFee = ev.platformFee || 0
      const cNet = ev.netProfit || 0
      const cFill = cCap > 0 ? (cSold / cCap) * 100 : 0

      sumCap += cCap
      sumSold += cSold
      sumGross += cGross
      sumFee += cFee
      sumNet += cNet

      const row = wsAllList.addRow([
        i + 1,
        `#${ev.id}`,
        ev.title,
        ev.organizerName || '—',
        formatDateTimeVN(ev.startTime),
        formatDateTimeVN(ev.endTime),
        ev.status === 'OPEN' ? 'Đang mở bán' : (ev.status || '—'),
        cCap,
        cSold,
        formatVndFull(cGross),
        formatVndFull(cFee),
        formatVndFull(cNet),
        `${cFill.toFixed(1)}%`,
      ])

      row.eachCell((cell, colNum) => {
        cell.font = normalFont
        cell.border = thinBorder
        if (colNum === 1 || colNum === 2 || colNum === 5 || colNum === 6 || colNum === 7 || colNum === 13) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else if (colNum === 8 || colNum === 9 || colNum === 10 || colNum === 11 || colNum === 12) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' }
        }
      })
    })

    // Dòng Tổng Cộng Sự Kiện
    const rTotalAll = wsAllList.addRow([
      'Tổng',
      `${allEventsList.length} SK`,
      '—',
      '—',
      '—',
      '—',
      '—',
      sumCap,
      sumSold,
      formatVndFull(sumGross),
      formatVndFull(sumFee),
      formatVndFull(sumNet),
      sumCap > 0 ? `${((sumSold / sumCap) * 100).toFixed(1)}%` : '0.0%',
    ])
    rTotalAll.eachCell((cell, colNum) => {
      cell.fill = totalAmberFill
      cell.font = boldFont
      cell.border = doubleBottomBorder
      if (colNum >= 8 && colNum <= 12) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      }
    })
  }

  // =========================================================================
  // SHEET 3: CƠ CẤU THEO HẠNG VÉ (KẺ BẢNG VÀ MÀU SẮC CHUẨN)
  // =========================================================================
  const categories = advancedData?.categoryBreakdown || []
  const wsCat = workbook.addWorksheet('Cơ Cấu Hạng Vé', {
    views: [{ showGridLines: true }],
  })
  wsCat.columns = [
    { key: 'stt', width: 6 },
    { key: 'name', width: 24 },
    { key: 'price', width: 18 },
    { key: 'cap', width: 14 },
    { key: 'sold', width: 14 },
    { key: 'rem', width: 14 },
    { key: 'chk', width: 14 },
    { key: 'gross', width: 26 },
    { key: 'fee', width: 24 },
    { key: 'net', width: 26 },
    { key: 'fill', width: 16 },
  ]

  const rCatTitle = wsCat.addRow([isAll ? 'CƠ CẤU DOANH THU THEO TẤT CẢ HẠNG VÉ' : `CƠ CẤU DOANH THU THEO TỪNG HẠNG VÉ: ${eventTitle}`])
  rCatTitle.font = titleFont
  wsCat.addRow([])

  const rHeadCat = wsCat.addRow([
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
  ])
  rHeadCat.eachCell((cell) => {
    cell.fill = headerFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder
  })

  categories.forEach((c, i) => {
    const row = wsCat.addRow([
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
    ])

    row.eachCell((cell, colNum) => {
      cell.font = normalFont
      cell.border = thinBorder
      if (colNum === 1 || colNum === 11) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      } else if (colNum >= 3 && colNum <= 10) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' }
      }
    })
  })

  // Dòng Tổng Cộng Hạng Vé
  const rTotalCat = wsCat.addRow([
    'Tổng',
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
  ])
  rTotalCat.eachCell((cell, colNum) => {
    cell.fill = totalAmberFill
    cell.font = boldFont
    cell.border = doubleBottomBorder
    if (colNum >= 3 && colNum <= 10) {
      cell.alignment = { vertical: 'middle', horizontal: 'right' }
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    }
  })

  // =========================================================================
  // SHEET 4: XU HƯỚNG BÁN VÉ THEO NGÀY (CÓ KẺ BẢNG)
  // =========================================================================
  const timeline = advancedData?.timeline || []
  const wsTime = workbook.addWorksheet('Xu Hướng Bán Vé', {
    views: [{ showGridLines: true }],
  })
  wsTime.columns = [
    { key: 'stt', width: 6 },
    { key: 'date', width: 18 },
    { key: 'sold', width: 16 },
    { key: 'gross', width: 26 },
    { key: 'fee', width: 26 },
    { key: 'net', width: 28 },
    { key: 'type', width: 26 },
  ]

  const rTimeTitle = wsTime.addRow(['BÁO CÁO XU HƯỚNG BÁN VÉ & DOANH THU THEO CHUỖI THỜI GIAN'])
  rTimeTitle.font = titleFont
  wsTime.addRow([])

  const rHeadTime = wsTime.addRow([
    'STT',
    'Ngày Ghi Nhận',
    'Số Vé Bán Ra',
    'Doanh Thu Gộp (Gross)',
    'Phí Nền Tảng (Platform Fee)',
    'Doanh Thu Thực Nhận (Net)',
    'Tính Chất Giao Dịch',
  ])
  rHeadTime.eachCell((cell) => {
    cell.fill = navyFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder
  })

  timeline.forEach((t, i) => {
    const isNegative = t.ticketsSold < 0 || t.grossRevenue < 0
    const row = wsTime.addRow([
      i + 1,
      t.date,
      `${t.ticketsSold} vé`,
      formatVndFull(t.grossRevenue),
      formatVndFull(t.platformFee),
      formatVndFull(t.netProfit),
      isNegative ? 'Hoàn trả vé / Khấu trừ' : 'Bán vé tham dự',
    ])

    row.eachCell((cell, colNum) => {
      cell.font = normalFont
      cell.border = thinBorder
      if (colNum === 1 || colNum === 2 || colNum === 3 || colNum === 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      }
    })
  })

  // Dòng Tổng Cộng Timeline
  const rTotalTime = wsTime.addRow([
    'Tổng',
    '—',
    `${ticketsSold} vé`,
    formatVndFull(gross),
    formatVndFull(platformFee),
    formatVndFull(net),
    'Toàn bộ chu kỳ',
  ])
  rTotalTime.eachCell((cell, colNum) => {
    cell.fill = totalAmberFill
    cell.font = boldFont
    cell.border = doubleBottomBorder
    if (colNum >= 4 && colNum <= 6) {
      cell.alignment = { vertical: 'middle', horizontal: 'right' }
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    }
  })

  // =========================================================================
  // SHEET 5: THỐNG KÊ CHECK-IN & OUT (LỌC BỎ CÁC DÒNG SỐ 0, CÓ KẺ BẢNG)
  // =========================================================================
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

  const activeHours = Object.entries(hourMap)
    .map(([h, val]) => ({
      hour: Number(h),
      checkIn: val.checkIn,
      checkOut: val.checkOut,
      total: val.checkIn + val.checkOut,
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => a.hour - b.hour)

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

  const wsCheck = workbook.addWorksheet('Thống Kê Check-in', {
    views: [{ showGridLines: true }],
  })
  wsCheck.columns = [
    { key: 'c1', width: 22 },
    { key: 'c2', width: 24 },
    { key: 'c3', width: 26 },
    { key: 'c4', width: 26 },
    { key: 'c5', width: 38 },
  ]

  const rCheckTitle = wsCheck.addRow(['BÁO CÁO LƯU LƯỢNG KHÁCH CHECK-IN (VÀO) & CHECK-OUT (RA)'])
  rCheckTitle.font = titleFont
  wsCheck.addRow([])

  const rSecSession = wsCheck.addRow(['TỔNG QUAN THEO BUỔI TRONG NGÀY', '', '', '', ''])
  rSecSession.font = sectionHeaderFont

  const rHeadSession = wsCheck.addRow(['Buổi Hoạt Động', 'Khung Giờ', 'Lượt Vào (Check-in)', 'Lượt Ra (Check-out)', 'Tần Suất Lưu Lượng'])
  rHeadSession.eachCell((cell) => {
    cell.fill = headerFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder
  })

  const addSessionRow = (session: string, time: string, inCnt: number, outCnt: number, status: string) => {
    const row = wsCheck.addRow([session, time, `${inCnt} lượt`, `${outCnt} lượt`, status])
    row.eachCell((cell, colNum) => {
      cell.font = normalFont
      cell.border = thinBorder
      cell.alignment = { vertical: 'middle', horizontal: colNum === 1 || colNum === 5 ? 'left' : 'center' }
    })
  }

  addSessionRow('Buổi Sáng', '06:00 - 11:59', morning.in, morning.out, morning.in > 0 ? 'Có hoạt động' : 'Yên ắng')
  addSessionRow('Buổi Chiều', '12:00 - 17:59', afternoon.in, afternoon.out, afternoon.in > 0 ? 'Giờ cao điểm' : 'Yên ắng')
  addSessionRow('Buổi Tối', '18:00 - 23:59', evening.in, evening.out, evening.in > 0 ? 'Có hoạt động' : 'Yên ắng')
  addSessionRow('Đêm & Rạng Sáng', '00:00 - 05:59', night.in, night.out, night.in > 0 ? 'Có hoạt động' : 'Ngoài giờ')
  wsCheck.addRow([])

  const rSecHours = wsCheck.addRow(['CHI TIẾT CÁC KHUNG GIỜ THỰC TẾ CÓ PHÁT SINH LƯỢT KHÁCH', '', '', '', ''])
  rSecHours.font = sectionHeaderFont

  const rHeadHours = wsCheck.addRow(['Khung Giờ', 'Lượt Check-in (Vào)', 'Lượt Check-out (Ra)', 'Tổng Lưu Lượng', 'Ghi Chú'])
  rHeadHours.eachCell((cell) => {
    cell.fill = navyFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder
  })

  if (activeHours.length === 0) {
    const row = wsCheck.addRow(['Toàn bộ khung giờ', '0 lượt', '0 lượt', '0 lượt', 'Chưa ghi nhận lượt khách nào thực hiện check-in hoặc check-out'])
    row.eachCell((cell) => {
      cell.font = normalFont
      cell.border = thinBorder
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
  } else {
    activeHours.forEach((item) => {
      const pad = (n: number) => String(n).padStart(2, '0')
      const timeRange = `${pad(item.hour)}:00 - ${pad(item.hour)}:59`
      const isPeak = item.total === Math.max(...activeHours.map((h) => h.total))
      const row = wsCheck.addRow([
        timeRange,
        `${item.checkIn} lượt`,
        `${item.checkOut} lượt`,
        `${item.total} lượt`,
        isPeak ? 'Khung giờ cao điểm nhất (Peak Hour)' : 'Lưu lượng bình thường',
      ])
      row.eachCell((cell, colNum) => {
        cell.font = isPeak ? boldFont : normalFont
        cell.border = thinBorder
        cell.alignment = { vertical: 'middle', horizontal: colNum === 5 ? 'left' : 'center' }
        if (isPeak) cell.fill = highlightEmeraldFill
      })
    })
  }

  // =========================================================================
  // SHEET 6: NHẬT KÝ ĐƠN HOÀN TRẢ VÉ (AUDIT TRAIL CÓ KẺ BẢNG)
  // =========================================================================
  const refundAudits = advancedData?.refundAuditList || []
  const wsRefund = workbook.addWorksheet('Nhật Ký Hoàn Trả', {
    views: [{ showGridLines: true }],
  })
  wsRefund.columns = [
    { key: 'stt', width: 6 },
    { key: 'id', width: 12 },
    { key: 'tcode', width: 18 },
    { key: 'cat', width: 18 },
    { key: 'name', width: 22 },
    { key: 'email', width: 26 },
    { key: 'amount', width: 18 },
    { key: 'reason', width: 26 },
    { key: 'detail', width: 35 },
    { key: 'reviewer', width: 22 },
    { key: 'time', width: 22 },
    { key: 'status', width: 16 },
  ]

  const rRefTitle = wsRefund.addRow(['NHẬT KÝ & PHÂN TÍCH ĐƠN HOÀN TRẢ VÉ (AUDIT TRAIL & RISK ANALYTICS)'])
  rRefTitle.font = titleFont
  wsRefund.addRow([])

  const rHeadRef = wsRefund.addRow([
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
  ])
  rHeadRef.eachCell((cell) => {
    cell.fill = headerFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder
  })

  if (refundAudits.length === 0) {
    const row = wsRefund.addRow([
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
    row.eachCell((cell) => {
      cell.font = normalFont
      cell.border = thinBorder
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
  } else {
    refundAudits.forEach((audit, i) => {
      const pTime = audit.processedAt ? formatDateTimeVN(audit.processedAt) : '—'
      const row = wsRefund.addRow([
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
      row.eachCell((cell, colNum) => {
        cell.font = normalFont
        cell.border = thinBorder
        if (colNum === 1 || colNum === 2 || colNum === 3 || colNum === 11 || colNum === 12) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else if (colNum === 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' }
        }
      })
    })
  }

  // Ghi tệp và tải về trình duyệt
  const fileName = generateReportFileName(eventTitle, eventId || 'ALL', 'xlsx', isAll)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Xuất Báo Cáo CSV chuẩn hóa với UTF-8 BOM, hỗ trợ cả 'ALL' và sự kiện đơn lẻ
 */
export function exportEventAnalyticsToCSV({
  isAllEvents = false,
  eventId,
  eventTitle,
  eventStartTime,
  eventEndTime,
  organizerName,
  allEventsList = [],
  advancedData,
  financialOverview,
  currentSub,
}: ExportReportParams): void {
  const isAll = isAllEvents || eventId === 'ALL'
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
    [isAll ? 'BÁO CÁO TỔNG HỢP TOÀN BỘ SỰ KIỆN' : `Sự kiện: ${eventTitle} (Mã: #${eventId})`],
    [isAll ? `Tổng số sự kiện: ${allEventsList.length} sự kiện` : `Thời gian diễn ra: ${formatDateTimeVN(eventStartTime)} - ${formatDateTimeVN(eventEndTime)}`],
    [`Đơn vị tổ chức: ${organizerName || 'Ban Tổ Chức'}`],
    [`Thời gian trích xuất dữ liệu: ${formatDateTimeVN(new Date().toISOString())}`],
    ['===================================================================================================='],
    ['1. DANH MỤC KPI VẬN HÀNH & ĐỐI SOÁT TÀI CHÍNH', 'GIÁ TRỊ', 'GHI CHÚ CHI TIẾT'],
    ['Doanh Thu Thanh Toán (Gross)', formatVndFull(gross), 'Tổng tiền thực thu từ khách mua vé'],
    ['Doanh Thu Gốc Ban Đầu (Original Gross)', formatVndFull(originalGross), 'Doanh thu trước khi trừ hoàn trả'],
    ['Đã Trừ Hoàn Trả (Refund Amount)', refundAmount > 0 ? `-${formatVndFull(refundAmount)}` : '0 đ', `${refundCount} vé hoàn trả`],
    ['Phí Dịch Vụ Nền Tảng (Platform Fee)', formatVndFull(platformFee), `Khấu trừ đối soát (Gói ${tierCode} - Hoa hồng ${commRate}%)`],
    ['Doanh Thu Thực Nhận (Net Profit)', formatVndFull(net), 'Chuyển về ví Ban tổ chức'],
    ['Số Vé Đã Bán', `${ticketsSold.toLocaleString('vi-VN')} vé`, 'vé đã thanh toán thành công'],
    ['Lượt Khách Đã Vào Cổng (Check-in)', `${checkedIn.toLocaleString('vi-VN')} lượt`, 'lượt khách có mặt'],
    ['Tỷ Lệ Check-in', `${checkInRate.toFixed(1)}%`, 'Khách có mặt / Vé đã bán'],
    ['Tổng Sức Chứa (Capacity)', `${capacity.toLocaleString('vi-VN')} chỗ`, 'chỗ ngồi'],
    ['Tỷ Lệ Lấp Đầy (Fill Rate)', `${fillRate.toFixed(1)}%`, 'Vé đã bán / Sức chứa'],
    ['Giá Trị Đơn Hàng Trung Bình (AOV)', formatVndFull(aov), 'Doanh thu / vé bán'],
  ]

  if (isAll && allEventsList.length > 0) {
    rows.push(['===================================================================================================='])
    rows.push(['2. DANH SÁCH CHI TIẾT TẤT CẢ SỰ KIỆN'])
    rows.push(['STT', 'Mã SK', 'Tên Sự Kiện', 'Ban Tổ Chức', 'Bắt Đầu', 'Kết Thúc', 'Trạng Thái', 'Sức Chứa', 'Vé Đã Bán', 'Doanh Thu Gross', 'Phí Sàn', 'Thực Nhận Net', 'Lấp Đầy'])
    allEventsList.forEach((ev, i) => {
      const cCap = ev.capacity || 0
      const cSold = ev.ticketsSold || 0
      const cGross = ev.grossRevenue || 0
      const cFee = ev.platformFee || 0
      const cNet = ev.netProfit || 0
      const cFill = cCap > 0 ? (cSold / cCap) * 100 : 0
      rows.push([
        `${i + 1}`,
        `#${ev.id}`,
        ev.title,
        ev.organizerName || '—',
        formatDateTimeVN(ev.startTime),
        formatDateTimeVN(ev.endTime),
        ev.status === 'OPEN' ? 'Đang mở bán' : (ev.status || '—'),
        `${cCap}`,
        `${cSold}`,
        formatVndFull(cGross),
        formatVndFull(cFee),
        formatVndFull(cNet),
        `${cFill.toFixed(1)}%`,
      ])
    })
  }

  rows.push(['===================================================================================================='])
  rows.push(['CƠ CẤU HẠNG VÉ'])
  rows.push(['STT', 'Tên Hạng Vé', 'Giá Vé', 'Sức Chứa', 'Đã Bán', 'Còn Lại', 'Check-in', 'Doanh Thu Gross', 'Phí Sàn', 'Thực Nhận Net', 'Tỷ Lệ Lấp Đầy'])

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

  rows.push(['===================================================================================================='])
  rows.push(['XU HƯỚNG BÁN VÉ THEO NGÀY'])
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

  rows.push(['===================================================================================================='])
  rows.push(['KHUNG GIỜ CHECK-IN CÓ PHÁT SINH LƯỢT KHÁCH'])
  rows.push(['Khung Giờ', 'Lượt Check-in (Vào)', 'Ghi Chú'])

  const activeCheckIns = (advancedData?.hourlyCheckIns || []).filter((h) => h.count > 0)
  if (activeCheckIns.length === 0) {
    rows.push(['Toàn bộ khung giờ', '0 lượt', 'Chưa ghi nhận lượt khách nào thực hiện check-in'])
  } else {
    activeCheckIns.forEach((h) => {
      const pad = (n: number) => String(n).padStart(2, '0')
      rows.push([`${pad(h.hour)}:00 - ${pad(h.hour)}:59`, `${h.count} lượt`, 'Khung giờ có hoạt động'])
    })
  }

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
  const fileName = generateReportFileName(eventTitle, eventId || 'ALL', 'csv', isAll)
  link.setAttribute('download', fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
