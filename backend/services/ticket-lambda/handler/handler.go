package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/ticket-lambda/usecase"
)

var log = logger.Default()

type TicketHandler struct {
	useCase *usecase.TicketUseCase
}

// NewTicketHandlerWithDB creates a new ticket handler with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewTicketHandlerWithDB(dbConn *sql.DB) *TicketHandler {
	return &TicketHandler{
		useCase: usecase.NewTicketUseCaseWithDB(dbConn),
	}
}

// HandleGetMyTickets - GET /api/registrations/my-tickets
func (h *TicketHandler) HandleGetMyTickets(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Inject request headers vào context cho JWT Propagation (internal calls)
	ctx = utils.WithRequestHeaders(ctx, request.Headers)

	// Get userId from request attribute (set by JWT middleware)
	userIDStr := request.Headers["X-User-Id"]
	log.Debug("HandleGetMyTickets - X-User-Id header: '%s'", userIDStr)

	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing userId")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		log.Warn("HandleGetMyTickets - Invalid userId: %s, error: %v", userIDStr, err)
		return createMessageResponse(http.StatusBadRequest, "Invalid userId")
	}

	// Check if pagination params are provided
	params := request.QueryStringParameters
	pageStr := params["page"]
	limitStr := params["limit"]
	search := params["search"]
	status := params["status"]

	// If no pagination params, use old endpoint
	if pageStr == "" && limitStr == "" {
		tickets, err := h.useCase.GetMyTickets(ctx, userID)
		if err != nil {
			log.Error("HandleGetMyTickets - GetMyTickets error: %v", err)
			return createMessageResponse(http.StatusInternalServerError, "Internal server error when loading tickets")
		}
		log.Debug("HandleGetMyTickets - Found %d tickets for userID %d", len(tickets), userID)
		return createJSONResponse(http.StatusOK, tickets)
	}

	// Parse pagination params
	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	paginatedTickets, err := h.useCase.GetMyTicketsPaginated(ctx, userID, page, limit, search, status)
	if err != nil {
		log.Error("HandleGetMyTickets - GetMyTicketsPaginated error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Internal server error when loading tickets")
	}

	log.Debug("HandleGetMyTickets - userID=%d page=%d found=%d total=%d", userID, page, len(paginatedTickets.Tickets), paginatedTickets.TotalRecords)
	return createJSONResponse(http.StatusOK, paginatedTickets)
}

// HandleGetTicketList - GET /api/tickets/list?eventId=
func (h *TicketHandler) HandleGetTicketList(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get role and userId from headers (set by JWT middleware)
	role := request.Headers["X-User-Role"]
	userIDStr := request.Headers["X-User-Id"]

	if role == "" || userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId")
	}

	// Optional eventId filter
	var eventID *int
	if eventIDStr := request.QueryStringParameters["eventId"]; eventIDStr != "" {
		id, err := strconv.Atoi(eventIDStr)
		if err == nil {
			eventID = &id
		}
	}

	tickets, err := h.useCase.GetTicketsByRole(ctx, role, userID, eventID)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading tickets")
	}

	return createJSONResponse(http.StatusOK, tickets)
}

// HandleGetCategoryTickets - GET /api/category-tickets?eventId=
func (h *TicketHandler) HandleGetCategoryTickets(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	eventIDStr := request.QueryStringParameters["eventId"]
	if eventIDStr == "" {
		return createMessageResponse(http.StatusBadRequest, "Missing eventId")
	}

	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid eventId")
	}

	categories, err := h.useCase.GetCategoryTickets(ctx, eventID)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading category tickets")
	}

	return createJSONResponse(http.StatusOK, categories)
}

// HandleGetMyBills - GET /api/bills/my-bills
func (h *TicketHandler) HandleGetMyBills(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := request.Headers["X-User-Id"]
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing userId")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId")
	}

	// Check if pagination params are provided
	params := request.QueryStringParameters
	pageStr := params["page"]
	limitStr := params["limit"]
	search := params["search"]
	paymentStatus := params["status"]
	paymentMethod := params["method"]

	// If no pagination params, use old endpoint
	if pageStr == "" && limitStr == "" {
		bills, err := h.useCase.GetMyBills(ctx, userID)
		if err != nil {
			return createMessageResponse(http.StatusInternalServerError, "Error loading bills")
		}
		return createJSONResponse(http.StatusOK, bills)
	}

	// Parse pagination params
	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	paginatedBills, err := h.useCase.GetMyBillsPaginated(ctx, userID, page, limit, search, paymentStatus, paymentMethod)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading bills")
	}

	return createJSONResponse(http.StatusOK, paginatedBills)
}

