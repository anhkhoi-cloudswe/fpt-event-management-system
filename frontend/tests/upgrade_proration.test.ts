import { describe, it, expect } from 'vitest'

interface SubscriptionTier {
  tierCode: string
  name: string
  priceVnd: number
}

interface CurrentSubscription {
  tierCode: string
  tierName?: string
  daysRemaining?: number
  endDate?: string
}

function calculateUpgradeCost(
  targetTier: SubscriptionTier,
  currentSub: CurrentSubscription | null,
  tiers: SubscriptionTier[],
  nowMs: number = Date.now()
) {
  if (!currentSub || currentSub.tierCode === 'FREE' || currentSub.tierCode === 'SCHOOL_ORGANIZER') {
    return {
      originalPrice: targetTier.priceVnd,
      proratedCredit: 0,
      netPay: targetTier.priceVnd,
      daysRemaining: 0,
    }
  }

  const currentTierData = tiers.find((t) => t.tierCode === currentSub.tierCode)
  const currentPrice = currentTierData?.priceVnd || 0

  let daysRemaining = currentSub.daysRemaining ?? 0
  if (currentSub.endDate) {
    const msDiff = new Date(currentSub.endDate).getTime() - nowMs
    if (msDiff > 0) {
      // Capped at 30 days to prevent sub-second rounding / clock skew from exceeding full cycle duration
      daysRemaining = Math.min(30, Math.ceil(msDiff / (1000 * 60 * 60 * 24)))
    } else {
      daysRemaining = 0
    }
  } else {
    daysRemaining = Math.min(30, Math.max(0, daysRemaining))
  }

  if (daysRemaining > 0 && currentPrice > 0) {
    // Nếu còn đủ 30 ngày (vừa mua ngay trong ngày đầu / chu kỳ mới): Khấu trừ trọn vẹn 100% gói cũ
    let credit = daysRemaining >= 30 ? currentPrice : Math.floor((currentPrice * daysRemaining) / 30)
    if (credit > currentPrice) {
      credit = currentPrice
    }
    const net = Math.max(0, targetTier.priceVnd - credit)
    return {
      originalPrice: targetTier.priceVnd,
      proratedCredit: credit,
      netPay: net,
      daysRemaining,
    }
  }

  return {
    originalPrice: targetTier.priceVnd,
    proratedCredit: 0,
    netPay: targetTier.priceVnd,
    daysRemaining: 0,
  }
}

describe('Upgrade Proration Logic (Prorated Upgrade Calculator)', () => {
  const tiers: SubscriptionTier[] = [
    { tierCode: 'FREE', name: 'Gói Free', priceVnd: 0 },
    { tierCode: 'PRO', name: 'Gói Pro', priceVnd: 299000 },
    { tierCode: 'BUSINESS', name: 'Gói Doanh Nghiệp', priceVnd: 1000000 },
  ]

  const businessTier = tiers[2]

  it('1. User vừa mua PRO (299k) và nâng cấp ngay lập tức sang BUSINESS (1 triệu): Khấu trừ 100% PRO, thực trả đúng 701k', () => {
    const now = Date.now()
    // Giả lập endDate là đúng 30 ngày + 500ms (lệch clock/mili-giây giữa client & server)
    const endDate = new Date(now + 30 * 24 * 60 * 60 * 1000 + 500).toISOString()

    const currentSub: CurrentSubscription = {
      tierCode: 'PRO',
      tierName: 'Gói Pro',
      daysRemaining: 30,
      endDate: endDate,
    }

    const result = calculateUpgradeCost(businessTier, currentSub, tiers, now)

    // Khấu trừ trọn vẹn 299.000đ của gói PRO
    expect(result.daysRemaining).toBe(30)
    expect(result.proratedCredit).toBe(299000)
    expect(result.netPay).toBe(701000)
    // Tổng số tiền user chi: 299.000 + 701.000 = đúng 1.000.000đ!
    expect(299000 + result.netPay).toBe(1000000)
  })

  it('2. Khắc phục lỗi làm tròn 31 ngày (không bao giờ credit vượt quá giá gói cũ)', () => {
    const now = Date.now()
    // Giả lập case cũ gây ra 31 ngày: endDate lệch 1 giây
    const endDate = new Date(now + 30 * 24 * 60 * 60 * 1000 + 1000).toISOString()

    const currentSub: CurrentSubscription = {
      tierCode: 'PRO',
      daysRemaining: 31, // Backend hoặc client tính ra 31 ngày
      endDate: endDate,
    }

    const result = calculateUpgradeCost(businessTier, currentSub, tiers, now)

    // Đã được cap về tối đa 30 ngày và credit tối đa là 299.000đ (thay vì 308.966đ)
    expect(result.daysRemaining).toBe(30)
    expect(result.proratedCredit).toBe(299000)
    expect(result.netPay).toBe(701000)
    expect(result.netPay).not.toBe(691034)
  })

  it('3. User đã dùng PRO được 10 ngày (còn 20 ngày): Khấu trừ 20/30 giá trị', () => {
    const now = Date.now()
    const endDate = new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString()

    const currentSub: CurrentSubscription = {
      tierCode: 'PRO',
      daysRemaining: 20,
      endDate: endDate,
    }

    const result = calculateUpgradeCost(businessTier, currentSub, tiers, now)

    // 299.000 * 20 / 30 = 199.333đ
    expect(result.daysRemaining).toBe(20)
    expect(result.proratedCredit).toBe(199333)
    expect(result.netPay).toBe(1000000 - 199333) // 800.667đ
  })

  it('4. User nâng cấp từ FREE lên BUSINESS: Không có credit, trả nguyên giá 1 triệu', () => {
    const currentSub: CurrentSubscription = {
      tierCode: 'FREE',
      daysRemaining: 0,
    }

    const result = calculateUpgradeCost(businessTier, currentSub, tiers)

    expect(result.proratedCredit).toBe(0)
    expect(result.netPay).toBe(1000000)
  })
})
