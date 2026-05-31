/**
 * =============================================================================
 * FILE: CheckIn.tsx
 * MÔ TẢ: Trang quản lý Check-in / Check-out vé sự kiện
 * 
 * CHỨC NĂNG CHÍNH:
 * - Quét mã QR trên vé để check-in/check-out người tham dự sự kiện
 * - Hỗ trợ quét cả vé đơn lẻ và nhiều vé cùng lúc (multi-ticket)
 * - Cho phép nhập thủ công mã vé nếu không quét được QR
 * - Hiển thị kết quả check-in/check-out với thông tin chi tiết
 * 
 * ĐỊNH DẠNG QR HỖ TRỢ:
 * - Vé đơn: số nguyên (123) hoặc URL có ticketId=123
 * - Nhiều vé: "TICKETS:123,124,125"
 * =============================================================================
 */

// =============================================================================
// IMPORT CÁC THƯ VIỆN VÀ MODULES CẦN THIẾT
// =============================================================================

import { useState, useEffect, useRef } from 'react'
// useState: Hook để quản lý trạng thái của component (tab đang chọn, đang quét, kết quả...)
// useEffect: Hook để xử lý side-effect (khởi động/dừng camera) khi trạng thái thay đổi
// useRef: Hook để giữ tham chiếu đến đối tượng scanner giữa các lần render mà không gây re-render

import { useAuth } from '../contexts/AuthContext'
// Custom hook để lấy thông tin người dùng đang đăng nhập từ AuthContext
// Dùng để kiểm tra quyền truy cập (chỉ STAFF/ADMIN mới được check-in/checkout)

import { Html5Qrcode } from 'html5-qrcode'
// Thư viện bên thứ 3 để quét mã QR bằng camera trên trình duyệt web
// Hỗ trợ nhiều loại mã vạch và QR code

import { Scan, CheckCircle, XCircle, Search, LogIn, LogOut, AlertTriangle, AlertCircle, Clock, Loader, ShieldAlert, RotateCcw, type LucideIcon } from 'lucide-react'
// Các icon từ thư viện lucide-react:
// - Scan: icon quét mã
// - CheckCircle: icon thành công (dấu check trong vòng tròn)
// - XCircle: icon thất bại (dấu X trong vòng tròn)
// - Search: icon tìm kiếm
// - LogIn: icon đăng nhập (dùng cho tab Check-in)
// - LogOut: icon đăng xuất (dùng cho tab Check-out)
// - AlertTriangle: icon cảnh báo ⚠️
// - AlertCircle: icon lỗi 🚫
// - Clock: icon thời gian ⏳
// - Loader: icon loading

import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
// Thư viện date-fns để định dạng ngày giờ
// - format: hàm format ngày giờ theo pattern chỉ định
// - vi: locale tiếng Việt để hiển thị ngày tháng đúng định dạng VN

// =============================================================================
// ĐỊNH NGHĨA KIỂU DỮ LIỆU (TYPE DEFINITIONS)
// =============================================================================
// Kiểu dữ liệu cho 2 tab: 'checkin' (vào sự kiện) và 'checkout' (ra khỏi sự kiện)
type TabType = 'checkin' | 'checkout'

// =============================================================================
// HELPER: CẤU HÌNH HIỂN THỊ LỖI DỰA TRÊN ERROR CODE
// Phân biệt rõ ràng: 'Vé giả/Sai sự kiện' vs 'Vé đã dùng rồi'
// =============================================================================
type ErrorDisplayConfig = {
  Icon: LucideIcon
  iconClass: string
  title: string
}

function getErrorConfig(errorCode: string | undefined, tab: TabType, previousTime?: string): ErrorDisplayConfig {
  switch (errorCode) {
    case 'UnauthorizedOrganizer':
      // Vé thuộc sự kiện khác - Organizer không sở hữu
      return {
        Icon: ShieldAlert,
        iconClass: 'text-red-500',
        title: '🔐 Bạn không có quyền quét vé cho sự kiện này.\nVui lòng kiểm tra lại sự kiện bạn đang quản lý'
      }
    case 'AlreadyCheckedIn':
      // Vé đã quét rồi - trước đó đã cho vào
      return {
        Icon: RotateCcw,
        iconClass: 'text-orange-500',
        title: previousTime
          ? `⚠️ Mã QR này đã được dùng để check-in vào lúc ${previousTime}`
          : '⚠️ Vé đã được quét rồi! Khách này đã vào cổng.'
      }
    case 'AlreadyCheckedOut':
      return { Icon: RotateCcw, iconClass: 'text-orange-500', title: '🚶 Khách đã rời sự kiện rồi! Vé không còn hiệu lực.' }
    case 'NotCheckedIn':
      return { Icon: AlertTriangle, iconClass: 'text-yellow-500', title: '❓ Khách chưa check-in! Không thể check-out.' }
    case 'TicketCancelled':
      return { Icon: XCircle, iconClass: 'text-red-500', title: '❌ Vé đã bị hủy! Không thể sử dụng.' }
    case 'InvalidTicket':
      return {
        Icon: XCircle,
        iconClass: 'text-red-500',
        title: '❌ Mã vé không tồn tại trong hệ thống hoặc thuộc về một sự kiện khác'
      }
    case 'TooEarlyToCheckIn':
      return { Icon: Clock, iconClass: 'text-yellow-500', title: '⏰ Chưa đến giờ! Cổng check-in chưa mở.' }
    case 'TooEarlyToCheckOut':
      return { Icon: Clock, iconClass: 'text-yellow-500', title: '⏰ Chưa đến giờ check-out!' }
    case 'EventEnded':
      return { Icon: AlertCircle, iconClass: 'text-red-500', title: '🏁 Sự kiện đã kết thúc!' }
    case 'DatabaseError':
      return { Icon: AlertCircle, iconClass: 'text-gray-500', title: '⛔ Lỗi hệ thống!' }
    default:
      // Fallback: dùng icon cũ dựa trên nội dung message
      return {
        Icon: tab === 'checkin' ? XCircle : XCircle,
        iconClass: 'text-red-500',
        title: tab === 'checkin' ? 'Check-in thất bại!' : 'Check-out thất bại!',
      }
  }
}


