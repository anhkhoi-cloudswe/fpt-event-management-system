import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  Wallet,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  ChevronDown,
  Info,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Calculator,
  Landmark,
  BadgePercent
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { NumericInput } from '../components/common/NumericInput'

type PolicyItem = {
  question: string
  answer: string
}

type PolicyCategory = {
  id: string
  title: string
  badge: string
  description: string
  icon: any
  highlights: { label: string; value: string; desc: string }[]
  rules: string[]
  faqs: PolicyItem[]
}

export default function OrganizerPolicy() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<string>('pricing')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  // Interactive Fee Calculator state
  const [calcTicketPrice, setCalcTicketPrice] = useState<number>(100000)
  const [calcQuantity, setCalcQuantity] = useState<number>(50)

  const calcGross = calcTicketPrice * calcQuantity
  const calcCommissionPerTicket = calcTicketPrice > 0 ? (calcTicketPrice * 0.10) + 1000 : 0
  const calcTotalCommission = calcCommissionPerTicket * calcQuantity
  const calcOrganizerNet = calcGross - calcTotalCommission

  const toggleFaq = (idx: number) => {
    setExpandedFaq(prev => (prev === idx ? null : idx))
  }

  const categories: PolicyCategory[] = [
    {
      id: 'pricing',
      title: 'Biểu Phí & Thu Phí Nền Tảng',
      badge: '10% + 1.000đ',
      description: 'Quy chuẩn tính phí dịch vụ, hoa hồng hệ thống trên mỗi giao dịch vé thành công.',
      icon: BadgePercent,
      highlights: [
        { label: 'Phí cố định', value: '1.000 đ', desc: 'Phí xử lý giao dịch mỗi vé có thu phí' },
        { label: 'Phí hoa hồng', value: '10%', desc: 'Tỷ lệ chiết khấu trên giá vé niêm yết' },
        { label: 'Vé Miễn Phí', value: '0 đ (Free)', desc: 'Hoàn toàn miễn phí trọn đời cho vé 0 VNĐ' }
      ],
      rules: [
        'Công thức tính tiền thực nhận: Doanh thu thực nhận = Giá vé - (Giá vé × 10% + 1.000 VNĐ).',
        'Phí hệ thống được tự động trích xuất và lập Biên lai tài chính điện tử (Financial Receipt) ngay tại thời điểm khách hàng thanh toán vé thành công.',
        'Đối với các sự kiện phi lợi nhuận (giá vé 0 VNĐ): Ban tổ chức không phải chịu bất kỳ khoản phí nền tảng hay phí duy trì nào.',
        'Tất cả các khoản phí đều được công khai minh bạch trong báo cáo giao dịch chi tiết trên Ví Ban Tổ Chức.'
      ],
      faqs: [
        {
          question: 'Phí sàn 10% + 1.000đ được dùng để duy trì những dịch vụ gì?',
          answer: 'Khoản phí này được sử dụng để chi trả cổng thanh toán trực tuyến, hạ tầng máy chủ, hệ thống gửi email vé tự động, mã QR chống gian lận và hỗ trợ kỹ thuật vận hành sự kiện.'
        },
        {
          question: 'Nếu tôi tạo sự kiện có nhiều loại vé (VIP, Standard) thì phí tính thế nào?',
          answer: 'Hệ thống tự động áp dụng công thức tính phí độc lập cho từng loại vé dựa trên mệnh giá thực tế của từng vé được xuất ra.'
        }
      ]
    },
    {
      id: 'escrow',
      title: 'Cơ Chế Ký Quỹ & Tạm Giữ Tiền (Escrow)',
      badge: 'Pending Balance',
      description: 'Quy trình bảo vệ tài chính an toàn tuyệt đối cho người mua vé và uy tín Ban tổ chức.',
      icon: ShieldCheck,
      highlights: [
        { label: 'Số dư tạm giữ', value: 'Pending Balance', desc: 'Lưu giữ an toàn trong suốt thời gian bán vé' },
        { label: 'Thời gian ký quỹ', value: 'Đến khi kết thúc', desc: 'Giữ tiền cho đến khi sự kiện hoàn tất thành công' },
        { label: 'Theo dõi thời gian thực', value: 'Live Updates', desc: 'Cập nhật biến động doanh thu từng giây' }
      ],
      rules: [
        'Khi sinh viên thanh toán mua vé, toàn bộ doanh thu thực nhận (Net Amount) sẽ được đưa vào "Số dư tạm giữ" (Pending Balance) của Ban tổ chức.',
        'Khoản tiền tạm giữ này được hệ thống bảo chứng an toàn (Escrow) nhằm đảm bảo năng lực hoàn tiền cho khán giả nếu sự kiện có sự cố hoặc bị hủy.',
        'Ban tổ chức có thể xem thống kê chi tiết từng biên lai vé, tổng số tiền đang được tạm giữ theo từng sự kiện trong mục "Sự kiện đang ký quỹ".',
        'Số dư tạm giữ (Pending Balance) không thể dùng để rút tiền trực tiếp cho đến khi được giải phóng sang Số dư khả dụng.'
      ],
      faqs: [
        {
          question: 'Tại sao tiền bán vé không vào ngay số dư khả dụng mà phải vào số dư tạm giữ?',
          answer: 'Đây là chuẩn mực bảo vệ tài chính toàn cầu của các nền tảng bán vé lớn (như Eventbrite, Ticketmaster). Cơ chế này bảo vệ người mua vé và ngăn chặn rủi ro gian lận hoặc sự kiện bị hủy bỏ đột xuất.'
        },
        {
          question: 'Tôi có thể xem danh sách từng đơn vé nằm trong quỹ tạm giữ ở đâu?',
          answer: 'Tại trang "Ví & Doanh thu", tab "Biên lai tài chính (Receipts)" hiển thị chi tiết mã đơn, tên người mua, giá vé, phí hoa hồng và số tiền thực nhận của từng vé.'
        }
      ]
    },
    {
      id: 'settlement',
      title: 'Quyết Toán Tự Động (Auto-Settlement)',
      badge: 'Automated 100%',
      description: 'Cơ chế kích hoạt chuyển toàn bộ doanh thu tạm giữ thành tiền khả dụng để rút.',
      icon: RefreshCw,
      highlights: [
        { label: 'Thời điểm quyết toán', value: 'Sự kiện Kết thúc', desc: 'Kích hoạt ngay khi trạng thái chuyển FINISHED' },
        { label: 'Phương thức', value: 'Tự động 100%', desc: 'Transaction DB an toàn không cần thao tác tay' },
        { label: 'Lịch sử giao dịch', value: 'EVENT_PAYOUT_RELEASE', desc: 'Ghi nhận rõ ràng nguồn gốc dòng tiền' }
      ],
      rules: [
        'Thời điểm quyết toán: Toàn bộ số tiền tạm giữ (Pending Balance) của sự kiện sẽ được tự động cộng dồn vào "Số dư khả dụng" (Available Balance) ngay khi sự kiện kết thúc thành công.',
        'Cơ chế kích hoạt: Khi sự kiện chuyển trạng thái sang "FINISHED" (thông qua nút Kết thúc sự kiện của Organizer hoặc Cronjob tự động quét theo thời gian kết thúc `end_time`).',
        'Mỗi lần quyết toán thành công, hệ thống sinh ra một giao dịch ví nội bộ loại `EVENT_PAYOUT_RELEASE` ghi nhận chi tiết tên sự kiện và số tiền được giải phóng.',
        'Ngay sau khi quyết toán, Ban tổ chức có toàn quyền tạo Lệnh rút tiền (Payout Request) về tài khoản ngân hàng.'
      ],
      faqs: [
        {
          question: 'Nếu sự kiện kết thúc trễ hơn so với dự kiến thì thời gian quyết toán có bị ảnh hưởng không?',
          answer: 'Khi Ban tổ chức nhấn xác nhận "Kết thúc sự kiện" trên hệ thống quản lý, tiến trình quyết toán sẽ được kích hoạt ngay lập tức mà không cần đợi cronjob.'
        },
        {
          question: 'Có cần phê duyệt từ Admin để giải phóng tiền sau sự kiện không?',
          answer: 'Không. Quá trình giải phóng doanh thu từ Pending sang Available là hoàn toàn tự động theo hợp đồng thông minh của hệ thống FEMS.'
        }
      ]
    },
    {
      id: 'payout',
      title: 'Quy Trình Rút Tiền Về Ngân Hàng',
      badge: 'Payout 24/7',
      description: 'Hướng dẫn liên kết tài khoản ngân hàng thụ hưởng và tạo yêu cầu giải ngân.',
      icon: Landmark,
      highlights: [
        { label: 'Hạn mức rút tối thiểu', value: '50.000 đ', desc: 'Số tiền tối thiểu cho một lần tạo lệnh rút' },
        { label: 'Thời gian xử lý', value: '1 - 24 giờ', desc: 'Giải ngân qua chuyển khoản liên ngân hàng 24/7' },
        { label: 'Ngân hàng hỗ trợ', value: 'Hơn 50+ Bank', desc: 'Vietcombank, Techcombank, MB, TPBank, VietinBank...' }
      ],
      rules: [
        'Bước 1: Ban tổ chức thêm và xác thực ít nhất 01 tài khoản ngân hàng thụ hưởng (chính chủ hoặc đại diện CLB) tại mục "Tài khoản ngân hàng".',
        'Bước 2: Tạo "Lệnh rút tiền mới" bằng cách nhập số tiền mong muốn (nhỏ hơn hoặc bằng Số dư khả dụng hiện có).',
        'Bước 3: Khi tạo lệnh, số tiền yêu cầu rút sẽ được tạm khóa để tránh chi tiêu trùng lặp. Đội ngũ Kế toán sẽ đối soát và giải ngân.',
        'Các trạng thái lệnh rút: PENDING (Chờ duyệt) ➜ PROCESSING (Đang giải ngân) ➜ COMPLETED (Đã nhận tiền) hoặc REJECTED (Bị từ chối kèm lý do rõ ràng).'
      ],
      faqs: [
        {
          question: 'Rút tiền có mất phí ngân hàng không?',
          answer: 'Hiện tại hệ thống FEMS miễn phí toàn bộ chi phí chuyển khoản liên ngân hàng 24/7 khi Ban tổ chức thực hiện rút tiền.'
        },
        {
          question: 'Tôi có thể liên kết nhiều tài khoản ngân hàng và đặt tài khoản mặc định không?',
          answer: 'Có. Bạn có thể thêm nhiều tài khoản ngân hàng và chọn một tài khoản làm mặc định (Default) để thuận tiện cho các lần rút tiền sau.'
        }
      ]
    },
    {
      id: 'cancellation',
      title: 'Chính Sách Hủy Sự Kiện & Hoàn Tiền',
      badge: 'Refund Policy',
      description: 'Quy định xử lý nghĩa vụ tài chính khi sự kiện bị hủy hoặc khán giả khiếu nại.',
      icon: AlertTriangle,
      highlights: [
        { label: 'Sự kiện bị hủy', value: 'Hoàn 100%', desc: 'Tự động hoàn toàn bộ tiền cho người mua vé' },
        { label: 'Nguồn hoàn tiền', value: 'Quỹ Escrow', desc: 'Trích trực tiếp từ số dư tạm giữ của sự kiện đó' },
        { label: 'Bảo vệ Organizer', value: 'Không âm ví', desc: 'Không làm ảnh hưởng đến số dư các sự kiện khác' }
      ],
      rules: [
        'Trong trường hợp sự kiện bị HỦY (Cancelled) bởi Ban tổ chức hoặc Ban giám hiệu: Hệ thống sẽ tự động hoàn trả 100% tiền vé lại cho toàn bộ khán giả đã thanh toán.',
        'Khoản tiền hoàn trả này được trừ trực tiếp từ "Số dư tạm giữ" (Pending Balance) của chính sự kiện đó. Phí hoa hồng sàn dự kiến tương ứng sẽ được tự động hủy bỏ.',
        'Nếu có khán giả khiếu nại ghế hỏng hoặc lỗi sảnh và được Staff phê duyệt hoàn tiền: Tiền hoàn sẽ được khấu trừ trực tiếp từ doanh thu tạm giữ của đơn vé đó trước khi quyết toán.',
        'Ban tổ chức có trách nhiệm thông báo lý do hủy sự kiện rõ ràng cho sinh viên qua hệ thống thông báo ít nhất 24 giờ trước thời điểm bắt đầu.'
      ],
      faqs: [
        {
          question: 'Nếu sự kiện bị hủy, Ban tổ chức có phải đóng phí hoa hồng cho hệ thống không?',
          answer: 'Không. Nếu sự kiện bị hủy và tiền đã hoàn lại 100% cho khán giả, hệ thống sẽ KHÔNG thu bất kỳ khoản phí hoa hồng nào từ Ban tổ chức.'
        },
        {
          question: 'Khán giả nhận tiền hoàn bằng hình thức nào?',
          answer: 'Tiền hoàn sẽ được cộng trực tiếp vào Số dư Ví nội bộ của tài khoản sinh viên FPT hoặc hoàn về tài khoản ngân hàng theo quy định.'
        }
      ]
    }
  ]

  const activeCategory = categories.find(c => c.id === activeTab) || categories[0]

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Top Navigation & Breadcrumb */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1)
                } else {
                  navigate(user ? '/dashboard' : '/guest')
                }
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-500/50 shadow-sm active:scale-95 transition-all"
            >
              <ArrowLeft size={14} /> {user ? 'Quay lại Dashboard' : 'Quay lại'}
            </button>
            {user?.role === 'ORGANIZER' && (
              <button
                type="button"
                onClick={() => navigate('/dashboard/organizer/wallet')}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/40 text-orange-600 dark:text-orange-400 hover:bg-orange-100 shadow-sm active:scale-95 transition-all"
              >
                <Wallet size={14} /> Quản lý Ví Ban Tổ Chức
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>FEMS Platform</span>
            <span>•</span>
            <span className="text-orange-600 dark:text-orange-400 font-bold">Organizer Financial Policy v2.0</span>
          </div>
        </div>

        {/* Hero Header Card */}
        <div className="relative overflow-hidden rounded-3xl p-8 sm:p-10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white shadow-2xl border border-slate-800">
          <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black bg-orange-500/20 text-orange-400 border border-orange-500/30 backdrop-blur-md">
              <Sparkles size={14} />
              Chính Sách & Quy Định Vận Hành Tài Chính Ban Tổ Chức
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              Minh Bạch, An Toàn & Tự Động Quyết Toán
            </h1>
            <p className="text-sm sm:text-base text-slate-300 font-medium leading-relaxed">
              Hướng dẫn chi tiết dành cho các Ban Tổ Chức, Câu Lạc Bộ FPT về cấu trúc Phí nền tảng, cơ chế Ký quỹ bảo chứng (Escrow), Quy trình tự động giải phóng doanh thu và Rút tiền về tài khoản ngân hàng.
            </p>
          </div>

          {/* Key Metric Highlights */}
          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-8 border-t border-slate-700/60">
            <div className="bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-700/60">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Phí dịch vụ</p>
              <p className="text-xl font-black text-orange-400 mt-1">10% + 1.000đ</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Trên vé có thu phí</p>
            </div>
            <div className="bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-700/60">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vé Miễn Phí</p>
              <p className="text-xl font-black text-emerald-400 mt-1">0 VNĐ (Free)</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Không mất bất kỳ phí nào</p>
            </div>
            <div className="bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-700/60">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Quyết toán</p>
              <p className="text-xl font-black text-amber-400 mt-1">Tự Động 100%</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Khi sự kiện FINISHED</p>
            </div>
            <div className="bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-700/60">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Giải ngân</p>
              <p className="text-xl font-black text-blue-400 mt-1">24/7 Liên Bank</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Tối thiểu từ 50.000đ</p>
            </div>
          </div>
        </div>

        {/* Live Interactive Fee Calculator Widget */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
                <Calculator size={20} />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Công Cụ Ước Tính Doanh Thu Thực Nhận (Revenue Calculator)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Nhập giá vé và số lượng vé dự kiến bán ra để xem chi tiết khoản phí trích xuất và doanh thu thực nhận.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              Công thức: [Giá vé - (10% + 1.000đ)] × Số vé
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Inputs */}
            <div className="space-y-4 bg-slate-50 dark:bg-slate-950/60 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Mệnh giá mỗi vé (VNĐ):
                </label>
                <div className="relative">
                  <NumericInput
                    value={calcTicketPrice}
                    onChange={(val) => setCalcTicketPrice(val)}
                    min={0}
                    placeholder="0"
                    className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-sm text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 pr-12"
                  />
                  <span className="absolute right-4 top-2.5 text-xs font-bold text-slate-400">VNĐ</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Số lượng vé bán dự kiến:
                </label>
                <div className="relative">
                  <NumericInput
                    value={calcQuantity}
                    onChange={(val) => setCalcQuantity(Math.max(1, val))}
                    min={1}
                    placeholder="1"
                    className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-sm text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 pr-12"
                  />
                  <span className="absolute right-4 top-2.5 text-xs font-bold text-slate-400">Vé</span>
                </div>
              </div>
            </div>

            {/* Output Calculation Breakdown */}
            <div className="space-y-3 bg-gradient-to-br from-orange-500/5 to-amber-500/5 dark:from-orange-950/20 dark:to-slate-900 p-5 rounded-2xl border border-orange-200/60 dark:border-orange-900/40 flex flex-col justify-between">
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span>Tổng tiền thu từ khán giả (Gross):</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{calcGross.toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span>Phí sàn FEMS (10% + 1.000đ/vé):</span>
                  <span className="font-bold text-rose-500 text-sm">- {calcTotalCommission.toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span>Tỷ lệ thực nhận trên tổng doanh thu:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {calcGross > 0 ? ((calcOrganizerNet / calcGross) * 100).toFixed(1) : '100'}%
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-orange-200/60 dark:border-orange-900/40 flex justify-between items-center">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-orange-600 dark:text-orange-400">
                    Ban Tổ Chức Thực Nhận (Net):
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    (Được chuyển vào Ví sau khi sự kiện kết thúc)
                  </p>
                </div>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {calcOrganizerNet.toLocaleString('vi-VN')} đ
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((cat) => {
            const Icon = cat.icon
            const isActive = cat.id === activeTab
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveTab(cat.id)
                  setExpandedFaq(null)
                }}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl font-bold text-xs shrink-0 transition-all active:scale-95 border ${isActive
                  ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-600/20'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-orange-500/40 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <Icon size={16} />
                <span>{cat.title}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${isActive
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>
                  {cat.badge}
                </span>
              </button>
            )
          })}
        </div>

        {/* Active Category Content Section */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl space-y-8 animate-fade-in">
          {/* Section Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap pb-6 border-b border-slate-100 dark:border-slate-800">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                <activeCategory.icon size={16} />
                {activeCategory.badge}
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                {activeCategory.title}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                {activeCategory.description}
              </p>
            </div>
          </div>

          {/* Category Highlight Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {activeCategory.highlights.map((h, i) => (
              <div key={i} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{h.label}</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">{h.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{h.desc}</p>
              </div>
            ))}
          </div>

          {/* Key Rules List */}
          <div className="space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-500" />
              Quy định chi tiết & Hướng dẫn thực hiện
            </h3>
            <div className="space-y-2.5">
              {activeCategory.rules.map((rule, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed"
                >
                  <div className="w-5 h-5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive FAQs Accordion */}
          <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Info size={16} className="text-orange-500" />
              Câu hỏi thường gặp (FAQ)
            </h3>
            <div className="space-y-2.5">
              {activeCategory.faqs.map((faq, fIdx) => {
                const isOpen = expandedFaq === fIdx
                return (
                  <div
                    key={fIdx}
                    className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(fIdx)}
                      className="w-full flex items-center justify-between p-4 text-left font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="text-orange-500 font-black">Q:</span>
                        {faq.question}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-orange-500' : ''}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/30 border-t border-slate-100 dark:border-slate-800/60 leading-relaxed">
                        <span className="text-emerald-500 font-bold mr-1">Trả lời:</span> {faq.answer}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Bottom Call to Action Card */}
        <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-xl flex items-center justify-between gap-6 flex-wrap">
          <div className="space-y-1 max-w-xl">
            <h3 className="text-lg sm:text-xl font-black">Sẵn sàng trải nghiệm quản lý sự kiện chuyên nghiệp?</h3>
            <p className="text-xs sm:text-sm text-orange-100 font-medium">
              Kiểm tra doanh thu sự kiện, quản lý tài khoản ngân hàng và thực hiện yêu cầu rút tiền tại trang Ví Ban Tổ Chức.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard/organizer/wallet')}
              className="px-6 py-3 rounded-2xl bg-white text-orange-600 font-black text-xs sm:text-sm shadow-lg hover:bg-orange-50 active:scale-95 transition-all flex items-center gap-2"
            >
              Mở Ví Ban Tổ Chức <ArrowRight size={16} />
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
