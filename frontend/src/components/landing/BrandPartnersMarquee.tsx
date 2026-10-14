import React from 'react'
import { BrandPartnerItem } from '../../types/frontendConfig'

interface BrandPartnersMarqueeProps {
  brands: BrandPartnerItem[]
  title?: string
  subtitle?: string
}

// Bộ icon SVG chính xác cho các thương hiệu hàng đầu nếu URL ảnh bên ngoài bị lỗi hoặc chưa điền
const BRAND_SVG_ICONS: Record<string, { bg: string; color: string; svg: React.ReactNode }> = {
  TPBank: {
    bg: 'bg-purple-100 text-purple-700',
    color: '#8A2BE2',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2L2 7l10 5 10-5-10-5zm0 8L4.5 6.25 12 2.5l7.5 3.75L12 10zm-8 4l8 4 8-4v3l-8 4-8-4v-3z" />
      </svg>
    ),
  },
  MoMo: {
    bg: 'bg-pink-100 text-pink-600',
    color: '#D82D8B',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path fill="#fff" d="M7 9a2 2 0 114 0v6H9V9zm6 0a2 2 0 114 0v6h-2V9z" />
      </svg>
    ),
  },
  VietCredit: {
    bg: 'bg-teal-100 text-teal-800',
    color: '#00897B',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 10h18" stroke="#fff" strokeWidth="2" />
      </svg>
    ),
  },
  VNPAY: {
    bg: 'bg-blue-100 text-blue-700',
    color: '#005BAA',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M4 4h7v16H4V4zm9 0h7v7h-7V4zm0 9h7v7h-7v-7z" />
      </svg>
    ),
  },
  moneyveo: {
    bg: 'bg-emerald-100 text-emerald-700',
    color: '#10B981',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5zm4 4h-2v-6h2v6zm0-8h-2V7h2v2z" />
      </svg>
    ),
  },
  Sacombank: {
    bg: 'bg-blue-100 text-blue-800',
    color: '#004A99',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
      </svg>
    ),
  },
  'MIRAE ASSET': {
    bg: 'bg-orange-100 text-orange-700',
    color: '#F37021',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2L2 12h5v8h10v-8h5L12 2z" />
      </svg>
    ),
  },
  HDBank: {
    bg: 'bg-red-100 text-red-700',
    color: '#E30613',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M3 3h18v4H3V3zm0 7h18v4H3v-4zm0 7h18v4H3v-4z" />
      </svg>
    ),
  },
  Viettel: {
    bg: 'bg-red-100 text-red-600',
    color: '#EE0033',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
      </svg>
    ),
  },
  Mobifone: {
    bg: 'bg-blue-100 text-blue-600',
    color: '#0055A5',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <circle cx="8" cy="12" r="5" />
        <circle cx="16" cy="12" r="5" fill="#E30613" />
      </svg>
    ),
  },
  'Bộ Xây Dựng': {
    bg: 'bg-red-100 text-red-800',
    color: '#C62828',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <polygon points="12,2 15,8 21,9 17,14 18,20 12,17 6,20 7,14 3,9 9,8" />
      </svg>
    ),
  },
  'Việt Ba Media': {
    bg: 'bg-blue-100 text-blue-800',
    color: '#1565C0',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <polygon points="5,3 19,12 5,21" />
      </svg>
    ),
  },
  'Dân Trí': {
    bg: 'bg-blue-100 text-blue-900',
    color: '#0D47A1',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
      </svg>
    ),
  },
  SAVIS: {
    bg: 'bg-indigo-100 text-indigo-800',
    color: '#3F51B5',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <polygon points="12,2 2,7 12,12 22,7" />
        <polygon points="2,17 12,22 22,17 12,12" />
      </svg>
    ),
  },
  SMARTNet: {
    bg: 'bg-cyan-100 text-cyan-800',
    color: '#00838F',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
      </svg>
    ),
  },
  'Tinh Vân Group': {
    bg: 'bg-sky-100 text-sky-800',
    color: '#0288D1',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
      </svg>
    ),
  },
  'Base.vn': {
    bg: 'bg-slate-800 text-white',
    color: '#1a1f36',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <rect x="5" y="4" width="4" height="16" rx="2" fill="#E24A4A" />
        <rect x="11" y="2" width="4" height="20" rx="2" fill="#2E7EEA" />
        <rect x="17" y="6" width="4" height="14" rx="2" fill="#38C172" />
      </svg>
    ),
  },
  Beatvn: {
    bg: 'bg-amber-100 text-amber-700',
    color: '#FFB800',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
      </svg>
    ),
  },
  'Vie Channel': {
    bg: 'bg-purple-100 text-purple-800',
    color: '#7B1FA2',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <polygon points="5,3 19,12 5,21" />
      </svg>
    ),
  },
  'King News': {
    bg: 'bg-rose-100 text-rose-800',
    color: '#E91E63',
    svg: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1v-1h14v1z" />
      </svg>
    ),
  },
}

