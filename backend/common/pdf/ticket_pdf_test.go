package pdf

import (
	"bytes"
	"compress/zlib"
	"io"
	"strings"
	"testing"
	"time"

	commonutils "github.com/fpt-event-services/common/utils"
)

func TestFormatEventTimeRange_UsesVietnamTime(t *testing.T) {
	vnLoc := commonutils.VietnamLocation()

	startDB := time.Date(2026, 3, 31, 2, 0, 0, 0, vnLoc)
	endDB := time.Date(2026, 3, 31, 9, 0, 0, 0, vnLoc)

	startVN := commonutils.DBTimeToVietnamTime(startDB)
	endVN := commonutils.DBTimeToVietnamTime(endDB)

	got := formatEventTimeRange(startVN, endVN, vnLoc)
	want := "09:00 - 16:00"

	if got != want {
		t.Fatalf("formatEventTimeRange() = %q, want %q", got, want)
	}
}

func TestGenerateTicketPDF_ContainsVietnamEventTime(t *testing.T) {
	vnLoc := commonutils.VietnamLocation()

	data := TicketPDFData{
		TicketCode:   "TKT_123",
		EventName:    "Timezone Test Event",
		EventDate:    time.Date(2026, 3, 31, 2, 0, 0, 0, vnLoc),
		EndTime:      time.Date(2026, 3, 31, 9, 0, 0, 0, vnLoc),
		VenueName:    "FPT Hall",
		AreaName:     "A",
		Address:      "Hoa Lac",
		SeatRow:      "A",
		SeatNumber:   "1",
		CategoryName: "VIP",
		Price:        "500.000 VND",
		UserName:     "Test User",
		UserEmail:    "test@example.com",
	}

	pdfBytes, err := GenerateTicketPDF(data)
	if err != nil {
		t.Fatalf("GenerateTicketPDF() error = %v", err)
	}

	pdfText := string(pdfBytes)
	decoded := decodeFirstPDFStream(t, pdfBytes)
	if !strings.Contains(decoded, "09:00 - 16:00") {
		t.Fatalf("expected PDF to contain Vietnam time range, decoded stream=%q raw=%q", decoded, pdfText)
	}
}

func decodeFirstPDFStream(t *testing.T, pdfBytes []byte) string {
	t.Helper()

	content := string(pdfBytes)
	streamIdx := strings.Index(content, "stream\n")
	if streamIdx < 0 {
		t.Fatalf("stream marker not found in PDF")
	}

	dataStart := streamIdx + len("stream\n")
	endIdx := strings.Index(content[dataStart:], "\nendstream")
	if endIdx < 0 {
		t.Fatalf("endstream marker not found in PDF")
	}
	dataEnd := dataStart + endIdx

	compressed := pdfBytes[dataStart:dataEnd]
	zr, err := zlib.NewReader(bytes.NewReader(compressed))
	if err != nil {
		t.Fatalf("failed to open zlib stream: %v", err)
	}
	defer zr.Close()

	decoded, err := io.ReadAll(zr)
	if err != nil {
		t.Fatalf("failed to read zlib stream: %v", err)
	}

	return string(decoded)
}
