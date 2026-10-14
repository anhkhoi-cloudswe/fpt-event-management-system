import React, { useState, useEffect } from 'react'
import { LumaMobileCollage } from './LumaMobileCollage'

/**
 * Danh sách poster sự kiện có hình ảnh thực tế phong cách Luma.com
 */
const EVENT_POSTER_POOL = [
  {
    id: 1,
    title: 'FPT AI & Tech Hackathon 2026',
    image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 2,
    title: 'F-Camp Gala & Sunset Acoustic',
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 3,
    title: 'FPT University Career Day 2026',
    image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 4,
    title: 'Vovinam Championship Final Cup',
    image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 5,
    title: 'Design & Creative Media Showcase',
    image: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 6,
    title: 'Startup & Business Pitching Arena',
    image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 7,
    title: 'FPT Esports Championship Valorant',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 8,
    title: 'Global Cultural Exchange Festival',
    image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 9,
    title: 'Robotics & Drone Racing Arena',
    image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 10,
    title: 'TEDx FPT University Talkshow',
    image: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 11,
    title: 'Festival & Music Light Show',
    image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=500&q=80',
  }
]

interface LumaFloatingCardsProps {
  view?: 'desktop' | 'mobile' | 'both'
}

/**
 * LumaFloatingCards
 * Layout thẻ sự kiện lơ lửng phong cách Luma.com:
 * - Desktop: Phân bổ dàn trải đều đặn tự nhiên 2 bên cánh màn hình laptop, chân ảnh mờ êm dịu tệp màu nền website
 * - Mobile: Bố cục 5 hình so le tỉ lệ chuẩn (hàng sau 3 ảnh, hàng trước 2 ảnh không đè lên nhau, thấy trọn vẹn cả 5 ảnh)
 */
