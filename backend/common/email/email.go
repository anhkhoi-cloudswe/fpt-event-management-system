package email

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/fpt-event-services/common/logger"
)

// ============================================================
// CONFIGURATION & SERVICE
// ============================================================

type Config struct {
	Host          string
	Port          string
	Username      string
	Password      string
	From          string
	FromName      string
	UseTLS        bool
	SkipVerify    bool
	ResendAPIKey  string
	BrevoHost     string
	BrevoPort     string
	BrevoUsername string
	BrevoPassword string
}

func DefaultConfig() *Config {
	return &Config{
		Host:          getEnv("SMTP_HOST", "smtp.gmail.com"),
		Port:          getEnv("SMTP_PORT", "587"),
		Username:      getEnv("SMTP_USERNAME", ""),
		Password:      getEnv("SMTP_PASSWORD", ""),
		From:          getEnv("EMAIL_FROM", getEnv("SMTP_FROM", "onboarding@resend.dev")),
		FromName:      getEnv("SMTP_FROM_NAME", "FPT Event System"),
		UseTLS:        getEnv("SMTP_USE_TLS", "true") == "true",
		SkipVerify:    getEnv("SMTP_SKIP_VERIFY", "false") == "true",
		ResendAPIKey:  getEnv("RESEND_API_KEY", ""),
		BrevoHost:     getEnv("BREVO_SMTP_HOST", "smtp-relay.brevo.com"),
		BrevoPort:     getEnv("BREVO_SMTP_PORT", "587"),
		BrevoUsername: getEnv("BREVO_SMTP_USERNAME", ""),
		BrevoPassword: getEnv("BREVO_SMTP_PASSWORD", ""),
	}
}

type EmailService struct {
	config    *Config
	devMode   bool
	templates map[string]*template.Template
}

func NewEmailService(config *Config) *EmailService {
	if config == nil {
		config = DefaultConfig()
	}
	hasSMTP := config.Username != "" && config.Password != ""
	hasBrevo := config.BrevoUsername != "" && config.BrevoPassword != ""
	devMode := config.ResendAPIKey == "" && !hasSMTP && !hasBrevo
	if devMode {
		logger.Default().Warn("[EMAIL] ⚠️ DEV MODE ENABLED - Emails will NOT be sent. Configure RESEND_API_KEY, BREVO, or SMTP settings.")
	}
	return &EmailService{
		config:    config,
		devMode:   devMode,
		templates: make(map[string]*template.Template),
	}
}

// ============================================================
// DATA STRUCTURES
// ============================================================

type EmailMessage struct {
	To          []string
	Subject     string
	Body        string
	HTMLBody    string
	Attachments []Attachment
}

type Attachment struct {
	Filename string
	Data     []byte
	MimeType string
}

type TicketEmailData struct {
	UserEmail      string
	UserName       string
	EventTitle     string
	TicketIDs      string
	TicketTypes    string
	SeatCodes      string
	VenueName      string
	VenueAddress   string
	AreaName       string
	MapURL         string
	TotalAmount    string
	StartTime      string // RFC3339 format
	EndTime        string // RFC3339 format (optional)
	QRCodeBase64   string
	PaymentMethod  string
	PDFAttachment  []byte
	PDFFilename    string
	OrganizerName  string
	OrganizerEmail string
}

type MultipleTicketsEmailData struct {
	UserEmail      string
	UserName       string
	EventTitle     string
	EventDate      string
	EndTime        string
	VenueName      string
	VenueAddress   string
	TicketCount    int
	SeatList       string
	TotalAmount    string
	GoogleMapsURL  string
	OrganizerName  string
	OrganizerEmail string
	PDFAttachments []PDFAttachment
}

