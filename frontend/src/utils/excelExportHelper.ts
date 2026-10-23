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
 * Định dạng ngày chuẩn: DD/MM/YYYY
 */
export function formatDateOnlyVN(dateStr?: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/**
 * Trích xuất chuỗi ngày YYYYMMDD để ghép vào tên tệp
 */
function getDateStringForFileName(dateStr?: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

/**
 * Tạo tên tệp báo cáo chuyên nghiệp:
 * - Sự kiện riêng lẻ: Bao_Cao_[Ten_Su_Kien]_[Ngay_Bat_Dau].xlsx
 *   Ví dụ: Bao_Cao_Su_Kien_Truong_Hoc_20261022.xlsx
 * - Toàn bộ sự kiện: Bao_Cao_Tong_Hop_[N]_Su_Kien_[Ngay_Dau]_den_[Ngay_Cuoi].xlsx
 *   Ví dụ: Bao_Cao_Tong_Hop_10_Su_Kien_20261021_den_20261022.xlsx
 */
export function generateReportFileName(
  title: string,
  eventId: number | string,
  extension: 'xlsx' | 'csv',
  isAll?: boolean,
  eventStartTime?: string,
  allEventsList?: EventSummaryItem[]
): string {
  if (isAll || eventId === 'ALL') {
    if (allEventsList && allEventsList.length > 0) {
      const validDates = allEventsList
        .map((ev) => ev.startTime || ev.endTime)
        .filter(Boolean)
        .map((dStr) => new Date(dStr!).getTime())
        .filter((t) => !isNaN(t))
        .sort((a, b) => a - b)

      if (validDates.length > 0) {
        const earliest = getDateStringForFileName(new Date(validDates[0]).toISOString())
        const latest = getDateStringForFileName(new Date(validDates[validDates.length - 1]).toISOString())
        const count = allEventsList.length

        if (earliest && latest && earliest !== latest) {
          return `Bao_Cao_Tong_Hop_${count}_Su_Kien_${earliest}_den_${latest}.${extension}`
        } else if (earliest) {
          return `Bao_Cao_Tong_Hop_${count}_Su_Kien_${earliest}.${extension}`
        }
      }
    }
    return `Bao_Cao_Tong_Hop_Toan_Bo_Su_Kien.${extension}`
  }

  // Sự kiện riêng lẻ: Lấy ngày bắt đầu sự kiện
  const cleanTitle = removeVietnameseTones(title || `Event_${eventId}`)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('_')

  const eventDate = getDateStringForFileName(eventStartTime)
  if (eventDate) {
    return `Bao_Cao_${cleanTitle || `Event_${eventId}`}_${eventDate}.${extension}`
  }
  return `Bao_Cao_${cleanTitle || `Event_${eventId}`}.${extension}`
}

// ===================== STYLING TOKENS CHO EXCELJS =====================
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
}

const doubleBottomBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'double', color: { argb: 'FF0F172A' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
}

const headerFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEA580C' }, // FPT Primary Orange
}

const navyFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E293B' }, // Dark Navy
}

const slateSectionFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF334155' }, // Slate-700
}

const zebraFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF8FAFC' }, // Light Gray
}

const highlightEmeraldFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFECFDF5' }, // Emerald-50
}

const totalAmberFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFEF3C7' }, // Amber-100
}

const titleFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF0F172A' } }
const subtitleFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF475569' } }
const sectionHeaderFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
const headerFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
const normalFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } }
const boldFont: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } }

