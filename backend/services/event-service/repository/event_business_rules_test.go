package repository

import "testing"

func TestApprovalAreaRulesByEventFormat(t *testing.T) {
	areaID := 12

	tests := []struct {
		name    string
		format  string
		areaID  *int
		wantErr bool
	}{
		{name: "school online approval does not need area", format: "ONLINE", areaID: nil, wantErr: false},
		{name: "school online approval ignores zero area", format: "online", areaID: nil, wantErr: false},
		{name: "onsite approval needs area", format: "ONSITE", areaID: nil, wantErr: true},
		{name: "hybrid approval needs area", format: "HYBRID", areaID: nil, wantErr: true},
		{name: "onsite approval accepts area", format: "ONSITE", areaID: &areaID, wantErr: false},
		{name: "hybrid approval accepts area", format: "HYBRID", areaID: &areaID, wantErr: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateApprovalArea(tt.format, tt.areaID)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validateApprovalArea(%q) error = %v, wantErr %v", tt.format, err, tt.wantErr)
			}
		})
	}
}

func TestEventFormatNormalizationAndValidation(t *testing.T) {
	if got := normalizeEventFormat(" hybrid "); got != "HYBRID" {
		t.Fatalf("normalizeEventFormat() = %q, want HYBRID", got)
	}
	if got := normalizeEventFormat(""); got != "ONSITE" {
		t.Fatalf("empty format default = %q, want ONSITE", got)
	}

	for _, format := range []string{"ONLINE", "ONSITE", "HYBRID", "online", " hybrid "} {
		if !isValidEventFormat(format) {
			t.Fatalf("expected %q to be valid", format)
		}
	}
	for _, format := range []string{"REMOTE", "FREE", "SCHOOL"} {
		if isValidEventFormat(format) {
			t.Fatalf("expected %q to be invalid", format)
		}
	}
}
