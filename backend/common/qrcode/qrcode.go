package qrcode

import (
	"encoding/base64"
	"fmt"

	"github.com/skip2/go-qrcode"
)

// QRCodeUtil - Generate QR codes for tickets
// KHỚP VỚI Java utils/QRCodeUtil.java
// ============================================================

// GenerateQRCodeBase64 generates QR code as Base64 string (PNG format)
// KHỚP VỚI Java: QRCodeUtil.generateQRCodeBase64(text, width, height)
//
// Parameters:
//   - text: Content to encode (ticketId, URL, JSON...)
//   - size: QR code size (pixels) - both width and height
//
// Returns:
//   - Full data URI: "data:image/png;base64,iVBORw0KGgo..."
//   - Can be used directly in HTML: <img src="{result}" />
//   - Frontend can display without adding prefix
//
// Example:
//
//	qrDataURI, _ := GenerateQRCodeBase64("123", 300)
//	html := fmt.Sprintf("<img src='%s' />", qrDataURI)
func GenerateQRCodeBase64(text string, size int) (string, error) {
	pngBytes, err := GenerateQRCodePngBytes(text, size)
	if err != nil {
		return "", err
	}

	// Return full data URI for direct HTML/frontend usage
	base64Str := base64.StdEncoding.EncodeToString(pngBytes)
	return fmt.Sprintf("data:image/png;base64,%s", base64Str), nil
}

// GenerateQRCodePngBytes generates QR code as PNG byte array
// KHỚP VỚI Java: QRCodeUtil.generateQRCodePngBytes(text, width, height)
//
// Parameters:
//   - text: Content to encode
//   - size: QR code size (pixels)
//
// Returns:
//   - PNG image bytes
//   - Can be saved to file or uploaded to cloud storage
func GenerateQRCodePngBytes(text string, size int) ([]byte, error) {
	// Generate QR code with Medium error correction (15% recovery)
	// KHỚP VỚI Java ZXing default settings
	qr, err := qrcode.New(text, qrcode.Medium)
	if err != nil {
		return nil, fmt.Errorf("failed to generate QR code: %w", err)
	}

	// Write to PNG bytes
	pngBytes, err := qr.PNG(size)
	if err != nil {
		return nil, fmt.Errorf("failed to encode QR to PNG: %w", err)
	}

	return pngBytes, nil
}

// GenerateTicketQRBase64 generates QR code for ticket (wrapper method)
// KHỚP VỚI Java: QRCodeUtil.generateTicketQrBase64(ticketId, width, height)
//
// QR code contains only ticketId for check-in/check-out
//
// Parameters:
//   - ticketId: Ticket ID from database
//   - size: QR code size (standard: 300px, large: 500px, small: 150px)
//
// Returns:
//   - Base64 encoded PNG image
//
// Use case:
//   - User buys ticket -> receives email with QR code
//   - At event gate -> scan QR -> get ticketId
//   - Backend queries Ticket table -> validates
//   - Updates status = CHECKED_IN
//
// Example:
//
//	qrBase64, _ := GenerateTicketQRBase64(123, 300)
//	// QR contains: "123"
func GenerateTicketQRBase64(ticketId int, size int) (string, error) {
	text := fmt.Sprintf("%d", ticketId)
	return GenerateQRCodeBase64(text, size)
}

// GenerateTicketQRPngBytes generates QR code for ticket as PNG bytes
// KHỚP VỚI Java: QRCodeUtil.generateTicketQrPngBytes(ticketId, width, height)
//
// Same as GenerateTicketQRBase64 but returns bytes
// Use when you need to save QR code to file
func GenerateTicketQRPngBytes(ticketId int, size int) ([]byte, error) {
	text := fmt.Sprintf("%d", ticketId)
	return GenerateQRCodePngBytes(text, size)
}

// ============================================================
// NOTES:
//
// QR CODE SIZES:
// - Standard: 300x300 pixels (for email, mobile scan)
// - Large: 500x500 pixels (for printing, poster)
// - Small: 150x150 pixels (for thumbnail)
//
// SECURITY:
// - QR only contains ticketId (public info)
// - Backend validates ticket via database
// - Do NOT embed sensitive data (password, token...)
// - Consider adding timestamp to prevent replay attacks in production
//
// EMAIL FLOW:
// 1. User completes payment
// 2. Generate QR: GenerateTicketQRBase64(ticketId, 300)
// 3. Embed in email HTML: <img src="data:image/png;base64,{qrBase64}" />
// 4. Send email with QR code
// 5. User opens email and sees QR code
//
// CHECK-IN FLOW:
// 1. User arrives at event gate
// 2. Staff scans QR code with mobile app
// 3. App reads ticketId (e.g., "123")
// 4. Call API: POST /api/checkin { ticketId: 123 }
// 5. Backend checks Ticket.status
// 6. Update status = CHECKED_IN
// 7. Return success -> open gate
//
// LIBRARY:
// - go-qrcode: https://github.com/skip2/go-qrcode
// - Pure Go implementation (no CGO required)
// - Compatible with standard QR code readers
// - Error correction level Medium (15% recovery)
// ============================================================