// Helper functions
func createJSONResponse(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
	body, err := json.Marshal(data)
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Headers:    defaultHeaders(),
			Body:       `{"message":"Failed to serialize response"}`,
		}, nil
	}

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

func createMessageResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	body, _ := json.Marshal(map[string]string{"message": message})
	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

func defaultHeaders() map[string]string {
	return map[string]string{
		"Content-Type":                     "application/json;charset=UTF-8",
		"Access-Control-Allow-Origin":      "*",
		"Access-Control-Allow-Credentials": "true",
	}
}

func getHeaderIgnoreCase(headers map[string]string, key string) string {
	for headerKey, value := range headers {
		if strings.EqualFold(headerKey, key) {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func buildDynamicReturnURL(request events.APIGatewayProxyRequest) string {
	// ⭐ CRITICAL: Tạo dynamic return URL cho VNPay callback
	// This allows Docker deployment ở bất kỳ đâu (localhost, LAN, AWS) mà ko cần edit .env
	
	host := getHeaderIgnoreCase(request.Headers, "Host")
	if host == "" {
		// Fallback if Host header missing (should not happen with proper proxy setup)
		return ""
	}

	// Xác định scheme (http vs https) từ X-Forwarded-Proto header
	// X-Forwarded-Proto được set bởi API Gateway hoặc reverse proxy
	scheme := getHeaderIgnoreCase(request.Headers, "X-Forwarded-Proto")
	
	if scheme != "" {
		// Parse X-Forwarded-Proto (có thể là "http,https" nếu qua nhiều proxy)
		if commaIdx := strings.Index(scheme, ","); commaIdx >= 0 {
			scheme = scheme[:commaIdx]
		}
		scheme = strings.ToLower(strings.TrimSpace(scheme))
	}
	
	// Fallback nếu X-Forwarded-Proto không có hoặc invalid
	if scheme == "" || (scheme != "http" && scheme != "https") {
		// Default to http dành cho local dev (Docker compose, localhost)
		// Production AWS API Gateway sẽ set X-Forwarded-Proto = https
		scheme = "http"
		log.Debug("[buildDynamicReturnURL] No valid X-Forwarded-Proto, defaulting to http (Local Dev Mode)")
	}

	returnURL := fmt.Sprintf("%s://%s/api/buyTicket", scheme, host)
	log.Debug("[buildDynamicReturnURL] Dynamic VNPay Return URL: %s (Host=%s, Scheme=%s)", returnURL, host, scheme)
	return returnURL
}

// ============================================================
// HandlePaymentTicket - GET /api/payment-ticket
// Tạo URL thanh toán VNPay cho vé sự kiện
// KHỚP VỚI Java PaymentJwtController
// ============================================================
func (h *TicketHandler) HandlePaymentTicket(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get query params
	userIDStr := request.QueryStringParameters["userId"]
	eventIDStr := request.QueryStringParameters["eventId"]
	categoryTicketIDStr := request.QueryStringParameters["categoryTicketId"]

	// Hỗ trợ cả seatId (số ít) và seatIds (số nhiều) để tương thích với frontend
	seatIDStr := request.QueryStringParameters["seatId"]
	if seatIDStr == "" {
		seatIDStr = request.QueryStringParameters["seatIds"]
	}

	// Validate required params
	if userIDStr == "" || eventIDStr == "" || seatIDStr == "" {
		return createMessageResponse(http.StatusBadRequest, "Missing required parameters: userId, eventId, seatId")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId")
	}

	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid eventId")
	}

	categoryTicketID := 0
	if categoryTicketIDStr != "" {
		parsedCategoryTicketID, parseErr := strconv.Atoi(categoryTicketIDStr)
		if parseErr != nil {
			return createMessageResponse(http.StatusBadRequest, "Invalid categoryTicketId")
		}
		categoryTicketID = parsedCategoryTicketID
	}

	// Parse multiple seatIds (comma-separated: "1,2,3,4")
	seatIDStrs := []string{}
	if seatIDStr != "" {
		for _, part := range strings.Split(seatIDStr, ",") {
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				seatIDStrs = append(seatIDStrs, trimmed)
			}
		}
	}

	if len(seatIDStrs) == 0 {
		return createMessageResponse(http.StatusBadRequest, "No valid seatIds provided")
	}

	// Convert to []int
	seatIDs := []int{}
	for _, idStr := range seatIDStrs {
		seatID, err := strconv.Atoi(idStr)
		if err != nil {
			return createMessageResponse(http.StatusBadRequest, "Invalid seatId: "+idStr)
		}
		seatIDs = append(seatIDs, seatID)
	}

	// Limit to 4 seats maximum (business rule)
	if len(seatIDs) > 4 {
		return createMessageResponse(http.StatusBadRequest, "Maximum 4 seats per purchase")
	}

	// Build dynamic return URL from current request host/protocol.
	// If host is unavailable, repository/service will fallback to configured VNPAY_RETURN_URL.
	dynamicReturnURL := buildDynamicReturnURL(request)

	// Generate VNPay URL for multiple seats
	paymentURL, err := h.useCase.CreatePaymentURL(ctx, userID, eventID, categoryTicketID, seatIDs, dynamicReturnURL)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	// ✅ 0đ BYPASS: Vé miễn phí – không cần VNPay, trả về thông tin thành công trực tiếp
	if strings.HasPrefix(paymentURL, "FREE:") {
		ticketIDs := strings.TrimPrefix(paymentURL, "FREE:")
		successURL := fmt.Sprintf("http://localhost:3000/dashboard/payment/success?status=success&method=free&ticketIds=%s", url.QueryEscape(ticketIDs))
		log.Info("Free ticket bypass - successUrl: %s", successURL)
		body, _ := json.Marshal(map[string]interface{}{
			"free":       true,
			"ticketIds":  ticketIDs,
			"successUrl": successURL,
		})
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusOK,
			Headers: map[string]string{
				"Content-Type":                "application/json;charset=UTF-8",
				"Access-Control-Allow-Origin": "*",
			},
			Body: string(body),
		}, nil
	}

	// Return redirect or URL
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type":                "application/json;charset=UTF-8",
			"Access-Control-Allow-Origin": "*",
		},
		Body: `{"paymentUrl":"` + paymentURL + `"}`,
	}, nil
}

