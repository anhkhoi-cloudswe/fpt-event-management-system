package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/email"
	"github.com/fpt-event-services/common/logger"
	ticketpdf "github.com/fpt-event-services/common/pdf"
	"github.com/fpt-event-services/common/qrcode"
	"github.com/fpt-event-services/common/utils"
)

// ============================================================
// Notification Internal Handler - APIs nội bộ cho Notification Service
//
// Phase 6: Tách notification (email/PDF/QR) thành service riêng
//
// Các API nội bộ:
//   1. POST /internal/notify/email      → Gửi email generic (OTP, thông báo)
//   2. POST /internal/notify/ticket-pdf → Sinh PDF + QR + gửi email vé điện tử
//
// Security: Kiểm tra header X-Internal-Call = "true"
// ============================================================

// NotificationHandler xử lý notification requests
type NotificationHandler struct {
	emailService *email.EmailService
	logger       *logger.Logger
}

// NewNotificationHandler tạo handler cho Notification Service
func NewNotificationHandler() *NotificationHandler {
	return &NotificationHandler{
		emailService: email.NewEmailService(nil),
		logger:       logger.Default(),
	}
}

// ============================================================
// REQUEST/RESPONSE DTOs
// ============================================================

// SendEmailRequest - Request cho POST /internal/notify/email
type SendEmailRequest struct {
	To      string `json:"to"`      // Email recipient
	Subject string `json:"subject"` // Email subject
	// Type determines which email template to use
	// Values: "otp", "generic"
	Type string `json:"type"`
	// OTP-specific fields
	OTP     string `json:"otp,omitempty"`
	Purpose string `json:"purpose,omitempty"` // "register", "forgot_password"
	// Generic email fields
	HTMLBody string `json:"htmlBody,omitempty"`
}

// TicketPDFRequest - Request cho POST /internal/notify/ticket-pdf
// Gửi email vé điện tử kèm PDF attachment
type TicketPDFRequest struct {
	// Single ticket mode
	SingleTicket *SingleTicketData `json:"singleTicket,omitempty"`
	// Multiple tickets mode
	MultipleTickets *MultipleTicketsData `json:"multipleTickets,omitempty"`
}

// RefundNotifyRequest - Request cho POST /internal/notify/refund
// 1 user + 1 event = 1 email aggregate
type RefundNotifyRequest struct {
	UserEmail   string `json:"userEmail"`
	UserName    string `json:"userName"`
	EventName   string `json:"eventName"`
	TotalAmount string `json:"totalAmount"`
	TicketIDs   []int  `json:"ticketIds"`
}

// SingleTicketData - Data cho 1 vé
type SingleTicketData struct {
	TicketID         int    `json:"ticketId"`
	TicketCode       string `json:"ticketCode"`
	UserEmail        string `json:"userEmail"`
	UserName         string `json:"userName"`
	EventTitle       string `json:"eventTitle"`
	EventDate        string `json:"eventDate"` // RFC3339 format
	EndTime          string `json:"endTime"`   // RFC3339 format
	VenueName        string `json:"venueName"`
	VenueAddress     string `json:"venueAddress"`
	AreaName         string `json:"areaName"`
	SeatRow          string `json:"seatRow"`
	SeatNumber       string `json:"seatNumber"`
	CategoryName     string `json:"categoryName"`
	Price            string `json:"price"`
	TotalAmount      string `json:"totalAmount"`
	StartTime        string `json:"startTime"`
	PaymentMethod    string `json:"paymentMethod"`
	MapURL           string `json:"mapUrl"`
	TicketIDs        string `json:"ticketIds"`
	TicketTypes      string `json:"ticketTypes"`
	SeatCodes        string `json:"seatCodes"`
	CategoryTicketID int    `json:"categoryTicketId"`
	OrganizerName    string `json:"organizerName"`
	OrganizerEmail   string `json:"organizerEmail"`
}

