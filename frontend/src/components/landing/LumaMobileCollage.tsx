import React, { useRef, useState, useEffect } from 'react'

export interface CollageItem {
  id: string | number
  image: string
  title: string
}

export interface CollageCardConfig {
  left: number
  top: number
  width: number
  height: number
  zIndex: number
}

// Bảng tọa độ thiết kế gốc 552px x 400px theo yêu cầu
export const DEFAULT_COLLAGE_COORDS: CollageCardConfig[] = [
  // Ảnh 1: phía sau bên trái, thấp hơn ảnh 2, tràn mép trái (-35px)
  { left: -35, top: 70, width: 182, height: 188, zIndex: 1 },
  // Ảnh 2: phía sau ở giữa, cao nhất
  { left: 169, top: 10, width: 210, height: 210, zIndex: 2 },
  // Ảnh 3: phía sau bên phải, tràn mép phải
  { left: 410, top: 35, width: 190, height: 235, zIndex: 1 },
  // Ảnh 4: phía trước, ở dưới bên trái (chồng lên 1 phần ảnh 1 và góc trái ảnh 2)
  { left: 50, top: 195, width: 195, height: 195, zIndex: 3 },
  // Ảnh 5: phía trước, ở dưới bên phải, cao hơn ảnh 4 một chút
  { left: 310, top: 165, width: 220, height: 220, zIndex: 4 },
]

interface LumaMobileCollageProps {
  items: CollageItem[]
  className?: string
  isLoaded?: boolean
}

const DESIGN_WIDTH = 552
const DESIGN_HEIGHT = 400

/**
 * LumaMobileCollage
 * Bố cục 5 ảnh chồng lớp chuẩn xác theo tọa độ và tỷ lệ gốc 552px x 400px.
 * Tự động scale đồng bộ khi màn hình < 552px mà không bao giờ vỡ bố cục hay gây scroll ngang.
 * Animation xuất hiện so le (staggered) từng ảnh mượt mà khi load.
 */
export const LumaMobileCollage: React.FC<LumaMobileCollageProps> = ({
  items,
  className = '',
  isLoaded = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [internalLoaded, setInternalLoaded] = useState(false)

  useEffect(() => {
    // Kích hoạt animation so le mượt mà ngay sau mount
    const timer = setTimeout(() => {
      setInternalLoaded(true)
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        // Lấy chiều rộng khả dụng của container cha
        const availableWidth = containerRef.current.offsetWidth
        if (availableWidth < DESIGN_WIDTH && availableWidth > 0) {
          setScale(availableWidth / DESIGN_WIDTH)
        } else {
          setScale(1)
        }
      }
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  // Chiều cao tương ứng sau khi scale để wrapper ôm sát, không tạo khoảng trắng dư
  const scaledHeight = DESIGN_HEIGHT * scale
  const hasLoaded = isLoaded && internalLoaded

  // Thời gian trễ (delay) cho từng ảnh theo thứ tự xuất hiện tự nhiên từ sau ra trước:
  // Ảnh 2 (giữa, cao nhất) -> Ảnh 1 (trái sau) -> Ảnh 3 (phải sau) -> Ảnh 4 (trái trước) -> Ảnh 5 (phải trước)
  const STAGGER_DELAYS = [200, 100, 320, 460, 580]

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-w-[552px] mx-auto overflow-hidden select-none pointer-events-none ${className}`}
      style={{
        height: `${scaledHeight}px`,
      }}
    >
      {/* Khung gốc cố định 552px x 400px, thu phóng bằng transform scale */}
      <div
        className="absolute top-0 left-0"
        style={{
          width: `${DESIGN_WIDTH}px`,
          height: `${DESIGN_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {DEFAULT_COLLAGE_COORDS.map((config, index) => {
          const item = items[index % items.length]
          if (!item) return null

          const delay = STAGGER_DELAYS[index] ?? (index * 120)

          return (
            <div
              key={item.id ?? index}
              className="absolute pointer-events-none select-none transition-all duration-700 ease-out"
              style={{
                left: `${config.left}px`,
                top: `${config.top}px`,
                width: `${config.width}px`,
                height: `${config.height}px`,
                zIndex: config.zIndex,
                // Khung ngoài bo góc 24px, padding 8px
                borderRadius: '24px',
                padding: '8px',
                // Khung màu xám trắng bán trong suốt với viền trắng mảnh opacity thấp
                backgroundColor: 'rgba(255, 255, 255, 0.45)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.75)',
                // Bóng đổ mềm tạo chiều sâu thị giác
                boxShadow:
                  config.zIndex >= 3
                    ? '0 20px 35px -8px rgba(0, 0, 0, 0.16), 0 8px 16px -6px rgba(0, 0, 0, 0.1)'
                    : '0 12px 25px -6px rgba(0, 0, 0, 0.12), 0 4px 10px -4px rgba(0, 0, 0, 0.08)',
                // Animation xuất hiện từng ảnh so le
                opacity: hasLoaded ? 1 : 0,
                transform: hasLoaded ? 'translateY(0) scale(1)' : 'translateY(28px) scale(0.92)',
                transitionDelay: `${delay}ms`,
              }}
            >
              {/* Ảnh bên trong bo góc 17px, lấp đầy bằng object-fit: cover */}
              <div
                className="w-full h-full overflow-hidden"
                style={{
                  borderRadius: '17px',
                }}
              >
                <img
                  src={item.image}
                  alt={item.title || `Ảnh sự kiện ${index + 1}`}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full h-full object-cover select-none pointer-events-none"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    // @ts-ignore
                    WebkitUserDrag: 'none',
                  }}
                  loading="lazy"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