// ============================================================
// HandleBuyTicket - GET /api/buyTicket
// VNPay return URL - xác nhận thanh toán và tạo vé
// KHỚP VỚI Java BuyTicketJwtController
// ============================================================
func (h *TicketHandler) HandleBuyTicket(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get VNPay params
	vnpAmount := request.QueryStringParameters["vnp_Amount"]
	vnpResponseCode := request.QueryStringParameters["vnp_ResponseCode"]
	vnpOrderInfo := request.QueryStringParameters["vnp_OrderInfo"]
	vnpTxnRef := request.QueryStringParameters["vnp_TxnRef"]
	vnpSecureHash := request.QueryStringParameters["vnp_SecureHash"]

	log.Info("VNPay callback received - Amount=%s ResponseCode=%s TxnRef=%s", vnpAmount, vnpResponseCode, vnpTxnRef)

	// Process payment callback
	ticketIds, err := h.useCase.ProcessPaymentCallback(ctx, vnpAmount, vnpResponseCode, vnpOrderInfo, vnpTxnRef, vnpSecureHash)
	if err != nil {
		// Redirect to payment failed page
		frontendURL := "http://localhost:3000/dashboard/payment/failed?status=failed&method=vnpay&reason=" + url.QueryEscape(err.Error())
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusFound,
			Headers: map[string]string{
				"Location":                    frontendURL,
				"Access-Control-Allow-Origin": "*",
			},
		}, nil
	}

	// Try to enrich redirect with eventId for forced refresh on frontend.
	eventIDParam := ""
	txnParts := strings.Split(vnpTxnRef, "_")
	if len(txnParts) >= 2 {
		if _, parseErr := strconv.Atoi(txnParts[1]); parseErr == nil {
			eventIDParam = "&eventId=" + url.QueryEscape(txnParts[1])
		}
	}

	// Redirect to payment success page with ticketIds
	frontendURL := fmt.Sprintf("http://localhost:3000/dashboard/payment/success?status=success&method=vnpay&ticketIds=%s%s", url.QueryEscape(ticketIds), eventIDParam)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusFound,
		Headers: map[string]string{
			"Location":                    frontendURL,
			"Access-Control-Allow-Origin": "*",
		},
	}, nil
}