export const BrandPartnersMarquee: React.FC<BrandPartnersMarqueeProps> = ({
  brands,
  title = 'Được tin tưởng và đánh giá cao bởi',
  subtitle = '300+ đối tác, doanh nghiệp & tổ chức câu lạc bộ',
}) => {
  if (!brands || brands.length === 0) return null

  // Chia danh sách brands thành 2 hàng cho hiệu ứng marquee chuyển động ngược chiều
  const half = Math.ceil(brands.length / 2)
  const row1 = brands.slice(0, half)
  const row2 = brands.length > 1 ? brands.slice(half) : brands

  // Nhân bản items để lặp vô tận mượt mà không bị khựng
  const marqueeList1 = [...row1, ...row1, ...row1, ...row1]
  const marqueeList2 = [...row2, ...row2, ...row2, ...row2]

  return (
    <section className="relative w-full overflow-hidden text-slate-800 py-12 sm:py-16 my-8 rounded-[36px] bg-white/40 dark:bg-white/5 border border-white/80 dark:border-white/10 backdrop-blur-xl shadow-[0_20px_50px_rgba(249,115,22,0.06)]">
      {/* Tiêu đề & phụ đề theo đúng phong cách trang /guest */}
      <div className="relative max-w-4xl mx-auto text-center px-4 mb-8 sm:mb-12 space-y-2 sm:space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-orange-600 shadow-sm">
          <span>Đối Tác Đồng Hành</span>
        </div>
        <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs sm:text-base font-semibold text-slate-600 dark:text-slate-300">
            {subtitle}
          </p>
        )}
      </div>

      {/* Container hiệu ứng Marquee với 2 màng mờ (Fade masks) trùng màu background trang khách */}
      <div className="relative w-full space-y-4 sm:space-y-6 select-none">
        {/* Fade mask mép trái & phải */}
        <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-32 bg-gradient-to-r from-orange-50/90 via-orange-50/50 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-32 bg-gradient-to-l from-orange-50/90 via-orange-50/50 to-transparent z-10 pointer-events-none" />

        <style>{`
          @keyframes marqueeLeftToRight {
            0% {
              transform: translateX(-50%);
            }
            100% {
              transform: translateX(0%);
            }
          }
          @keyframes marqueeRightToLeft {
            0% {
              transform: translateX(0%);
            }
            100% {
              transform: translateX(-50%);
            }
          }
          .animate-marquee-ltr {
            display: flex;
            width: max-content;
            animation: marqueeLeftToRight 36s linear infinite;
          }
          .animate-marquee-rtl {
            display: flex;
            width: max-content;
            animation: marqueeRightToLeft 40s linear infinite;
          }
          .marquee-wrapper:hover .animate-marquee-ltr,
          .marquee-wrapper:hover .animate-marquee-rtl {
            animation-play-state: paused;
          }
        `}</style>

        {/* HÀNG 1: Di chuyển từ Trái sang Phải (LTR) */}
        <div className="marquee-wrapper overflow-hidden py-1">
          <div className="animate-marquee-ltr gap-4 sm:gap-6 items-center">
            {marqueeList1.map((item, index) => (
              <BrandItemCard key={`row1-${item.id}-${index}`} item={item} />
            ))}
          </div>
        </div>

        {/* HÀNG 2: Di chuyển ngược lại từ Phải sang Trái (RTL) */}
        <div className="marquee-wrapper overflow-hidden py-1">
          <div className="animate-marquee-rtl gap-4 sm:gap-6 items-center">
            {marqueeList2.map((item, index) => (
              <BrandItemCard key={`row2-${item.id}-${index}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Thẻ hiển thị một Brand item:
 * Tự động kết hợp logo ảnh ngoài + logo icon chuẩn SVG + tên thương hiệu
 * Nền kính mờ hòa quyện với background trang khách
 */
const BrandItemCard: React.FC<{ item: BrandPartnerItem }> = ({ item }) => {
  const [imgFailed, setImgFailed] = React.useState(false)
  const fallbackIcon = BRAND_SVG_ICONS[item.name]

  const content = (
    <div className="group flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-900 border border-white/90 dark:border-slate-800 hover:border-orange-500/40 shadow-xs hover:shadow-lg hover:shadow-orange-500/10 backdrop-blur-md transition-all duration-300 cursor-pointer">
      {/* 1. Ưu tiên hiển thị ảnh logo nếu có và load thành công */}
      {item.logoUrl && !imgFailed ? (
        <div className="w-8 h-8 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 border border-slate-100 shadow-xs">
          <img
            src={item.logoUrl}
            alt={item.name}
            className="w-full h-full object-contain filter group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : fallbackIcon ? (
        /* 2. Nếu không có URL hoặc ảnh ngoài lỗi: Dùng Icon SVG chuẩn của Brand */
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${fallbackIcon.bg}`}>
          {fallbackIcon.svg}
        </div>
      ) : (
        /* 3. Fallback chữ cái đầu đẹp mắt */
        <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950 text-orange-600 font-black text-xs flex items-center justify-center shrink-0 border border-orange-200">
          {item.name.charAt(0)}
        </div>
      )}

      <span className="text-sm font-black tracking-tight text-slate-800 dark:text-slate-100 group-hover:text-orange-600 transition-colors duration-200 whitespace-nowrap">
        {item.name}
      </span>
    </div>
  )

  if (item.website) {
    return (
      <a
        href={item.website}
        target="_blank"
        rel="noopener noreferrer"
        title={item.name}
        className="inline-block transform hover:-translate-y-0.5 transition-transform"
      >
        {content}
      </a>
    )
  }

  return <div className="inline-block transform hover:-translate-y-0.5 transition-transform">{content}</div>
}
