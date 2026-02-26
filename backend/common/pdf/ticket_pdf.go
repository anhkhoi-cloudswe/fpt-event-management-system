package pdf

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/jung-kurt/gofpdf"
)

// TicketPDFData chứa thông tin để tạo PDF vé
type TicketPDFData struct {
	TicketCode     string
	EventName      string
	EventDate      time.Time
	VenueName      string
	AreaName       string
	Address        string
	SeatRow        string
	SeatNumber     string
	CategoryName   string
	Price          string
	UserName       string
	UserEmail      string
	QRCodePngBytes []byte // QR code PNG bytes (không phải Base64)
}

// toUTF8 restores corrupted Vietnamese text encoding to proper UTF-8
// cleanText converts Vietnamese UTF-8 characters to ASCII equivalents
func cleanText(text string) string {
	// Vietnamese-specific character mappings (both single codepoints and composed)
	vietnameseMap := map[string]string{
		// Lowercase Vietnamese characters
		"đ": "d", "ð": "d", // U+0111, U+00F0
		"ơ": "o", // U+01A1
		"ư": "u", // U+01B0
		"ă": "a", // U+0103
		"â": "a", "á": "a", "à": "a", "ả": "a", "ã": "a", "ạ": "a",
		"ấ": "a", "ầ": "a", "ẩ": "a", "ẫ": "a", "ậ": "a",
		"ắ": "a", "ằ": "a", "ẳ": "a", "ẵ": "a", "ặ": "a",
		"é": "e", "è": "e", "ẻ": "e", "ẽ": "e", "ẹ": "e",
		"ê": "e", "ế": "e", "ề": "e", "ể": "e", "ễ": "e", "ệ": "e",
		"í": "i", "ì": "i", "ỉ": "i", "ĩ": "i", "ị": "i",
		"ó": "o", "ò": "o", "ỏ": "o", "õ": "o", "ọ": "o",
		"ô": "o", "ố": "o", "ồ": "o", "ổ": "o", "ỗ": "o", "ộ": "o",
		"ớ": "o", "ờ": "o", "ở": "o", "ỡ": "o", "ợ": "o",
		"ú": "u", "ù": "u", "ủ": "u", "ũ": "u", "ụ": "u",
		"ứ": "u", "ừ": "u", "ử": "u", "ữ": "u", "ự": "u",
		"ý": "y", "ỳ": "y", "ỷ": "y", "ỹ": "y", "ỵ": "y",

		// Uppercase Vietnamese characters
		"Đ": "D", "Ð": "D", // U+0110, U+00D0
		"Ơ": "O", // U+01A0
		"Ư": "U", // U+01AF
		"Ă": "A", // U+0102
		"Â": "A", "Á": "A", "À": "A", "Ả": "A", "Ã": "A", "Ạ": "A",
		"Ấ": "A", "Ầ": "A", "Ẩ": "A", "Ẫ": "A", "Ậ": "A",
		"Ắ": "A", "Ằ": "A", "Ẳ": "A", "Ẵ": "A", "Ặ": "A",
		"É": "E", "È": "E", "Ẻ": "E", "Ẽ": "E", "Ẹ": "E",
		"Ê": "E", "Ế": "E", "Ề": "E", "Ể": "E", "Ễ": "E", "Ệ": "E",
		"Í": "I", "Ì": "I", "Ỉ": "I", "Ĩ": "I", "Ị": "I",
		"Ó": "O", "Ò": "O", "Ỏ": "O", "Õ": "O", "Ọ": "O",
		"Ô": "O", "Ố": "O", "Ồ": "O", "Ổ": "O", "Ỗ": "O", "Ộ": "O",
		"Ớ": "O", "Ờ": "O", "Ở": "O", "Ỡ": "O", "Ợ": "O",
		"Ú": "U", "Ù": "U", "Ủ": "U", "Ũ": "U", "Ụ": "U",
		"Ứ": "U", "Ừ": "U", "Ử": "U", "Ữ": "U", "Ự": "U",
		"Ý": "Y", "Ỳ": "Y", "Ỷ": "Y", "Ỹ": "Y", "Ỵ": "Y",
	}

	result := text
	// Replace all Vietnamese characters with ASCII equivalents
	for viet, ascii := range vietnameseMap {
		result = strings.ReplaceAll(result, viet, ascii)
	}

	return result
}