// ============================================================
// HandleGetWalletBalance - GET /api/wallet/balance
// Get user's wallet balance for pre-check before payment
// ============================================================
func (h *TicketHandler) HandleGetWalletBalance(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Priority 1: X-User-Id header injected by Gateway (Trusted Gateway pattern)
	userIDStr := request.Headers["X-User-Id"]
	if userIDStr == "" {
		userIDStr = request.Headers["x-user-id"]
	}

	// Priority 2: Query parameter fallback
	if userIDStr == "" {
		userIDStr = request.QueryStringParameters["userId"]
	}

	if userIDStr == "" {
		log.Warn("GetWalletBalance - User ID not found in request")
		return createMessageResponse(http.StatusUnauthorized, "User ID not found")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		log.Warn("GetWalletBalance - Invalid user ID format: '%s'", userIDStr)
		return createMessageResponse(http.StatusBadRequest, "Invalid user ID format")
	}

	// Get wallet balance from use case
	balance, err := h.useCase.GetWalletBalance(ctx, userID)
	if err != nil {
		log.Error("GetWalletBalance - error for userID %d: %v", userID, err)
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	log.Debug("GetWalletBalance - userID=%d balance=%.2f", userID, balance)

	// Return JSON response
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type":                "application/json;charset=UTF-8",
			"Access-Control-Allow-Origin": "*",
		},
		Body: fmt.Sprintf(`{"balance":%.2f}`, balance),
	}, nil
}

