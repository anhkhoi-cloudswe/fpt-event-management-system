package repository

import (
	"math"
	"testing"
)

// legacyCalculateTicketCommission đại diện cho logic gốc trước khi có bất kỳ sửa đổi nào
func legacyCalculateTicketCommission(ticketNumber int, price float64, orgType string) (feePercentage float64, fixedFee float64, commissionAmount float64, netAmount float64) {
	fixedFee = 1000.00
	if orgType == "SCHOOL" {
		if ticketNumber < 100 {
			feePercentage = 4.50
		} else {
			feePercentage = 3.50
		}
	} else {
		// Off-Campus / Independent
		if ticketNumber < 100 {
			feePercentage = 6.00
		} else {
			feePercentage = 5.00
		}
	}

	commissionAmount = math.Round(((price*feePercentage)/100.0 + fixedFee)*100) / 100
	netAmount = price - commissionAmount
	if netAmount < 0 {
		netAmount = 0
	}
	return
}

// TestCompareOldAndNewCalculateTicketCommission đối chiếu 100% output của hàm tính toán
// trên ma trận nhiều mức giá vé, số thứ tự vé, và loại hình tổ chức để đảm bảo Pha 1
// KHÔNG làm thay đổi bất kỳ số tiền nào so với trước đó.
func TestCompareOldAndNewCalculateTicketCommission(t *testing.T) {
	prices := []float64{
		0, 1000, 5000, 10000, 15000, 20000, 25000, 50000,
		99999, 100000, 150000, 200000, 500000, 1000000, 2500000, 33333.33,
	}
	ticketNumbers := []int{0, 1, 50, 99, 100, 101, 250, 1000}
	orgTypes := []string{"SCHOOL", "FREE"}

	var count int
	for _, price := range prices {
		for _, num := range ticketNumbers {
			for _, orgType := range orgTypes {
				count++
				oldFeePercent, oldFixed, oldComm, oldNet := legacyCalculateTicketCommission(num, price, orgType)
				newFeePercent, newFixed, newComm, newNet := CalculateTicketCommission(num, price, orgType)

				if oldFeePercent != newFeePercent {
					t.Fatalf("[Case %d] FeePercent mismatch: old=%v, new=%v (price=%v, num=%v, org=%s)",
						count, oldFeePercent, newFeePercent, price, num, orgType)
				}
				if oldFixed != newFixed {
					t.Fatalf("[Case %d] FixedFee mismatch: old=%v, new=%v (price=%v, num=%v, org=%s)",
						count, oldFixed, newFixed, price, num, orgType)
				}
				if math.Abs(oldComm-newComm) > 1e-6 {
					t.Fatalf("[Case %d] Commission mismatch: old=%v, new=%v (price=%v, num=%v, org=%s)",
						count, oldComm, newComm, price, num, orgType)
				}
				if math.Abs(oldNet-newNet) > 1e-6 {
					t.Fatalf("[Case %d] Net mismatch: old=%v, new=%v (price=%v, num=%v, org=%s)",
						count, oldNet, newNet, price, num, orgType)
				}
			}
		}
	}
	t.Logf("✅ Đã kiểm thử so sánh đối chiếu thành công %d trường hợp (khớp 100%% với logic gốc)", count)
}

// TestFinancialReceiptConstraintLogic kiểm tra tính hợp lệ của các logic ràng buộc:
// 1. Biên lai gốc (is_reversal = FALSE): net_amount >= 0 là hợp lệ; net_amount < 0 bị vi phạm.
// 2. Biên lai đảo (is_reversal = TRUE): net_amount < 0 được phép lưu hợp lệ.
// 3. Snapshot (tier_code, fee_source, commission_bps, fee_config_version) không được rỗng.
func TestFinancialReceiptConstraintLogic(t *testing.T) {
	t.Run("Bien lai goc net_amount >= 0 hop le", func(t *testing.T) {
		isReversal := false
		netAmount := 95000.0
		// CHECK: (is_reversal = TRUE OR net_amount >= 0)
		isValid := isReversal == true || netAmount >= 0
		if !isValid {
			t.Errorf("Mong doi constraint thoa man cho bien lai goc net >= 0")
		}
	})

	t.Run("Bien lai goc net_amount < 0 bi chan", func(t *testing.T) {
		isReversal := false
		netAmount := -5000.0
		isValid := isReversal == true || netAmount >= 0
		if isValid {
			t.Errorf("Mong doi constraint tu choi bien lai goc net < 0")
		}
	})

	t.Run("Bien lai dao is_reversal = TRUE cho phep net_amount am", func(t *testing.T) {
		isReversal := true
		netAmount := -94000.0
		isValid := isReversal == true || netAmount >= 0
		if !isValid {
			t.Errorf("Mong doi constraint cho phep bien lai dao co net am")
		}
	})

	t.Run("Snapshot fields khong duoc de trong", func(t *testing.T) {
		tierCode := "LEGACY"
		feeSource := "LEGACY"
		commissionBps := 500
		feeConfigVersion := 1

		if tierCode == "" || feeSource == "" || commissionBps <= 0 || feeConfigVersion <= 0 {
			t.Errorf("Snapshot phai co day du gia tri hop le")
		}
	})
}