// MultipleTicketsData - Data cho nhiều vé
type MultipleTicketsData struct {
	UserEmail      string          `json:"userEmail"`
	UserName       string          `json:"userName"`
	EventTitle     string          `json:"eventTitle"`
	EventDate      string          `json:"eventDate"` // RFC3339 format
	EndTime        string          `json:"endTime"`   // RFC3339 format
	VenueName      string          `json:"venueName"`
	VenueAddress   string          `json:"venueAddress"`
	SeatList       string          `json:"seatList"`
	TotalAmount    string          `json:"totalAmount"`
	GoogleMapsURL  string          `json:"googleMapsUrl"`
	OrganizerName  string          `json:"organizerName"`
	OrganizerEmail string          `json:"organizerEmail"`
	Tickets        []TicketPDFItem `json:"tickets"`
}

// TicketPDFItem - Thông tin 1 vé trong nhóm nhiều vé
type TicketPDFItem struct {
	TicketID     int    `json:"ticketId"`
	TicketCode   string `json:"ticketCode"`
	EventDate    string `json:"eventDate"` // RFC3339
	VenueName    string `json:"venueName"`
	AreaName     string `json:"areaName"`
	VenueAddress string `json:"venueAddress"`
	SeatRow      string `json:"seatRow"`
	SeatNumber   string `json:"seatNumber"`
	CategoryName string `json:"categoryName"`
	Price        string `json:"price"`
	UserName     string `json:"userName"`
	UserEmail    string `json:"userEmail"`
	EventName    string `json:"eventName"`
}

// ============================================================
// 1. HandleSendEmail - POST /internal/notify/email
//    Gửi email generic (OTP, thông báo)
// ============================================================

func (h *NotificationHandler) HandleSendEmail(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isNotifyInternalCall(request) {
		return createNotifyResponse(http.StatusForbidden, map[string]interface{}{"success": false, "error": "internal only"})
	}

	var req SendEmailRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "invalid request body"})
	}

	if req.To == "" {
		return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "recipient email required"})
	}

	var err error
	switch req.Type {
	case "otp":
		if req.OTP == "" || req.Purpose == "" {
			return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "otp and purpose required for OTP email"})
		}
		err = h.emailService.SendOTPEmail(req.To, req.OTP, req.Purpose)
	case "generic":
		if req.HTMLBody == "" {
			return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "htmlBody required for generic email"})
		}
		err = h.emailService.Send(email.EmailMessage{
			To:       []string{req.To},
			Subject:  req.Subject,
			HTMLBody: req.HTMLBody,
		})
	default:
		return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": fmt.Sprintf("unknown email type: %s", req.Type)})
	}

	if err != nil {
		h.logger.Warn("[NOTIFICATION] Failed to send email to %s: %v", req.To, err)
		return createNotifyResponse(http.StatusInternalServerError, map[string]interface{}{"success": false, "error": "failed to send email"})
	}

	h.logger.Info("[NOTIFICATION] ✅ Email sent: type=%s, to=%s", req.Type, req.To)
	return createNotifyResponse(http.StatusOK, map[string]interface{}{"success": true})
}

// ============================================================
// 2. HandleSendTicketPDF - POST /internal/notify/ticket-pdf
//    Sinh PDF + QR Code + Gửi email vé điện tử
// ============================================================

