package repository

import (
	"math"
	"testing"
	"time"
)

// calculateProratedUpgrade calculates the upgrade credit and amount to pay
func calculateProratedUpgrade(targetPrice, oldPrice int64, oldEndDate, now time.Time) (daysRemaining int, proratedCredit, amountToPay int64) {
	daysRemaining = int(math.Ceil(oldEndDate.Sub(now).Hours() / 24.0))
	if daysRemaining > 30 {
		daysRemaining = 30
	}
	if daysRemaining < 0 {
		daysRemaining = 0
	}
	if daysRemaining > 0 && oldPrice > 0 {
		if daysRemaining >= 30 {
			proratedCredit = oldPrice
		} else {
			proratedCredit = (oldPrice * int64(daysRemaining)) / 30
		}
		if proratedCredit > oldPrice {
			proratedCredit = oldPrice
		}
	}
	amountToPay = targetPrice - proratedCredit
	if amountToPay < 0 {
		amountToPay = 0
	}
	return daysRemaining, proratedCredit, amountToPay
}

func TestSubscriptionProration_UpgradeImmediateDay0(t *testing.T) {
	now := time.Now()
	// Giả sử endDate được tạo là 30 ngày sau, cộng thêm 200ms do độ lệch clock hoặc network
	oldEndDate := now.Add(30*24*time.Hour + 200*time.Millisecond)

	oldPrice := int64(299000)   // PRO
	targetPrice := int64(1000000) // BUSINESS

	days, credit, netPay := calculateProratedUpgrade(targetPrice, oldPrice, oldEndDate, now)

	if days != 30 {
		t.Fatalf("Kỳ vọng daysRemaining bị chặn ở 30 ngày, nhận: %d", days)
	}
	if credit != 299000 {
		t.Fatalf("Kỳ vọng khấu trừ 100%% gói PRO (299.000đ), nhận: %d", credit)
	}
	if netPay != 701000 {
		t.Fatalf("Kỳ vọng số tiền thực trả là 701.000đ (1tr - 299k), nhận: %d", netPay)
	}
	if oldPrice+netPay != targetPrice {
		t.Fatalf("Tổng tiền user bỏ ra phải đúng 1.000.000đ, nhưng là: %d", oldPrice+netPay)
	}
}

func TestSubscriptionProration_ClockSkew31DaysBugFixed(t *testing.T) {
	now := time.Now()
	// Giả lập case gây bug cũ: endDate lớn hơn 30 ngày tròn (dẫn đến 31 ngày khi ceil)
	oldEndDate := now.Add(30*24*time.Hour + 2*time.Hour)

	oldPrice := int64(299000)
	targetPrice := int64(1000000)

	days, credit, netPay := calculateProratedUpgrade(targetPrice, oldPrice, oldEndDate, now)

	if days > 30 {
		t.Fatalf("daysRemaining không được vượt quá 30 ngày: nhận %d", days)
	}
	if credit > oldPrice {
		t.Fatalf("Khấu trừ credit (%d) không được vượt quá số tiền gói cũ (%d)", credit, oldPrice)
	}
	if netPay == 691034 {
		t.Fatalf("LỖI CŨ: netPay vẫn ra 691.034đ do tính 31 ngày!")
	}
	if netPay != 701000 {
		t.Fatalf("netPay phải là 701.000đ, nhận %d", netPay)
	}
}

func TestSubscriptionProration_MidCycle20DaysRemaining(t *testing.T) {
	now := time.Now()
	oldEndDate := now.Add(20 * 24 * time.Hour)

	oldPrice := int64(299000)
	targetPrice := int64(1000000)

	days, credit, netPay := calculateProratedUpgrade(targetPrice, oldPrice, oldEndDate, now)

	if days != 20 {
		t.Fatalf("Kỳ vọng 20 ngày, nhận %d", days)
	}
	expectedCredit := (int64(299000) * 20) / 30 // 199333
	if credit != expectedCredit {
		t.Fatalf("Kỳ vọng credit %d, nhận %d", expectedCredit, credit)
	}
	if netPay != targetPrice-expectedCredit { // 800667
		t.Fatalf("Kỳ vọng netPay %d, nhận %d", targetPrice-expectedCredit, netPay)
	}
}
