import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  ShieldAlert,
  QrCode,
  Award,
  ChevronDown,
  ArrowLeft,
  HelpCircle,
  Clock,
  Sparkles,
  HeartHandshake
} from 'lucide-react'

type PolicyItem = {
  question: string
  answer: string
}

type PolicyCategory = {
  id: string
  title: string
  description: string
  icon: any
  rules: string[]
  faqs: PolicyItem[]
}

export default function SystemPolicy() {
  const [activeTab, setActiveTab] = useState<string>('booking')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const categories: PolicyCategory[] = [
    {
      id: 'booking',
      title: 'Quy Định Đăng Ký Vé',
      description: 'Chính sách đặt chỗ, số lượng vé tối đa và thời gian giữ chỗ của sinh viên FPT.',
      icon: BookOpen,
      rules: [
        'Mỗi tài khoản sinh viên FPT được đăng ký tối đa 04 vé/ghế ngồi cho mỗi sự kiện trong một giao dịch mua vé.',
        'Vé đăng ký thành công sẽ đi kèm với mã QR duy nhất và thông tin số ghế ngồi tại hội trường (nếu sự kiện có cấu hình sơ đồ ghế).',
        'Các sự kiện có phí phải được thanh toán trong vòng 05 phút kể từ lúc giữ chỗ (áp dụng cho cả ví nội bộ và SePay chuyển khoản). Quá thời gian trên, hệ thống sẽ tự động hủy đơn và giải phóng ghế để tránh "ghế ma".',
        'Hành vi tự ý hủy hoặc để đơn hàng hết hạn thanh toán liên tiếp 03 lần sẽ kích hoạt cơ chế khóa tài khoản đặt vé tạm thời trong 15 phút (Seat Hoarding Lockout).'
      ],
      faqs: [
        {
          question: 'Sinh viên ngoài trường có thể đăng ký vé được không?',
          answer: 'Hệ thống FPT Event Management hiện tại ưu tiên xác thực tài khoản email FPT Education (@fpt.edu.vn hoặc @fe.edu.vn). Khách vãng lai có thể tham quan danh sách sự kiện công khai nhưng cần đăng nhập bằng tài khoản FPT để hoàn tất đặt vé.'
        },
        {
          question: 'Tôi có thể nhượng vé đã đăng ký cho người khác không?',
          answer: 'Không. Vé sự kiện được liên kết trực tiếp với mã sinh viên và tài khoản cá nhân để phục vụ công tác điểm danh và quản lý chỗ ngồi của Ban tổ chức.'
        }
      ]
    },
    {
      id: 'refunds',
      title: 'Phản Ánh & Hoàn Tiền',
      description: 'Cơ chế xử lý khi sảnh ghế ngồi bị lỗi, bị chiếm chỗ và chính sách hoàn trả chi phí tự động.',
      icon: ShieldAlert,
      rules: [
        'Nếu vị trí ghế ngồi của bạn tại sự kiện bị chiếm dụng hoặc bị hư hỏng vật lý, bạn có quyền gửi "Báo Cáo Lỗi" ngay trên trang chi tiết vé trong mục "Vé của tôi".',
        'Staff sẽ thẩm định phản ánh của bạn trong vòng 24 giờ. Nếu báo cáo hợp lệ, bạn sẽ được hoàn trả 100% tiền vé trực tiếp vào tài khoản ví cá nhân.',
        'Trong trường hợp sự kiện bị Hủy hoặc Rút phép hoạt động bởi Ban tổ chức, toàn bộ sinh viên đã mua vé sẽ được hệ thống tự động hoàn tiền 100% lập tức.'
      ],
      faqs: [
        {
          question: 'Tôi có thể tự ý hủy vé đã mua để lấy lại tiền không?',
          answer: 'Việc tự ý hoàn/hủy vé từ phía sinh viên chỉ được chấp nhận trước khi sự kiện bắt đầu ít nhất 24 giờ. Tiền vé sẽ được hoàn trả sau khi trừ phí dịch vụ (nếu có quy định riêng từ nhà tổ chức).'
        },
        {
          question: 'Làm thế nào để biết báo cáo lỗi ghế ngồi của tôi được duyệt?',
          answer: 'Trạng thái báo cáo sẽ cập nhật trực tiếp trên thẻ vé trong ví của bạn dưới dạng nhãn trạng thái sáng màu: "Đang chờ hoàn tiền", "Đã hoàn tiền" hoặc "Từ chối hoàn tiền".'
        }
      ]
    },
    {
      id: 'checkin',
      title: 'Quy Trình Kiểm Vé & Check-In',
      description: 'Hướng dẫn tham gia kiểm tra thông tin vé tại quầy trước khi bước vào hội trường.',
      icon: QrCode,
      rules: [
        'Sinh viên tham dự cần xuất trình mã QR vé từ mục "Vé của tôi" trên ứng dụng điện thoại hoặc cung cấp mã số vé (#ID) cho kiểm soát viên tại sảnh.',
        'Thời gian mở cửa Check-in trước sự kiện được cấu hình động bởi Ban tổ chức (mặc định là 60 phút trước giờ bắt đầu). Hệ thống cho phép quét Check-in linh hoạt cho đến khi sự kiện chính thức kết thúc.',
        'Hệ thống hỗ trợ quét Check-out phục vụ công tác cấp chứng nhận hoạt động ngoại khóa. Việc Check-out chỉ được ghi nhận khi sự kiện đã diễn ra đến thời gian đệm cho phép (tối thiểu 30-60 phút trước giờ kết thúc).'
      ],
      faqs: [
        {
          question: 'Nếu điện thoại của tôi mất kết nối internet lúc check-in thì sao?',
          answer: 'Bạn có thể chụp ảnh màn hình mã QR vé từ trước để kiểm soát viên quét ngoại tuyến, hoặc cung cấp mã số vé hiển thị trên hóa đơn giấy để nhập thủ công.'
        },
        {
          question: 'Tôi có cần quét mã Check-Out khi ra về không?',
          answer: 'Có, đối với các sự kiện đặc biệt yêu cầu quét Check-Out để xác nhận thời gian tham dự thực tế phục vụ cho việc cấp chứng nhận hoạt động ngoại khóa và tính điểm rèn luyện.'
        }
      ]
    },
    {
      id: 'organizer',
      title: 'Điều Khoản Ban Tổ Chức',
      description: 'Chính sách giữ chỗ hội trường, sảnh sự kiện, cấu hình giá vé và phê duyệt hồ sơ.',
      icon: Award,
      rules: [
        'Mọi yêu cầu tổ chức sự kiện từ các Câu lạc bộ/Ban tổ chức sinh viên phải được gửi trước ngày diễn ra ít nhất 07 ngày làm việc để Staff phê duyệt.',
        'Hạn ngạch tổ chức sự kiện (Daily Quota): Để đảm bảo chất lượng vận hành và điều phối cơ sở vật chất tốt nhất, hệ thống giới hạn tối đa 02 sự kiện được phép diễn ra đồng thời hoặc trong cùng một ngày trên toàn bộ các hội trường/sảnh.',
        'Nhà tổ chức phải đảm bảo tính trung thực của thông tin sự kiện. Mọi hành vi vi phạm đạo đức học đường sẽ dẫn đến việc đình chỉ sự kiện ngay lập tức.'
      ],
      faqs: [
        {
          question: 'Mất bao lâu để yêu cầu đăng ký sự kiện của tôi được duyệt?',
          answer: 'Hồ sơ yêu cầu tổ chức sẽ được Staff thẩm định và phản hồi kết quả duyệt hoặc yêu cầu bổ sung thông tin trong vòng tối đa 48 giờ làm việc.'
        },
        {
          question: 'Ban tổ chức có thể thay đổi số lượng ghế ngồi sau khi duyệt không?',
          answer: 'Có thể thay đổi cấu hình sơ đồ ghế ngồi thông qua chức năng "Cập nhật yêu cầu" trước khi mở bán vé chính thức.'
        }
      ]
    }
  ]

  const activeCategory = categories.find(c => c.id === activeTab) || categories[0]

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index)
  }

  return (
    <div className="bg-gradient-to-br from-orange-50/20 via-slate-50 to-amber-50/10 min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Quay lại trang chủ */}
        <div className="mb-6">
          <Link
            to="/guest"
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-500 hover:text-orange-600 transition-all duration-300 active:scale-95 bg-white/70 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/80 shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Quay lại trang chủ
          </Link>
        </div>

        {/* Tiêu đề chính */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-600 border border-orange-200/50 shadow-sm mb-4 animate-bounce">
            <HeartHandshake className="w-3.5 h-3.5" />
            Điều khoản & Hướng dẫn sử dụng
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Chính Sách Hệ Thống FPT Event
          </h1>
          <p className="text-slate-550 text-sm mt-2 max-w-xl mx-auto font-medium">
            Mọi quy định được thiết lập nhằm bảo vệ quyền lợi tham dự của sinh viên và nâng cao chất lượng vận hành sự kiện.
          </p>
        </div>

        {/* Tab Selector (Segmented control) */}
        <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-white/80 p-2 shadow-md mb-8 grid grid-cols-2 md:grid-cols-4 gap-1">
          {categories.map((c) => {
            const Icon = c.icon
            const isActive = activeTab === c.id
            return (
              <button
                key={c.id}
                onClick={() => {
                  setActiveTab(c.id)
                  setExpandedFaq(null)
                }}
                className={`flex items-center justify-center gap-1.5 py-3.5 px-3 rounded-2xl text-xs font-extrabold transition-all duration-300 ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-500/20 scale-102'
                    : 'text-slate-550 hover:bg-slate-100/50'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{c.title}</span>
              </button>
            )
          })}
        </div>

        {/* Main Content Area */}
        <div className="space-y-6">
          
          {/* Section: Quy định chính */}
          <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-white/80 p-6 sm:p-8 shadow-md animate-fade-in-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl border border-orange-100/50">
                <activeCategory.icon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">{activeCategory.title}</h2>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">{activeCategory.description}</p>
              </div>
            </div>

            <div className="space-y-4">
              {activeCategory.rules.map((rule, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-white/40 border border-slate-100 rounded-2xl p-4 transition-all duration-300 hover:border-orange-200/50 hover:bg-white/70 shadow-sm">
                  <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-slate-650 text-xs sm:text-sm font-semibold leading-relaxed">
                    {rule}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section: FAQs Hỏi đáp nhanh */}
          <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-white/80 p-6 sm:p-8 shadow-md animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-2 mb-6">
              <HelpCircle className="w-5 h-5 text-orange-500" />
              <h3 className="text-lg font-extrabold text-slate-900">Giải Đáp Thắc Mắc</h3>
            </div>

            <div className="space-y-3">
              {activeCategory.faqs.map((faq, idx) => {
                const isExpanded = expandedFaq === idx
                return (
                  <div
                    key={idx}
                    className="border border-slate-150 rounded-2xl overflow-hidden bg-white/40 transition-all duration-300 hover:bg-white/80 shadow-sm"
                  >
                    <button
                      onClick={() => toggleFaq(idx)}
                      className="w-full flex items-center justify-between p-5 text-left focus:outline-none"
                    >
                      <span className="text-xs sm:text-sm font-extrabold text-slate-800 pr-4">
                        {faq.question}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 transition-transform duration-300 flex-shrink-0 ${
                          isExpanded ? 'rotate-180 text-orange-500' : ''
                        }`}
                      />
                    </button>

                    <div
                      className={`transition-all duration-300 ease-in-out overflow-hidden ${
                        isExpanded ? 'max-h-48 border-t border-slate-150' : 'max-h-0'
                      }`}
                    >
                      <div className="p-5 text-xs sm:text-sm text-slate-500 leading-relaxed font-semibold">
                        {faq.answer}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Banner trợ giúp trực tiếp */}
          <div className="bg-gradient-to-r from-orange-600 via-orange-550 to-orange-500 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-orange-500/10 flex flex-col sm:flex-row items-center justify-between gap-6 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            <div className="space-y-1.5 text-center sm:text-left">
              <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-black uppercase tracking-wider">Hỗ trợ kỹ thuật</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black">Bạn cần thêm sự trợ giúp khác?</h3>
              <p className="text-xs font-bold text-orange-100 max-w-sm leading-relaxed">
                Vui lòng gửi email phản ánh kỹ thuật hoặc liên hệ trực tiếp văn phòng Công tác sinh viên tại các Campus.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-6 py-3 bg-white text-orange-600 font-extrabold rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.03] active:scale-97 text-sm"
            >
              Liên hệ chúng tôi
            </Link>
          </div>

        </div>

      </div>
    </div>
  )
}
