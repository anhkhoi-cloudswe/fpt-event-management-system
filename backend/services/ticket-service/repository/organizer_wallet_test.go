package repository

import (
	"math"
	"testing"
)

func TestCalculateTicketCommission(t *testing.T) {
	tests := []struct {
		name                 string
		ticketNumber         int
		price                float64
		orgType              string
		expectedFeePercent   float64
		expectedFixedFee     float64
		expectedCommission   float64
		expectedNet          float64
	}{
		// On-Campus (SCHOOL) - Tier 1 (< 100 tickets)
		{
			name:               "School Tier 1: ticket 0 (< 100), price 100,000",
			ticketNumber:       0,
			price:              100000.0,
			orgType:            "SCHOOL",
			expectedFeePercent: 4.50,
			expectedFixedFee:   1000.0,
			expectedCommission: 4500.0 + 1000.0, // 5500
			expectedNet:        100000.0 - 5500.0, // 94500
		},
		{
			name:               "School Tier 1: ticket 99 (< 100), price 200,000",
			ticketNumber:       99,
			price:              200000.0,
			orgType:            "SCHOOL",
			expectedFeePercent: 4.50,
			expectedFixedFee:   1000.0,
			expectedCommission: 9000.0 + 1000.0, // 10000
			expectedNet:        200000.0 - 10000.0, // 190000
		},
		// On-Campus (SCHOOL) - Tier 2 (>= 100 tickets)
		{
			name:               "School Tier 2: ticket 100 (>= 100), price 100,000",
			ticketNumber:       100,
			price:              100000.0,
			orgType:            "SCHOOL",
			expectedFeePercent: 3.50,
			expectedFixedFee:   1000.0,
			expectedCommission: 3500.0 + 1000.0, // 4500
			expectedNet:        100000.0 - 4500.0, // 95500
		},
		{
			name:               "School Tier 2: ticket 250 (>= 100), price 500,000",
			ticketNumber:       250,
			price:              500000.0,
			orgType:            "SCHOOL",
			expectedFeePercent: 3.50,
			expectedFixedFee:   1000.0,
			expectedCommission: 17500.0 + 1000.0, // 18500
			expectedNet:        500000.0 - 18500.0, // 481500
		},
		// Off-Campus (FREE) - Tier 1 (< 100 tickets)
		{
			name:               "Off-Campus Tier 1: ticket 0 (< 100), price 100,000",
			ticketNumber:       0,
			price:              100000.0,
			orgType:            "FREE",
			expectedFeePercent: 6.00,
			expectedFixedFee:   1000.0,
			expectedCommission: 6000.0 + 1000.0, // 7000
			expectedNet:        100000.0 - 7000.0, // 93000
		},
		{
			name:               "Off-Campus Tier 1: ticket 99 (< 100), price 200,000",
			ticketNumber:       99,
			price:              200000.0,
			orgType:            "FREE",
			expectedFeePercent: 6.00,
			expectedFixedFee:   1000.0,
			expectedCommission: 12000.0 + 1000.0, // 13000
			expectedNet:        200000.0 - 13000.0, // 187000
		},
		// Off-Campus (FREE) - Tier 2 (>= 100 tickets)
		{
			name:               "Off-Campus Tier 2: ticket 100 (>= 100), price 100,000",
			ticketNumber:       100,
			price:              100000.0,
			orgType:            "FREE",
			expectedFeePercent: 5.00,
			expectedFixedFee:   1000.0,
			expectedCommission: 5000.0 + 1000.0, // 6000
			expectedNet:        100000.0 - 6000.0, // 94000
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			feePercent, fixedFee, commission, net := CalculateTicketCommission(tt.ticketNumber, tt.price, tt.orgType)

			if feePercent != tt.expectedFeePercent {
				t.Errorf("FeePercent = %v, expected %v", feePercent, tt.expectedFeePercent)
			}
			if fixedFee != tt.expectedFixedFee {
				t.Errorf("FixedFee = %v, expected %v", fixedFee, tt.expectedFixedFee)
			}
			if math.Abs(commission-tt.expectedCommission) > 0.01 {
				t.Errorf("Commission = %v, expected %v", commission, tt.expectedCommission)
			}
			if math.Abs(net-tt.expectedNet) > 0.01 {
				t.Errorf("Net = %v, expected %v", net, tt.expectedNet)
			}
		})
	}
}
