package repository

import (
	"database/sql"
	"testing"
	"time"

	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/event-lambda/models"
)

func TestSetEventRequestTimeFields_CreatedAtUsesVietnamTime(t *testing.T) {
	utcNow := time.Now().UTC()

	req := models.EventRequest{}
	setEventRequestTimeFields(
		&req,
		sql.NullTime{},
		sql.NullTime{},
		sql.NullTime{Time: utcNow, Valid: true},
		sql.NullTime{},
	)

	if req.CreatedAt == nil {
		t.Fatalf("expected CreatedAt to be set")
	}

	parsed, err := time.Parse(time.RFC3339, *req.CreatedAt)
	if err != nil {
		t.Fatalf("failed to parse CreatedAt: %v", err)
	}

	vnNow := utils.ToVietnamTime(utcNow)
	delta := parsed.Sub(vnNow)
	if delta < 0 {
		delta = -delta
	}

	if delta > time.Second {
		t.Fatalf("CreatedAt mismatch: got=%s want~=%s delta=%s", parsed.Format(time.RFC3339), vnNow.Format(time.RFC3339), delta)
	}

	_, parsedOffset := parsed.Zone()
	if parsedOffset != 7*60*60 {
		t.Fatalf("CreatedAt timezone offset mismatch: got=%d want=%d", parsedOffset, 7*60*60)
	}
}