// contains checks if string contains substring
func contains(str, substr string) bool {
	for i := 0; i < len(str); i++ {
		if i+len(substr) > len(str) {
			return false
		}
		match := true
		for j := 0; j < len(substr); j++ {
			if str[i+j] != substr[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

// GenerateTicketPDF tạo PDF vé điện tử với QR code
// Trả về PDF bytes có thể lưu file hoặc attach email
func GenerateTicketPDF(data TicketPDFData) ([]byte, error) {
	// Khởi tạo PDF
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.AddPage()
	pdf.SetFont("Arial", "", 12)

	// ========================================
	// QR CODE - BIG ON TOP (Xóa header "VÉ ĐIỆN TỬ - DIGITAL TICKET")
	// ========================================
	if len(data.QRCodePngBytes) > 0 {
		imgOpts := gofpdf.ImageOptions{
			ImageType: "PNG",
			ReadDpi:   false,
		}
		imgName := fmt.Sprintf("qr_%s", data.TicketCode)
		pdf.RegisterImageOptionsReader(imgName, imgOpts, bytes.NewReader(data.QRCodePngBytes))

		// QR code center, size 120x120mm (x1.5 larger)
		qrX := (210.0 - 120.0) / 2
		pdf.ImageOptions(imgName, qrX, pdf.GetY(), 120, 120, false, imgOpts, 0, "")
		pdf.Ln(122)
	}
	pdf.Ln(5)

	// ========================================
	// HORIZONTAL LINE SEPARATOR
	// ========================================
	pdf.SetDrawColor(200, 200, 200)
	pdf.SetLineWidth(0.5)
	pdf.Line(20, pdf.GetY(), 190, pdf.GetY())
	pdf.Ln(8)

	// ========================================
	// INFO SECTION - TWO BALANCED COLUMNS
	// LEFT: Event Name + Seat Details | RIGHT: Date/Time + Address
	// ========================================

	// ROW 1: Event Name (LEFT - 85mm) + Date/Time (RIGHT - 85mm)
	currentY := pdf.GetY()
	pdf.SetFont("Arial", "B", 21.6) // +20%: 18 → 21.6
	pdf.SetXY(20, currentY)
	eventName := data.EventName
	if len(eventName) > 25 {
		eventName = eventName[:22] + "..."
	}
	pdf.MultiCell(85, 9.6, eventName, "", "L", false) // +20%: 8 → 9.6

	// Right side - Event Date/Time
	pdf.SetFont("Arial", "", 16.8) // +20%: 14 → 16.8
	pdf.SetXY(115, currentY)
	pdf.CellFormat(75, 7.2, "Event Time:", "", 1, "L", false, 0, "") // +20%: 6 → 7.2
	pdf.SetFont("Arial", "B", 16.8)
	pdf.SetX(115)
	dateStr := data.EventDate.Format("January 2, 2006")
	pdf.CellFormat(75, 6, dateStr, "", 1, "L", false, 0, "") // +20%: 5 → 6
	pdf.SetX(115)
	startTime := data.EventDate.Format("3:04PM")
	endTime := data.EventDate.Add(7 * time.Hour).Format("3:04PM")
	timeStr := fmt.Sprintf("%s - %s", startTime, endTime)
	pdf.CellFormat(75, 6, timeStr, "", 1, "L", false, 0, "")
	pdf.Ln(2.4)

	// ROW 2: User Name (LEFT) + Venue Address (RIGHT)
	currentY = pdf.GetY()
	pdf.SetFont("Arial", "", 16.8) // +20%: 14 → 16.8
	pdf.SetXY(20, currentY)
	pdf.CellFormat(85, 7.2, "GUEST:", "", 1, "L", false, 0, "") // +20%: 6 → 7.2
	pdf.SetFont("Arial", "B", 19.2)                             // +20%: 16 → 19.2
	pdf.SetX(20)
	userName := data.UserName
	if len(userName) > 25 {
		userName = userName[:22] + "..."
	}
	pdf.MultiCell(85, 8.4, userName, "", "L", false) // +20%: 7 → 8.4

	// Right side - Venue Address
	pdf.SetFont("Arial", "", 16.8)
	pdf.SetXY(115, currentY)
	pdf.CellFormat(75, 7.2, "Location:", "", 1, "L", false, 0, "")
	venueInfo := data.Address
	if venueInfo == "Chua xac dinh" || venueInfo == "" {
		venueInfo = data.VenueName
	}
	// Remove diacritics and clean corrupted UTF-8 from database location
	venueInfo = cleanText(venueInfo)
	if len(venueInfo) > 40 {
		venueInfo = venueInfo[:37] + "..."
	}
	pdf.SetFont("Arial", "B", 16.8)
	pdf.SetX(115)
	pdf.MultiCell(75, 4.8, venueInfo, "", "L", false) // +20%: 4 → 4.8
	pdf.Ln(3.6)

	// ========================================
	// TICKET DETAILS - TWO COLUMNS, ALIGNED LEFT
	// ========================================
	pdf.SetFont("Arial", "", 18) // +20%: 15 → 18

	// Left column labels and values
	pdf.SetX(20)
	pdf.CellFormat(40, 10.8, "Seat row:", "", 0, "L", false, 0, "") // +20%: 9 → 10.8
	pdf.SetFont("Arial", "B", 21.6)                                 // +20%: 18 → 21.6
	pdf.CellFormat(45, 10.8, data.SeatRow, "", 1, "L", false, 0, "")

	// Left column row 2
	pdf.SetFont("Arial", "", 18)
	pdf.SetX(20)
	pdf.CellFormat(40, 10.8, "Ticket type:", "", 0, "L", false, 0, "")
	pdf.SetFont("Arial", "B", 21.6)
	pdf.CellFormat(45, 10.8, data.CategoryName, "", 1, "L", false, 0, "")

	// Left column row 3
	pdf.SetFont("Arial", "", 18)
	pdf.SetX(20)
	pdf.CellFormat(40, 10.8, "Seat number:", "", 0, "L", false, 0, "")
	pdf.SetFont("Arial", "B", 21.6)
	pdf.CellFormat(45, 10.8, data.SeatNumber, "", 1, "L", false, 0, "")

	// Left column row 4 - Price (PHÓNG TO NHẤT - +20%)
	pdf.SetFont("Arial", "", 18)
	pdf.SetX(20)
	pdf.CellFormat(40, 14.4, "Ticket price:", "", 0, "L", false, 0, "") // +20%: 12 → 14.4
	pdf.SetFont("Arial", "B", 26.4)                                     // +20%: 22 → 26.4
	priceVal := cleanText(data.Price)                                   // Clean Vietnamese characters
	// Remove standalone 'd' character from currency symbol (đ → d → remove)
	priceVal = strings.ReplaceAll(priceVal, " d ", " ")
	priceVal = strings.ReplaceAll(priceVal, " d", "")
	priceVal = strings.ReplaceAll(priceVal, "d ", "")
	priceVal = strings.TrimSpace(priceVal)
	// Ensure VND suffix
	if !contains(priceVal, "VND") {
		priceVal = priceVal + " VND"
	}
	pdf.CellFormat(45, 14.4, priceVal, "", 1, "L", false, 0, "")
	pdf.Ln(6)

	// ========================================
	// FOOTER - Ticket code & Note (+20%)
	// ========================================
	pdf.SetFont("Arial", "I", 16.2) // +20%: 13.5 → 16.2
	pdf.SetTextColor(100, 100, 100)
	pdf.CellFormat(0, 10.8, fmt.Sprintf("Ticket Code: %s", data.TicketCode), "0", 1, "C", false, 0, "") // +20%: 9 → 10.8
	pdf.Ln(3.6)                                                                                         // +20%: 3 → 3.6

	pdf.SetFont("Arial", "", 14.4)                                                                                                                      // +20%: 12 → 14.4
	pdf.MultiCell(0, 7.2, "Please bring this ticket (PDF file or image) to the event.\nScan the QR code to check in at the entrance.", "0", "C", false) // +20%: 6 → 7.2

	// ========================================
	// OUTPUT PDF
	// ========================================
	var buf bytes.Buffer
	err := pdf.Output(&buf)
	if err != nil {
		return nil, fmt.Errorf("failed to generate PDF: %w", err)
	}

	return buf.Bytes(), nil
}
