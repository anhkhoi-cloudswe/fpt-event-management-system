import React from 'react'

/**
 * Danh sách logo đối tác chuẩn theo template của vbee.vn do người dùng cung cấp
 * Hàng 1 (Revert - di chuyển từ trái sang phải hoặc phải sang trái)
 */
const PARTNER_ROW_1 = [
  { name: 'FE Credit', img: 'https://media-frontend.vbee.vn/images/partner/fe-credit.webp', website: 'https://fecredit.com.vn' },
  { name: 'TPBank', img: 'https://media-frontend.vbee.vn/images/partner/tp-bank.webp', website: 'https://tpb.vn' },
  { name: 'MoMo', img: 'https://media-frontend.vbee.vn/images/partner/momo.webp', website: 'https://momo.vn' },
  { name: 'VietCredit', img: 'https://media-frontend.vbee.vn/images/partner/viet-credit.webp', website: 'https://vietcredit.vn' },
  { name: 'VNPAY', img: 'https://media-frontend.vbee.vn/images/partner/vnpay.webp', website: 'https://vnpay.vn' },
  { name: 'moneyveo', img: 'https://media-frontend.vbee.vn/images/partner/moneyveo.webp', website: 'https://moneyveo.vn' },
  { name: 'Sacombank', img: 'https://media-frontend.vbee.vn/images/partner/sacombank.webp', website: 'https://sacombank.com.vn' },
  { name: 'Mirae Asset', img: 'https://media-frontend.vbee.vn/images/partner/mirae.webp', website: 'https://mafc.com.vn' },
  { name: 'HDBank', img: 'https://media-frontend.vbee.vn/images/partner/hd-bank.webp', website: 'https://hdbank.com.vn' },
  { name: 'Viettel', img: 'https://media-frontend.vbee.vn/images/partner/viettel.webp', website: 'https://viettel.vn' },
  { name: 'Mobifone', img: 'https://media-frontend.vbee.vn/images/partner/mobifone.webp', website: 'https://mobifone.vn' },
  { name: 'Gtel', img: 'https://media-frontend.vbee.vn/images/partner/gtel.webp', website: 'https://gtel.com.vn' },
  { name: 'Shopee', img: 'https://media-frontend.vbee.vn/images/partner/shopee.webp', website: 'https://shopee.vn' },
  { name: 'Sendo', img: 'https://media-frontend.vbee.vn/images/partner/sendo.webp', website: 'https://sendo.vn' },
  { name: 'Vietnamnet', img: 'https://media-frontend.vbee.vn/images/partner/viet-nam-net.webp', website: 'https://vietnamnet.vn' },
  { name: 'Người Đưa Tin', img: 'https://media-frontend.vbee.vn/images/partner/nguoi-dua-tin.webp', website: 'https://nguoiduatin.vn' },
  { name: 'Nhịp Cầu Đầu Tư', img: 'https://media-frontend.vbee.vn/images/partner/nhip-cau-dau-tu.webp', website: 'https://nhipcaudautu.vn' },
  { name: 'Tuổi Trẻ', img: 'https://media-frontend.vbee.vn/images/partner/tuoi-tre.webp', website: 'https://tuoitre.vn' },
]

/**
 * Hàng 2 (Di chuyển ngược chiều lại)
 */
const PARTNER_ROW_2 = [
  { name: 'Việt Báo', img: 'https://media-frontend.vbee.vn/images/partner/viet-bao.webp', website: 'https://vietbao.vn' },
  { name: 'Dân Trí', img: 'https://media-frontend.vbee.vn/images/partner/dan-tri.webp', website: 'https://dantri.com.vn' },
  { name: 'SAVIS', img: 'https://media-frontend.vbee.vn/images/partner/savis.webp', website: 'https://savis.vn' },
  { name: 'SMARTNet', img: 'https://media-frontend.vbee.vn/images/partner/smartnet.webp', website: 'https://smartnetvn.com.vn' },
  { name: 'Tinh Vân Group', img: 'https://media-frontend.vbee.vn/images/partner/tinh-van.webp', website: 'https://tinhvan.com' },
  { name: 'Base.vn', img: 'https://media-frontend.vbee.vn/images/partner/base.webp', website: 'https://base.vn' },
  { name: 'Beatvn', img: 'https://media-frontend.vbee.vn/images/partner/beat-vn.webp', website: 'https://beat.vn' },
  { name: 'Vie Channel', img: 'https://media-frontend.vbee.vn/images/partner/vie.webp', website: 'https://viechannel.vn' },
  { name: 'King News', img: 'https://media-frontend.vbee.vn/images/partner/king-news.webp', website: 'https://kingnews.vn' },
  { name: 'VTV', img: 'https://media-frontend.vbee.vn/images/partner/vtv.webp', website: 'https://vtv.vn' },
  { name: 'BRT', img: 'https://media-frontend.vbee.vn/images/partner/brt.webp', website: 'http://brt.vn' },
  { name: 'Gia Lai', img: 'https://media-frontend.vbee.vn/images/partner/gia-lai.webp', website: 'https://gialaitv.vn' },
  { name: 'Bộ Thông Tin & Truyền Thông', img: 'https://media-frontend.vbee.vn/images/partner/bo-thong-tin-va-truyen-thong.webp', website: 'https://mic.gov.vn' },
  { name: 'Hà Tĩnh', img: 'https://media-frontend.vbee.vn/images/partner/ha-tinh.webp', website: 'https://hatinhtv.vn' },
  { name: 'Cổng Thông Tin Điện Tử', img: 'https://media-frontend.vbee.vn/images/partner/cong-thong-tin-dien-tu.webp', website: 'https://chinhphu.vn' },
  { name: 'California Fitness', img: 'https://media-frontend.vbee.vn/images/partner/california.webp', website: 'https://cali.vn' },
  { name: 'Rainmaker', img: 'https://media-frontend.vbee.vn/images/partner/rainmaker.webp', website: 'https://rainmaker.com' },
  { name: 'Bộ Xây Dựng', img: 'https://media-frontend.vbee.vn/images/partner/bo-xay-dung.webp', website: 'https://moc.gov.vn' },
]