// ============================================================
// HandleWalletPayTicket - POST /api/wallet/pay-ticket
// Process ticket purchase using wallet balance
// Returns 402 Payment Required if insufficient balance
// ============================================================
func (h *TicketHandler) HandleWalletPayTicket(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract userId from header (set by auth middleware)
	userIDStr := request.Headers["X-User-Id"]
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "User ID not found")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid user ID format")
	}

	// Parse JSON body for POST request
	type WalletPaymentRequest struct {
		EventID          int   `json:"eventId"`
		CategoryTicketID int   `json:"categoryTicketId"`
		SeatIDs          []int `json:"seatIds"`
	}

	var paymentReq WalletPaymentRequest
	if request.Body != "" {
		// Security: Don't log raw body (could contain sensitive data)
		fmt.Printf("[WALLET_PAYMENT] 📋 Content-Type: %s, Body size: %d bytes\n", request.Headers["Content-Type"], len(request.Body))

		err := json.Unmarshal([]byte(request.Body), &paymentReq)
		if err != nil {
			fmt.Printf("[WALLET_PAYMENT] ❌ JSON PARSE ERROR: %v\n", err)
			fmt.Printf("[WALLET_PAYMENT] 📝 Failed to parse payment request (body redacted for security)\n")
			return createMessageResponse(http.StatusBadRequest, "Invalid request body: "+err.Error())
		}

		fmt.Printf("[WALLET_PAYMENT] ✅ Parsed successfully - EventID: %d, CategoryTicketID: %d, SeatIDs: %v\n",
			paymentReq.EventID, paymentReq.CategoryTicketID, paymentReq.SeatIDs)
	} else {
		// Try parsing from query or form params as fallback
		eventIDStr := request.QueryStringParameters["eventId"]
		categoryTicketIDStr := request.QueryStringParameters["categoryTicketId"]
		seatIDStr := request.QueryStringParameters["seatIds"]

		if eventIDStr == "" || categoryTicketIDStr == "" {
			return createMessageResponse(http.StatusBadRequest, "Missing required parameters: eventId, categoryTicketId, seatIds")
		}

		eventID, err := strconv.Atoi(eventIDStr)
		if err != nil {
			return createMessageResponse(http.StatusBadRequest, "Invalid eventId")
		}

		categoryTicketID, err := strconv.Atoi(categoryTicketIDStr)
		if err != nil {
			return createMessageResponse(http.StatusBadRequest, "Invalid categoryTicketId")
		}

		// Parse seat IDs
		seatIDStrs := []string{}
		if seatIDStr != "" {
			for _, part := range strings.Split(seatIDStr, ",") {
				trimmed := strings.TrimSpace(part)
				if trimmed != "" {
					seatIDStrs = append(seatIDStrs, trimmed)
				}
			}
		}

		if len(seatIDStrs) == 0 {
			return createMessageResponse(http.StatusBadRequest, "No valid seatIds provided")
		}

		// Convert to []int
		seatIDs := []int{}
		for _, idStr := range seatIDStrs {
			seatID, err := strconv.Atoi(idStr)
			if err != nil {
				return createMessageResponse(http.StatusBadRequest, "Invalid seatId: "+idStr)
			}
			seatIDs = append(seatIDs, seatID)
		}

		paymentReq.EventID = eventID
		paymentReq.CategoryTicketID = categoryTicketID
		paymentReq.SeatIDs = seatIDs
	}

	// Validate
	if paymentReq.EventID == 0 || paymentReq.CategoryTicketID == 0 || len(paymentReq.SeatIDs) == 0 {
		fmt.Printf("[WALLET_PAYMENT] ❌ VALIDATION FAILED - EventID: %d, CategoryTicketID: %d, SeatIDs: %v\n",
			paymentReq.EventID, paymentReq.CategoryTicketID, paymentReq.SeatIDs)
		return createMessageResponse(http.StatusBadRequest, "Missing required parameters: eventId, categoryTicketId, seatIds")
	}

	fmt.Printf("[WALLET_PAYMENT] ✅ Validation passed - Processing payment for UserID: %d, EventID: %d, CategoryTicketID: %d, %d seat(s)\n",
		userID, paymentReq.EventID, paymentReq.CategoryTicketID, len(paymentReq.SeatIDs))

	// Limit to 4 seats maximum
	if len(paymentReq.SeatIDs) > 4 {
		return createMessageResponse(http.StatusBadRequest, "Maximum 4 seats per purchase")
	}

	// Get wallet balance
	balance, err := h.useCase.GetWalletBalance(ctx, userID)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	// Calculate total amount needed
	totalAmount, err := h.useCase.CalculateSeatsPriceForWallet(ctx, paymentReq.EventID, paymentReq.SeatIDs)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	// Check insufficient balance
	if balance < float64(totalAmount) {
		shortage := float64(totalAmount) - balance
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusPaymentRequired, // 402
			Headers: map[string]string{
				"Content-Type":                "application/json;charset=UTF-8",
				"Access-Control-Allow-Origin": "*",
			},
			Body: fmt.Sprintf(`{"error":"insufficient_balance","required":%d,"current":%.2f,"shortage":%.2f}`, totalAmount, balance, shortage),
		}, nil
	}

	// Process wallet payment
	ticketIds, err := h.useCase.ProcessWalletPayment(ctx, userID, paymentReq.EventID, paymentReq.CategoryTicketID, paymentReq.SeatIDs, totalAmount)
	if err != nil {
		// Check if error is due to closed/invalid event status
		if strings.Contains(err.Error(), "đã kết thúc") || strings.Contains(err.Error(), "đã đóng") {
			return createMessageResponse(http.StatusBadRequest, err.Error())
		}

		// Check if error is due to insufficient balance (with atomic lock)
		if strings.Contains(err.Error(), "insufficient_balance") || strings.Contains(err.Error(), "Số dư ví không đủ") {
			// Extract shortage amount from error message format: "insufficient_balance|%d|%f"
			parts := strings.Split(err.Error(), "|")
			if len(parts) >= 3 {
				shortage, _ := strconv.Atoi(parts[1])
				currentBalance, _ := strconv.ParseFloat(parts[2], 64)
				return events.APIGatewayProxyResponse{
					StatusCode: http.StatusPaymentRequired, // 402
					Headers: map[string]string{
						"Content-Type":                "application/json;charset=UTF-8",
						"Access-Control-Allow-Origin": "*",
					},
					Body: fmt.Sprintf(`{"error":"insufficient_balance","message":"Số dư ví không đủ để hoàn thành giao dịch này","required":%d,"current":%.2f,"shortage":%d}`, totalAmount, currentBalance, shortage),
				}, nil
			}
			// Fallback for generic insufficient balance message
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusPaymentRequired, // 402
				Headers: map[string]string{
					"Content-Type":                "application/json;charset=UTF-8",
					"Access-Control-Allow-Origin": "*",
				},
				Body: fmt.Sprintf(`{"error":"insufficient_balance","message":"Số dư ví không đủ để hoàn thành giao dịch này","required":%d,"current":%.2f}`, totalAmount, balance),
			}, nil
		}

		// For other errors, log and return 500
		fmt.Printf("[ERROR] ProcessWalletPayment failed: %v\n", err)
		return createMessageResponse(http.StatusInternalServerError, "Payment processing failed: "+err.Error())
	}

	// Return success response with message for frontend redirect
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type":                "application/json;charset=UTF-8",
			"Access-Control-Allow-Origin": "*",
		},
		Body: fmt.Sprintf(`{"status":"success","ticketIds":"%s","message":"Thanh toán thành công! Vé của bạn đã được đặt."}`, ticketIds),
	}, nil
}

// ============================================================