/**
 * Xuất Báo Cáo Phân Tích Chuyên Sâu dạng Excel đa trang tính (.xlsx)
 * Đảm bảo 100%: Kẻ bảng toàn bộ, màu sắc đồng nhất, không cắt chữ, căn lề chuẩn xác, dữ liệu minh bạch
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

  // 1. Dữ liệu tài chính hợp nhất và minh bạch 100%
  const gross = advancedData?.totalGrossRevenue ?? financialOverview?.totalGrossRevenue ?? 0
  const refundAmount = advancedData?.totalRefundAmount ?? financialOverview?.totalRefundAmount ?? 0
  const refundCount = (advancedData as any)?.totalTicketsRefunded ?? financialOverview?.totalTicketsRefunded ?? 0
  const originalGross = advancedData?.totalOriginalGross || financialOverview?.totalOriginalGross || (gross + refundAmount)
  const platformFee = advancedData?.totalPlatformFee ?? financialOverview?.totalPlatformFee ?? 0
  const net = advancedData?.totalNetProfit ?? financialOverview?.totalNetProfit ?? (gross - platformFee)

  const ticketsSold = advancedData?.totalTicketsSold ?? financialOverview?.totalTicketsSold ?? 0
  const capacity = advancedData?.totalCapacity || 0
  const fillRate = capacity > 0 ? (ticketsSold / capacity) * 100 : 0

  // 2. Lượt check-in và check-out thực tế
  let totalInCount = advancedData?.checkedInTickets || 0
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
  } else if (isAll) {
    const hourlyInSum = (advancedData?.hourlyCheckIns || []).reduce((acc, curr) => acc + curr.count, 0)
    totalInCount = Math.max(advancedData?.checkedInTickets || 0, hourlyInSum)
    totalOutCount = (advancedData?.hourlyCheckOuts || []).reduce((acc, curr) => acc + curr.count, 0)
  }

  // Tỷ lệ check-in thực tế tính chuẩn xác theo totalInCount để không bao giờ bị mâu thuẫn
  const checkInRate = ticketsSold > 0 ? (totalInCount / ticketsSold) * 100 : 0
  const aov = ticketsSold > 0 ? Math.round(gross / ticketsSold) : 0

  // 3. Phân rã phí nền tảng
  const rawTierCode = advancedData?.tierCode || financialOverview?.tierCode || currentSub?.tierCode || 'FREE'
  const tierCode = rawTierCode === 'LEGACY' ? (currentSub?.tierCode || 'FREE') : rawTierCode
  const commRate = tierCode === 'BUSINESS'
    ? 0.0
    : (advancedData?.commissionRatePercent ?? financialOverview?.commissionRatePercent ?? (currentSub?.commissionBps ? currentSub.commissionBps / 100 : 5.0))
  const fixedFee = (advancedData?.totalFixedFee !== undefined && advancedData.totalFixedFee >= 0)
    ? advancedData.totalFixedFee
    : ((financialOverview?.totalFixedFee !== undefined && financialOverview.totalFixedFee >= 0)
      ? financialOverview.totalFixedFee
      : (platformFee > 0 ? Math.min(platformFee, ticketsSold * 1000) : 0))
  const commFee = tierCode === 'BUSINESS'
    ? 0
    : (advancedData?.totalCommissionFee ?? Math.max(0, platformFee - fixedFee))

  // Tính số lượng vé thực tế chịu phí cố định 1.000đ
  const feeTicketCount = fixedFee > 0 ? Math.round(fixedFee / 1000) : 0

  // =========================================================================
  // SHEET 1: TỔNG QUAN & TÀI CHÍNH (ĐƯỢC KẺ BẢNG VÀ CANH LỀ ĐỒNG NHẤT 100%)
  // =========================================================================
  const sheet1Name = isAll ? 'Tổng Quan Toàn Bộ' : 'Tổng Quan & Tài Chính'
  const ws1 = workbook.addWorksheet(sheet1Name, {
    views: [{ showGridLines: true }],
  })
  // Độ rộng cột rộng rãi, Cột C đủ 72 ký tự để không bao giờ bị cắt chữ
  ws1.columns = [
    { key: 'colA', width: 44 },
    { key: 'colB', width: 28 },
    { key: 'colC', width: 72 },
  ]

  // Header Titles
  const r1 = ws1.addRow(['HỆ THỐNG QUẢN LÝ SỰ KIỆN FEMS - FPT EVENT MANAGEMENT SYSTEM'])
  r1.font = titleFont
  const r2 = ws1.addRow([isAll ? 'BÁO CÁO PHÂN TÍCH TỔNG HỢP TOÀN BỘ SỰ KIỆN' : 'BÁO CÁO PHÂN TÍCH TỔNG QUAN VẬN HÀNH & ĐỐI SOÁT TÀI CHÍNH'])
  r2.font = subtitleFont
  ws1.addRow([])

  // Block THÔNG TIN SỰ KIỆN với Thanh Tiêu Đề Có Kẻ Bảng
  const rInfoHead = ws1.addRow(['THÔNG TIN CHUNG SỰ KIỆN', '', ''])
  ws1.mergeCells(`A${rInfoHead.number}:C${rInfoHead.number}`)
  rInfoHead.getCell(1).fill = slateSectionFill
  rInfoHead.getCell(1).font = sectionHeaderFont
  rInfoHead.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  rInfoHead.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = thinBorder
  })

  const addInfoRow = (label: string, val: string, spanCol = true) => {
    const row = ws1.addRow([label, val, ''])
    row.getCell(1).font = boldFont
    row.getCell(2).font = normalFont
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' }
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    row.getCell(1).fill = zebraFill

    if (spanCol) {
      ws1.mergeCells(`B${row.number}:C${row.number}`)
    }
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder
    })
  }

  if (isAll) {
    // Tính khoảng thời gian của toàn bộ sự kiện
    let dateRangeStr = 'Đang cập nhật'
    if (allEventsList.length > 0) {
      const validDates = allEventsList
        .map((ev) => ev.startTime || ev.endTime)
        .filter(Boolean)
        .map((dStr) => new Date(dStr!).getTime())
        .filter((t) => !isNaN(t))
        .sort((a, b) => a - b)
      if (validDates.length > 0) {
        const dStart = formatDateOnlyVN(new Date(validDates[0]).toISOString())
        const dEnd = formatDateOnlyVN(new Date(validDates[validDates.length - 1]).toISOString())
        dateRangeStr = dStart === dEnd ? `Ngày ${dStart}` : `Từ ${dStart} đến ${dEnd}`
      }
    }

    addInfoRow('Phạm vi báo cáo', 'Toàn bộ sự kiện trên hệ thống')
    addInfoRow('Tổng số sự kiện ghi nhận', `${allEventsList.length} sự kiện`)
    addInfoRow('Khoảng thời gian chu kỳ sự kiện', dateRangeStr)
    addInfoRow('Người lập báo cáo', organizerName || 'Ban Quản Trị Hệ Thống')
    addInfoRow('Thời gian trích xuất dữ liệu', formatDateTimeVN(new Date().toISOString()))
    addInfoRow('Trạng thái tổng hợp', 'Đã đối soát toàn sàn')
  } else {
    addInfoRow('Mã sự kiện', `#${eventId}`)
    addInfoRow('Tên sự kiện', eventTitle)
    addInfoRow('Đơn vị tổ chức', organizerName || 'Ban Tổ Chức')
    addInfoRow('Thời gian sự kiện bắt đầu', formatDateTimeVN(eventStartTime))
    addInfoRow('Thời gian sự kiện kết thúc', formatDateTimeVN(eventEndTime))
    addInfoRow('Trạng thái sự kiện', eventStatus === 'OPEN' ? 'Đang mở bán vé (OPEN)' : eventStatus === 'CLOSED' ? 'CLOSED (Đã kết thúc)' : (eventStatus || 'Hoàn tất'))
    addInfoRow('Gói dịch vụ áp dụng', `Gói ${tierCode} (${tierCode === 'BUSINESS' ? 'Ưu đãi 0.0% hoa hồng sàn bán vé' : `${commRate}% hoa hồng sàn bán vé`})`)
    addInfoRow('Thời gian trích xuất báo cáo', formatDateTimeVN(new Date().toISOString()))
  }
  ws1.addRow([])

  // =========================================================================
  // BẢNG 1: CHỈ SỐ VẬN HÀNH & KHÁCH THAM DỰ (ĐỒNG NHẤT 100%)
  // =========================================================================
  const rSec1 = ws1.addRow(['1. CHỈ SỐ VẬN HÀNH & KHÁCH THAM DỰ', '', ''])
  ws1.mergeCells(`A${rSec1.number}:C${rSec1.number}`)
  rSec1.getCell(1).fill = slateSectionFill
  rSec1.getCell(1).font = sectionHeaderFont
  rSec1.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  rSec1.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = thinBorder
  })

  const rHead1 = ws1.addRow(['CHỈ SỐ VẬN HÀNH', 'GIÁ TRỊ THỰC TẾ', 'DIỄN GIẢI CHI TIẾT & GHI CHÚ'])
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
    // Căn giữa đồng nhất cho toàn bộ cột Giá Trị Thực Tế
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

    row.getCell(1).border = thinBorder
    row.getCell(2).border = thinBorder
    row.getCell(3).border = thinBorder
  }

  addMetricRow('Tổng sức chứa sự kiện (Capacity)', `${capacity.toLocaleString('vi-VN')} chỗ ngồi`, 'Tổng số ghế/vé tối đa được thiết lập cho sự kiện')
  addMetricRow('Tổng số vé đã bán (Tickets Sold)', `${ticketsSold.toLocaleString('vi-VN')} vé`, 'Số vé người tham dự đã thanh toán thành công')
  addMetricRow('Tỷ lệ lấp đầy sức chứa (Fill Rate)', `${fillRate.toFixed(1)}%`, 'Tỷ lệ vé đã bán / Tổng sức chứa thiết lập')
  addMetricRow('Lượt khách đã vào cổng (Đã có mặt)', `${totalInCount.toLocaleString('vi-VN')} lượt`, 'Lượt khách quét mã Check-in thành công tại sự kiện')
  addMetricRow('Lượt khách đã rời sự kiện (Check-out)', `${totalOutCount.toLocaleString('vi-VN')} lượt`, 'Lượt khách quét mã Check-out rời sự kiện')
  addMetricRow('Tỷ lệ khách có mặt thực tế', `${checkInRate.toFixed(1)}%`, 'Tỷ lệ khách Check-in vào cổng / Số vé đã bán ra')
  addMetricRow('Giá trị đơn hàng trung bình (AOV)', formatVndFull(aov), 'Doanh thu trung bình trên mỗi vé bán ra')
  addMetricRow('Số vé đã hoàn tiền (Refunded)', `${refundCount.toLocaleString('vi-VN')} vé`, 'Số vé đã xử lý hủy chỗ & hoàn tiền hợp lệ')
  ws1.addRow([])

  // =========================================================================
  // BẢNG 2: ĐỐI SOÁT TÀI CHÍNH & DOANH THU (MINH BẠCH & KHỚP 100% CÔNG THỨC)
  // =========================================================================
  const rSec2 = ws1.addRow(['2. ĐỐI SOÁT TÀI CHÍNH & DOANH THU', '', ''])
  ws1.mergeCells(`A${rSec2.number}:C${rSec2.number}`)
  rSec2.getCell(1).fill = slateSectionFill
  rSec2.getCell(1).font = sectionHeaderFont
  rSec2.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  rSec2.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = thinBorder
  })

  const rHead2 = ws1.addRow(['HẠNG MỤC TÀI CHÍNH', 'SỐ TIỀN THỰC THU (VNĐ)', 'DIỄN GIẢI CÔNG THỨC & ĐỐI SOÁT'])
  rHead2.eachCell((cell) => {
    cell.fill = navyFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder
  })

  const addFinanceRow = (item: string, amount: string, desc: string, isHighlight = false) => {
    const row = ws1.addRow([item, amount, desc])
    row.getCell(1).font = isHighlight ? boldFont : normalFont
    row.getCell(2).font = boldFont
    row.getCell(3).font = normalFont

    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' }
    // Tiền tệ canh phải chuẩn kế toán
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' }
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

    row.getCell(1).border = isHighlight ? doubleBottomBorder : thinBorder
    row.getCell(2).border = isHighlight ? doubleBottomBorder : thinBorder
    row.getCell(3).border = isHighlight ? doubleBottomBorder : thinBorder

    if (isHighlight) {
      row.getCell(1).fill = highlightEmeraldFill
      row.getCell(2).fill = highlightEmeraldFill
      row.getCell(3).fill = highlightEmeraldFill
    }
  }

  // Giải thích chi tiết phí cố định
  let fixedFeeExplanation = `Phí xử lý giao dịch 1.000 đ / vé (${feeTicketCount} vé có tính phí)`
  if (feeTicketCount === ticketsSold) {
    fixedFeeExplanation = `Phí xử lý giao dịch 1.000 đ / vé (áp dụng cho toàn bộ ${ticketsSold} vé bán ra)`
  } else if (feeTicketCount < ticketsSold) {
    fixedFeeExplanation = `Phí xử lý giao dịch 1.000 đ / vé (${feeTicketCount} vé có phí, ${ticketsSold - feeTicketCount} vé miễn phí 0đ)`
  }

  // Giải thích hoàn tiền
  const refundExplanation = refundCount > 0
    ? `${refundCount} vé hoàn trả hợp lệ (đã hoàn lại cho người mua)`
    : 'Không phát sinh đơn hoàn tiền nào'

  addFinanceRow('Doanh thu thanh toán (Gross Revenue)', formatVndFull(gross), `Tổng tiền thực thu từ người tham dự (Doanh thu gốc - Hoàn trả: ${formatVndFull(originalGross)} - ${formatVndFull(refundAmount)})`)
  addFinanceRow('Doanh thu gốc ban đầu (Original Gross)', formatVndFull(originalGross), 'Tổng tiền ban đầu khách thanh toán trước khi phát sinh đơn hoàn tiền')
  addFinanceRow('Đã trừ hoàn trả vé (Total Refunded)', refundAmount > 0 ? `-${formatVndFull(refundAmount)}` : '0 đ', refundExplanation)
  addFinanceRow('Phí dịch vụ nền tảng (Platform Fee)', formatVndFull(platformFee), `Tổng phí hệ thống khấu trừ vào đợt đối soát (Hoa hồng ${formatVndFull(commFee)} + Phí cố định ${formatVndFull(fixedFee)})`)
  addFinanceRow('  - Trong đó: Hoa hồng sàn bán vé', formatVndFull(commFee), tierCode === 'BUSINESS' ? 'Ưu đãi hoa hồng 0.0% sàn áp dụng theo gói BUSINESS' : `Tỷ lệ hoa hồng ${commRate}% tính trên doanh thu gộp`)
  addFinanceRow('  - Trong đó: Phí cố định hệ thống', formatVndFull(fixedFee), fixedFeeExplanation)
  addFinanceRow('DOANH THU THỰC NHẬN CỦA BTC (Net Profit)', formatVndFull(net), `Số tiền thực tế chuyển vào ví Ban Tổ Chức (Gross ${formatVndFull(gross)} - Phí sàn ${formatVndFull(platformFee)})`, true)

  // =========================================================================
  // SHEET 2: KHI LÀ 'ALL' -> DANH SÁCH CHI TIẾT TẤT CẢ SỰ KIỆN
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
        } else if (colNum >= 8 && colNum <= 12) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
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
  // SHEET: CƠ CẤU THEO HẠNG VÉ
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
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
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
  // SHEET: XU HƯỚNG BÁN VÉ THEO NGÀY
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
  // SHEET: THỐNG KÊ CHECK-IN & OUT (LỌC BỎ DÒNG SỐ 0, CÓ KẺ BẢNG)
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
  wsCheck.mergeCells(`A${rSecSession.number}:E${rSecSession.number}`)
  rSecSession.getCell(1).fill = slateSectionFill
  rSecSession.getCell(1).font = sectionHeaderFont
  rSecSession.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  rSecSession.getCell(1).border = thinBorder

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
  wsCheck.mergeCells(`A${rSecHours.number}:E${rSecHours.number}`)
  rSecHours.getCell(1).fill = slateSectionFill
  rSecHours.getCell(1).font = sectionHeaderFont
  rSecHours.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  rSecHours.getCell(1).border = thinBorder

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
  // SHEET: NHẬT KÝ ĐƠN HOÀN TRẢ VÉ (AUDIT TRAIL CÓ KẺ BẢNG)
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
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
        }
      })
    })
  }

  // Tên tệp phản ánh chính xác ngày diễn ra sự kiện thay vì ngày giờ tải về
  const fileName = generateReportFileName(eventTitle, eventId || 'ALL', 'xlsx', isAll, eventStartTime, allEventsList)
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
 * Xuất Báo Cáo CSV chuẩn hóa với UTF-8 BOM, hỗ trợ cả 'ALL' và sự kiện đơn lẻ, tên tệp theo ngày diễn ra
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
  checkIns = [],
}: ExportReportParams): void {
  const isAll = isAllEvents || eventId === 'ALL'
  const gross = advancedData?.totalGrossRevenue ?? financialOverview?.totalGrossRevenue ?? 0
  const refundAmount = advancedData?.totalRefundAmount ?? financialOverview?.totalRefundAmount ?? 0
  const refundCount = (advancedData as any)?.totalTicketsRefunded ?? financialOverview?.totalTicketsRefunded ?? 0
  const originalGross = advancedData?.totalOriginalGross || financialOverview?.totalOriginalGross || (gross + refundAmount)
  const platformFee = advancedData?.totalPlatformFee ?? financialOverview?.totalPlatformFee ?? 0
  const net = advancedData?.totalNetProfit ?? financialOverview?.totalNetProfit ?? (gross - platformFee)

  const ticketsSold = advancedData?.totalTicketsSold ?? financialOverview?.totalTicketsSold ?? 0
  const capacity = advancedData?.totalCapacity || 0
  const fillRate = capacity > 0 ? (ticketsSold / capacity) * 100 : 0

  let totalInCount = advancedData?.checkedInTickets || 0
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
  } else if (isAll) {
    const hourlyInSum = (advancedData?.hourlyCheckIns || []).reduce((acc, curr) => acc + curr.count, 0)
    totalInCount = Math.max(advancedData?.checkedInTickets || 0, hourlyInSum)
    totalOutCount = (advancedData?.hourlyCheckOuts || []).reduce((acc, curr) => acc + curr.count, 0)
  }

  const checkInRate = ticketsSold > 0 ? (totalInCount / ticketsSold) * 100 : 0
  const aov = ticketsSold > 0 ? Math.round(gross / ticketsSold) : 0

  const rawTierCode = advancedData?.tierCode || financialOverview?.tierCode || currentSub?.tierCode || 'FREE'
  const tierCode = rawTierCode === 'LEGACY' ? (currentSub?.tierCode || 'FREE') : rawTierCode
  const commRate = tierCode === 'BUSINESS'
    ? 0.0
    : (advancedData?.commissionRatePercent ?? financialOverview?.commissionRatePercent ?? 5.0)

  const fixedFee = (advancedData?.totalFixedFee !== undefined && advancedData.totalFixedFee >= 0)
    ? advancedData.totalFixedFee
    : ((financialOverview?.totalFixedFee !== undefined && financialOverview.totalFixedFee >= 0)
      ? financialOverview.totalFixedFee
      : (platformFee > 0 ? Math.min(platformFee, ticketsSold * 1000) : 0))
  const commFee = tierCode === 'BUSINESS'
    ? 0
    : (advancedData?.totalCommissionFee ?? Math.max(0, platformFee - fixedFee))

  const feeTicketCount = fixedFee > 0 ? Math.round(fixedFee / 1000) : 0
  let fixedFeeExplanation = `Phí xử lý giao dịch 1.000 đ / vé (${feeTicketCount} vé có tính phí)`
  if (feeTicketCount === ticketsSold) {
    fixedFeeExplanation = `Phí xử lý giao dịch 1.000 đ / vé (áp dụng cho toàn bộ ${ticketsSold} vé bán ra)`
  } else if (feeTicketCount < ticketsSold) {
    fixedFeeExplanation = `Phí xử lý giao dịch 1.000 đ / vé (${feeTicketCount} vé có tính phí / ${ticketsSold} vé bán ra, ${ticketsSold - feeTicketCount} vé miễn phí 0đ)`
  }

  const refundExplanation = refundCount > 0
    ? `${refundCount} vé hoàn trả hợp lệ (đã hoàn lại cho người mua)`
    : 'Không phát sinh đơn hoàn tiền nào'

  // Khoảng thời gian
  let dateHeaderStr = ''
  if (isAll) {
    if (allEventsList.length > 0) {
      const validDates = allEventsList
        .map((ev) => ev.startTime || ev.endTime)
        .filter(Boolean)
        .map((dStr) => new Date(dStr!).getTime())
        .filter((t) => !isNaN(t))
        .sort((a, b) => a - b)
      if (validDates.length > 0) {
        const dStart = formatDateOnlyVN(new Date(validDates[0]).toISOString())
        const dEnd = formatDateOnlyVN(new Date(validDates[validDates.length - 1]).toISOString())
        dateHeaderStr = dStart === dEnd ? `Ngày sự kiện: ${dStart}` : `Chu kỳ sự kiện: Từ ${dStart} đến ${dEnd}`
      }
    }
  } else {
    dateHeaderStr = `Thời gian sự kiện: ${formatDateTimeVN(eventStartTime)} - ${formatDateTimeVN(eventEndTime)}`
  }

  const rows: string[][] = [
    ['HỆ THỐNG QUẢN LÝ SỰ KIỆN FEMS - BÁO CÁO PHÂN TÍCH CHUYÊN SÂU'],
    [isAll ? 'BÁO CÁO TỔNG HỢP TOÀN BỘ SỰ KIỆN' : `Sự kiện: ${eventTitle} (Mã: #${eventId})`],
    [dateHeaderStr],
    [`Đơn vị tổ chức: ${organizerName || 'Ban Tổ Chức'}`],
    [`Thời gian trích xuất dữ liệu: ${formatDateTimeVN(new Date().toISOString())}`],
    ['===================================================================================================='],
    ['1. CHỈ SỐ VẬN HÀNH & KHÁCH THAM DỰ', 'GIÁ TRỊ THỰC TẾ', 'DIỄN GIẢI CHI TIẾT & GHI CHÚ'],
    ['Tổng sức chứa sự kiện (Capacity)', `${capacity.toLocaleString('vi-VN')} chỗ ngồi`, 'Tổng số ghế/vé tối đa được thiết lập cho sự kiện'],
    ['Tổng số vé đã bán (Tickets Sold)', `${ticketsSold.toLocaleString('vi-VN')} vé`, 'Số vé người tham dự đã thanh toán thành công'],
    ['Tỷ lệ lấp đầy sức chứa (Fill Rate)', `${fillRate.toFixed(1)}%`, 'Tỷ lệ vé đã bán / Tổng sức chứa thiết lập'],
    ['Lượt khách đã vào cổng (Đã có mặt)', `${totalInCount.toLocaleString('vi-VN')} lượt`, 'Lượt khách quét mã Check-in thành công tại sự kiện'],
    ['Lượt khách đã rời sự kiện (Check-out)', `${totalOutCount.toLocaleString('vi-VN')} lượt`, 'Lượt khách quét mã Check-out rời sự kiện'],
    ['Tỷ lệ khách có mặt thực tế', `${checkInRate.toFixed(1)}%`, 'Tỷ lệ khách Check-in vào cổng / Số vé đã bán ra'],
    ['Giá trị đơn hàng trung bình (AOV)', formatVndFull(aov), 'Doanh thu trung bình trên mỗi vé bán ra'],
    ['Số vé đã hoàn tiền (Refunded)', `${refundCount.toLocaleString('vi-VN')} vé`, refundExplanation],
    ['===================================================================================================='],
    ['2. ĐỐI SOÁT TÀI CHÍNH & DOANH THU', 'SỐ TIỀN THỰC THU (VNĐ)', 'DIỄN GIẢI CÔNG THỨC & ĐỐI SOÁT'],
    ['Doanh thu thanh toán (Gross Revenue)', formatVndFull(gross), `Tổng tiền thực thu từ người tham dự (Doanh thu gốc - Hoàn trả: ${formatVndFull(originalGross)} - ${formatVndFull(refundAmount)})`],
    ['Doanh thu gốc ban đầu (Original Gross)', formatVndFull(originalGross), 'Tổng tiền ban đầu khách thanh toán trước khi phát sinh đơn hoàn tiền'],
    ['Đã trừ hoàn trả vé (Total Refunded)', refundAmount > 0 ? `-${formatVndFull(refundAmount)}` : '0 đ', refundExplanation],
    ['Phí dịch vụ nền tảng (Platform Fee)', formatVndFull(platformFee), `Tổng phí hệ thống khấu trừ vào đợt đối soát (Hoa hồng ${formatVndFull(commFee)} + Phí cố định ${formatVndFull(fixedFee)})`],
    ['  - Trong đó: Hoa hồng sàn bán vé', formatVndFull(commFee), tierCode === 'BUSINESS' ? 'Ưu đãi hoa hồng 0.0% sàn áp dụng theo gói BUSINESS' : `Tỷ lệ hoa hồng ${commRate}% tính trên doanh thu gộp`],
    ['  - Trong đó: Phí cố định hệ thống', formatVndFull(fixedFee), fixedFeeExplanation],
    ['DOANH THU THỰC NHẬN CỦA BTC (Net Profit)', formatVndFull(net), `Số tiền thực tế chuyển vào ví Ban Tổ Chức (Gross ${formatVndFull(gross)} - Phí sàn ${formatVndFull(platformFee)})`],
  ]

  let secIndex = 3
  if (isAll && allEventsList.length > 0) {
    rows.push(['===================================================================================================='])
    rows.push([`${secIndex++}. DANH SÁCH CHI TIẾT TẤT CẢ SỰ KIỆN`])
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
        ev.startTime ? `="${formatDateTimeVN(ev.startTime)}"` : '—',
        ev.endTime ? `="${formatDateTimeVN(ev.endTime)}"` : '—',
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
  rows.push([`${secIndex++}. CƠ CẤU DOANH SỐ THEO HẠNG VÉ`])
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
  rows.push([`${secIndex++}. XU HƯỚNG BÁN VÉ THEO NGÀY`])
  rows.push(['STT', 'Ngày', 'Số Vé Bán', 'Doanh Thu Gộp (Gross)', 'Phí Sàn', 'Thực Nhận (Net)', 'Ghi Chú'])

  const timeline = advancedData?.timeline || []
  timeline.forEach((t, i) => {
    rows.push([
      `${i + 1}`,
      t.date ? `="${formatDateOnlyVN(t.date)}"` : '—',
      `${t.ticketsSold} vé`,
      formatVndFull(t.grossRevenue),
      formatVndFull(t.platformFee),
      formatVndFull(t.netProfit),
      t.ticketsSold < 0 ? 'Giao dịch hoàn trả vé' : 'Bán vé tham dự',
    ])
  })

  rows.push(['===================================================================================================='])
  rows.push([`${secIndex++}. KHUNG GIỜ CHECK-IN CÓ PHÁT SINH LƯỢT KHÁCH`])
  rows.push(['Khung Giờ', 'Lượt Check-in (Vào)', 'Ghi Chú'])

  const activeCheckIns = (advancedData?.hourlyCheckIns || []).filter((h) => h.count > 0)
  if (activeCheckIns.length === 0) {
    rows.push(['Toàn bộ khung giờ', '0 lượt', 'Chưa ghi nhận lượt khách nào thực hiện check-in'])
  } else {
    activeCheckIns.forEach((h) => {
      const pad = (n: number) => String(n).padStart(2, '0')
      rows.push([`="${pad(h.hour)}:00 - ${pad(h.hour)}:59"`, `${h.count} lượt`, 'Khung giờ có hoạt động'])
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
  const fileName = generateReportFileName(eventTitle, eventId || 'ALL', 'csv', isAll, eventStartTime, allEventsList)
  link.setAttribute('download', fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