func (h *NotificationHandler) HandleSendTicketPDF(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isNotifyInternalCall(request) {
		return createNotifyResponse(http.StatusForbidden, map[string]interface{}{"success": false, "error": "internal only"})
	}

	var req TicketPDFRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		h.logger.Warn("[NOTIFICATION] Failed to parse ticket-pdf request: %v", err)
		return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "invalid request body"})
	}

	// Log entry point và validate email trước khi xử lý
	if req.SingleTicket != nil {
		h.logger.Info(fmt.Sprintf("[NOTIFY] 📧 Nhận yêu cầu gửi vé cho Email: %s (ticketId=%d)", req.SingleTicket.UserEmail, req.SingleTicket.TicketID))
		if req.SingleTicket.UserEmail == "" {
			h.logger.Warn("[ERROR] Email recipient is empty, skipping send")
			return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "email recipient is empty"})
		}
		return h.handleSingleTicketPDF(req.SingleTicket)
	}

	if req.MultipleTickets != nil {
		h.logger.Info(fmt.Sprintf("[NOTIFY] 📧 Nhận yêu cầu gửi %d vé cho Email: %s", len(req.MultipleTickets.Tickets), req.MultipleTickets.UserEmail))
		if req.MultipleTickets.UserEmail == "" {
			h.logger.Warn("[ERROR] Email recipient is empty, skipping send")
			return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "email recipient is empty"})
		}
		return h.handleMultipleTicketsPDF(req.MultipleTickets)
	}

	return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "either singleTicket or multipleTickets required"})
}

// handleSingleTicketPDF - Sinh 1 PDF + QR + gửi email
func (h *NotificationHandler) handleSingleTicketPDF(data *SingleTicketData) (events.APIGatewayProxyResponse, error) {
	// Step 1: Generate QR Code
	qrBase64, err := qrcode.GenerateTicketQRBase64(data.TicketID, 300)
	if err != nil {
		h.logger.Warn("[NOTIFICATION] Failed to generate QR for ticket %d: %v", data.TicketID, err)
		return createNotifyResponse(http.StatusInternalServerError, map[string]interface{}{"success": false, "error": "failed to generate QR code"})
	}

	// Step 2: Generate QR PNG bytes for PDF
	qrPngBytes, err := qrcode.GenerateTicketQRPngBytes(data.TicketID, 300)
	if err != nil {
		h.logger.Warn("[NOTIFICATION] Failed to generate QR PNG for ticket %d: %v", data.TicketID, err)
		return createNotifyResponse(http.StatusInternalServerError, map[string]interface{}{"success": false, "error": "failed to generate QR PNG"})
	}

	// Step 3: Parse event date
	eventDate, err := time.Parse(time.RFC3339, data.EventDate)
	if err != nil {
		eventDate = time.Now()
	}
	eventDate = utils.ToVietnamTime(eventDate)

	eventEndTime, err := time.Parse(time.RFC3339, data.EndTime)
	if err != nil {
		eventEndTime = time.Time{}
	}
	if !eventEndTime.IsZero() {
		eventEndTime = utils.ToVietnamTime(eventEndTime)
	}

	startTimeRFC3339 := eventDate.Format(time.RFC3339)
	endTimeRFC3339 := ""
	if !eventEndTime.IsZero() {
		endTimeRFC3339 = eventEndTime.Format(time.RFC3339)
	}

	// Step 4: Generate PDF
	pdfBytes, err := ticketpdf.GenerateTicketPDF(ticketpdf.TicketPDFData{
		TicketCode:     data.TicketCode,
		EventName:      data.EventTitle,
		EventDate:      eventDate,
		EndTime:        eventEndTime,
		VenueName:      data.VenueName,
		AreaName:       data.AreaName,
		Address:        data.VenueAddress,
		SeatRow:        data.SeatRow,
		SeatNumber:     data.SeatNumber,
		CategoryName:   data.CategoryName,
		Price:          data.Price,
		UserName:       data.UserName,
		UserEmail:      data.UserEmail,
		QRCodePngBytes: qrPngBytes,
	})
	if err != nil {
		h.logger.Warn("[NOTIFICATION] Failed to generate PDF for ticket %d: %v", data.TicketID, err)
		return createNotifyResponse(http.StatusInternalServerError, map[string]interface{}{"success": false, "error": "failed to generate PDF"})
	}

	// Step 5: Send email with PDF
	h.logger.Info(fmt.Sprintf("[NOTIFY] 📧 Đang gửi vé #%d tới email %s...", data.TicketID, data.UserEmail))
	emailData := email.TicketEmailData{
		UserEmail:      data.UserEmail,
		UserName:       data.UserName,
		EventTitle:     data.EventTitle,
		TicketIDs:      data.TicketIDs,
		TicketTypes:    data.TicketTypes,
		SeatCodes:      data.SeatCodes,
		VenueName:      data.VenueName,
		VenueAddress:   data.VenueAddress,
		AreaName:       data.AreaName,
		MapURL:         data.MapURL,
		TotalAmount:    data.TotalAmount,
		StartTime:      startTimeRFC3339,
		EndTime:        endTimeRFC3339,
		QRCodeBase64:   qrBase64,
		PaymentMethod:  data.PaymentMethod,
		PDFAttachment:  pdfBytes,
		PDFFilename:    fmt.Sprintf("ticket_%s.pdf", data.TicketCode),
		OrganizerName:  data.OrganizerName, // Add organizer info
		OrganizerEmail: data.OrganizerEmail,
	}

	if err := h.emailService.SendTicketEmail(emailData); err != nil {
		h.logger.Warn("[SES_ERROR] Failed to send Purchase email to %s with 1 tickets: %v", data.UserEmail, err)
		h.logger.Warn("[NOTIFICATION] Failed to send ticket email for ticket %d: %v", data.TicketID, err)
		return createNotifyResponse(http.StatusInternalServerError, map[string]interface{}{"success": false, "error": "failed to send email"})
	}

	h.logger.Info("[SES_RESULT] Success: Sent Purchase email to %s with 1 tickets", data.UserEmail)
	h.logger.Info(fmt.Sprintf("[NOTIFY] ✅ Email sent successfully → vé #%d tới %s", data.TicketID, data.UserEmail))
	return createNotifyResponse(http.StatusOK, map[string]interface{}{"success": true, "ticketId": data.TicketID})
}