interface TrustedByBrandMarqueeProps {
  title?: string
  subtitle?: string
}

/**
 * Component TrustedByBrandMarquee theo đúng chuẩn HTML/CSS và WebP CDN của cấu trúc user cung cấp:
 * - 2 hàng logo chuyển động ngược chiều mượt mà vô tận (--slider-length: 36)
 * - Grayscale tự nhiên, hover sáng nguyên bản
 * - Hai đầu fade gradient trắng/kem hòa quyện trang khách
 * - Không gây lag/tải lại DOM
 */
export const TrustedByBrandMarquee: React.FC<TrustedByBrandMarqueeProps> = ({
  title = 'Được tin tưởng và đánh giá cao bởi',
  subtitle = '300+ đối tác, doanh nghiệp & tổ chức câu lạc bộ',
}) => {
  // Nhân đôi để loop vô tận mượt mà
  const row1Doubled = [...PARTNER_ROW_1, ...PARTNER_ROW_1]
  const row2Doubled = [...PARTNER_ROW_2, ...PARTNER_ROW_2]

  return (
    <section className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16 my-6 overflow-hidden">
      {/* Tiêu đề & Phụ đề */}
      <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12 space-y-2 sm:space-y-3">
        <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs sm:text-base font-semibold text-slate-600">
            {subtitle}
          </p>
        )}
      </div>

      {/* Styled Slider Container chuẩn xác theo CSS của template */}
      <div className="relative w-full overflow-hidden select-none">
        {/* Gradient fade che mờ 2 bên mép */}
        <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-36 bg-gradient-to-r from-orange-50/95 via-orange-50/60 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-36 bg-gradient-to-l from-orange-50/95 via-orange-50/60 to-transparent z-10 pointer-events-none" />

        <style>{`
          @keyframes slideTrackRevert {
            0% {
              transform: translateX(-50%);
            }
            100% {
              transform: translateX(0%);
            }
          }
          @keyframes slideTrackNormal {
            0% {
              transform: translateX(0%);
            }
            100% {
              transform: translateX(-50%);
            }
          }
          .partner-slider-track-revert {
            display: flex;
            width: max-content;
            animation: slideTrackRevert 45s linear infinite;
            will-change: transform;
          }
          .partner-slider-track-normal {
            display: flex;
            width: max-content;
            animation: slideTrackNormal 45s linear infinite;
            will-change: transform;
          }
          .partner-logo-grayscale {
            filter: grayscale(100%);
            opacity: 0.65;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .partner-logo-grayscale:hover {
            filter: grayscale(0%);
            opacity: 1;
            transform: scale(1.08);
          }
        `}</style>

        <div className="partner-slider-wrapper space-y-4 sm:space-y-6">
          {/* HÀNG 1: slideTrackRevert */}
          <div className="overflow-hidden py-1">
            <div className="partner-slider-track-revert">
              {row1Doubled.map((partner, index) => (
                <div key={`row1-${partner.name}-${index}`} className="flex items-center justify-center w-[120px] md:w-[160px] p-1 sm:p-3 px-3 lg:px-6">
                  <a
                    href={partner.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Truy cập website ${partner.name}`}
                    className="partner-logo-grayscale flex items-center justify-center cursor-pointer focus:outline-none"
                  >
                    <span className="inline-block">
                      <img
                        src={partner.img}
                        alt={partner.name}
                        title={partner.name}
                        height="80"
                        width="200"
                        decoding="async"
                        loading="lazy"
                        className="max-h-[36px] sm:max-h-[44px] w-auto object-contain"
                      />
                    </span>
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* HÀNG 2: slideTrackNormal */}
          <div className="overflow-hidden py-1">
            <div className="partner-slider-track-normal">
              {row2Doubled.map((partner, index) => (
                <div key={`row2-${partner.name}-${index}`} className="flex items-center justify-center w-[120px] md:w-[160px] p-1 sm:p-3 px-3 lg:px-6">
                  <a
                    href={partner.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Truy cập website ${partner.name}`}
                    className="partner-logo-grayscale flex items-center justify-center cursor-pointer focus:outline-none"
                  >
                    <span className="inline-block">
                      <img
                        src={partner.img}
                        alt={partner.name}
                        title={partner.name}
                        height="80"
                        width="200"
                        decoding="async"
                        loading="lazy"
                        className="max-h-[36px] sm:max-h-[44px] w-auto object-contain"
                      />
                    </span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default TrustedByBrandMarquee
