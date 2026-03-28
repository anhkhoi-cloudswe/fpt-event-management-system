package utils

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

type nestedTimePayload struct {
	ProcessedAt *time.Time `json:"processedAt"`
}

type jsonTimePayload struct {
	CreatedAt time.Time         `json:"createdAt"`
	Nested    nestedTimePayload `json:"nested"`
}

func TestMarshalVietnamJSON_ConvertsUTCToVN_13xx(t *testing.T) {
	utc := time.Date(2026, 3, 28, 6, 15, 0, 0, time.UTC)
	payload := jsonTimePayload{
		CreatedAt: utc,
		Nested: nestedTimePayload{
			ProcessedAt: &utc,
		},
	}

	b, err := MarshalVietnamJSON(payload)
	if err != nil {
		t.Fatalf("MarshalVietnamJSON() error = %v", err)
	}

	jsonStr := string(b)
	if !strings.Contains(jsonStr, `"createdAt":"2026-03-28T13:15:00+07:00"`) {
		t.Fatalf("expected createdAt in VN timezone (13:15), got: %s", jsonStr)
	}
	if !strings.Contains(jsonStr, `"processedAt":"2026-03-28T13:15:00+07:00"`) {
		t.Fatalf("expected processedAt in VN timezone (13:15), got: %s", jsonStr)
	}
}

func TestMarshalVietnamJSON_ConvertsUTCToVN_14xx(t *testing.T) {
	payload := map[string]interface{}{
		"updatedAt": time.Date(2026, 3, 28, 7, 45, 0, 0, time.UTC),
	}

	b, err := MarshalVietnamJSON(payload)
	if err != nil {
		t.Fatalf("MarshalVietnamJSON() error = %v", err)
	}

	var out map[string]string
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	got := out["updatedAt"]
	want := "2026-03-28T14:45:00+07:00"
	if got != want {
		t.Fatalf("updatedAt = %q, want %q", got, want)
	}
}