// =============================================================================
// COMPONENT CHÍNH: CheckIn
// =============================================================================

export default function CheckIn() {
  // ===========================================================================
  // KHAI BÁO CÁC STATE VÀ REF
  // ===========================================================================

  // Lấy thông tin user từ AuthContext
  // Đặt tên _user (có underscore) vì hiện tại chưa sử dụng trực tiếp trong component
  const { user: _user } = useAuth()

  // Lấy token xác thực từ localStorage để gửi kèm trong header Authorization khi gọi API
  // Kiểm tra typeof window !== 'undefined' để tránh lỗi khi chạy Server-Side Rendering (SSR)

  // State lưu tab đang được chọn, mặc định là 'checkin'
  const [activeTab, setActiveTab] = useState<TabType>('checkin')

  // State kiểm soát việc bật/tắt camera quét QR
  // true = đang quét, false = không quét
  const [scanning, setScanning] = useState(false)

  // State lưu giá trị input khi người dùng nhập mã vé thủ công
  const [manualCode, setManualCode] = useState('')

  // Ref giữ tham chiếu đến instance của Html5Qrcode (đối tượng scanner)
  // Dùng ref thay vì state vì không cần re-render khi thay đổi scanner
  const scannerRef = useRef<Html5Qrcode | null>(null)

  // State lưu kết quả trả về sau khi gọi API check-in/check-out(lưu kết quả để hiển thị)
  // - success: boolean cho biết thành công hay thất bại
  // - message: thông báo hiển thị cho người dùng
  // - errorCode: mã lỗi có cấu trúc để phân loại và hiển thị đúng icon/message
  // - registration: dữ liệu chi tiết về vé/sự kiện (tùy chọn)
  const [result, setResult] = useState<{
    success: boolean
    message: string
    errorCode?: string
    registration?: any
  } | null>(null)

  // ✅ NEW: State kiểm soát việc đang xử lý request (disable button, show loading)
  const [isProcessing, setIsProcessing] = useState(false)

  // ===========================================================================
  // EFFECT: QUẢN LÝ KHỞI ĐỘNG VÀ DỪNG CAMERA QR SCANNER
  // ===========================================================================

  /**
   * useEffect này chạy khi state 'scanning' thay đổi
   * - Khi scanning = true và chưa có scanner: khởi tạo và bật camera
   * - Khi component unmount hoặc scanning = false: dừng và dọn dẹp scanner
   */
  useEffect(() => {
    // Chỉ khởi tạo scanner khi đang quét VÀ chưa có instance scanner
    if (scanning && !scannerRef.current) {
      // Tạo instance Html5Qrcode mới, gắn vào element có id="reader" (Khởi tạo để quét QR)
      const html5QrCode = new Html5Qrcode('reader')
      scannerRef.current = html5QrCode

      // Bắt đầu quét QR với các cấu hình:
      // - facingMode: 'environment' = sử dụng camera sau (phù hợp quét QR)
      // - fps: 10 = quét 10 khung hình/giây
      // - qrbox: kích thước vùng quét QR (280x280 pixel)
      html5QrCode
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 280, height: 280 } },
          (decodedText) => {
            // Callback khi quét thành công - nhận được nội dung QR
            // Use stopScanning() to consistently stop/clear and avoid races
            if (scannerRef.current) {
              stopScanning()
                .then(() => {
                  processAction(decodedText)
                })
                .catch((err) => {
                  console.error('Error stopping scanner after decode', err)
                  // Still process the decoded QR even if stopping failed
                  processAction(decodedText)
                })
            } else {
              setScanning(false)
              processAction(decodedText)
            }
          },
          () => { },  // Callback khi quét thất bại - bỏ trống vì không cần xử lý
        )
        .catch((err) => {
          // Xử lý lỗi khi không thể khởi động camera (ví dụ: không có quyền camera)
          console.error('Unable to start scanning', err)
        })
    }

    // Cleanup function: chạy khi component unmount hoặc dependency thay đổi
    // Đảm bảo dừng camera và giải phóng tài nguyên - wait for stop before clear
    return () => {
      if (scannerRef.current) {
        const ref = scannerRef.current
        ref
          .stop()
          .then(() => {
            try {
              ref.clear()
            } catch (e) {
              console.warn('Failed to clear scanner element during cleanup', e)
            }
          })
          .catch((e) => {
            console.warn('Error stopping scanner during cleanup', e)
            try {
              ref.clear()
            } catch (err) {
              console.warn('Failed to clear scanner element after stop error', err)
            }
          })
          .finally(() => {
            if (scannerRef.current === ref) scannerRef.current = null
          })
      }
    }
  }, [scanning])  // Dependency: chỉ chạy lại khi 'scanning' thay đổi

  // ==========================================================================
  // EFFECT: RESET STATE KHI CHUYỂN TAB
  // ==========================================================================

  /**
   * useEffect này chạy khi người dùng chuyển tab (check-in <-> check-out)
   * Reset tất cả state về trạng thái ban đầu để bắt đầu fresh
   */
  useEffect(() => {
    stopScanning()      // Dừng camera nếu đang quét
    setResult(null)     // Xóa kết quả cũ
    setManualCode('')   // Xóa input nhập tay
  }, [activeTab])  // Dependency: chạy khi 'activeTab' thay đổi

  // ===========================================================================
  // HÀM DỪNG QUÉT QR
  // ===========================================================================

  /**
   * Dừng camera scanner và reset state scanning về false
   * Được gọi khi: quét xong, nhấn nút dừng, hoặc chuyển tab
   */
  const stopScanning = (): Promise<void> => {
    // Ensure we wait for the scanner to stop before clearing the element.
    // Set `scanning` to false only after stop/clear completes to avoid
    // removing the camera UI while the native stream is still active.
    if (scannerRef.current) {
      const ref = scannerRef.current
      return ref
        .stop()
        .then(() => {
          try {
            ref.clear()
          } catch (e) {
            console.warn('Failed to clear scanner element', e)
          }
        })
        .catch((e) => {
          console.warn('Error stopping scanner', e)
          try {
            ref.clear()
          } catch (err) {
            console.warn('Failed to clear scanner after stop error', err)
          }
        })
        .finally(() => {
          if (scannerRef.current === ref) scannerRef.current = null
          setScanning(false)
        }) as Promise<void>
    }

    setScanning(false)
    return Promise.resolve()
  }

  // ===========================================================================
  // HÀM CHUẨN HÓA NỘI DUNG QR CODE
  // ===========================================================================

  /**
   * Chuẩn hóa chuỗi text từ QR để tránh lỗi do ký tự đặc biệt
   * Một số QR code có thể chứa các ký tự ẩn hoặc ký tự Unicode đặc biệt
   * 
   * @param text - Chuỗi gốc đọc được từ QR
   * @returns Chuỗi đã được làm sạch
   */
  const normalizeQrText = (text: string) => {
    return text
      .replace(/\uFEFF/g, '')           // Loại bỏ BOM (Byte Order Mark) - ký tự đánh dấu đầu file
      .replace(/[\u200B-\u200D]/g, '')  // Loại bỏ zero-width characters (ký tự có độ rộng = 0)
      .replace(/[：]/g, ':')            // Chuyển fullwidth colon (：) thành colon thường (:)
      .trim()                            // Xóa khoảng trắng đầu và cuối chuỗi
  }

  // ===========================================================================
  // HÀM KIỂM TRA QR CODE NHIỀU VÉ
  // ===========================================================================

  /**
   * Kiểm tra xem QR code có phải định dạng nhiều vé không
   * Định dạng nhiều vé: "TICKETS:123,124,125"
   * 
   * @param text - Nội dung QR code
   * @returns true nếu là QR nhiều vé, false nếu không
   */
  const isMultiTicketQr = (text: string) => {
    return normalizeQrText(text).toUpperCase().startsWith('TICKETS:')
  }

  // ===========================================================================
  // HÀM TRÍCH XUẤT TICKET ID TỪ QR CODE
  // ===========================================================================

  /**
   * Trích xuất ticketId từ nội dung QR code (dành cho vé đơn)
   * Hỗ trợ 2 định dạng:
   * 1. Số nguyên trực tiếp: "123"
   * 2. URL có tham số: "...?ticketId=123"
   * 
   * @param code - Nội dung QR code hoặc mã nhập tay
   * @returns ticketId (số nguyên) hoặc null nếu không tìm thấy
   */
  const extractTicketId = (code: string): number | null => {
    const trimmed = normalizeQrText(code)

    // Thử parse trực tiếp thành số
    const numeric = Number(trimmed)
    // Kiểm tra: không phải NaN, là số nguyên, và lớn hơn 0
    if (!Number.isNaN(numeric) && Number.isInteger(numeric) && numeric > 0) {
      return numeric
    }

    // Thử tìm pattern ticketId=(\d+) trong chuỗi (không phân biệt hoa thường)
    const match = trimmed.match(/ticketId=(\d+)/i)
    if (match) {
      return Number(match[1])  // match[1] là nhóm capture đầu tiên (\d+)
    }

    // Không tìm thấy ticketId hợp lệ
    return null
  }

  // ===========================================================================
  // HÀM PARSE DATE TỪ FORMAT BACKEND
  // ===========================================================================

  /**
   * Parse chuỗi date từ format backend: "HH:mm dd/MM/yyyy" hoặc "dd/MM/yyyy HH:mm:ss"
   * Backend có thể trả dưới các format khác nhau, hàm này xử lý tất cả
   * 
   * @param dateStr - Chuỗi date từ backend
   * @returns Date object hoặc null nếu không parse được
   */
  const parseBackendDate = (dateStr: string | undefined): Date | null => {
    if (!dateStr) return null

    try {
      // Cố gắng parse dưới các format khác nhau
      // Format 1: "17:03 14/04/2026" (HH:mm dd/MM/yyyy)
      const match1 = dateStr.match(/(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (match1) {
        const [, hour, min, day, month, year] = match1
        return new Date(
          parseInt(year),
          parseInt(month) - 1, // Tháng bắt đầu từ 0
          parseInt(day),
          parseInt(hour),
          parseInt(min),
          0
        )
      }

      // Format 2: "dd/MM/yyyy HH:mm:ss" (dd/MM/yyyy HH:mm:ss)
      const match2 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/)
      if (match2) {
        const [, day, month, year, hour, min, sec] = match2
        return new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(min),
          parseInt(sec)
        )
      }

      // Nếu không parse được, trả null thay vì hiển thị lỗi
      console.warn(`Could not parse date: ${dateStr}`)
      return null
    } catch (e) {
      console.error(`Error parsing date: ${dateStr}`, e)
      return null
    }
  }

  // ===========================================================================
  // HÀM XỬ LÝ CHÍNH: GỌI API CHECK-IN/CHECK-OUT
  // ===========================================================================

  /**
   * Hàm chính xử lý logic check-in hoặc check-out
   * Được gọi khi: quét QR thành công HOẶC nhập mã thủ công
   * 
   * Luồng xử lý:
   * 1. Kiểm tra token (phải đăng nhập mới được thực hiện)
   * 2. Chuẩn hóa và phân tích nội dung QR
   * 3. Xây dựng endpoint API phù hợp (check-in/check-out, đơn vé/nhiều vé)
   * 4. Gọi API và xử lý response
   * 5. Cập nhật state result để hiển thị kết quả
   * 
   * @param qrCode - Nội dung QR code hoặc mã nhập tay
   */
  const processAction = async (qrCode: string) => {
    // Reset kết quả cũ trước khi xử lý để tránh việc còn tồn tại kết quả cũ 
    setResult(null)
    setIsProcessing(true)  // ✅ NEW: Disable button, show loading

    // Chuẩn hóa nội dung QR tránh việc lỗi do ký tự đặc biệt
    const cleaned = normalizeQrText(qrCode)

    //Gọi api check-in/check-out ở BE xử lí
    try {
      // =====================================================================
      // XÂY DỰNG ENDPOINT API DỰA TRÊN TAB VÀ LOẠI VÉ
      // =====================================================================
      // Quy tắc:
      // - TAB CHECK-IN:
      //    + QR nhiều vé (TICKETS:123,124) => /api/staff/checkin?ticketCode=TICKETS:123,124
      //    + Vé đơn (123)                  => /api/staff/checkin?ticketId=123
      // - TAB CHECK-OUT: tương tự, thay checkin bằng checkout
      let apiEndpoint = ''

      if (activeTab === 'checkin') {
        // *** XỬ LÝ CHECK-IN ***
        if (isMultiTicketQr(cleaned)) {
          // Trường hợp QR nhiều vé: gửi nguyên chuỗi ticketCode
          apiEndpoint = `/api/staff/checkin?ticketCode=${encodeURIComponent(
            cleaned,
          )}`
        } else {
          // Trường hợp vé đơn: trích xuất và gửi ticketId
          const ticketId = extractTicketId(cleaned)
          if (!ticketId) {
            // Không trích xuất được ticketId -> báo lỗi
            setResult({
              success: false,
              message: 'QR không hợp lệ hoặc không đọc được ticketId.',
            })
            setIsProcessing(false)  // ✅ NEW: Disable flag
            return
          }
          apiEndpoint = `/api/staff/checkin?ticketId=${encodeURIComponent(
            String(ticketId),
          )}`
        }
      } else {
        // *** XỬ LÝ CHECK-OUT ***
        // Logic tương tự check-in, hỗ trợ cả multi-ticket
        if (isMultiTicketQr(cleaned)) {
          apiEndpoint = `/api/staff/checkout?ticketCode=${encodeURIComponent(
            cleaned,
          )}`
        } else {
          const ticketId = extractTicketId(cleaned)
          if (!ticketId) {
            setResult({
              success: false,
              message: 'QR không hợp lệ hoặc không đọc được ticketId.',
            })
            setIsProcessing(false)  // ✅ NEW: Disable flag
            return
          }
          apiEndpoint = `/api/staff/checkout?ticketId=${encodeURIComponent(
            String(ticketId),
          )}`
        }
      }

      // =====================================================================
      // GỌI API CHECK-IN/CHECK-OUT
      // =====================================================================
      const res = await fetch(apiEndpoint, {
        method: 'POST',                    // Phương thức POST
        credentials: 'include',            // Gửi kèm cookie (nếu có)
        headers: {
          'Content-Type': 'application/json',
          credentials: 'include', // Token xác thực
        },
      })

      // Parse response JSON, nếu lỗi thì trả về object rỗng
      const data = await res.json().catch(() => ({} as any))

      // 🔍 DEBUG: Log toàn bộ response để troubleshoot
      console.group(`🔍 [CHECK-${activeTab.toUpperCase()} RESPONSE]`)
      console.log('HTTP Status:', res.status)
      console.log('Response OK:', res.ok)
      console.log('Response Data:', JSON.stringify(data, null, 2))
      console.groupEnd()

      // =====================================================================
      // XỬ LÝ RESPONSE THẤT BẠI (HTTP status không phải 2xx)
      // =====================================================================
      if (!res.ok) {
        // Lấy message lỗi từ response, ưu tiên error trong results[0] > error > message > mặc định
        const msg =
          (data && data.results && data.results.length > 0 && data.results[0].error) ||
          (data && (data.error || data.message)) ||
          `${activeTab === 'checkin' ? 'Check-in' : 'Check-out'} thất bại (HTTP ${res.status
          })`

        console.error('❌ Check-in/out failed:', {
          status: res.status,
          errorMessage: msg,
          rawData: data
        })

        // Khai thác thông tin ticket nếu có
        const ticketInfo = data && data.results && data.results.length > 0 ? data.results[0] : null

        setResult({
          success: false,
          message: msg,
          errorCode: (ticketInfo && ticketInfo.errorCode) || (res.status === 403 ? 'UnauthorizedOrganizer' : data.errorCode),
          registration: ticketInfo ? {
            ticketId: ticketInfo.ticketId || data.ticketId,
            eventName: ticketInfo.eventName || data.eventName,
            customerName: ticketInfo.customerName || data.customerName,
            previousTime: ticketInfo.previousTime || data.previousTime,
          } : undefined
        })
        setIsProcessing(false)  // ✅ NEW: Disable flag
        return
      }

      // =====================================================================
      // XỬ LÝ RESPONSE THÀNH CÔNG - NHIỀU VÉ (MULTI-TICKET)
      // Backend trả về mảng results[] khi xử lý nhiều vé cùng lúc
      // =====================================================================
      if (data && Array.isArray(data.results)) {
        // ✅ Vé đơn thất bại: hiển thị error chi tiết với errorCode để phân loại
        if (data.results.length === 1 && !data.success && data.results[0].error) {
          setResult({
            success: false,
            message: data.results[0].error,
            errorCode: data.results[0].errorCode, // ✅ Mã lỗi có cấu trúc
            registration: {
              ticketId: data.results[0].ticketId,
              eventName: data.results[0].eventName,
              customerName: data.results[0].customerName,
              previousTime: data.results[0].previousTime, // thời gian đã quét
            },
          })
          return
        }

        // ✅ Vé đơn thành công: hiển thị câu chào mừng cá nhân hoá
        if (data.results.length === 1 && data.success) {
          const r = data.results[0]
          const customerName: string = r.customerName || ''
          const eventName: string = r.eventName || ''
          const greeting = activeTab === 'checkin'
            ? (eventName ? `🎉 Check-in thành công cho sự kiện ${eventName}!` : '✅ Check-in thành công!')
            : (customerName ? `👋 Hẹn gặp lại ${customerName}!` : '✅ Check-out thành công!')
          setResult({
            success: true,
            message: greeting,
            registration: {
              ticketId: r.ticketId,
              eventName: eventName,
              customerName: customerName,
              checkedInAt: r.checkInTime,
              checkedOutAt: r.checkOutTime,
              seatCode: r.seatCode,
            },
          })
          return
        }

        setResult({
          success: !!data.success,
          message:
            data.message ||
            `${activeTab === 'checkin' ? 'Check-in' : 'Check-out'} thành công`,
          registration: {
            results: data.results,           // Mảng kết quả từng vé
            totalTickets: data.totalTickets, // Tổng số vé
            successCount: data.successCount, // Số vé thành công
            failCount: data.failCount,       // Số vé thất bại
          },
        })
        return
      }

      // =====================================================================
      // XỬ LÝ RESPONSE THÀNH CÔNG - VÉ ĐƠN (SINGLE-TICKET)
      // =====================================================================
      // Xử lý đặc biệt cho check-out khi backend vẫn trả results[]
      if (activeTab === 'checkout' && data.results && data.results.length > 0) {
        const firstResult = data.results[0]
        const customerName: string = firstResult.customerName || ''
        const isSuccess = data.success || firstResult.success
        setResult({
          success: isSuccess,
          message: isSuccess
            ? (customerName ? `👋 Hẹn gặp lại ${customerName}!` : 'Check-out thành công')
            : (firstResult.message || data.message || 'Check-out thất bại'),
          errorCode: !isSuccess ? firstResult.errorCode : undefined,
          registration: {
            ticketId: firstResult.ticketId,
            checkedOutAt: firstResult.checkOutTime,
            eventName: firstResult.eventName,
            customerName: customerName,
          },
        })
      } else {
        // Trường hợp response đơn giản (không có results[])
        setResult({
          success: true,
          message:
            data.message ||
            `${activeTab === 'checkin' ? 'Check-in' : 'Check-out'} thành công`,
          registration: {
            ticketId: data.ticketId,
            checkedInAt: data.checkInTime,
            checkedOutAt: data.checkOutTime,
            eventName: data.eventName,
            customerName: data.customerName, // ✅ NEW: Thêm tên khách hàng
          },
        })
      }
      // ✅ NEW: Set isProcessing=false như failed response, thích hợp lúc có lỗi
    } catch (error) {
      // Xử lý lỗi mạng hoặc lỗi không mong đợi
      console.error(error)
      setResult({
        success: false,
        message: 'Lỗi kết nối API',
      })
    } finally {
      setIsProcessing(false)  // ✅ NEW: Always disable processing flag
    }
  }

  // ===========================================================================
  // HÀM XỬ LÝ NHẬP MÃ THỦ CÔNG
  // ===========================================================================

  /**
   * Xử lý khi người dùng nhấn nút Search hoặc Enter sau khi nhập mã thủ công
   * Gọi processAction với mã đã nhập và xóa input
   */
  const handleManualAction = () => {
    if (manualCode.trim()) {
      processAction(manualCode.trim())  // Xử lý với mã đã nhập
      setManualCode('')                  // Xóa input sau khi submit
    }
  }

  // ===========================================================================
  // HÀM RESET KẾT QUẢ
  // ===========================================================================

  /**
   * Xóa kết quả hiện tại để quét/nhập vé tiếp theo
   */
  const resetResult = () => {
    setResult(null)
  }

  // ===========================================================================
  // BIẾN TIỆN ÍCH CHO RENDER
  // ===========================================================================

  // Biến boolean kiểm tra đang ở tab check-in hay không
  const isCheckIn = activeTab === 'checkin'

  // Label hiển thị dựa theo tab hiện tại
  const actionLabel = isCheckIn ? 'Check-in' : 'Check-out'

  // ===========================================================================
  // PHẦN RENDER GIAO DIỆN (JSX)
  // ===========================================================================

  return (
    <div className="bg-slate-900 rounded-3xl border border-slate-850 p-6 sm:p-8 shadow-2xl text-slate-100 animate-fade-in-up">
      {/* ===== TIÊU ĐỀ TRANG ===== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800/60 pb-5 mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase sm:text-3xl">
            Kiểm Soát Check-In / Check-Out
          </h1>
          <p className="text-xs font-semibold text-slate-450 mt-1">
            Bảng điều khiển quét mã QR và nhập mã vé tham gia hội trường sự kiện FPT.
          </p>
        </div>
      </div>

      {/* ===== TAB CHUYỂN ĐỔI CHECK-IN / CHECK-OUT ===== */}
      <div className="flex bg-slate-950/80 rounded-2xl p-1.5 mb-6 max-w-md border border-slate-800/50">
        {/* Nút tab Check-in */}
        <button
          onClick={() => setActiveTab('checkin')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all duration-300 ${
            activeTab === 'checkin'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-500/20 scale-102'
              : 'text-slate-450 hover:text-slate-200'
          }`}
        >
          <LogIn className="w-4 h-4" />
          Check-in Cổng
        </button>

        {/* Nút tab Check-out */}
        <button
          onClick={() => setActiveTab('checkout')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all duration-300 ${
            activeTab === 'checkout'
              ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/20 scale-102'
              : 'text-slate-450 hover:text-slate-200'
          }`}
        >
          <LogOut className="w-4 h-4" />
          Check-out Cổng
        </button>
      </div>

      {/* ===== LAYOUT 2 CỘT: QUÉT QR + KẾT QUẢ ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* CỘT TRÁI: KHU VỰC QUÉT MÃ QR VÀ NHẬP THỦ CÔNG */}
        <div className="bg-slate-950/60 border border-slate-850/80 rounded-3xl p-6 shadow-md flex flex-col justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-200 mb-4 flex items-center gap-2">
              <Scan className="w-4.5 h-4.5 text-orange-500" />
              Quét mã QR - {actionLabel}
            </h2>

            {!scanning ? (
              <div className="space-y-5">
                {/* Nút bắt đầu quét QR */}
                <button
                  onClick={() => {
                    resetResult()
                    setScanning(true)
                  }}
                  disabled={isProcessing}
                  className={`w-full py-4 rounded-2xl transition-all duration-300 font-extrabold text-xs uppercase tracking-widest text-white shadow-md active:scale-95 flex items-center justify-center gap-2 ${
                    isProcessing
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                      : isCheckIn
                        ? 'bg-gradient-to-r from-orange-600 to-orange-500 hover:shadow-lg hover:shadow-orange-500/10'
                        : 'bg-gradient-to-r from-purple-600 to-purple-500 hover:shadow-lg hover:shadow-purple-500/10'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader className="w-4.5 h-4.5 animate-spin" />
                      Đang xử lý dữ liệu...
                    </>
                  ) : (
                    <>
                      <Scan className="w-4.5 h-4.5" />
                      Bắt đầu quét {actionLabel}
                    </>
                  )}
                </button>

                {/* Đường kẻ phân cách */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-800" />
                  </div>
                  <div className="relative flex justify-center text-xs font-bold uppercase tracking-wider">
                    <span className="px-3 bg-slate-950 text-slate-500">Hoặc nhập tay</span>
                  </div>
                </div>

                {/* Form nhập mã thủ công */}
                <div className="space-y-2">
                  <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wide pl-1">
                    Nhập mã QR / ID vé thủ công
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="Ví dụ: 123 hoặc TICKETS:123,124"
                      className="flex-1 px-4 py-3 bg-slate-900/80 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-slate-100 placeholder-slate-600 font-bold text-sm shadow-sm transition-all duration-300"
                      onKeyDown={(e) => e.key === 'Enter' && handleManualAction()}
                    />
                    <button
                      onClick={handleManualAction}
                      disabled={isProcessing}
                      className="px-5 py-3 text-white rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-650 transition-all duration-300 active:scale-95 flex items-center justify-center shadow-sm disabled:opacity-40"
                    >
                      {isProcessing ? (
                        <Loader className="w-5 h-5 animate-spin" />
                      ) : (
                        <Search className="w-5 h-5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ĐANG QUÉT QR CAMERA */
              <div className="space-y-4">
                <div className="relative bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
                  <div id="reader" className="w-full h-full" style={{ minHeight: 320 }} />

                  {/* Overlay khung quét HUD */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className={`relative w-64 h-64 rounded-2xl border-2 ${isCheckIn ? 'border-orange-500/80' : 'border-purple-500/80'} animate-pulse`}>
                      {/* 4 Góc bo tròn HUD */}
                      <div className={`absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 rounded-tl-xl ${isCheckIn ? 'border-orange-500' : 'border-purple-500'}`} />
                      <div className={`absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 rounded-tr-xl ${isCheckIn ? 'border-orange-500' : 'border-purple-500'}`} />
                      <div className={`absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 rounded-bl-xl ${isCheckIn ? 'border-orange-500' : 'border-purple-500'}`} />
                      <div className={`absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 rounded-br-xl ${isCheckIn ? 'border-orange-500' : 'border-purple-500'}`} />
                    </div>
                  </div>

                  <div className="absolute bottom-4 inset-x-4 bg-slate-950/85 backdrop-blur-sm text-slate-200 text-xs font-bold text-center rounded-xl px-3.5 py-2.5 border border-slate-800 shadow-sm leading-relaxed">
                    Giữ ổn định thiết bị và hướng camera về mã QR vé.
                  </div>
                </div>

                <button
                  onClick={() => {
                    stopScanning()
                    resetResult()
                  }}
                  className="w-full bg-rose-650 hover:bg-rose-700 text-white font-extrabold text-xs uppercase tracking-wider py-3.5 rounded-2xl transition-all duration-300 shadow active:scale-95"
                >
                  Dừng quét camera
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CỘT PHẢI: KẾT QUẢ CHECK-IN/CHECK-OUT */}
        <div className="bg-slate-950/60 border border-slate-850/80 rounded-3xl p-6 shadow-md flex flex-col justify-between min-h-[350px]">
          <div>
            <h2 className="text-base font-extrabold text-slate-200 mb-4 flex items-center gap-2">
              <CheckCircle className="w-4.5 h-4.5 text-orange-550" />
              Kết quả quét - {actionLabel}
            </h2>

            {!result ? (
              <div className="text-center py-16 text-slate-500 flex flex-col items-center justify-center h-full">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-full w-fit mb-4 text-slate-600 animate-pulse">
                  <Scan className="w-12 h-12" />
                </div>
                <p className="font-extrabold text-sm text-slate-400">Chưa có kết quả quét</p>
                <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Nhấn "Bắt đầu quét" hoặc sử dụng khung nhập ID vé thủ công để ghi nhận tham dự.
                </p>
              </div>
            ) : (
              /* ĐÃ CÓ KẾT QUẢ TỪ API */
              <div className="space-y-4">
                {result.success ? (
                  /* THÀNH CÔNG CARD */
                  <div className="space-y-4">
                    <div className="text-center py-4 bg-slate-900/60 border border-slate-850 rounded-2xl p-5 relative overflow-hidden">
                      <div className="absolute inset-0 bg-emerald-500/5 opacity-40 pointer-events-none" />
                      <CheckCircle
                        className={`w-14 h-14 mx-auto mb-3.5 animate-bounce ${isCheckIn ? 'text-emerald-500' : 'text-purple-500'}`}
                      />
                      <p className={`text-lg font-black leading-tight ${isCheckIn ? 'text-emerald-500' : 'text-purple-500'}`}>
                        {result.message}
                      </p>
                    </div>

                    {(result.registration?.ticketId || result.registration?.checkedInAt || result.registration?.checkedOutAt) && (
                      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
                        {result.registration?.ticketId && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-450 font-bold">Ticket ID:</span>
                            <span className="font-black text-slate-200">#{result.registration.ticketId}</span>
                          </div>
                        )}
                        {result.registration?.checkedInAt && (() => {
                          const checkinDate = parseBackendDate(result.registration.checkedInAt)
                          return (
                            <div className="flex justify-between items-center">
                              <span className="text-slate-450 font-bold">Thời gian Check-in:</span>
                              <span className="font-extrabold text-slate-250">
                                {checkinDate ? format(checkinDate, 'dd/MM/yyyy HH:mm:ss', { locale: vi }) : result.registration.checkedInAt}
                              </span>
                            </div>
                          )
                        })()}
                        {result.registration?.checkedOutAt && (() => {
                          const checkoutDate = parseBackendDate(result.registration.checkedOutAt)
                          return (
                            <div className="flex justify-between items-center">
                              <span className="text-slate-450 font-bold">Thời gian Check-out:</span>
                              <span className="font-extrabold text-slate-250">
                                {checkoutDate ? format(checkoutDate, 'dd/MM/yyyy HH:mm:ss', { locale: vi }) : result.registration.checkedOutAt}
                              </span>
                            </div>
                          )
                        })()}
                        {result.registration?.customerName && (
                          <div className="flex justify-between items-center border-t border-slate-800/80 pt-2 mt-2">
                            <span className="text-slate-450 font-bold">Sinh viên:</span>
                            <span className="font-extrabold text-slate-100">{result.registration.customerName}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* THẤT BẠI CARD */
                  (() => {
                    const errCfg = getErrorConfig(result.errorCode, activeTab, result.registration?.previousTime)
                    const ErrIcon = errCfg.Icon
                    return (
                      <div className="space-y-4">
                        <div className="text-center py-5 bg-rose-950/20 border border-rose-900/30 rounded-2xl p-5 relative overflow-hidden">
                          <ErrIcon className={`w-14 h-14 mx-auto mb-3.5 ${errCfg.iconClass} animate-pulse`} />
                          <p className="text-base font-black text-slate-200 whitespace-pre-line leading-relaxed">
                            {errCfg.title}
                          </p>
                          {result.message && (
                            <div className="mt-3 text-xs text-rose-400 font-extrabold italic bg-rose-950/50 rounded-xl p-2 border border-rose-900/20">
                              {result.message}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()
                )}

                {/* Info details case of failure multi-ticket */}
                {!result.success && result.registration && (
                  <div className="border-t border-slate-800 pt-4 space-y-3">
                    {result.registration.customerName && (
                      <div className="bg-slate-900/60 p-3.5 rounded-2xl border-l-4 border-orange-500/80 text-xs">
                        <p className="text-slate-450 font-bold uppercase tracking-wider mb-0.5">👤 Khách hàng:</p>
                        <p className="font-extrabold text-slate-100">{result.registration.customerName}</p>
                      </div>
                    )}

                    {result.registration.eventName && (
                      <div className="bg-slate-900/60 p-3.5 rounded-2xl border-l-4 border-purple-500/80 text-xs">
                        <p className="text-slate-450 font-bold uppercase tracking-wider mb-0.5">📋 Sự kiện:</p>
                        <p className="font-extrabold text-slate-100">{result.registration.eventName}</p>
                      </div>
                    )}

                    {result.registration.results && Array.isArray(result.registration.results) && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-450 font-extrabold uppercase tracking-wider mb-2">Báo cáo kiểm tra lô vé:</p>
                        <div className="text-xs space-y-2 max-h-48 overflow-y-auto pr-1">
                          {result.registration.results.map((r: any, idx: number) => (
                            <div
                              key={idx}
                              className="border-l-4 pl-3 py-2.5 rounded-xl bg-slate-900/40 text-xs"
                              style={{ borderColor: r.success ? '#10b981' : '#ef4444' }}
                            >
                              <div className="flex justify-between items-center font-bold">
                                <span className="text-slate-300">Vé #{r.ticketId}</span>
                                <span className={r.success ? 'text-emerald-500 font-extrabold' : 'text-rose-500 font-extrabold'}>
                                  {r.success ? '✓ Hợp lệ' : '✗ Lỗi quét'}
                                </span>
                              </div>
                              {!r.success && r.error && (
                                <p className="text-[10px] text-rose-450 mt-1 font-semibold italic">{r.error}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Button next checkin */}
                <button
                  onClick={resetResult}
                  className="w-full mt-4 py-3.5 font-extrabold text-xs uppercase tracking-wider text-slate-200 bg-slate-800 hover:bg-slate-750 hover:text-white rounded-2xl transition-all duration-300 shadow-sm active:scale-95"
                >
                  Quét vé tiếp theo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== PHẦN HƯỚNG DẪN SỬ DỤNG ===== */}
      <div className={`mt-6 p-5 rounded-3xl border text-xs leading-relaxed ${
        isCheckIn ? 'bg-orange-950/25 border-orange-500/35 text-orange-200 shadow-lg shadow-orange-500/5' : 'bg-purple-950/25 border-purple-500/35 text-purple-200 shadow-lg shadow-purple-500/5'
      }`}>
        <h3 className={`font-black uppercase tracking-wider mb-2 text-[11px] ${isCheckIn ? 'text-orange-400' : 'text-purple-400'}`}>
          Hướng dẫn nghiệp vụ {actionLabel}
        </h3>
        <ul className="space-y-1.5 font-bold">
          {isCheckIn ? (
            <>
              <li className="flex items-center gap-1.5">• Sử dụng camera sau để quét mã QR vé đơn hoặc mã kiểm soát lô vé của SV.</li>
              <li className="flex items-center gap-1.5">• Cho phép quét QR đa vé định dạng <strong className="text-orange-400">TICKETS:id1,id2,id3</strong> để check-in hàng loạt.</li>
              <li className="flex items-center gap-1.5">• Nhập trực tiếp số ID vé vào ô tìm kiếm thủ công nếu thiết bị không bật được camera hoặc camera mờ.</li>
            </>
          ) : (
            <>
              <li className="flex items-center gap-1.5">• Ghi nhận check-out cho sinh viên khi ra về để tính hạn ngạch hoạt động ngoại khóa.</li>
              <li className="flex items-center gap-1.5">• Chỉ hỗ trợ quét check-out đối với các mã vé đã được ghi nhận check-in trước đó.</li>
              <li className="flex items-center gap-1.5">• Có thể đối soát vé lỗi bằng cách nhập số ID vé tương ứng tại quầy.</li>
            </>
          )}
        </ul>
      </div>
    </div>
  )
}