// handleMultipleTicketsPDF - Sinh nhiều PDF + QR + gửi 1 email
func (h *NotificationHandler) handleMultipleTicketsPDF(data *MultipleTicketsData) (events.APIGatewayProxyResponse, error) {
	var pdfAttachments []email.PDFAttachment

	eventEndTime, err := time.Parse(time.RFC3339, data.EndTime)
	if err != nil {
		eventEndTime = time.Time{}
	}
	if !eventEndTime.IsZero() {
		eventEndTime = utils.ToVietnamTime(eventEndTime)
	}

	multipleStartTime, err := time.Parse(time.RFC3339, data.EventDate)
	if err != nil {
		multipleStartTime = time.Now()
	}
	multipleStartTime = utils.ToVietnamTime(multipleStartTime)

	multipleStartTimeRFC3339 := multipleStartTime.Format(time.RFC3339)
	multipleEndTimeRFC3339 := ""
	if !eventEndTime.IsZero() {
		multipleEndTimeRFC3339 = eventEndTime.Format(time.RFC3339)
	}

	for _, ticket := range data.Tickets {
		// Generate QR PNG bytes
		qrPngBytes, err := qrcode.GenerateTicketQRPngBytes(ticket.TicketID, 300)
		if err != nil {
			h.logger.Warn("[NOTIFICATION] Failed to generate QR for ticket %d: %v", ticket.TicketID, err)
			continue
		}

		// Parse event date
		eventDate, err := time.Parse(time.RFC3339, ticket.EventDate)
		if err != nil {
			eventDate = time.Now()
		}
		eventDate = utils.ToVietnamTime(eventDate)

		// Generate PDF
		pdfBytes, err := ticketpdf.GenerateTicketPDF(ticketpdf.TicketPDFData{
			TicketCode:     ticket.TicketCode,
			EventName:      ticket.EventName,
			EventDate:      eventDate,
			EndTime:        eventEndTime,
			VenueName:      ticket.VenueName,
			AreaName:       ticket.AreaName,
			Address:        ticket.VenueAddress,
			SeatRow:        ticket.SeatRow,
			SeatNumber:     ticket.SeatNumber,
			CategoryName:   ticket.CategoryName,
			Price:          ticket.Price,
			UserName:       ticket.UserName,
			UserEmail:      ticket.UserEmail,
			QRCodePngBytes: qrPngBytes,
		})
		if err != nil {
			h.logger.Warn("[NOTIFICATION] Failed to generate PDF for ticket %d: %v", ticket.TicketID, err)
			continue
		}

		pdfAttachments = append(pdfAttachments, email.PDFAttachment{
			Filename: fmt.Sprintf("ticket_%s.pdf", ticket.TicketCode),
			Data:     pdfBytes,
		})
	}

	// Send combined email
	h.logger.Info(fmt.Sprintf("[NOTIFY] 📧 Đang gửi %d vé tới email %s...", len(data.Tickets), data.UserEmail))
	emailData := email.MultipleTicketsEmailData{
		UserEmail:      data.UserEmail,
		UserName:       data.UserName,
		EventTitle:     data.EventTitle,
		EventDate:      multipleStartTimeRFC3339,
		EndTime:        multipleEndTimeRFC3339,
		VenueName:      data.VenueName,
		VenueAddress:   data.VenueAddress,
		TicketCount:    len(data.Tickets),
		SeatList:       data.SeatList,
		TotalAmount:    data.TotalAmount,
		GoogleMapsURL:  data.GoogleMapsURL,
		OrganizerName:  data.OrganizerName,
		OrganizerEmail: data.OrganizerEmail,
		PDFAttachments: pdfAttachments,
	}

	if err := h.emailService.SendMultipleTicketsEmail(emailData); err != nil {
		h.logger.Warn("[SES_ERROR] Failed to send Purchase email to %s with %d tickets: %v", data.UserEmail, len(data.Tickets), err)
		h.logger.Warn("[NOTIFICATION] Failed to send multiple tickets email: %v", err)
		return createNotifyResponse(http.StatusInternalServerError, map[string]interface{}{"success": false, "error": "failed to send email"})
	}

	h.logger.Info("[SES_RESULT] Success: Sent Purchase email to %s with %d tickets", data.UserEmail, len(data.Tickets))
	h.logger.Info(fmt.Sprintf("[NOTIFY] ✅ Email sent successfully → %d vé tới %s", len(data.Tickets), data.UserEmail))
	return createNotifyResponse(http.StatusOK, map[string]interface{}{"success": true, "ticketCount": len(data.Tickets)})
}

