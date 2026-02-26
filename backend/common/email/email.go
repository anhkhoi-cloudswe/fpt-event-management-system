package email

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"html/template"
	"net/smtp"
	"net/url"
	"os"
	"strings"
	"time"
)

// ============================================================
// CONFIGURATION & SERVICE
// ============================================================

type Config struct {
	Host       string
	Port       string
	Username   string
	Password   string
	From       string
	FromName   string
	UseTLS     bool
	SkipVerify bool
}

func DefaultConfig() *Config {
	return &Config{
		Host:       getEnv("SMTP_HOST", "smtp.gmail.com"),
		Port:       getEnv("SMTP_PORT", "587"),
		Username:   getEnv("SMTP_USERNAME", ""),
		Password:   getEnv("SMTP_PASSWORD", ""),
		From:       getEnv("SMTP_FROM", "noreply@fpt.edu.vn"),
		FromName:   getEnv("SMTP_FROM_NAME", "FPT Event System"),
		UseTLS:     getEnv("SMTP_USE_TLS", "true") == "true",
		SkipVerify: getEnv("SMTP_SKIP_VERIFY", "false") == "true",
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
	devMode := config.Username == "" || config.Password == ""
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
	UserEmail     string
	UserName      string
	EventTitle    string
	TicketIDs     string
	TicketTypes   string
	SeatCodes     string
	VenueName     string
	VenueAddress  string
	AreaName      string
	MapURL        string
	TotalAmount   string
	StartTime     string
	QRCodeBase64  string
	PaymentMethod string
	PDFAttachment []byte
	PDFFilename   string
}

type MultipleTicketsEmailData struct {
	UserEmail      string
	UserName       string
	EventTitle     string
	EventDate      string
	VenueName      string
	VenueAddress   string
	TicketCount    int
	SeatList       string
	TotalAmount    string
	GoogleMapsURL  string
	PDFAttachments []PDFAttachment
}

type PDFAttachment struct {
	Filename string
	Data     []byte
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

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

func (s *EmailService) Send(msg EmailMessage) error {
	if s.devMode {
		return nil
	}
	addr := fmt.Sprintf("%s:%s", s.config.Host, s.config.Port)
	auth := smtp.PlainAuth("", s.config.Username, s.config.Password, s.config.Host)
	var body bytes.Buffer
	boundary := fmt.Sprintf("boundary_%d", time.Now().UnixNano())
	body.WriteString(fmt.Sprintf("From: %s <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=%s\r\n\r\n", s.config.FromName, s.config.From, strings.Join(msg.To, ", "), msg.Subject, boundary))
	body.WriteString(fmt.Sprintf("--%s\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n", boundary, msg.HTMLBody))
	for _, att := range msg.Attachments {
		body.WriteString(fmt.Sprintf("--%s\r\nContent-Type: %s; name=\"%s\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"%s\"\r\n\r\n%s\r\n", boundary, att.MimeType, att.Filename, att.Filename, base64.StdEncoding.EncodeToString(att.Data)))
	}
	body.WriteString(fmt.Sprintf("--%s--\r\n", boundary))
	return smtp.SendMail(addr, auth, s.config.From, msg.To, body.Bytes())
}

// ============================================================
// TEMPLATE BUILDERS
// ============================================================

func (s *EmailService) SendTicketEmail(data TicketEmailData) error {
	data.UserName, data.EventTitle, data.VenueName, data.VenueAddress = cleanVietnameseText(data.UserName), cleanVietnameseText(data.EventTitle), cleanVietnameseText(data.VenueName), cleanVietnameseText(data.VenueAddress)
	data.TotalAmount = formatVND(data.TotalAmount)
	html := s.buildTicketEmailHTML(data)
	msg := EmailMessage{To: []string{data.UserEmail}, Subject: fmt.Sprintf("[FPT Event] E-Ticket - %s", data.EventTitle), HTMLBody: html}
	if len(data.PDFAttachment) > 0 {
		msg.Attachments = []Attachment{{Filename: "ticket.pdf", Data: data.PDFAttachment, MimeType: "application/pdf"}}
	}
	return s.Send(msg)
}

func (s *EmailService) buildTicketEmailHTML(data TicketEmailData) string {
	mapURL := "https://www.google.com/maps/search/?api=1&query=" + url.QueryEscape(data.VenueAddress)
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
    <tr><td><small style="color:#999999;text-transform:uppercase;">Date & Time</small><br/><strong>%s</strong></td></tr>
    <tr><td><small style="color:#999999;text-transform:uppercase;">Total Amount</small><br/><strong style="color:#F27124;font-size:22px;">%s VND</strong></td></tr>
    </table>
    <table width="100%%" bgcolor="#FFF8E1" style="border:1px solid #FFE082;border-radius:8px;margin-bottom:30px;"><tr><td style="padding:15px;"><strong>This email contains 1 PDF file.</strong> Please present the QR code at the entrance.</td></tr></table>
    <table border="0" cellspacing="0" cellpadding="0"><tr><td bgcolor="#F27124" style="border-radius:50px;padding:15px 35px;"><a href="%s" style="color:#ffffff;text-decoration:none;font-weight:bold;">VIEW ON MAP</a></td></tr></table>
    </td></tr><tr><td align="center" bgcolor="#2c2c2c" style="padding:25px;"><p style="margin:0;font-size:12px;color:#999999;">© 2026 FPT Event Management. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`,
		data.EventTitle, data.UserName, data.TicketIDs, data.VenueName, data.VenueAddress, data.StartTime, data.TotalAmount, mapURL)
}

func (s *EmailService) SendMultipleTicketsEmail(data MultipleTicketsEmailData) error {
	data.UserName, data.EventTitle, data.VenueName, data.VenueAddress = cleanVietnameseText(data.UserName), cleanVietnameseText(data.EventTitle), cleanVietnameseText(data.VenueName), cleanVietnameseText(data.VenueAddress)
	data.TotalAmount = formatVND(data.TotalAmount)
	mapURL := "https://www.google.com/maps/search/?api=1&query=" + url.QueryEscape(data.VenueAddress)
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
    <tr><td><small style="color:#999999;text-transform:uppercase;">DATE & TIME</small><br/><strong>%s</strong></td></tr>
    <tr><td><small style="color:#999999;text-transform:uppercase;">TOTAL AMOUNT</small><br/><strong style="color:#F27124;font-size:22px;">%s VND</strong></td></tr>
    </table>
    <table width="100%%" bgcolor="#FFF8E1" style="border:1px solid #FFE082;border-radius:8px;margin-bottom:30px;"><tr><td style="padding:15px;"><strong>This email contains %d PDF files.</strong></td></tr></table>
    <table border="0" cellspacing="0" cellpadding="0"><tr><td bgcolor="#F27124" style="border-radius:50px;padding:15px 35px;"><a href="%s" style="color:#ffffff;text-decoration:none;font-weight:bold;">VIEW ON MAP</a></td></tr></table>
    </td></tr><tr><td align="center" bgcolor="#2c2c2c" style="padding:25px;"><p style="margin:0;font-size:12px;color:#999999;">© 2026 FPT Event Management. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`,
		data.EventTitle, data.UserName, data.TicketCount, data.SeatList, data.VenueName, data.VenueAddress, data.EventDate, data.TotalAmount, data.TicketCount, mapURL)
	msg := EmailMessage{To: []string{data.UserEmail}, Subject: fmt.Sprintf("[FPT Event] %d E-Tickets - %s", data.TicketCount, data.EventTitle), HTMLBody: html}
	for _, att := range data.PDFAttachments {
		msg.Attachments = append(msg.Attachments, Attachment{Filename: att.Filename, Data: att.Data, MimeType: "application/pdf"})
	}
	return s.Send(msg)
}

func (s *EmailService) SendOTPEmail(to, otp, purpose string) error {
	var subject, title string
	switch purpose {
	case "register":
		subject, title = "FPT Event - Account Verification", "WELCOME TO FPT EVENT"
	case "forgot_password":
		subject, title = "FPT Event - Password Reset", "PASSWORD RESET"
	default:
		subject, title = "FPT Event - Verification Code", "VERIFICATION CODE"
	}
	html := fmt.Sprintf(`<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial;background-color:#f5f5f5;"><table width="100%%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f5f5f5"><tr><td align="center" style="padding:40px 0;"><table width="600" border="0" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.1);">
    <tr><td height="8" bgcolor="#F27124" style="line-height:8px;font-size:8px;">&nbsp;</td></tr>
    <tr><td align="left" style="padding:35px 40px;"><h1 style="margin:0;color:#F27124;font-size:24px;font-weight:bold;">FPT EVENT SYSTEM</h1></td></tr>
    <tr><td style="padding:10px 40px 40px 40px;"><h2 style="color:#000000;margin:0 0 10px 0;">%s</h2><p>Your OTP code is below. It expires in 5 minutes:</p><table width="100%%" bgcolor="#fafafa" style="border:2px dashed #F27124;border-radius:8px;"><tr><td align="center" style="padding:25px;"><p style="font-size:42px;font-weight:bold;color:#F27124;letter-spacing:10px;margin:0;">%s</p></td></tr></table><p style="margin-top:25px;color:#999999;font-size:13px;">If you did not request this, please ignore this email.</p></td></tr><tr><td align="center" bgcolor="#2c2c2c" style="padding:20px;color:#999999;font-size:12px;">© 2026 FPT Event Management</td></tr></table></td></tr></table></body></html>`, title, otp)
	return s.Send(EmailMessage{To: []string{to}, Subject: subject, HTMLBody: html})
}
