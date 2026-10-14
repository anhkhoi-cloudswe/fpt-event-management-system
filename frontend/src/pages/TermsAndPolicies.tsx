import React, { useState } from 'react'
import {
  FileText,
  ShieldCheck,
  CreditCard,
  BookOpen,
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Smartphone,
  LogIn,
  QrCode,
  ShieldAlert,
  Award,
  HelpCircle,
  Sparkles,
  X
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { RealtimeClock } from '../components/RealtimeClock'
import fptLogo from '../assets/fpt-logo.png'

interface DocSection {
  id: string
  title: string
  description: string
  badge?: string
  content: React.ReactNode
}

function PolicyFaqAccordion({ faqs }: { faqs: { q: string; a: string }[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx)
  }

  return (
    <div className="space-y-3">
      {faqs.map((faq, idx) => {
        const isOpen = openIdx === idx
        return (
          <div
            key={idx}
            className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white/40 dark:bg-slate-950/40 transition-all duration-300 hover:bg-white/80 dark:hover:bg-slate-950/70 shadow-xs"
          >
            <button
              onClick={() => toggle(idx)}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left focus:outline-none"
            >
              <span className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200 pr-4">
                {faq.q}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 shrink-0 ${
                  isOpen ? 'rotate-180 text-orange-500' : ''
                }`}
              />
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                isOpen ? 'max-h-52 border-t border-slate-200 dark:border-slate-800' : 'max-h-0'
              }`}
            >
              <div className="p-4 sm:p-5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium bg-orange-50/20 dark:bg-slate-900/40">
                {faq.a}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function TermsAndPolicies() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentTab = searchParams.get('tab') || 'overview'
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [rulesOpen, setRulesOpen] = useState(true)

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const sections: Record<string, DocSection> = {
    terms: {
      id: 'terms',
      title: 'Điều khoản sử dụng dịch vụ',
      description: 'Quy định và nghĩa vụ của người dùng khi sử dụng hệ thống FPT Event Management',
      badge: 'Cập nhật lần cuối: 2026',
      content: (
        <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-[15px]">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">1. Giới thiệu và Phạm vi áp dụng</h3>
            <p>
              Chào mừng bạn đến với <strong>FPT Event Management System (FEMS)</strong>. Khi bạn truy cập, đăng ký tài khoản hoặc sử dụng bất kỳ dịch vụ nào thuộc hệ thống, bạn xác nhận đã đọc, hiểu và đồng ý tuân thủ toàn bộ các điều khoản và điều kiện được nêu tại văn bản này.
            </p>
            <p className="mt-2">
              Nếu bạn không đồng ý với bất kỳ phần nào của điều khoản, vui lòng ngừng sử dụng dịch vụ của hệ thống ngay lập tức.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">2. Đăng ký & Bảo mật Tài khoản</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Tài khoản người dùng:</strong> Người dùng có thể đăng ký tài khoản thông qua tài khoản Google (ưu tiên email sinh viên FPT Education <code>@fpt.edu.vn</code>, <code>@fe.edu.vn</code>) hoặc đăng ký bằng Email có xác thực mã OTP.
              </li>
              <li>
                <strong>Bảo mật thông tin đăng nhập:</strong> Bạn có trách nhiệm bảo mật thông tin mật khẩu, mã xác thực và mọi hoạt động diễn ra dưới tài khoản của mình. Khi phát hiện tài khoản bị truy cập trái phép, bạn cần thông báo ngay cho ban quản trị.
              </li>
              <li>
                <strong>Tính chính xác của thông tin:</strong> Bạn cam kết cung cấp thông tin trung thực, chính xác khi tham gia hoặc tổ chức sự kiện.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">3. Quy định tham gia & Đăng ký sự kiện</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Giữ chỗ và đặt vé:</strong> Mỗi tài khoản được phép giữ chỗ và thanh toán theo số lượng quy định cho từng loại sự kiện. Đơn đặt vé cần được hoàn tất thanh toán trong thời hạn quy định (5 phút) để tránh hiện tượng giữ chỗ ảo.
              </li>
              <li>
                <strong>Mã vé QR & Check-in:</strong> Mỗi vé phát hành đi kèm một mã QR duy nhất. Người tham dự có trách nhiệm bảo quản mã QR và xuất trình tại bàn kiểm soát khi đến sự kiện.
              </li>
              <li>
                <strong>Hành vi nghiêm cấm:</strong> Nghiêm cấm mọi hành vi đầu cơ vé, sao chép hoặc chuyển nhượng trái phép vé sự kiện dưới mọi hình thức trục lợi cá nhân.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">4. Quyền và Trách nhiệm của Ban tổ chức</h3>
            <p>
              Ban tổ chức các sự kiện trong trường có trách nhiệm tuân thủ quy chế nội bộ của Nhà trường, cung cấp nội dung sự kiện lành mạnh, không vi phạm pháp luật và các quy chuẩn đạo đức học đường. Ban quản trị hệ thống có quyền tạm dừng hoặc hủy bỏ bất kỳ sự kiện nào vi phạm chính sách mà không cần báo trước.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">5. Miễn trừ trách nhiệm</h3>
            <p>
              Hệ thống không chịu trách nhiệm đối với các sự cố bất khả kháng bao gồm mất kết nối internet từ phía người dùng, sự cố viễn thông bên thứ ba hoặc các hành vi gian lận thông tin vé do người dùng tự ý chia sẻ mã QR ra bên ngoài.
            </p>
          </div>
        </div>
      )
    },
    privacy: {
      id: 'privacy',
      title: 'Cam kết bảo mật thông tin và bảo vệ dữ liệu cá nhân',
      description: 'Chính sách bảo vệ thông tin nhận dạng cá nhân và quyền riêng tư theo tiêu chuẩn an toàn thông tin',
      badge: 'Nghị định 13/2023/NĐ-CP',
      content: (
        <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-[15px]">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">1. Nguyên tắc Bảo vệ Dữ liệu Cá nhân</h3>
            <p>
              FPT Event Management System cam kết tuân thủ nghiêm ngặt các nguyên tắc bảo mật và quyền riêng tư, tôn trọng quyền bảo vệ dữ liệu cá nhân của người dùng theo quy định pháp luật Việt Nam (bao gồm Nghị định số 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân).
            </p>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">2. Loại Dữ liệu Thu thập</h3>
            <p>Chúng tôi chỉ thu thập những thông tin cần thiết phục vụ cho việc vận hành sự kiện:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Thông tin định danh cơ bản:</strong> Họ tên, địa chỉ email, ảnh đại diện (khi đăng nhập qua Google OAuth).</li>
              <li><strong>Thông tin sinh viên/học vụ:</strong> Mã số sinh viên, chuyên ngành, số điện thoại (phục vụ liên hệ khẩn cấp hoặc gửi vé).</li>
              <li><strong>Dữ liệu hoạt động:</strong> Lịch sử đăng ký sự kiện, vị trí chỗ ngồi, trạng thái check-in/check-out điểm danh.</li>
              <li><strong>Dữ liệu giao dịch:</strong> Mã đơn hàng, phương thức thanh toán, số tiền thanh toán (chúng tôi không lưu trữ thông tin thẻ ngân hàng hoặc mật khẩu ngân hàng).</li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">3. Mục đích Sử dụng Dữ liệu</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Xác thực danh tính và cấp quyền truy cập hệ thống sự kiện.</li>
              <li>Gửi mã vé điện tử QR, xác nhận đơn hàng và thông báo nhắc nhở lịch trình sự kiện.</li>
              <li>Ghi nhận điểm rèn luyện, cấp chứng chỉ ngoại khóa điện tử cho sinh viên tham gia đủ thời lượng.</li>
              <li>Phát hiện, ngăn chặn các hành vi gian lận và tối ưu hiệu năng hạ tầng hệ thống.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">4. Cam kết Không Chia sẻ cho Bên Thứ ba</h3>
            <p>
              Chúng tôi cam kết <strong>tuyệt đối không bán, cho thuê, trao đổi hoặc tiết lộ dữ liệu cá nhân</strong> của người dùng cho bất kỳ bên thứ ba nào vì mục đích thương mại. Thông tin chỉ được cung cấp cho các đơn vị có thẩm quyền theo yêu cầu hợp pháp của cơ quan chức năng hoặc bộ phận Đào tạo - Khảo thí của Nhà trường.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">5. Biện pháp Kỹ thuật Bảo vệ An toàn</h3>
            <p>
              Toàn bộ dữ liệu truyền tải giữa thiết bị của bạn và hệ thống được mã hóa bằng giao thức HTTPS/TLS tiêu chuẩn cao. Mật khẩu được băm (hash) bằng thuật toán mã hóa Bcrypt một chiều an toàn. Cơ sở dữ liệu và các phiên làm việc được bảo vệ bởi tường lửa WAF và giới hạn tần suất truy cập tự động.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">6. Quyền của Chủ thể Dữ liệu</h3>
            <p>
              Bạn có quyền yêu cầu xem lại, cập nhật hoặc yêu cầu xóa bỏ thông tin tài khoản của mình bất cứ lúc nào thông qua trang Quản lý hồ sơ cá nhân hoặc gửi yêu cầu tới bộ phận quản trị hệ thống.
            </p>
          </div>
        </div>
      )
    },
    payment: {
      id: 'payment',
      title: 'Chính sách thanh toán',
      description: 'Quy định thanh toán trực tuyến qua cổng thanh toán, ví nội bộ và cơ chế bảo vệ giao dịch',
      badge: 'Thanh toán bảo mật',
      content: (
        <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-[15px]">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">1. Phương thức Thanh toán Hỗ trợ</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Cổng thanh toán điện tử VNPay / Chuyển khoản QR SePay:</strong> Hỗ trợ thanh toán nhanh chóng qua Internet Banking, thẻ ATM nội địa và mã VietQR.</li>
              <li><strong>Ví nội bộ FEMS:</strong> Thanh toán tức thời không mất phí đối với số dư sẵn có trong ví người dùng.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">2. Quy định Giữ chỗ & Khóa đơn hàng</h3>
            <p>
              Sau khi chọn ghế và chuyển tới trang thanh toán, hệ thống sẽ tạm khóa ghế trong vòng <strong>05 phút</strong> để bạn hoàn tất giao dịch. Nếu quá thời gian này giao dịch chưa được ghi nhận thành công, đơn hàng sẽ tự động hủy và ghế sẽ được giải phóng cho người khác.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">3. Chính sách Hoàn tiền & Hủy vé</h3>
            <p>
              - Hoàn tiền 100% khi sự kiện bị hủy bỏ hoặc thay đổi lịch trình bất khả kháng từ Ban tổ chức.<br />
              - Trường hợp báo lỗi sự cố chỗ ngồi (hỏng ghế, trùng ghế) được tiếp nhận và xử lý hoàn tiền vào Ví nội bộ trong vòng 24 giờ sau khi nhân viên thẩm định hợp lệ.<br />
              - Hủy vé theo nhu cầu cá nhân phải tuân thủ điều kiện thời gian tối thiểu 24 giờ trước khi sự kiện bắt đầu.
            </p>
          </div>
        </div>
      )
    },
    booking: {
      id: 'booking',
      title: 'Quy định đăng ký vé & Giữ chỗ',
      description: 'Chính sách đặt chỗ, hạn mức vé tối đa và thời gian giữ chỗ của sinh viên FPT',
      badge: 'Chính sách tham dự',
      content: (
        <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-[15px]">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">1. Nguyên tắc Đặt vé & Giới hạn Hạn ngạch</h3>
            <div className="space-y-3">
              {[
                'Mỗi tài khoản sinh viên FPT được đăng ký tối đa 04 vé/ghế ngồi cho mỗi sự kiện trong một giao dịch mua vé.',
                'Vé đăng ký thành công sẽ đi kèm với mã QR duy nhất và thông tin số ghế ngồi tại hội trường (nếu sự kiện có cấu hình sơ đồ ghế).',
                'Các sự kiện có phí phải được thanh toán trong vòng 05 phút kể từ lúc giữ chỗ (áp dụng cho cả ví nội bộ và SePay/VNPay). Quá thời gian trên, hệ thống sẽ tự động hủy đơn và giải phóng ghế để tránh "ghế ma".',
                'Hành vi tự ý hủy hoặc để đơn hàng hết hạn thanh toán liên tiếp 03 lần sẽ kích hoạt cơ chế khóa tài khoản đặt vé tạm thời trong 15 phút (Seat Hoarding Lockout).'
              ].map((rule, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-white/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                  <div className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-relaxed">
                    {rule}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200/80 dark:border-slate-800 pt-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-orange-500" /> Giải đáp thắc mắc (FAQ)
            </h3>
            <PolicyFaqAccordion
              faqs={[
                {
                  q: 'Sinh viên ngoài trường có thể đăng ký vé được không?',
                  a: 'Hệ thống FPT Event Management hiện tại ưu tiên xác thực tài khoản email FPT Education (@fpt.edu.vn hoặc @fe.edu.vn). Khách vãng lai có thể tham quan danh sách sự kiện công khai nhưng cần đăng nhập bằng tài khoản FPT để hoàn tất đặt vé.'
                },
                {
                  q: 'Tôi có thể nhượng vé đã đăng ký cho người khác không?',
                  a: 'Không. Vé sự kiện được liên kết trực tiếp với mã sinh viên và tài khoản cá nhân để phục vụ công tác điểm danh và quản lý chỗ ngồi của Ban tổ chức.'
                }
              ]}
            />
          </div>
        </div>
      )
    },
    refunds: {
      id: 'refunds',
      title: 'Phản ánh & Hoàn tiền',
      description: 'Cơ chế xử lý khi sảnh ghế ngồi bị lỗi, bị chiếm chỗ và chính sách hoàn trả chi phí tự động',
      badge: 'Bảo vệ quyền lợi',
      content: (
        <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-[15px]">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">1. Cơ chế Tiếp nhận & Thẩm định Báo cáo</h3>
            <div className="space-y-3">
              {[
                'Nếu vị trí ghế ngồi của bạn tại sự kiện bị chiếm dụng hoặc bị hư hỏng vật lý, bạn có quyền gửi "Báo Cáo Lỗi" ngay trên trang chi tiết vé trong mục "Vé của tôi".',
                'Staff sẽ thẩm định phản ánh của bạn trong vòng 24 giờ. Nếu báo cáo hợp lệ, bạn sẽ được hoàn trả 100% tiền vé trực tiếp vào tài khoản ví cá nhân.',
                'Trong trường hợp sự kiện bị Hủy hoặc Rút phép hoạt động bởi Ban tổ chức, toàn bộ sinh viên đã mua vé sẽ được hệ thống tự động hoàn tiền 100% lập tức.'
              ].map((rule, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-white/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                  <div className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-relaxed">
                    {rule}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200/80 dark:border-slate-800 pt-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-orange-500" /> Giải đáp thắc mắc (FAQ)
            </h3>
            <PolicyFaqAccordion
              faqs={[
                {
                  q: 'Tôi có thể tự ý hủy vé đã mua để lấy lại tiền không?',
                  a: 'Việc tự ý hoàn/hủy vé từ phía sinh viên chỉ được chấp nhận trước khi sự kiện bắt đầu ít nhất 24 giờ. Tiền vé sẽ được hoàn trả sau khi trừ phí dịch vụ (nếu có quy định riêng từ nhà tổ chức).'
                },
                {
                  q: 'Làm thế nào để biết báo cáo lỗi ghế ngồi của tôi được duyệt?',
                  a: 'Trạng thái báo cáo sẽ cập nhật trực tiếp trên thẻ vé trong ví của bạn dưới dạng nhãn trạng thái sáng màu: "Đang chờ hoàn tiền", "Đã hoàn tiền" hoặc "Từ chối hoàn tiền".'
                }
              ]}
            />
          </div>
        </div>
      )
    },
    checkin: {
      id: 'checkin',
      title: 'Quy trình kiểm vé & Check-in',
      description: 'Hướng dẫn tham gia kiểm tra thông tin vé tại quầy trước khi bước vào hội trường',
      badge: 'Vận hành sự kiện',
      content: (
        <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-[15px]">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">1. Hướng dẫn Xuất trình & Quét mã</h3>
            <div className="space-y-3">
              {[
                'Sinh viên tham dự cần xuất trình mã QR vé từ mục "Vé của tôi" trên ứng dụng điện thoại hoặc cung cấp mã số vé (#ID) cho kiểm soát viên tại sảnh.',
                'Thời gian mở cửa Check-in trước sự kiện được cấu hình động bởi Ban tổ chức (mặc định là 60 phút trước giờ bắt đầu). Hệ thống cho phép quét Check-in linh hoạt cho đến khi sự kiện chính thức kết thúc.',
                'Hệ thống hỗ trợ quét Check-out phục vụ công tác cấp chứng nhận hoạt động ngoại khóa. Việc Check-out chỉ được ghi nhận khi sự kiện đã diễn ra đến thời gian đệm cho phép (tối thiểu 30-60 phút trước giờ kết thúc).'
              ].map((rule, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-white/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                  <div className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-relaxed">
                    {rule}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200/80 dark:border-slate-800 pt-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-orange-500" /> Giải đáp thắc mắc (FAQ)
            </h3>
            <PolicyFaqAccordion
              faqs={[
                {
                  q: 'Nếu điện thoại của tôi mất kết nối internet lúc check-in thì sao?',
                  a: 'Bạn có thể chụp ảnh màn hình mã QR vé từ trước để kiểm soát viên quét ngoại tuyến, hoặc cung cấp mã số vé hiển thị trên hóa đơn giấy để nhập thủ công.'
                },
                {
                  q: 'Tôi có cần quét mã Check-Out khi ra về không?',
                  a: 'Có, đối với các sự kiện đặc biệt yêu cầu quét Check-Out để xác nhận thời gian tham dự thực tế phục vụ cho việc cấp chứng nhận hoạt động ngoại khóa và tính điểm rèn luyện.'
                }
              ]}
            />
          </div>
        </div>
      )
    },
    organizer: {
      id: 'organizer',
      title: 'Điều khoản Ban tổ chức',
      description: 'Chính sách giữ chỗ hội trường, sảnh sự kiện, cấu hình giá vé và phê duyệt hồ sơ',
      badge: 'Ban tổ chức (CLB)',
      content: (
        <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-[15px]">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">1. Hạn ngạch & Quy chế Tổ chức</h3>
            <div className="space-y-3">
              {[
                'Mọi yêu cầu tổ chức sự kiện từ các Câu lạc bộ/Ban tổ chức sinh viên phải được gửi trước ngày diễn ra ít nhất 07 ngày làm việc để Staff phê duyệt.',
                'Hạn ngạch tổ chức sự kiện (Daily Quota): Để đảm bảo chất lượng vận hành và điều phối cơ sở vật chất tốt nhất, hệ thống giới hạn tối đa 02 sự kiện được phép diễn ra đồng thời hoặc trong cùng một ngày trên toàn bộ các hội trường/sảnh.',
                'Nhà tổ chức phải đảm bảo tính trung thực của thông tin sự kiện. Mọi hành vi vi phạm đạo đức học đường sẽ dẫn đến việc đình chỉ sự kiện ngay lập tức.'
              ].map((rule, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-white/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                  <div className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-relaxed">
                    {rule}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200/80 dark:border-slate-800 pt-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-orange-500" /> Giải đáp thắc mắc (FAQ)
            </h3>
            <PolicyFaqAccordion
              faqs={[
                {
                  q: 'Mất bao lâu để yêu cầu đăng ký sự kiện của tôi được duyệt?',
                  a: 'Hồ sơ yêu cầu tổ chức sẽ được Staff thẩm định và phản hồi kết quả duyệt hoặc yêu cầu bổ sung thông tin trong vòng tối đa 48 giờ làm việc.'
                },
                {
                  q: 'Ban tổ chức có thể thay đổi số lượng ghế ngồi sau khi duyệt không?',
                  a: 'Có thể thay đổi cấu hình sơ đồ ghế ngồi thông qua chức năng "Cập nhật yêu cầu" trước khi mở bán vé chính thức.'
                }
              ]}
            />
          </div>
        </div>
      )
    },
    mobile: {
      id: 'mobile',
      title: 'Quy định ứng dụng di động',
      description: 'Quy chuẩn sử dụng ứng dụng di động, đồng bộ vé QR ngoại tuyến và quyền truy cập thiết bị',
      badge: 'Mobile App Policy',
      content: (
        <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-[15px]">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">1. Quyền Truy Cập Thiết Bị (Permissions)</h3>
            <p>
              Ứng dụng di động FEMS yêu cầu cấp quyền Camera chỉ với mục đích duy nhất là quét mã QR Code để Check-in/Check-out tại cửa sự kiện. Ứng dụng không tự ý truy cập danh bạ, định vị GPS nền hoặc ảnh cá nhân của người dùng.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">2. Lưu Trữ Vé Ngoại Tuyến (Offline Mode)</h3>
            <p>
              Mã vé QR được tải và lưu mã hóa an toàn trên bộ nhớ thiết bị. Người dùng có thể xuất trình vé ngay cả khi mất sóng điện thoại hoặc không có kết nối Wi-Fi tại khu vực sảnh sự kiện.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">3. Cập Nhật Phiên Bản</h3>
            <p>
              Người dùng nên duy trì phiên bản ứng dụng mới nhất để được cập nhật các bản vá bảo mật và tính năng nhận thông báo lịch trình tự động (Push Notification).
            </p>
          </div>
        </div>
      )
    },
    docs: {
      id: 'docs',
      title: 'Tài liệu mẫu & Hướng dẫn',
      description: 'Quy trình, tài liệu hướng dẫn đăng ký, check-in và quyền lợi người dùng',
      badge: 'Tài liệu FEMS',
      content: (
        <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-[15px]">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">1. Hướng dẫn Nhận vé & Check-in sự kiện</h3>
            <p>
              Sau khi đăng ký vé thành công, bạn có thể kiểm tra danh sách vé tại mục <strong>"Vé của tôi"</strong>. Xuất trình mã QR tại cổng kiểm soát để kiểm soát viên quét mã ghi nhận điểm danh.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">2. Hướng dẫn Dành cho Ban tổ chức (Organizer)</h3>
            <p>
              Các Câu lạc bộ và Đơn vị tổ chức sự kiện cần gửi đơn đăng ký sự kiện trước thời điểm diễn ra tối thiểu 07 ngày làm việc để Nhà trường xét duyệt địa điểm, trang thiết bị và hạn ngạch sự kiện.
            </p>
          </div>

          <div className="p-4 bg-orange-100/70 dark:bg-orange-950/40 rounded-2xl border border-orange-200 dark:border-orange-800 text-sm">
            <p className="font-semibold text-orange-900 dark:text-orange-300">
              💡 Cần hỗ trợ khẩn cấp hoặc giải đáp thắc mắc?
            </p>
            <p className="text-orange-800 dark:text-orange-400 mt-1">
              Vui lòng liên hệ Văn phòng Quản lý Sự kiện FPT hoặc gửi email tới <code>support@fpt.edu.vn</code>.
            </p>
          </div>
        </div>
      )
    }
  }

  // Danh sách các tab theo đúng thứ tự logic GitBook
  const navTabs = [
    { id: 'overview', title: 'Chính sách và điều khoản' },
    { id: 'terms', title: 'Điều khoản sử dụng dịch vụ' },
    { id: 'privacy', title: 'Chính sách bảo mật' },
    { id: 'payment', title: 'Chính sách thanh toán' },
    { id: 'booking', title: 'Quy định đăng ký vé' },
    { id: 'refunds', title: 'Phản ánh & Hoàn tiền' },
    { id: 'checkin', title: 'Quy trình kiểm vé & Check-in' },
    { id: 'organizer', title: 'Điều khoản Ban tổ chức' },
    { id: 'mobile', title: 'Quy định ứng dụng di động' },
    { id: 'docs', title: 'Tài liệu mẫu' }
  ]

  const currentIndex = navTabs.findIndex(t => t.id === currentTab)
  const prevTab = currentIndex > 0 ? navTabs[currentIndex - 1] : null
  const nextTab = currentIndex >= 0 && currentIndex < navTabs.length - 1 ? navTabs[currentIndex + 1] : null

  const currentSection = sections[currentTab] || sections.terms
  const isViewingOverview = currentTab === 'overview'

  const overviewList = [
    { id: 'terms', title: 'Điều khoản sử dụng dịch vụ', tag: 'Chung', icon: FileText, desc: 'Quy định tài khoản người dùng, vé sự kiện và nghĩa vụ pháp lý' },
    { id: 'privacy', title: 'Chính sách bảo mật', tag: 'Bảo mật', icon: ShieldCheck, desc: 'Cam kết bảo vệ dữ liệu cá nhân & mã hóa an toàn thông tin sinh viên' },
    { id: 'payment', title: 'Chính sách thanh toán', tag: 'Tài chính', icon: CreditCard, desc: 'Quy trình giao dịch vé trực tuyến, cổng SePay/VNPay và biên lai' },
    { id: 'booking', title: 'Quy định đăng ký vé', tag: 'Tham dự', icon: BookOpen, desc: 'Hạn mức tối đa 04 vé/sinh viên, sơ đồ ghế và thời hạn giữ chỗ 5 phút' },
    { id: 'refunds', title: 'Phản ánh & Hoàn tiền', tag: 'Hỗ trợ', icon: ShieldAlert, desc: 'Cơ chế giải quyết sự cố ghế lỗi và chính sách hoàn trả 100% tự động' },
    { id: 'checkin', title: 'Quy trình kiểm vé & Check-in', tag: 'Vận hành', icon: QrCode, desc: 'Quét vé QR vào cổng hội trường và Check-out ghi nhận điểm ngoại khóa' },
    { id: 'organizer', title: 'Điều khoản Ban tổ chức', tag: 'Tổ chức', icon: Award, desc: 'Quy định đăng ký sảnh, hạn ngạch 2 sự kiện lớn/ngày và trả mặt bằng' },
    { id: 'mobile', title: 'Quy định ứng dụng di động', tag: 'Ứng dụng', icon: Smartphone, desc: 'Quyền riêng tư thiết bị di động, quyền Camera và chế độ lưu vé offline' },
    { id: 'docs', title: 'Tài liệu mẫu & Biểu mẫu ban hành', tag: 'Tài liệu tải về', icon: BookOpen, desc: 'Bộ biểu mẫu đề xuất sự kiện FPT, checklist kỹ thuật âm thanh ánh sáng và biên bản bàn giao chuẩn ban tổ chức' }
  ]

  // Danh sách mở rộng phục vụ tìm kiếm chi tiết (Hình 3)
  const searchIndex = [
    { id: 'overview', title: 'Tổng quan Chính sách & Điều khoản', category: 'Chính sách và điều khoản', desc: 'Toàn bộ danh mục văn bản và quy định vận hành của hệ thống FEMS' },
    { id: 'terms', title: 'Điều khoản sử dụng dịch vụ', category: 'Chính sách và điều khoản', desc: 'Quy định tài khoản, vé và quyền hạn người dùng' },
    { id: 'terms', title: 'Điều 2. Đăng ký & Bảo mật Tài khoản', category: 'Chính sách và điều khoản > Điều khoản sử dụng', desc: 'Xác thực OTP, email sinh viên FPT và trách nhiệm bảo mật mật khẩu' },
    { id: 'privacy', title: 'Chính sách bảo mật dữ liệu', category: 'Chính sách và điều khoản', desc: 'Bảo vệ dữ liệu cá nhân, thông tin sinh viên & mã hóa chuẩn TLS/SSL' },
    { id: 'payment', title: 'Chính sách thanh toán', category: 'Chính sách và điều khoản', desc: 'Quy trình giao dịch vé trực tuyến, cổng SePay/VNPay và biên lai điện tử' },
    { id: 'booking', title: 'Quy định đăng ký vé & Giữ chỗ', category: 'Quy định vận hành sự kiện', desc: 'Hạn mức tối đa 04 vé/sinh viên, sơ đồ ghế và thời hạn giữ chỗ 5 phút' },
    { id: 'booking', title: 'FAQ: Giải đáp thắc mắc đăng ký vé', category: 'Quy định vận hành sự kiện > FAQ', desc: 'Vé khách ngoài trường và quy định không được chuyển nhượng vé' },
    { id: 'refunds', title: 'Phản ánh & Hoàn tiền tự động', category: 'Quy định vận hành sự kiện', desc: 'Khiếu nại chỗ ngồi lỗi, cơ chế hoàn trả 100% qua ví sinh viên' },
    { id: 'refunds', title: 'FAQ: Giải đáp thắc mắc hoàn tiền', category: 'Quy định vận hành sự kiện > FAQ', desc: 'Quy trình gửi video/ảnh hiện trường và thời hạn xét duyệt hoàn tất 24h' },
    { id: 'checkin', title: 'Quy trình kiểm vé & Check-in QR', category: 'Quy định vận hành sự kiện', desc: 'Quét vé QR lối vào hội trường và Check-out ghi nhận điểm rèn luyện ngoại khóa' },
    { id: 'checkin', title: 'FAQ: Giải đáp thắc mắc kiểm vé & Check-in', category: 'Quy định vận hành sự kiện > FAQ', desc: 'Xử lý vé mờ, màn hình điện thoại vỡ và sinh viên quên mang vé' },
    { id: 'organizer', title: 'Điều khoản Ban tổ chức', category: 'Quy định vận hành sự kiện', desc: 'Hạn ngạch 02 sự kiện lớn/ngày, đăng ký mượn phòng hội trường và hoàn trả mặt bằng' },
    { id: 'organizer', title: 'FAQ: Giải đáp thắc mắc Ban tổ chức', category: 'Quy định vận hành sự kiện > FAQ', desc: 'Thời hạn duyệt sự kiện 48h và quy chế xử lý sự kiện phát sinh sự cố âm thanh' },
    { id: 'mobile', title: 'Quy định ứng dụng di động', category: 'Chính sách và điều khoản cho ứng dụng trên điện thoại', desc: 'Quyền riêng tư thiết bị, truy cập Camera quét vé và tính năng lưu vé offline' },
    { id: 'docs', title: 'Tài liệu mẫu', category: 'Chính sách và điều khoản', desc: 'Biểu mẫu đề xuất sự kiện, checklist kỹ thuật âm thanh ánh sáng và biên bản bàn giao' }
  ]

  const filteredSearchResults = searchIndex.filter(item => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase().trim()
    return item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans selection:bg-orange-500/20">
      
      {/* Top Header đồng bộ 100% với Trang Chủ (Hình 1) */}
      <header className="sticky top-0 z-40 border-b border-orange-500/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xs transition-all duration-300">
        <div className="mx-auto flex h-16 sm:h-20 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
          
          {/* Left: Logo FEMS × FPT University chuẩn trang chủ + Tên Docs */}
          <div className="flex items-center gap-2 sm:gap-4 shrink min-w-0">
            <Link to="/" className="flex items-center gap-1.5 sm:gap-4 group shrink min-w-0">
              <img
                src="/favicon.png"
                alt="FEMS Logo"
                className="h-7 sm:h-10 md:h-12 w-auto object-contain transition-transform duration-300 group-hover:scale-105 shrink-0"
              />
              <span className="text-slate-300 font-light text-sm sm:text-xl md:text-2xl select-none leading-none shrink-0">
                ×
              </span>
              <img
                src={fptLogo}
                alt="FPT Education"
                className="h-6 sm:h-10 md:h-12 w-auto object-contain transition-transform duration-300 group-hover:scale-105 shrink-0"
              />
            </Link>
            <span className="h-5 w-px bg-slate-300 dark:bg-slate-700 hidden md:block"></span>
            <span className="font-extrabold text-xs sm:text-base text-slate-800 dark:text-white hidden md:block truncate">
              Chính sách & điều khoản
            </span>
          </div>

          {/* Right: Search box mở Popup (Hình 3) & Đồng hồ Realtime & Nút Đăng nhập */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="relative hidden md:block">
              <button
                onClick={() => setIsSearchOpen(true)}
                className="w-56 lg:w-64 flex items-center justify-between bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-orange-500/60 rounded-full pl-3.5 pr-3 py-1.5 text-xs text-slate-400 focus:outline-none transition-all shadow-xs group"
              >
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
                  <span className="text-slate-500 dark:text-slate-400">Tìm kiếm tài liệu...</span>
                </div>
                <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-600">
                  Ctrl K
                </kbd>
              </button>
            </div>

            {/* Mobile search icon button */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="md:hidden p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-orange-600 transition-colors"
              aria-label="Tìm kiếm"
            >
              <Search className="w-4 h-4" />
            </button>

            <div className="hidden xl:block">
              <RealtimeClock />
            </div>

            <button
              onClick={() => navigate('/login')}
              className="rounded-full bg-gradient-to-r from-orange-600 to-orange-500 px-3.5 py-1.5 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-orange-500/25 hover:shadow-xl hover:shadow-orange-500/40 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-1 sm:gap-1.5 group shrink-0"
            >
              <span>Đăng nhập</span>
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ===================== SEARCH MODAL (THAM KHẢO HÌNH 3) ===================== */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              setIsSearchOpen(false)
              setSearchQuery('')
            }}
          ></div>

          <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-orange-200/80 dark:border-slate-800 overflow-hidden z-10 animate-fade-in-up">
            {/* Search Input Bar (Hình 3) */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <Search className="w-5 h-5 text-orange-500 shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Tìm kiếm tài liệu, điều khoản, chính sách..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <span className="text-[11px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg">
                {filteredSearchResults.length} results
              </span>
            </div>

            {/* Results List (Kiểu như Hình 3) */}
            <div className="max-h-96 overflow-y-auto p-3 space-y-1">
              {filteredSearchResults.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs font-semibold">
                  Không tìm thấy tài liệu phù hợp với "{searchQuery}"
                </div>
              ) : (
                filteredSearchResults.map((item, idx) => (
                  <button
                    key={`${item.id}-${idx}`}
                    onClick={() => {
                      setSearchParams({ tab: item.id })
                      setIsSearchOpen(false)
                      setSearchQuery('')
                    }}
                    className="w-full p-3 rounded-2xl hover:bg-orange-50 dark:hover:bg-slate-800/80 transition-colors flex items-center justify-between text-left group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-orange-100/70 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 group-hover:scale-105 transition-transform shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-400 truncate">
                          {item.category}
                        </p>
                        <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 group-hover:text-orange-600 transition-colors truncate">
                          {item.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-medium">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  </button>
                ))
              )}
            </div>

            {/* Modal Footer Keybinds (Hình 3) */}
            <div className="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-4 text-[11px] text-slate-400 font-bold">
              <span>ESC để đóng</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Container: Sidebar cố định bên trái, Nội dung bên phải */}
      <div className="flex-1 w-full max-w-7xl mx-auto flex">
        {/* Left Sidebar (Gắn sát lề trái, phân chia mục rõ ràng) */}
        <aside className="w-72 shrink-0 border-r border-orange-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-4 hidden md:flex flex-col h-[calc(100vh-80px)] sticky top-20 shadow-xs">
          <div className="space-y-6 overflow-y-auto pr-1 scrollbar-thin flex-1">
            {/* Group 1: Tổng quan & Điều khoản chung */}
            <div>
              <div
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider px-2 py-1.5 cursor-pointer hover:text-orange-600 transition-colors select-none"
              >
                <span>Chính sách và điều khoản</span>
                {sidebarOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
              </div>

              {sidebarOpen && (
                <div className="mt-1 space-y-0.5 border-l-2 border-orange-200/60 dark:border-slate-800 ml-2 pl-2">
                  <button
                    onClick={() => setSearchParams({ tab: 'overview' })}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isViewingOverview
                        ? 'bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400 font-black shadow-xs border-l-2 border-orange-500 pl-2.5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-orange-500/10'
                    }`}
                  >
                    <span>Tổng quan chính sách</span>
                  </button>

                  <button
                    onClick={() => setSearchParams({ tab: 'terms' })}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      currentTab === 'terms'
                        ? 'bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400 font-black shadow-xs border-l-2 border-orange-500 pl-2.5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-orange-500/10'
                    }`}
                  >
                    <span>Điều khoản sử dụng dịch vụ</span>
                  </button>

                  <button
                    onClick={() => setSearchParams({ tab: 'privacy' })}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      currentTab === 'privacy'
                        ? 'bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400 font-black shadow-xs border-l-2 border-orange-500 pl-2.5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-orange-500/10'
                    }`}
                  >
                    <span>Chính sách bảo mật</span>
                  </button>

                  <button
                    onClick={() => setSearchParams({ tab: 'payment' })}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      currentTab === 'payment'
                        ? 'bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400 font-black shadow-xs border-l-2 border-orange-500 pl-2.5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-orange-500/10'
                    }`}
                  >
                    <span>Chính sách thanh toán</span>
                  </button>
                </div>
              )}
            </div>

            {/* Group 2: Quy định vận hành & Sự kiện (Tích hợp từ /policy) */}
            <div>
              <div
                onClick={() => setRulesOpen(!rulesOpen)}
                className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider px-2 py-1.5 cursor-pointer hover:text-orange-600 transition-colors select-none"
              >
                <span>Quy định vận hành sự kiện</span>
                {rulesOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
              </div>

              {rulesOpen && (
                <div className="mt-1 space-y-0.5 border-l-2 border-orange-200/60 dark:border-slate-800 ml-2 pl-2">
                  <button
                    onClick={() => setSearchParams({ tab: 'booking' })}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      currentTab === 'booking'
                        ? 'bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400 font-black shadow-xs border-l-2 border-orange-500 pl-2.5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-orange-500/10'
                    }`}
                  >
                    <span>Quy định đăng ký vé</span>
                  </button>

                  <button
                    onClick={() => setSearchParams({ tab: 'refunds' })}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      currentTab === 'refunds'
                        ? 'bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400 font-black shadow-xs border-l-2 border-orange-500 pl-2.5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-orange-500/10'
                    }`}
                  >
                    <span>Phản ánh & Hoàn tiền</span>
                  </button>

                  <button
                    onClick={() => setSearchParams({ tab: 'checkin' })}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      currentTab === 'checkin'
                        ? 'bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400 font-black shadow-xs border-l-2 border-orange-500 pl-2.5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-orange-500/10'
                    }`}
                  >
                    <span>Quy trình kiểm vé & Check-in</span>
                  </button>

                  <button
                    onClick={() => setSearchParams({ tab: 'organizer' })}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      currentTab === 'organizer'
                        ? 'bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400 font-black shadow-xs border-l-2 border-orange-500 pl-2.5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-orange-500/10'
                    }`}
                  >
                    <span>Điều khoản Ban tổ chức</span>
                  </button>

                  <button
                    onClick={() => setSearchParams({ tab: 'mobile' })}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      currentTab === 'mobile'
                        ? 'bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400 font-black shadow-xs border-l-2 border-orange-500 pl-2.5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-orange-500/10'
                    }`}
                  >
                    <span>Quy định ứng dụng di động</span>
                  </button>

                  <button
                    onClick={() => setSearchParams({ tab: 'docs' })}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      currentTab === 'docs'
                        ? 'bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400 font-black shadow-xs border-l-2 border-orange-500 pl-2.5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-orange-500/10'
                    }`}
                  >
                    <span>Tài liệu mẫu & Hướng dẫn</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Badge footer */}
          <div className="pt-4 border-t border-orange-200/60 dark:border-slate-800 mt-4">
            <div className="px-3.5 py-3 rounded-2xl border border-orange-200/70 dark:border-slate-800 bg-orange-50/60 dark:bg-slate-950/40 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 shadow-xs">
              <BookOpen className="w-4 h-4 text-orange-600 shrink-0" />
              <div className="min-w-0">
                <span className="font-extrabold text-slate-800 dark:text-slate-200 block truncate">
                  FPT Event Management Docs
                </span>
                <span className="text-[10px] text-slate-400 block font-medium">
                  Phiên bản 2026 • Chính thức
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Main Content Area */}
        <main className="flex-1 px-4 sm:px-10 lg:px-16 py-6 sm:py-10 max-w-5xl mx-auto w-full">

          {/* Main Content Body */}
          {isViewingOverview ? (
            /* Overview Grid matching Image 2 */
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-4">
                Chính sách và điều khoản
              </h1>
              <p className="text-slate-600 dark:text-slate-300 text-sm mb-8 leading-relaxed font-medium">
                Tài liệu chính thức về quy định sử dụng, cam kết an toàn thông tin và quy chế vận hành nền tảng quản lý sự kiện FPT Event Management System.
              </p>

              {/* 2-Column Grid with Featured Footer Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {overviewList.map((item, idx) => {
                  const Icon = item.icon
                  const isFeaturedBanner = idx === overviewList.length - 1

                  if (isFeaturedBanner) {
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSearchParams({ tab: item.id })}
                        className="md:col-span-2 group p-6 rounded-3xl border border-orange-200/90 dark:border-slate-800 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-white/90 dark:from-orange-950/40 dark:via-slate-900/60 dark:to-slate-900/80 backdrop-blur-sm hover:border-orange-500/70 hover:shadow-xl hover:shadow-orange-500/10 transition-all duration-300 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:-translate-y-0.5"
                      >
                        <div className="flex items-start sm:items-center gap-4">
                          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20 group-hover:scale-110 transition-transform shrink-0">
                            <Icon className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 border border-orange-200/70 dark:border-orange-800">
                                {item.tag}
                              </span>
                            </div>
                            <h3 className="font-extrabold text-base text-slate-900 dark:text-white group-hover:text-orange-600 transition-colors">
                              {item.title}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium leading-relaxed max-w-2xl">
                              {item.desc}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-orange-600 dark:text-orange-400 group-hover:translate-x-1 transition-transform shrink-0 self-end sm:self-center bg-white/80 dark:bg-slate-800 px-4 py-2 rounded-xl border border-orange-200/60 shadow-xs">
                          <span>Xem tài liệu</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </button>
                    )
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => setSearchParams({ tab: item.id })}
                      className="group p-5 rounded-3xl border border-orange-200/70 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 backdrop-blur-sm hover:border-orange-500/60 hover:shadow-xl hover:shadow-orange-500/10 transition-all duration-300 text-left flex items-start justify-between hover:-translate-y-0.5"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="p-2.5 rounded-2xl bg-orange-100/80 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 group-hover:scale-110 group-hover:bg-orange-500 group-hover:text-white transition-all shrink-0 mt-0.5 shadow-xs">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              {item.tag}
                            </span>
                          </div>
                          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white group-hover:text-orange-600 transition-colors">
                            {item.title}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium leading-relaxed">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-1 transition-all mt-1 shrink-0" />
                    </button>
                  )
                })}
              </div>

              {/* Bottom Nav: Only Next button (to Điều khoản sử dụng dịch vụ - nằm nửa bên phải) */}
              <div className="mt-12 pt-6 border-t border-orange-200/60 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => setSearchParams({ tab: 'terms' })}
                  className="w-full sm:w-1/2 p-4 rounded-2xl border border-orange-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-orange-500 hover:shadow-md transition-all flex items-center justify-between text-right group ml-auto"
                >
                  <div className="flex flex-col items-end min-w-0 w-full mr-3">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">NEXT</span>
                    <span className="text-sm font-black text-orange-600 dark:text-orange-400 group-hover:text-orange-700 transition-colors truncate">
                      Điều khoản sử dụng dịch vụ
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-orange-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              </div>
            </div>
          ) : (
            /* Specific Section Detail with Symmetrical GitBook Prev / Next Cards */
            <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-6 sm:p-10 rounded-3xl border border-orange-100/80 dark:border-slate-800 shadow-sm">
              <div className="mb-6">
                {currentSection.badge && (
                  <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-900/40 mb-3">
                    {currentSection.badge}
                  </span>
                )}
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
                  {currentSection.title}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  {currentSection.description}
                </p>
              </div>

              {/* Content Body */}
              <div className="mt-8 border-t border-slate-200/80 dark:border-slate-800 pt-6">
                {currentSection.content}
              </div>

              {/* Prev / Next Navigation Cards (tham khảo chính xác Hình 1 & Hình 2) */}
              <div className="mt-14 pt-8 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Previous Button Card (nửa bên trái) */}
                {prevTab ? (
                  <button
                    onClick={() => setSearchParams({ tab: prevTab.id })}
                    className="w-full sm:w-1/2 p-4 rounded-2xl border border-orange-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-orange-500 hover:shadow-md transition-all flex items-center gap-3 text-left group"
                  >
                    <ChevronLeft className="w-4 h-4 text-orange-500 group-hover:-translate-x-0.5 transition-all shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">PREVIOUS</span>
                      <span className="text-sm font-black text-orange-600 dark:text-orange-400 group-hover:text-orange-700 transition-colors truncate">
                        {prevTab.title}
                      </span>
                    </div>
                  </button>
                ) : (
                  <div className="hidden sm:block sm:w-1/2" />
                )}

                {/* Next Button Card (nửa bên phải) */}
                {nextTab ? (
                  <button
                    onClick={() => setSearchParams({ tab: nextTab.id })}
                    className="w-full sm:w-1/2 p-4 rounded-2xl border border-orange-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-orange-500 hover:shadow-md transition-all flex items-center justify-between text-right group ml-auto"
                  >
                    <div className="flex flex-col items-end min-w-0 w-full mr-3">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">NEXT</span>
                      <span className="text-sm font-black text-orange-600 dark:text-orange-400 group-hover:text-orange-700 transition-colors truncate">
                        {nextTab.title}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-orange-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ) : (
                  <div className="hidden sm:block sm:w-1/2" />
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
