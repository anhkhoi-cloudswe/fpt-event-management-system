package models

type PaymentGateway string

const (
	GatewayPayOS PaymentGateway = "payos"
	GatewaySePay PaymentGateway = "sepay"
)

// BankTransferOrderResponse represents the unified order creation response for payOS (primary) and SePay (fallback)
type BankTransferOrderResponse struct {
	OrderID             int64          `json:"order_id"`
	Amount              float64        `json:"amount"`
	Gateway             PaymentGateway `json:"gateway"` // "payos" or "sepay"

	// PayOS specific fields
	CheckoutURL         string         `json:"checkoutUrl,omitempty"`
	QRCode              string         `json:"qrCode,omitempty"`
	Bin                 string         `json:"bin,omitempty"`
	AccountNumber       string         `json:"accountNumber,omitempty"`
	AccountName         string         `json:"accountName,omitempty"`
	PaymentLinkId       string         `json:"paymentLinkId,omitempty"`

	// SePay specific fields
	TransferDescription string         `json:"transferDescription,omitempty"`
	BankName            string         `json:"bankName,omitempty"`

	ExpireAt            string         `json:"expire_at"`
	ExpiresAt           string         `json:"expiresAt"`
	CreatedAt           string         `json:"createdAt"`
	ServerTime          string         `json:"serverTime"`
	Free                bool           `json:"free"`
	TicketIDs           string         `json:"ticketIds,omitempty"`
	SuccessURL          string         `json:"successUrl,omitempty"`
}