export const LumaFloatingCards: React.FC<LumaFloatingCardsProps> = ({ view = 'both' }) => {
  const [cards, setCards] = useState(EVENT_POSTER_POOL)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // Xáo trộn ngẫu nhiên các thẻ mỗi lần tải trang để giao diện luôn tươi mới
    const shuffled = [...EVENT_POSTER_POOL].sort(() => 0.5 - Math.random())
    setCards(shuffled)

    const timer = setTimeout(() => {
      setIsLoaded(true)
    }, 550)

    return () => clearTimeout(timer)
  }, [])

  // Vị trí phân bổ 10 poster chuẩn phong cách Luma trải dàn 2 bên cánh, kích thước đan xen Lớn / Vừa / Nhỏ sinh động (giữ trung tâm thoáng đãng không che chữ)
  const desktopCards = [
    // 1. Phía trên bên trái (Size Vừa - Robot)
    {
      className: 'top-6 left-[8%] lg:left-[9%] w-28 h-28 lg:w-32 lg:h-32 z-0',
      delay: '0.65s',
      anim: 'lumaFloat2',
      duration: '7.0s',
      animDelay: '-1.5s',
    },
    // 2. Mạn trái trên ngoài cùng (Size Nhỏ - Hội trường)
    {
      className: 'top-[26%] left-[1.5%] lg:left-[2%] w-24 h-24 lg:w-28 lg:h-28 z-0',
      delay: '0.7s',
      anim: 'lumaFloat3',
      duration: '6.2s',
      animDelay: '-3.0s',
    },
    // 3. Mạn trái giữa (Size Lớn - Phòng làm việc hiện đại: Nổi bật, không chạm text, xa ảnh 2)
    {
      className: 'top-[44%] left-[5%] lg:left-[6%] w-32 h-32 lg:w-36 lg:h-36 z-10',
      delay: '0.75s',
      anim: 'lumaFloat4',
      duration: '6.8s',
      animDelay: '-2.2s',
    },
    // 4. Mạn trái dưới ngoài cùng (Size Nhỏ - Micro sân khấu)
    {
      className: 'bottom-[9%] left-[1.5%] lg:left-[2%] w-24 h-24 lg:w-28 lg:h-28 z-0',
      delay: '0.8s',
      anim: 'lumaFloat1',
      duration: '7.2s',
      animDelay: '-4.0s',
    },
    // 5. Chân dưới bên trái nhô lên (Size Vừa - Pháo sáng sân khấu)
    {
      className: '-bottom-6 left-[17%] lg:left-[19%] w-28 h-28 lg:w-32 lg:h-32 z-0',
      delay: '0.85s',
      anim: 'lumaFloat2',
      duration: '5.8s',
      animDelay: '-1.0s',
    },
    // 6. Phía trên bên phải (Size Nhỏ - Cử tạ thể thao)
    {
      className: 'top-8 right-[8%] lg:right-[9%] w-24 h-24 lg:w-28 lg:h-28 z-0',
      delay: '0.65s',
      anim: 'lumaFloat3',
      duration: '6.6s',
      animDelay: '-2.5s',
    },
    // 7. Mạn phải trên ngoài cùng (Size Lớn - Nghệ thuật cọ vẽ sáng tạo)
    {
      className: 'top-[22%] right-[1.5%] lg:right-[2%] w-32 h-32 lg:w-36 lg:h-36 z-0',
      delay: '0.7s',
      anim: 'lumaFloat4',
      duration: '7.4s',
      animDelay: '-0.5s',
    },
    // 8. Mạn phải giữa (Size Vừa - Esports giả lập đua xe)
    {
      className: 'top-[46%] right-[6%] lg:right-[7%] w-28 h-28 lg:w-32 lg:h-32 z-10',
      delay: '0.75s',
      anim: 'lumaFloat1',
      duration: '6.0s',
      animDelay: '-3.5s',
    },
    // 9. Mạn phải dưới ngoài cùng (Size Lớn - Khán phòng hội trường)
    {
      className: 'bottom-[7%] right-[1.5%] lg:right-[2%] w-32 h-32 lg:w-36 lg:h-36 z-10',
      delay: '0.8s',
      anim: 'lumaFloat2',
      duration: '7.1s',
      animDelay: '-1.8s',
    },
    // 10. Chân dưới bên phải nhô lên (Size Vừa - Khuôn viên trường)
    {
      className: '-bottom-6 right-[17%] lg:right-[19%] w-28 h-28 lg:w-32 lg:h-32 z-0',
      delay: '0.85s',
      anim: 'lumaFloat3',
      duration: '6.4s',
      animDelay: '-4.2s',
    },
  ]

  const showDesktop = view === 'desktop' || view === 'both'
  const showMobile = view === 'mobile' || view === 'both'

  return (
    <>
      {/* ==================== DESKTOP FLOATING CARDS (Trải dàn đều 2 bên cánh như Luma Laptop) ==================== */}
      {showDesktop && (
        <div className="hidden md:block absolute inset-0 pointer-events-none select-none z-0 overflow-hidden">
          {/* Keyframe animation lơ lửng bồng bềnh tự nhiên */}
          <style>{`
            @keyframes lumaFloat1 {
              0%, 100% {
                transform: translateY(0px);
              }
              50% {
                transform: translateY(-8px);
              }
            }
            @keyframes lumaFloat2 {
              0%, 100% {
                transform: translateY(0px);
              }
              50% {
                transform: translateY(8px);
              }
            }
            @keyframes lumaFloat3 {
              0%, 100% {
                transform: translateY(0px);
              }
              50% {
                transform: translateY(-6px);
              }
            }
            @keyframes lumaFloat4 {
              0%, 100% {
                transform: translateY(0px);
              }
              50% {
                transform: translateY(7px);
              }
            }
            @keyframes mobileFloat1 {
              0%, 100% {
                transform: translateY(0px);
              }
              50% {
                transform: translateY(-4px);
              }
            }
            @keyframes mobileFloat2 {
              0%, 100% {
                transform: translateY(0px);
              }
              50% {
                transform: translateY(4px);
              }
            }
          `}</style>

          {desktopCards.map((pos, idx) => {
            const card = cards[idx % cards.length]
            return (
              <div
                key={`${card.id}-${idx}`}
                className={`absolute ${pos.className} transition-all duration-1000 ease-out transform ${
                  isLoaded
                    ? 'opacity-95 scale-100 translate-y-0'
                    : 'opacity-0 scale-90 translate-y-12'
                } pointer-events-none select-none`}
                style={{
                  transitionDelay: pos.delay,
                }}
              >
                {/* Thẻ bên trong giữ đúng phong cách hình 2 bo cong 24px, viền trắng, shadow và animation floating */}
                <div
                  className="w-full h-full rounded-[24px] overflow-hidden border-[3px] border-white shadow-[0_12px_32px_rgba(0,0,0,0.12)] bg-white pointer-events-none select-none"
                  style={{
                    animation: isLoaded
                      ? `${pos.anim} ${pos.duration} ease-in-out infinite ${pos.animDelay}`
                      : 'none',
                  }}
                >
                  {/* Ảnh poster thực tế sắc nét bo cong sang trọng - Hoàn toàn không thể click hay kéo tab mới */}
                  <img
                    src={card.image}
                    alt=""
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    onContextMenu={(e) => e.preventDefault()}
                    className="w-full h-full object-cover pointer-events-none select-none"
                    style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitUserDrag: 'none' as any }}
                    loading="lazy"
                  />
                </div>
              </div>
            )
          })}

          {/* Dải gradient mờ tệp màu cam sữa tự nhiên ở chân hero desktop (không lộ mép ảnh dưới) */}
          <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-orange-50 via-orange-50/80 to-transparent pointer-events-none z-10" />
        </div>
      )}

      {/* ==================== MOBILE CARDS COLLAGE (Bố trí chuẩn xác 100% theo spec Luma 552x400) ==================== */}
      {showMobile && (
        <div className="md:hidden w-full max-w-[552px] mx-auto mt-4 pointer-events-none select-none">
          <LumaMobileCollage items={cards} isLoaded={isLoaded} />
        </div>
      )}
    </>
  )
}




