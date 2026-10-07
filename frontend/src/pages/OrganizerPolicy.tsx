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
  BadgePercent,
  Gift,
  Coins,
  TrendingUp,
  Zap,
  HelpCircle
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
  const calcOrganizerNet = Math.max(0, calcGross - calcTotalCommission)
  const netRatio = calcGross > 0 ? ((calcOrganizerNet / calcGross) * 100).toFixed(1) : '100'

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
    <div className="min-h-screen bg-slate-900/5 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6 lg:px-8 font-sans selection:bg-orange-500 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1)
                } else {
                  navigate(user ? '/dashboard' : '/guest')
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-500/50 shadow-md shadow-slate-200/50 dark:shadow-none active:scale-95 transition-all"
            >
              <ArrowLeft size={16} /> {user ? 'Quay lại Dashboard' : 'Quay lại'}
            </button>
            {user?.role === 'ORGANIZER' && (
              <button
                type="button"
                onClick={() => navigate('/dashboard/organizer/wallet')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 active:scale-95 transition-all"
              >
                <Wallet size={16} /> Quản lý Ví Ban Tổ Chức
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/20">
            <Zap size={14} className="animate-pulse" />
            <span>FEMS Platform • Organizer Financial Policy v2.0</span>
          </div>
        </div>

        {/* Premium Hero Header Card */}
        <div className="relative overflow-hidden rounded-3xl p-8 sm:p-12 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white shadow-2xl border border-slate-800/80">
          {/* Animated Background Glowing Orbs */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-orange-500/20 via-amber-500/10 to-transparent rounded-full blur-3xl pointer-events-none animate-pulse duration-[7000ms]" />
          <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-gradient-to-tr from-blue-600/15 via-indigo-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-5 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black bg-gradient-to-r from-orange-500/20 via-amber-500/20 to-orange-500/20 text-orange-300 border border-orange-500/30 backdrop-blur-xl shadow-inner">
              <Sparkles size={14} className="text-amber-400 animate-spin duration-[4000ms]" />
              CHÍNH SÁCH & QUY ĐỊNH VẬN HÀNH TÀI CHÍNH BAN TỔ CHỨC
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
              Minh Bạch, An Toàn &{' '}
              <span className="bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-400 bg-clip-text text-transparent">
                Tự Động Quyết Toán
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300 font-medium leading-relaxed">
              Hướng dẫn chi tiết dành cho các Ban Tổ Chức, Câu Lạc Bộ FPT về cấu trúc Phí nền tảng, cơ chế Ký quỹ bảo chứng (Escrow), Quy trình tự động giải phóng doanh thu và Rút tiền về tài khoản ngân hàng.
            </p>
          </div>

          {/* Key Metric Highlights Header Grid */}
          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-4 mt-10 pt-8 border-t border-slate-800/80">
            <div className="bg-slate-900/80 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-slate-800 hover:border-orange-500/50 transition-all group">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 group-hover:scale-110 transition-transform">
                  <BadgePercent size={18} />
                </div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Phí dịch vụ</p>
              </div>
              <p className="text-xl sm:text-2xl font-black text-orange-400">10% + 1.000đ</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Trên vé có thu phí</p>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-slate-800 hover:border-emerald-500/50 transition-all group">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                  <Gift size={18} />
                </div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Vé Miễn Phí</p>
              </div>
              <p className="text-xl sm:text-2xl font-black text-emerald-400">0 VNĐ (Free)</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Không mất bất kỳ phí nào</p>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-slate-800 hover:border-amber-500/50 transition-all group">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
                  <RefreshCw size={18} />
                </div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Quyết toán</p>
              </div>
              <p className="text-xl sm:text-2xl font-black text-amber-400">Tự Động 100%</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Khi sự kiện FINISHED</p>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-slate-800 hover:border-blue-500/50 transition-all group">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                  <Landmark size={18} />
                </div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Giải ngân</p>
              </div>
              <p className="text-xl sm:text-2xl font-black text-blue-400">24/7 Liên Bank</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Tối thiểu từ 50.000đ</p>
            </div>
          </div>
        </div>

        {/* Live Interactive Revenue Calculator Widget */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center font-black shadow-lg shadow-orange-500/30">
                <Calculator size={24} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  Công Cụ Ước Tính Doanh Thu Thực Nhận (Revenue Calculator)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Kéo thanh trượt hoặc nhập giá vé và số lượng để tính toán doanh thu thực nhận lập tức.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-black px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <Coins size={14} className="text-amber-500" />
              <span>Công thức: [Giá vé - (10% + 1.000đ)] × Số vé</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2">
            {/* Input Controls (Left Column) */}
            <div className="lg:col-span-6 space-y-6 bg-slate-50/80 dark:bg-slate-950/60 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800">
              {/* Ticket Price Field & Slider */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Mệnh giá mỗi vé (VNĐ):
                  </label>
                  <span className="text-sm font-black text-orange-600 dark:text-orange-400">
                    {calcTicketPrice.toLocaleString('vi-VN')} đ
                  </span>
                </div>
                <div className="relative">
                  <NumericInput
                    value={calcTicketPrice}
                    onChange={(val) => setCalcTicketPrice(val)}
                    min={0}
                    placeholder="0"
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-black text-base text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 shadow-inner pr-16"
                  />
                  <span className="absolute right-4 top-3.5 text-xs font-black text-slate-400">VNĐ</span>
                </div>
                {/* Interactive Slider */}
                <input
                  type="range"
                  min="0"
                  max="1000000"
                  step="10000"
                  value={calcTicketPrice}
                  onChange={(e) => setCalcTicketPrice(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>0đ (Miễn phí)</span>
                  <span>500.000đ</span>
                  <span>1.000.000đ</span>
                </div>
              </div>

              {/* Quantity Field & Slider */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Số lượng vé dự kiến bán ra:
                  </label>
                  <span className="text-sm font-black text-orange-600 dark:text-orange-400">
                    {calcQuantity.toLocaleString('vi-VN')} Vé
                  </span>
                </div>
                <div className="relative">
                  <NumericInput
                    value={calcQuantity}
                    onChange={(val) => setCalcQuantity(Math.max(1, val))}
                    min={1}
                    placeholder="1"
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-black text-base text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 shadow-inner pr-16"
                  />
                  <span className="absolute right-4 top-3.5 text-xs font-black text-slate-400">Vé</span>
                </div>
                {/* Interactive Quantity Slider */}
                <input
                  type="range"
                  min="1"
                  max="1000"
                  step="5"
                  value={calcQuantity}
                  onChange={(e) => setCalcQuantity(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>1 vé</span>
                  <span>500 vé</span>
                  <span>1.000 vé</span>
                </div>
              </div>
            </div>

            {/* Output Breakdown (Right Column) */}
            <div className="lg:col-span-6 space-y-5 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-slate-900/10 dark:from-orange-950/40 dark:via-slate-900 dark:to-slate-950 p-6 rounded-2xl border border-orange-500/20 dark:border-orange-500/30 flex flex-col justify-between shadow-inner">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-orange-500/20">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Tổng doanh thu Gross:
                  </span>
                  <span className="font-black text-slate-900 dark:text-white text-lg">
                    {calcGross.toLocaleString('vi-VN')} đ
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    Phí sàn FEMS (10% + 1.000đ/vé):
                  </span>
                  <span className="font-black text-rose-500 text-sm">
                    - {calcTotalCommission.toLocaleString('vi-VN')} đ
                  </span>
                </div>

                {/* Revenue Split Bar Indicator */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[11px] font-black">
                    <span className="text-emerald-600 dark:text-emerald-400">Thực nhận ({netRatio}%)</span>
                    <span className="text-rose-500">Phí sàn ({(100 - Number(netRatio)).toFixed(1)}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex p-0.5 border border-slate-300/50 dark:border-slate-700">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                      style={{ width: `${netRatio}%` }}
                    />
                    <div
                      className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(0, 100 - Number(netRatio))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Net Payout Glass Banner */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/15 border border-emerald-500/30 flex justify-between items-center flex-wrap gap-3 backdrop-blur-xl">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp size={16} /> BAN TỔ CHỨC THỰC NHẬN (NET):
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 font-bold mt-0.5">
                    (Giải phóng về Ví sau khi kết thúc sự kiện)
                  </p>
                </div>
                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
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
                className={`flex items-center gap-2.5 px-5 py-3.5 rounded-2xl font-black text-xs shrink-0 transition-all active:scale-95 border ${isActive
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white border-orange-500 shadow-lg shadow-orange-500/25'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200/80 dark:border-slate-800 hover:border-orange-500/40 hover:text-slate-900 dark:hover:text-white shadow-sm'
                  }`}
              >
                <Icon size={18} />
                <span>{cat.title}</span>
                <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${isActive
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
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-8 animate-fade-in">
          {/* Section Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap pb-6 border-b border-slate-100 dark:border-slate-800">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                <activeCategory.icon size={18} />
                <span>{activeCategory.badge}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
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
              <div
                key={i}
                className="p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1.5 hover:border-orange-500/40 transition-all shadow-sm"
              >
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">{h.label}</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{h.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{h.desc}</p>
              </div>
            ))}
          </div>

          {/* Key Rules List */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-500" />
              Quy định chi tiết & Hướng dẫn thực hiện
            </h3>
            <div className="space-y-3">
              {activeCategory.rules.map((rule, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800/80 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed hover:border-orange-500/30 transition-colors shadow-sm"
                >
                  <div className="w-6 h-6 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center font-black text-xs shrink-0 mt-0.5 shadow-md shadow-orange-500/20">
                    {idx + 1}
                  </div>
                  <span className="pt-0.5">{rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive FAQs Accordion */}
          <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <HelpCircle size={18} className="text-orange-500" />
              Câu hỏi thường gặp (FAQ)
            </h3>
            <div className="space-y-3">
              {activeCategory.faqs.map((faq, fIdx) => {
                const isOpen = expandedFaq === fIdx
                return (
                  <div
                    key={fIdx}
                    className="border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden transition-all shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(fIdx)}
                      className="w-full flex items-center justify-between p-4 sm:p-5 text-left font-black text-xs sm:text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 font-black text-xs">Q</span>
                        {faq.question}
                      </span>
                      <ChevronDown
                        size={18}
                        className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-orange-500' : ''}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 pt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800/80 leading-relaxed font-medium">
                        <span className="font-black text-emerald-600 dark:text-emerald-400 mr-1.5">Trả lời:</span> {faq.answer}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Bottom Call to Action Card */}
        <div className="relative overflow-hidden rounded-3xl p-8 sm:p-10 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 text-white shadow-2xl flex items-center justify-between gap-6 flex-wrap">
          <div className="space-y-2 max-w-xl relative z-10">
            <h3 className="text-xl sm:text-2xl font-black">Sẵn sàng trải nghiệm quản lý sự kiện chuyên nghiệp?</h3>
            <p className="text-xs sm:text-sm text-orange-100 font-medium leading-relaxed">
              Kiểm tra doanh thu sự kiện, quản lý tài khoản ngân hàng và thực hiện yêu cầu rút tiền tại trang Ví Ban Tổ Chức.
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard/organizer/wallet')}
              className="px-6 py-3.5 rounded-2xl bg-white text-orange-600 font-black text-xs sm:text-sm shadow-xl hover:bg-orange-50 hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5"
            >
              Mở Ví Ban Tổ Chức <ArrowRight size={18} />
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
