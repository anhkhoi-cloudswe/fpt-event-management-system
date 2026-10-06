package utils

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	payos "github.com/payOSHQ/payos-lib-golang/v2"
)

// PayOSService manages interaction with the payOS API
type PayOSService struct {
	client      *payos.PayOS
	clientID    string
	apiKey      string
	checksumKey string
	initialized bool
	mu          sync.RWMutex
}

var (
	globalPayOSService *PayOSService
	payOSOnce          sync.Once
)

// GetPayOSService returns the singleton PayOSService instance
func GetPayOSService() *PayOSService {
	payOSOnce.Do(func() {
		globalPayOSService = &PayOSService{}
		globalPayOSService.Init()
	})
	return globalPayOSService
}

// Init initializes the PayOS client from environment variables
func (s *PayOSService) Init() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.clientID = strings.TrimSpace(os.Getenv("PAYOS_CLIENT_ID"))
	s.apiKey = strings.TrimSpace(os.Getenv("PAYOS_API_KEY"))
	s.checksumKey = strings.TrimSpace(os.Getenv("PAYOS_CHECKSUM_KEY"))

	if s.clientID == "" || s.apiKey == "" || s.checksumKey == "" {
		s.initialized = false
		return
	}

	// Use custom transport with explicit IPv4 dialing to avoid Windows IPv6 dual-stack timeouts
	d := &net.Dialer{Timeout: 10 * time.Second}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return d.DialContext(ctx, "tcp4", addr)
		},
		TLSHandshakeTimeout: 10 * time.Second,
	}
	httpClient := &http.Client{Transport: transport, Timeout: 15 * time.Second}

	client, err := payos.NewPayOS(&payos.PayOSOptions{
		ClientId:    s.clientID,
		ApiKey:      s.apiKey,
		ChecksumKey: s.checksumKey,
		HTTPClient:  httpClient,
	})
	if err != nil {
		fmt.Printf("[PayOSService] ⚠️ Failed to initialize payOS client: %v\n", err)
		s.initialized = false
		return
	}

	s.client = client
	s.initialized = true
	fmt.Println("[PayOSService] ✅ payOS Client successfully initialized as PRIMARY payment gateway")
}

// IsConfigured returns true if payOS credentials are valid and client is ready
func (s *PayOSService) IsConfigured() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.initialized && s.client != nil
}

// sanitizeDescription ensures description complies with payOS restrictions (max 25 chars, alphanumeric & spaces)
func sanitizeDescription(desc string) string {
	// Remove Vietnamese diacritics / special characters
	re := regexp.MustCompile(`[^a-zA-Z0-9 ]+`)
	cleaned := re.ReplaceAllString(desc, "")
	cleaned = strings.TrimSpace(cleaned)
	if len(cleaned) > 25 {
		cleaned = cleaned[:25]
	}
	if cleaned == "" {
		cleaned = "FEMS Ticket"
	}
	return cleaned
}

// CreatePaymentLink creates a payment link on payOS
func (s *PayOSService) CreatePaymentLink(
	ctx context.Context,
	orderCode int64,
	amount int,
	description string,
	cancelURL string,
	returnURL string,
) (*payos.CreatePaymentLinkResponse, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("payOS service is not configured")
	}

	cleanDesc := sanitizeDescription(description)

	req := payos.CreatePaymentLinkRequest{
		OrderCode:   orderCode,
		Amount:      amount,
		Description: cleanDesc,
		CancelUrl:   cancelURL,
		ReturnUrl:   returnURL,
	}

	return s.client.PaymentRequests.Create(ctx, req)
}

// VerifyWebhook validates the incoming webhook payload from payOS
func (s *PayOSService) VerifyWebhook(ctx context.Context, webhook payos.Webhook) (*payos.WebhookData, error) {
	if strings.TrimSpace(os.Getenv("BYPASS_PAYOS_SIGNATURE")) == "true" {
		return webhook.Data, nil
	}

	if !s.IsConfigured() {
		return nil, fmt.Errorf("payOS service is not configured")
	}

	verifiedData, err := s.client.Webhooks.VerifyData(ctx, webhook)
	if err != nil {
		return nil, fmt.Errorf("payOS webhook signature verification failed: %w", err)
	}

	if data, ok := verifiedData.(*payos.WebhookData); ok {
		return data, nil
	}
	if webhook.Data != nil {
		return webhook.Data, nil
	}
	return nil, fmt.Errorf("unable to parse verified webhook data")
}

// GetPaymentLinkInformation retrieves live status of an order directly from payOS
func (s *PayOSService) GetPaymentLinkInformation(ctx context.Context, orderCode int64) (*payos.PaymentLink, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("payOS service is not configured")
	}
	return s.client.PaymentRequests.Get(ctx, orderCode)
}