type PDFAttachment struct {
	Filename string
	Data     []byte
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

func formatEventDateTime(startTimeISO, endTimeISO string) (string, string) {
	// ✅ WALL-CLOCK APPROACH: Extract datetime components directly from RFC3339 string
	// WITHOUT parsing through time.Time objects which apply timezone logic
	// This ensures "2026-04-01T09:00:00+07:00" displays as "01/04/2026" and "09:00"

	// Extract date from startTimeISO: "2026-04-01T09:00:00+07:00" -> "2026-04-01"
	var startDate string
	if len(startTimeISO) >= 10 {
		// Extract YYYY-MM-DD
		parts := strings.Split(startTimeISO[:10], "-")
		if len(parts) == 3 {
			// Format as DD/MM/YYYY
			startDate = parts[2] + "/" + parts[1] + "/" + parts[0]
		}
	}

	// Extract time from startTimeISO: "2026-04-01T09:00:00+07:00" -> "09:00"
	var startTimeStr string
	if len(startTimeISO) > 10 && startTimeISO[10] == 'T' {
		// Expected format: "2026-04-01T09:00:00+07:00"
		// Extract substring from T to the next timezone indicator or +
		timePartStart := 11
		timePartEnd := strings.IndexAny(startTimeISO[timePartStart:], "+-Z")
		if timePartEnd > 0 {
			timePart := startTimeISO[timePartStart : timePartStart+timePartEnd]
			// Extract HH:mm from HH:mm:ss
			if len(timePart) >= 5 {
				startTimeStr = timePart[:5]
			}
		}
	}

	// If end time is provided, extract time portion only
	endTimeStr := ""
	if endTimeISO != "" && endTimeISO != "0001-01-01T00:00:00Z" && len(endTimeISO) > 10 && endTimeISO[10] == 'T' {
		timePartStart := 11
		timePartEnd := strings.IndexAny(endTimeISO[timePartStart:], "+-Z")
		if timePartEnd > 0 {
			timePart := endTimeISO[timePartStart : timePartStart+timePartEnd]
			// Extract HH:mm from HH:mm:ss
			if len(timePart) >= 5 {
				endTimeStr = timePart[:5]
			}
		}
	}

	// Create output: "09:00 - 16:00"
	if endTimeStr != "" {
		return startDate, startTimeStr + " - " + endTimeStr
	}
	return startDate, startTimeStr
}

func formatVND(amount string) string {
	clean := ""
	for _, r := range amount {
		if r >= '0' && r <= '9' {
			clean += string(r)
		}
	}
	if len(clean) == 0 {
		return "0"
	}
	var result []rune
	for i, digit := range clean {
		if i > 0 && (len(clean)-i)%3 == 0 {
			result = append(result, '.')
		}
		result = append(result, digit)
	}
	return string(result)
}

func cleanVietnameseText(text string) string {
	replacements := map[rune]string{
		'á': "a", 'à': "a", 'ả': "a", 'ã': "a", 'ạ': "a", 'ă': "a", 'ắ': "a", 'ằ': "a", 'ẳ': "a", 'ẵ': "a", 'ặ': "a", 'â': "a", 'ấ': "a", 'ầ': "a", 'ẩ': "a", 'ẫ': "a", 'ậ': "a",
		'é': "e", 'è': "e", 'ẻ': "e", 'ẽ': "e", 'ẹ': "e", 'ê': "e", 'ế': "e", 'ề': "e", 'ể': "e", 'ễ': "e", 'ệ': "e",
		'í': "i", 'ì': "i", 'ỉ': "i", 'ĩ': "i", 'ị': "i", 'ó': "o", 'ò': "o", 'ỏ': "o", 'õ': "o", 'ọ': "o", 'ô': "o", 'ố': "o", 'ồ': "o", 'ổ': "o", 'ỗ': "o", 'ộ': "o", 'ơ': "o", 'ớ': "o", 'ờ': "o", 'ở': "o", 'ỡ': "o", 'ợ': "o",
		'ú': "u", 'ù': "u", 'ủ': "u", 'ũ': "u", 'ụ': "u", 'ư': "u", 'ứ': "u", 'ừ': "u", 'ử': "u", 'ữ': "u", 'ự': "u", 'ý': "y", 'ỳ': "y", 'ỷ': "y", 'ỹ': "y", 'ỵ': "y", 'đ': "d", 'Đ': "D",
	}
	result := make([]rune, 0, len(text))
	for _, r := range text {
		if val, ok := replacements[r]; ok {
			result = append(result, []rune(val)...)
		} else {
			result = append(result, r)
		}
	}
	return string(result)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func stripHTML(html string) string { return strings.ReplaceAll(html, "<br>", "\n") }

// ============================================================
// SENDING ENGINE
// ============================================================

type ResendAttachment struct {
	Filename    string `json:"filename"`
	Content     string `json:"content"`
	ContentType string `json:"contentType,omitempty"`
}

type ResendEmailPayload struct {
	From        string             `json:"from"`
	To          []string           `json:"to"`
	Subject     string             `json:"subject"`
	HTML        string             `json:"html"`
	Attachments []ResendAttachment `json:"attachments,omitempty"`
}

// sendViaSMTPServer sends an email through an arbitrary SMTP server using the provided credentials/host/port.
func (s *EmailService) sendViaSMTPServer(msg EmailMessage, host, port, username, password string) error {
	log := logger.Default()
	addr := fmt.Sprintf("%s:%s", host, port)

	log.Info("[EMAIL] Dialing SMTP server %s with 10s timeout...", addr)
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		log.Error("[EMAIL] ❌ SMTP Dial failed: %v", err)
		return err
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		log.Error("[EMAIL] ❌ SMTP client creation failed: %v", err)
		return err
	}
	defer client.Quit()

	// STARTTLS for port 587
	if port == "587" || s.config.UseTLS {
		log.Info("[EMAIL] Negotiating STARTTLS on %s...", host)
		tlsConfig := &tls.Config{
			ServerName:         host,
			InsecureSkipVerify: s.config.SkipVerify,
		}
		if err = client.StartTLS(tlsConfig); err != nil {
			log.Error("[EMAIL] ❌ STARTTLS negotiation failed: %v", err)
			return err
		}
	}

	if username != "" && password != "" {
		log.Info("[EMAIL] Authenticating SMTP client on %s...", host)
		auth := smtp.PlainAuth("", username, password, host)
		if err = client.Auth(auth); err != nil {
			log.Error("[EMAIL] ❌ SMTP authentication failed: %v", err)
			return err
		}
	}

	if err = client.Mail(s.config.From); err != nil {
		log.Error("[EMAIL] ❌ SMTP MAIL command failed: %v", err)
		return err
	}

	for _, to := range msg.To {
		if err = client.Rcpt(to); err != nil {
			log.Error("[EMAIL] ❌ SMTP RCPT command failed for %s: %v", to, err)
			return err
		}
	}

	wc, err := client.Data()
	if err != nil {
		log.Error("[EMAIL] ❌ SMTP DATA command failed: %v", err)
		return err
	}
	defer wc.Close()

	var body bytes.Buffer
	body.WriteString(fmt.Sprintf("From: %s <%s>\r\n", s.config.FromName, s.config.From))
	body.WriteString(fmt.Sprintf("To: %s\r\n", strings.Join(msg.To, ", ")))
	body.WriteString(fmt.Sprintf("Subject: %s\r\n", msg.Subject))
	body.WriteString("MIME-Version: 1.0\r\n")

	if msg.HTMLBody != "" {
		body.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
		body.WriteString("\r\n")
		body.WriteString(msg.HTMLBody)
	} else {
		body.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
		body.WriteString("\r\n")
		body.WriteString(msg.Body)
	}

	if _, err = body.WriteTo(wc); err != nil {
		log.Error("[EMAIL] ❌ SMTP failed to write body data: %v", err)
		return err
	}

	log.Info("[EMAIL] ✅ SMTP Send successful via %s to %v", host, msg.To)
	return nil
}

// sendViaSMTP sends via the primary SMTP host (AWS SES or generic).
func (s *EmailService) sendViaSMTP(msg EmailMessage) error {
	return s.sendViaSMTPServer(msg, s.config.Host, s.config.Port, s.config.Username, s.config.Password)
}

// sendViaBrevo sends via Brevo SMTP relay (smtp-relay.brevo.com:587).
func (s *EmailService) sendViaBrevo(msg EmailMessage) error {
	return s.sendViaSMTPServer(msg, s.config.BrevoHost, s.config.BrevoPort, s.config.BrevoUsername, s.config.BrevoPassword)
}

// sendViaResend dispatches an email using the Resend HTTP API.
func (s *EmailService) sendViaResend(msg EmailMessage) error {
	log := logger.Default()
	recipients := strings.Join(msg.To, ", ")
	log.Info("[EMAIL] 🚀 Tier 1 – Resend API: to=%s subject=%s", recipients, msg.Subject)

	from := s.config.From
	if s.config.FromName != "" {
		from = fmt.Sprintf("%s <%s>", s.config.FromName, s.config.From)
	}

	var attachments []ResendAttachment
	for _, att := range msg.Attachments {
		attachments = append(attachments, ResendAttachment{
			Filename:    att.Filename,
			Content:     base64.StdEncoding.EncodeToString(att.Data),
			ContentType: att.MimeType,
		})
	}

	payload := ResendEmailPayload{
		From:        from,
		To:          msg.To,
		Subject:     msg.Subject,
		HTML:        msg.HTMLBody,
		Attachments: attachments,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("resend marshal error: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewBuffer(payloadBytes))
	if err != nil {
		return fmt.Errorf("resend http request error: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.config.ResendAPIKey)

	httpClient := &http.Client{Timeout: 15 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("resend request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("resend api error status %d: %s", resp.StatusCode, string(respBody))
	}

	log.Info("[EMAIL] ✅ Tier 1 Resend success: to=%s response=%s", recipients, string(respBody))
	return nil
}

// Send dispatches an email through a 3-tier fallback pipeline:
//
//	Tier 1: Resend API (primary free tier)
//	Tier 2: Brevo SMTP relay (secondary free fallback)
//	Tier 3: AWS SES SMTP (paid fallback, SES sandbox bypass enabled)
func (s *EmailService) Send(msg EmailMessage) error {
	log := logger.Default()
	if s.devMode {
		log.Info("[EMAIL] 📧 DEV MODE – skipping send to %v (Subject: %s)", msg.To, msg.Subject)
		return nil
	}

	recipients := strings.Join(msg.To, ", ")
	var lastErr error

	// ── Tier 1: Resend API ──────────────────────────────────────────────────
	if s.config.ResendAPIKey != "" {
		if err := s.sendViaResend(msg); err == nil {
			return nil
		} else {
			log.Warn("[EMAIL] ⚠️ Tier 1 (Resend) failed for %s: %v — falling back to Tier 2", recipients, err)
			lastErr = err
		}
	} else {
		log.Info("[EMAIL] ℹ️ Tier 1 (Resend) skipped – RESEND_API_KEY not configured")
	}

	// ── Tier 2: Brevo SMTP ──────────────────────────────────────────────────
	if s.config.BrevoUsername != "" && s.config.BrevoPassword != "" {
		log.Info("[EMAIL] 🔄 Tier 2 – Brevo SMTP: %s:%s → %s", s.config.BrevoHost, s.config.BrevoPort, recipients)
		if err := s.sendViaBrevo(msg); err == nil {
			return nil
		} else {
			log.Warn("[EMAIL] ⚠️ Tier 2 (Brevo) failed for %s: %v — falling back to Tier 3", recipients, err)
			lastErr = err
		}
	} else {
		log.Info("[EMAIL] ℹ️ Tier 2 (Brevo) skipped – BREVO_SMTP_USERNAME/PASSWORD not configured")
	}

	// ── Tier 3: AWS SES SMTP ────────────────────────────────────────────────
	if s.config.Username != "" && s.config.Password != "" {
		log.Info("[EMAIL] 🔄 Tier 3 – AWS SES SMTP: %s:%s → %s", s.config.Host, s.config.Port, recipients)
		if err := s.sendViaSMTP(msg); err != nil {
			// Gracefully bypass SES Sandbox unverified-recipient errors
			errStr := err.Error()
			if strings.Contains(errStr, "554") && strings.Contains(errStr, "not verified") {
				log.Warn("[EMAIL] ⚠️ [SES_SANDBOX] Unverified recipient %s – bypassing error gracefully. Verify recipient in SES console to enable delivery.", recipients)
				return nil
			}
			log.Error("[EMAIL] ❌ Tier 3 (AWS SES) failed for %s: %v", recipients, err)
			lastErr = err
		} else {
			return nil
		}
	} else {
		log.Info("[EMAIL] ℹ️ Tier 3 (AWS SES) skipped – SMTP_USERNAME/PASSWORD not configured")
	}

	if lastErr != nil {
		return fmt.Errorf("all email tiers exhausted for %s – last error: %w", recipients, lastErr)
	}
	return fmt.Errorf("no email provider configured (RESEND_API_KEY, BREVO, or SMTP credentials required)")
}

// ============================================================
// TEMPLATE BUILDERS
// ============================================================

func (s *EmailService) SendTicketEmail(data TicketEmailData) error {
	log := logger.Default()
	log.Info("[EMAIL] 📋 Preparing ticket email for %s (Event: %s)", data.UserEmail, data.EventTitle)
	data.UserName, data.EventTitle, data.VenueName, data.VenueAddress = cleanVietnameseText(data.UserName), cleanVietnameseText(data.EventTitle), cleanVietnameseText(data.VenueName), cleanVietnameseText(data.VenueAddress)
	data.TotalAmount = formatVND(data.TotalAmount)
	html := s.buildTicketEmailHTML(data)
	msg := EmailMessage{To: []string{data.UserEmail}, Subject: fmt.Sprintf("[FPT Event] E-Ticket - %s", data.EventTitle), HTMLBody: html}
	if len(data.PDFAttachment) > 0 {
		msg.Attachments = []Attachment{{Filename: "ticket.pdf", Data: data.PDFAttachment, MimeType: "application/pdf"}}
		log.Info("[EMAIL] 📎 Attaching PDF (size: %d bytes)", len(data.PDFAttachment))
	}
	return s.Send(msg)
}

func (s *EmailService) buildTicketEmailHTML(data TicketEmailData) string {
	mapURL := "https://www.google.com/maps/search/?api=1&query=" + url.QueryEscape(data.VenueAddress)

	// Format event date and time
	eventDate, eventTime := formatEventDateTime(data.StartTime, data.EndTime)

	// Build organizer section if available
	organizerSection := ""
	if data.OrganizerName != "" {
		organizerSection = fmt.Sprintf(`
    <div style="margin-top: 15px;">
      <p style="font-size: 10px; color: #9ca3af; margin-bottom: 4px; text-transform: uppercase;">EVENT ORGANIZER</p>
      <p style="font-weight: 600; color: #1f2937;">%s</p>
      <p style="font-size: 13px; color: #4b5563;">%s</p>
    </div>`, data.OrganizerName, data.OrganizerEmail)
	}

	return fmt.Sprintf(`<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
    <table width="100%%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f5f5f5"><tr><td align="center" style="padding:40px 0;">
    <table width="600" border="0" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.1);">
    <tr><td height="8" bgcolor="#F27124" style="line-height:8px;font-size:8px;">&nbsp;</td></tr>
    <tr><td align="left" style="padding:35px 40px;"><h1 style="margin:0;color:#F27124;font-size:24px;font-weight:bold;letter-spacing:1px;">FPT EVENT SYSTEM</h1></td></tr>
    <tr><td style="padding:10px 40px 40px 40px;"><p style="font-size:18px;color:#666666;margin:0 0 10px 0;">Registration confirmed</p>
    <h2 style="font-size:32px;font-weight:bold;color:#000000;margin:0 0 30px 0;line-height:1.2;">%s</h2>
    <p>Hello <strong>%s</strong>, your payment was successful. Details below:</p>
    <table width="100%%" border="0" cellpadding="15" bgcolor="#fafafa" style="margin-bottom:20px;border-left:4px solid #F27124;">
    <tr><td><small style="color:#999999;text-transform:uppercase;">Ticket ID</small><br/><strong>#%s</strong></td></tr>
    <tr><td><small style="color:#999999;text-transform:uppercase;">Location</small><br/><strong>%s</strong><br/><small>%s</small></td></tr>
    <tr><td><small style="color:#999999;text-transform:uppercase;">Date</small><br/><strong>%s</strong></td></tr>
    <tr><td><small style="color:#999999;text-transform:uppercase;">Time</small><br/><strong>%s</strong></td></tr>
    <tr><td><small style="color:#999999;text-transform:uppercase;">Total Amount</small><br/><strong style="color:#F27124;font-size:22px;">%s VND</strong></td></tr>
    </table>
    %s
    <table width="100%%" bgcolor="#FFF8E1" style="border:1px solid #FFE082;border-radius:8px;margin-bottom:30px;"><tr><td style="padding:15px;"><strong>This email contains 1 PDF file.</strong> Please present the QR code at the entrance.</td></tr></table>
    <table border="0" cellspacing="0" cellpadding="0"><tr><td bgcolor="#F27124" style="border-radius:50px;padding:15px 35px;"><a href="%s" style="color:#ffffff;text-decoration:none;font-weight:bold;">VIEW ON MAP</a></td></tr></table>
    </td></tr><tr><td align="center" bgcolor="#2c2c2c" style="padding:25px;"><p style="margin:0;font-size:12px;color:#999999;">© 2026 FPT Event Management. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`,
		data.EventTitle, data.UserName, data.TicketIDs, data.VenueName, data.VenueAddress, eventDate, eventTime, data.TotalAmount, organizerSection, mapURL)
}

func (s *EmailService) SendMultipleTicketsEmail(data MultipleTicketsEmailData) error {
	log := logger.Default()
	log.Info("[EMAIL] 📋 Preparing multi-ticket email for %s (%d tickets, Event: %s)", data.UserEmail, data.TicketCount, data.EventTitle)
	data.UserName, data.EventTitle, data.VenueName, data.VenueAddress = cleanVietnameseText(data.UserName), cleanVietnameseText(data.EventTitle), cleanVietnameseText(data.VenueName), cleanVietnameseText(data.VenueAddress)
	data.TotalAmount = formatVND(data.TotalAmount)
	mapURL := "https://www.google.com/maps/search/?api=1&query=" + url.QueryEscape(data.VenueAddress)

	// Format event date and time
	eventDate, eventTime := formatEventDateTime(data.EventDate, data.EndTime)

	// Build organizer section if available
	organizerSection := ""
	if data.OrganizerName != "" {
		organizerSection = fmt.Sprintf(`
    <div style="margin-top: 15px;">
      <p style="font-size: 10px; color: #9ca3af; margin-bottom: 4px; text-transform: uppercase;">EVENT ORGANIZER</p>
      <p style="font-weight: 600; color: #1f2937;">%s</p>
      <p style="font-size: 13px; color: #4b5563;">%s</p>
    </div>`, data.OrganizerName, data.OrganizerEmail)
	}

	html := fmt.Sprintf(`<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
    <table width="100%%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f5f5f5"><tr><td align="center" style="padding:40px 0;">
    <table width="600" border="0" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.1);">
    <tr><td height="8" bgcolor="#F27124" style="line-height:8px;font-size:8px;">&nbsp;</td></tr>
    <tr><td align="left" style="padding:35px 40px;"><h1 style="margin:0;color:#F27124;font-size:24px;font-weight:bold;letter-spacing:1px;">FPT EVENT SYSTEM</h1></td></tr>
    <tr><td style="padding:10px 40px 40px 40px;"><p style="font-size:18px;color:#666666;margin:0 0 10px 0;">Registration confirmed</p><h2 style="font-size:32px;font-weight:bold;color:#000000;margin:0 0 30px 0;">%s</h2>
    <p>Hello <strong>%s</strong>, you have <strong>%d tickets</strong> for this event.</p>
    <table width="100%%" border="0" cellpadding="15" bgcolor="#fafafa" style="margin-bottom:20px;border-left:4px solid #F27124;">
    <tr><td><small style="color:#999999;text-transform:uppercase;">SEATS</small><br/><strong>%s</strong></td></tr>
    <tr><td><small style="color:#999999;text-transform:uppercase;">LOCATION</small><br/><strong>%s</strong><br/><small>%s</small></td></tr>
    <tr><td><small style="color:#999999;text-transform:uppercase;">DATE</small><br/><strong>%s</strong></td></tr>
    <tr><td><small style="color:#999999;text-transform:uppercase;">TIME</small><br/><strong>%s</strong></td></tr>
    <tr><td><small style="color:#999999;text-transform:uppercase;">TOTAL AMOUNT</small><br/><strong style="color:#F27124;font-size:22px;">%s VND</strong></td></tr>
    </table>
    %s
    <table width="100%%" bgcolor="#FFF8E1" style="border:1px solid #FFE082;border-radius:8px;margin-bottom:30px;"><tr><td style="padding:15px;"><strong>This email contains %d PDF files.</strong></td></tr></table>
    <table border="0" cellspacing="0" cellpadding="0"><tr><td bgcolor="#F27124" style="border-radius:50px;padding:15px 35px;"><a href="%s" style="color:#ffffff;text-decoration:none;font-weight:bold;">VIEW ON MAP</a></td></tr></table>
    </td></tr><tr><td align="center" bgcolor="#2c2c2c" style="padding:25px;"><p style="margin:0;font-size:12px;color:#999999;">© 2026 FPT Event Management. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`,
		data.EventTitle, data.UserName, data.TicketCount, data.SeatList, data.VenueName, data.VenueAddress, eventDate, eventTime, data.TotalAmount, organizerSection, data.TicketCount, mapURL)
	msg := EmailMessage{To: []string{data.UserEmail}, Subject: fmt.Sprintf("[FPT Event] %d E-Tickets - %s", data.TicketCount, data.EventTitle), HTMLBody: html}
	for _, att := range data.PDFAttachments {
		msg.Attachments = append(msg.Attachments, Attachment{Filename: att.Filename, Data: att.Data, MimeType: "application/pdf"})
		log.Info("[EMAIL] 📎 Attaching PDF: %s (size: %d bytes)", att.Filename, len(att.Data))
	}
	return s.Send(msg)
}

func (s *EmailService) SendOTPEmail(to, otp, purpose string) error {
	log := logger.Default()
	log.Info("[EMAIL] 🔐 Preparing OTP email for %s (Purpose: %s)", to, purpose)
	var subject, title string
	switch purpose {
	case "register":
		subject, title = "FPT Event - Account Verification", "WELCOME TO FPT EVENT"
	case "forgot_password":
		subject, title = "FPT Event - Password Reset", "PASSWORD RESET"
	default:
		subject, title = "FPT Event - Verification Code", "VERIFICATION CODE"
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
  <table width="100%%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f5f5f5">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table width="600" border="0" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.1);">
          <tr><td height="8" bgcolor="#F27124" style="line-height:8px;font-size:8px;">&nbsp;</td></tr>
          <tr>
            <td align="left" style="padding:35px 40px;">
              <h1 style="margin:0;color:#F27124;font-size:24px;font-weight:bold;">FPT EVENT SYSTEM</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 40px 40px 40px;">
              <h2 style="color:#000000;margin:0 0 10px 0;">%s</h2>
              <p style="font-size:15px;color:#4b5563;margin-bottom:20px;text-align:center;">Mã xác thực OTP của bạn ở bên dưới (Hiệu lực trong vòng 5 phút). Nhấp đôi chuột hoặc chạm nhanh vào khối màu cam để sao chép mã số:</p>
              
              <!-- Beautiful Click-to-Copy Button block featuring user-select -->
              <div style="text-align:center;margin:30px 0;">
                <div style="display:inline-block;padding:15px 40px;background-color:#F27124;color:#ffffff;font-size:36px;font-weight:bold;border-radius:12px;box-shadow:0 4px 10px rgba(242,113,36,0.3);letter-spacing:8px;cursor:pointer;-webkit-user-select:all;-moz-user-select:all;-ms-user-select:all;user-select:all;">
                  %s
                </div>
                <p style="margin-top:10px;color:#9ca3af;font-size:12px;">(Nhấp đúp hoặc chạm giữ nút màu cam để chọn tất cả và Sao chép nhanh)</p>
              </div>

              <p style="margin-top:25px;color:#9ca3af;font-size:13px;text-align:center;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.</p>
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="#2c2c2c" style="padding:20px;color:#999999;font-size:12px;">
              © 2026 FPT Event Management
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`, title, otp)

	return s.Send(EmailMessage{To: []string{to}, Subject: subject, HTMLBody: html})
}