// ============================================================
// 3. HandleSendTickets - POST /internal/notify/send-tickets
//    Ticket-service chuyển full payload sang notification-service.
//    Notification-service chịu trách nhiệm 100% việc gửi email/PDF.
// ============================================================

// SendTicketsNotifyRequest payload từ ticket-lambda
type SendTicketsNotifyRequest struct {
	TicketIDs       []int                `json:"ticketIds,omitempty"`
	SingleTicket    *SingleTicketData    `json:"singleTicket,omitempty"`
	MultipleTickets *MultipleTicketsData `json:"multipleTickets,omitempty"`
}

func (h *NotificationHandler) HandleSendTickets(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isNotifyInternalCall(request) {
		return createNotifyResponse(http.StatusForbidden, map[string]interface{}{"success": false, "error": "internal only"})
	}

	var req SendTicketsNotifyRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		h.logger.Warn("[NOTIFICATION] Không parse được send-tickets request: %v", err)
		return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "invalid request body"})
	}

	if req.SingleTicket == nil && req.MultipleTickets == nil {
		h.logger.Warn("[NOTIFICATION] send-tickets: missing singleTicket/multipleTickets payload")
		return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "singleTicket or multipleTickets payload is required"})
	}

	if req.SingleTicket != nil {
		h.logger.Info("[NOTIFY] ✅ send-tickets received single ticket payload for %s (ticketId=%d)", req.SingleTicket.UserEmail, req.SingleTicket.TicketID)
		resp, err := h.handleSingleTicketPDF(req.SingleTicket)
		if err != nil {
			return resp, err
		}
		h.logger.Info("[SES_RESULT] Success: Sent Purchase email to %s with 1 tickets", req.SingleTicket.UserEmail)
		return resp, nil
	}

	if req.MultipleTickets == nil {
		return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "multipleTickets payload is required for batch send"})
	}

	h.logger.Info("[NOTIFY] ✅ send-tickets received multiple tickets payload for %s (count=%d)", req.MultipleTickets.UserEmail, len(req.MultipleTickets.Tickets))

	resp, err := h.handleMultipleTicketsPDF(req.MultipleTickets)
	if err != nil {
		h.logger.Warn("[SES_ERROR] Failed to send Purchase email to %s with %d tickets: %v", req.MultipleTickets.UserEmail, len(req.MultipleTickets.Tickets), err)
		return resp, err
	}

	h.logger.Info("[SES_RESULT] Success: Sent Purchase email to %s with %d tickets", req.MultipleTickets.UserEmail, len(req.MultipleTickets.Tickets))
	return resp, nil
}

// HandleRefundEmail - POST /internal/notify/refund
// Gửi 1 email aggregate cho 1 user + 1 event khi hủy sự kiện.
func (h *NotificationHandler) HandleRefundEmail(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isNotifyInternalCall(request) {
		return createNotifyResponse(http.StatusForbidden, map[string]interface{}{"success": false, "error": "internal only"})
	}

	var req RefundNotifyRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "invalid request body"})
	}

	if req.UserEmail == "" || req.EventName == "" || req.TotalAmount == "" || len(req.TicketIDs) == 0 {
		return createNotifyResponse(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "userEmail, eventName, totalAmount, ticketIds are required"})
	}

	ticketIDs := make([]string, 0, len(req.TicketIDs))
	for _, id := range req.TicketIDs {
		ticketIDs = append(ticketIDs, fmt.Sprintf("%d", id))
	}

	htmlBody := fmt.Sprintf(
		`<p>Sự kiện <b>%s</b> của bạn đã bị hủy. Chúng tôi đã hoàn lại tổng cộng <b>%s VND</b> cho các vé có mã: [%s]. Số tiền đã được cộng vào ví ảo của bạn.</p><p>Chúng tôi thật sự xin lỗi vì sự bất tiện này!</p>`,
		req.EventName,
		req.TotalAmount,
		strings.Join(ticketIDs, ", "),
	)

	err := h.emailService.Send(email.EmailMessage{
		To:       []string{req.UserEmail},
		Subject:  "[FPT Event] Sự kiện đã bị hủy - Hoàn tiền vé",
		HTMLBody: htmlBody,
	})
	if err != nil {
		h.logger.Warn("[SES_ERROR] Failed to send Refund email to %s with %d tickets: %v", req.UserEmail, len(req.TicketIDs), err)
		return createNotifyResponse(http.StatusInternalServerError, map[string]interface{}{"success": false, "error": "failed to send refund email"})
	}

	h.logger.Info("[SES_RESULT] Success: Sent Refund email to %s with %d tickets", req.UserEmail, len(req.TicketIDs))
	return createNotifyResponse(http.StatusOK, map[string]interface{}{"success": true})
}

// ============================================================
// HELPERS
// ============================================================

func isNotifyInternalCall(request events.APIGatewayProxyRequest) bool {
	return utils.IsValidInternalToken(request.Headers)
}

func createNotifyResponse(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
	body, err := utils.MarshalVietnamJSON(data)
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       `{"success":false,"error":"failed to serialize response"}`,
		}, nil
	}

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    map[string]string{"Content-Type": "application/json;charset=UTF-8"},
		Body:       string(body),
	}, nil
}
