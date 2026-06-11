package handler

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/logger"
	commonresponse "github.com/fpt-event-services/common/response"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/ticket-service/usecase"
)

var (
	log              = logger.Default()
	idempotencyStore sync.Map
)

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
	userIDStr := extractUserIDFromHeaders(request.Headers)
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
	userIDStr := extractUserIDFromHeaders(request.Headers)

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

	// Optional limit & offset for pagination
	limit := -1
	offset := -1
	if limitStr := request.QueryStringParameters["limit"]; limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l >= 0 {
			limit = l
		}
	}
	if offsetStr := request.QueryStringParameters["offset"]; offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	tickets, totalCount, err := h.useCase.GetTicketsByRole(ctx, role, userID, eventID, limit, offset)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading tickets")
	}

	if limit < 0 {
		return createJSONResponse(http.StatusOK, tickets)
	}

	return createJSONResponse(http.StatusOK, map[string]interface{}{
		"tickets":    tickets,
		"totalCount": totalCount,
	})
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
	userIDStr := extractUserIDFromHeaders(request.Headers)
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
	body, err := utils.MarshalVietnamJSON(data)
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
	return commonresponse.LambdaHeaders()
}

func getHeaderIgnoreCase(headers map[string]string, key string) string {
	for headerKey, value := range headers {
		if strings.EqualFold(headerKey, key) {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func getFrontendBaseURL() string {
	if frontendBaseURL := strings.TrimSpace(os.Getenv("FRONTEND_BASE_URL")); frontendBaseURL != "" {
		return strings.TrimRight(frontendBaseURL, "/")
	}
	return ""
}

func buildFrontendRedirectURL(baseURL, pathWithQuery string) string {
	if strings.TrimSpace(baseURL) == "" {
		// Fallback to relative redirect so browser stays on current domain when base is unavailable.
		return pathWithQuery
	}
	return strings.TrimRight(baseURL, "/") + pathWithQuery
}

func buildFrontendBaseURLFromRequest(request events.APIGatewayProxyRequest) string {
	origin := getHeaderIgnoreCase(request.Headers, "Origin")
	if origin != "" {
		parsed, err := url.Parse(origin)
		if err == nil && parsed.Scheme != "" && parsed.Host != "" {
			baseURL := fmt.Sprintf("%s://%s", strings.ToLower(parsed.Scheme), parsed.Host)
			log.Info("[FRONTEND_BASE_URL] Using Origin header: %s", baseURL)
			return baseURL
		}
	}

	host := getHeaderIgnoreCase(request.Headers, "Host")
	if host != "" {
		scheme := getHeaderIgnoreCase(request.Headers, "X-Forwarded-Proto")
		if scheme != "" {
			if commaIdx := strings.Index(scheme, ","); commaIdx >= 0 {
				scheme = scheme[:commaIdx]
			}
			scheme = strings.ToLower(strings.TrimSpace(scheme))
		}

		if scheme == "" || (scheme != "http" && scheme != "https") {
			if isLocalHost(host) {
				scheme = "http"
			} else {
				scheme = "https"
			}
		}

		baseURL := fmt.Sprintf("%s://%s", scheme, host)
		log.Info("[FRONTEND_BASE_URL] Using Host header: %s", baseURL)
		return baseURL
	}

	fallback := getFrontendBaseURL()
	log.Info("[FRONTEND_BASE_URL] Using FRONTEND_BASE_URL fallback: %s", fallback)
	return fallback
}

func isLocalHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return false
	}
	hostOnly := strings.Split(host, ":")[0]
	return hostOnly == "localhost" || hostOnly == "127.0.0.1"
}



// ============================================================
// HandleGetWalletBalance - GET /api/wallet/balance
// Get user's wallet balance for pre-check before payment
// ============================================================
func (h *TicketHandler) HandleGetWalletBalance(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Priority 1: X-User-Id header injected by Gateway (Trusted Gateway pattern)
	userIDStr := extractUserIDFromHeaders(request.Headers)

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
			"Content-Type": "application/json;charset=UTF-8",
			"Vary":         "Origin",
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
	userIDStr := extractUserIDFromHeaders(request.Headers)
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

	// Idempotency check
	clientKey := getHeaderIgnoreCase(request.Headers, "Idempotency-Key")
	isDuplicate, idempotencyKey := checkIdempotency(userID, paymentReq.EventID, paymentReq.SeatIDs, clientKey)
	if isDuplicate {
		body, _ := json.Marshal(map[string]interface{}{
			"error":   "duplicate_transaction",
			"message": "Giao dịch đang được xử lý. Vui lòng không gửi yêu cầu trùng lặp!",
			"key":     idempotencyKey,
		})
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusConflict,
			Headers:    defaultHeaders(),
			Body:       string(body),
		}, nil
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
				"Content-Type": "application/json;charset=UTF-8",
				"Vary":         "Origin",
			},
			Body: fmt.Sprintf(`{"error":"insufficient_balance","required":%d,"current":%.2f,"shortage":%.2f}`, totalAmount, balance, shortage),
		}, nil
	}

	// Process wallet payment
	ticketIds, err := h.useCase.ProcessWalletPayment(ctx, userID, paymentReq.EventID, paymentReq.CategoryTicketID, paymentReq.SeatIDs, totalAmount)
	if err != nil {
		if strings.Contains(err.Error(), "[E4002]|") {
			splitErr := strings.Split(err.Error(), "[E4002]|")
			dataParts := strings.Split(splitErr[1], "|")

			billID := ""
			seatsStr := ""
			seatIDsStr := ""
			eventIDStr := ""
			catIDStr := ""
			remSecsStr := ""
			if len(dataParts) >= 6 {
				billID = dataParts[0]
				seatsStr = dataParts[1]
				seatIDsStr = dataParts[2]
				eventIDStr = dataParts[3]
				catIDStr = dataParts[4]
				remSecsStr = dataParts[5]
			}

			seats := []string{}
			if seatsStr != "" {
				seats = strings.Split(seatsStr, ",")
			}

			seatIDs := []int{}
			if seatIDsStr != "" {
				for _, s := range strings.Split(seatIDsStr, ",") {
					id, _ := strconv.Atoi(s)
					seatIDs = append(seatIDs, id)
				}
			}

			evID, _ := strconv.Atoi(eventIDStr)
			catID, _ := strconv.Atoi(catIDStr)
			remSecs, _ := strconv.Atoi(remSecsStr)

			body, _ := json.Marshal(map[string]interface{}{
				"errorCode":        "E4002",
				"pendingBillId":    billID,
				"seats":            seats,
				"seatIds":          seatIDs,
				"eventId":          evID,
				"categoryTicketId": catID,
				"remainingSeconds": remSecs,
				"message":          fmt.Sprintf("Bạn đang có một đơn hàng giữ chỗ chưa hoàn tất cho ghế [%s]. Vui lòng xử lý đơn hàng này trước.", seatsStr),
			})
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusBadRequest,
				Headers: map[string]string{
					"Content-Type": "application/json;charset=UTF-8",
					"Vary":         "Origin",
				},
				Body: string(body),
			}, nil
		}
		if strings.Contains(err.Error(), "[E4003]|") {
			splitErr := strings.Split(err.Error(), "[E4003]|")
			dataParts := strings.Split(splitErr[1], "|")
			seconds := 0
			if len(dataParts) >= 1 {
				seconds, _ = strconv.Atoi(dataParts[0])
			}
			body, _ := json.Marshal(map[string]interface{}{
				"errorCode":        "E4003",
				"remainingSeconds": seconds,
				"message":          fmt.Sprintf("Tài khoản của bạn đã bị tạm khóa tính năng đặt vé. Vui lòng thử lại sau: %02d phút %02d giây do có hành vi giữ chỗ rác liên tục.", seconds/60, seconds%60),
			})
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusBadRequest,
				Headers: map[string]string{
					"Content-Type": "application/json;charset=UTF-8",
					"Vary":         "Origin",
				},
				Body: string(body),
			}, nil
		}
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
						"Content-Type": "application/json;charset=UTF-8",
						"Vary":         "Origin",
					},
					Body: fmt.Sprintf(`{"error":"insufficient_balance","message":"Số dư ví không đủ để hoàn thành giao dịch này","required":%d,"current":%.2f,"shortage":%d}`, totalAmount, currentBalance, shortage),
				}, nil
			}
			// Fallback for generic insufficient balance message
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusPaymentRequired, // 402
				Headers: map[string]string{
					"Content-Type": "application/json;charset=UTF-8",
					"Vary":         "Origin",
				},
				Body: fmt.Sprintf(`{"error":"insufficient_balance","message":"Số dư ví không đủ để hoàn thành giao dịch này","required":%d,"current":%.2f}`, totalAmount, balance),
			}, nil
		}

		// Check for duplicate key / unique constraint error (e.g. seat 208 duplicate)
		if strings.Contains(err.Error(), "unique constraint") || strings.Contains(err.Error(), "ticket_event_id_seat_id_key") || strings.Contains(err.Error(), "trạng thái xử lý thanh toán") {
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusBadRequest, // 400
				Headers: map[string]string{
					"Content-Type": "application/json;charset=UTF-8",
					"Vary":         "Origin",
				},
				Body: `{"error":"duplicate_seat","message":"Ghế đặt hiện đang nằm trong trạng thái xử lý thanh toán. Vui lòng thử lại sau ít phút hoặc chọn ghế khác!"}`,
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
			"Content-Type": "application/json;charset=UTF-8",
			"Vary":         "Origin",
		},
		Body: fmt.Sprintf(`{"status":"success","ticketIds":"%s","message":"Thanh toán thành công! Vé của bạn đã được đặt."}`, ticketIds),
	}, nil
}

// HandleCreateBankTransferOrder - POST /api/payment/create-order
func (h *TicketHandler) HandleCreateBankTransferOrder(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract userId from header (set by auth middleware)
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "User ID not found")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid user ID format")
	}

	type CreateOrderRequest struct {
		EventID          int   `json:"eventId"`
		CategoryTicketID int   `json:"categoryTicketId"`
		SeatIDs          []int `json:"seatIds"`
	}

	var req CreateOrderRequest
	if request.Body != "" {
		err := json.Unmarshal([]byte(request.Body), &req)
		if err != nil {
			return createMessageResponse(http.StatusBadRequest, "Invalid request body: "+err.Error())
		}
	} else {
		// Fallback to query parameters
		eventIDStr := request.QueryStringParameters["eventId"]
		categoryTicketIDStr := request.QueryStringParameters["categoryTicketId"]
		seatIDStr := request.QueryStringParameters["seatIds"]

		if eventIDStr == "" || categoryTicketIDStr == "" || seatIDStr == "" {
			return createMessageResponse(http.StatusBadRequest, "Missing parameters: eventId, categoryTicketId, seatIds")
		}

		eventID, _ := strconv.Atoi(eventIDStr)
		categoryTicketID, _ := strconv.Atoi(categoryTicketIDStr)

		seatIDs := []int{}
		for _, part := range strings.Split(seatIDStr, ",") {
			id, err := strconv.Atoi(strings.TrimSpace(part))
			if err == nil {
				seatIDs = append(seatIDs, id)
			}
		}

		req.EventID = eventID
		req.CategoryTicketID = categoryTicketID
		req.SeatIDs = seatIDs
	}

	if req.EventID == 0 || len(req.SeatIDs) == 0 {
		return createMessageResponse(http.StatusBadRequest, "Missing required parameters")
	}

	// Call usecase to create the pending order
	orderID, amount, err := h.useCase.CreateBankTransferOrder(ctx, userID, req.EventID, req.CategoryTicketID, req.SeatIDs)
	if err != nil {
		if strings.Contains(err.Error(), "[E4002]|") {
			splitErr := strings.Split(err.Error(), "[E4002]|")
			dataParts := strings.Split(splitErr[1], "|")

			billID := ""
			seatsStr := ""
			seatIDsStr := ""
			eventIDStr := ""
			catIDStr := ""
			remSecsStr := ""
			if len(dataParts) >= 6 {
				billID = dataParts[0]
				seatsStr = dataParts[1]
				seatIDsStr = dataParts[2]
				eventIDStr = dataParts[3]
				catIDStr = dataParts[4]
				remSecsStr = dataParts[5]
			}

			seats := []string{}
			if seatsStr != "" {
				seats = strings.Split(seatsStr, ",")
			}

			seatIDs := []int{}
			if seatIDsStr != "" {
				for _, s := range strings.Split(seatIDsStr, ",") {
					id, _ := strconv.Atoi(s)
					seatIDs = append(seatIDs, id)
				}
			}

			evID, _ := strconv.Atoi(eventIDStr)
			catID, _ := strconv.Atoi(catIDStr)
			remSecs, _ := strconv.Atoi(remSecsStr)

			body, _ := json.Marshal(map[string]interface{}{
				"errorCode":        "E4002",
				"pendingBillId":    billID,
				"seats":            seats,
				"seatIds":          seatIDs,
				"eventId":          evID,
				"categoryTicketId": catID,
				"remainingSeconds": remSecs,
				"message":          fmt.Sprintf("Bạn đang có một đơn hàng giữ chỗ chưa hoàn tất cho ghế [%s]. Vui lòng xử lý đơn hàng này trước.", seatsStr),
			})
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusBadRequest,
				Headers: map[string]string{
					"Content-Type": "application/json;charset=UTF-8",
					"Vary":         "Origin",
				},
				Body: string(body),
			}, nil
		}
		if strings.Contains(err.Error(), "[E4003]|") {
			splitErr := strings.Split(err.Error(), "[E4003]|")
			dataParts := strings.Split(splitErr[1], "|")
			seconds := 0
			if len(dataParts) >= 1 {
				seconds, _ = strconv.Atoi(dataParts[0])
			}
			body, _ := json.Marshal(map[string]interface{}{
				"errorCode":        "E4003",
				"remainingSeconds": seconds,
				"message":          fmt.Sprintf("Tài khoản của bạn đã bị tạm khóa tính năng đặt vé. Vui lòng thử lại sau: %02d phút %02d giây do có hành vi giữ chỗ rác liên tục.", seconds/60, seconds%60),
			})
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusBadRequest,
				Headers: map[string]string{
					"Content-Type": "application/json;charset=UTF-8",
					"Vary":         "Origin",
				},
				Body: string(body),
			}, nil
		}
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	createdAt, dbErr := h.useCase.GetBillCreatedAt(ctx, int(orderID))
	var expireTime time.Time
	if dbErr == nil {
		expireTime = createdAt.Add(5 * time.Minute)
	} else {
		expireTime = time.Now().Add(5 * time.Minute)
		createdAt = time.Now()
	}

	var ticketIDsStr string
	if amount == 0 {
		tids, _ := h.useCase.GetTicketIDsByBillID(ctx, orderID)
		ticketIDsStr = strings.Join(tids, ",")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"order_id":   orderID,
		"amount":     amount,
		"expire_at":  expireTime.Format(time.RFC3339),
		"expiresAt":  expireTime.Format(time.RFC3339),
		"createdAt":  createdAt.Format(time.RFC3339),
		"serverTime": time.Now().Format(time.RFC3339),
		"free":       amount == 0,
		"ticketIds":  ticketIDsStr,
		"successUrl": fmt.Sprintf("/dashboard/payment/success?status=success&method=free&ticketIds=%s", url.QueryEscape(ticketIDsStr)),
	})

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type": "application/json;charset=UTF-8",
			"Vary":         "Origin",
		},
		Body: string(body),
	}, nil
}

// HandleSePayWebhook - POST /api/payment/sepay-webhook
func (h *TicketHandler) HandleSePayWebhook(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	secret := strings.TrimSpace(os.Getenv("SEPAY_WEBHOOK_SECRET"))
	if secret == "" {
		log.Error("[SEPAY WEBHOOK] SEPAY_WEBHOOK_SECRET is empty")
		return createMessageResponse(http.StatusInternalServerError, "Webhook secret is not configured")
	}

	log.Info("SePay Webhook Request Received")

	signatureHex := getHeaderIgnoreCase(request.Headers, "x-sepay-signature")
	if signatureHex == "" {
		return createMessageResponse(http.StatusUnauthorized, "Missing webhook signature")
	}
	hMac := hmac.New(sha256.New, []byte(secret))
	hMac.Write([]byte(request.Body))
	computedSignature := hex.EncodeToString(hMac.Sum(nil))
	if !hmac.Equal([]byte(computedSignature), []byte(strings.TrimSpace(signatureHex))) {
		log.Warn("SePay Webhook: invalid signature")
		return createMessageResponse(http.StatusUnauthorized, "Invalid webhook signature")
	}

	type SePayWebhookPayload struct {
		Gateway        string  `json:"gateway"`
		TransferAmount float64 `json:"transferAmount"`
		Content        string  `json:"content"`
		TransferAt     string  `json:"transfer_at"`
	}

	var payload SePayWebhookPayload
	err := json.Unmarshal([]byte(request.Body), &payload)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid JSON body: "+err.Error())
	}

	// Call usecase to process the webhook with parsed TransferAmount
	result, err := h.useCase.ProcessSePayWebhook(ctx, payload.Gateway, payload.TransferAmount, payload.Content, payload.TransferAt)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	body, _ := json.Marshal(map[string]string{
		"status": "success",
		"result": result,
	})

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleCheckPaymentStatus - GET /api/payment/check-status/:order_id
func (h *TicketHandler) HandleCheckPaymentStatus(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	path := request.Path
	orderIDStr := strings.TrimPrefix(path, "/api/payment/check-status/")

	// Fallback to query parameter if not in path
	if orderIDStr == "" || orderIDStr == path {
		orderIDStr = request.QueryStringParameters["order_id"]
	}

	if orderIDStr == "" {
		return createMessageResponse(http.StatusBadRequest, "Missing order_id")
	}

	orderID, err := strconv.ParseInt(orderIDStr, 10, 64)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid order_id format")
	}

	status, err := h.useCase.GetPaymentStatus(ctx, orderID)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	body, _ := json.Marshal(map[string]string{
		"status": status,
	})

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type": "application/json;charset=UTF-8",
			"Vary":         "Origin",
		},
		Body: string(body),
	}, nil
}

// HandleCancelOrder - POST /api/payment/cancel-order
func (h *TicketHandler) HandleCancelOrder(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	type CancelOrderRequest struct {
		OrderID int64 `json:"order_id"`
	}

	var req CancelOrderRequest
	if request.Body != "" {
		_ = json.Unmarshal([]byte(request.Body), &req)
	}

	// Fallback: check query parameters for both order_id and bill_id
	if req.OrderID == 0 {
		orderIDStr := request.QueryStringParameters["order_id"]
		if orderIDStr == "" {
			orderIDStr = request.QueryStringParameters["bill_id"]
		}
		if orderIDStr != "" {
			if parsedID, parseErr := strconv.ParseInt(orderIDStr, 10, 64); parseErr == nil {
				req.OrderID = parsedID
			}
		}
	}

	if req.OrderID == 0 {
		return createMessageResponse(http.StatusBadRequest, "Missing or invalid order_id")
	}

	err := h.useCase.CancelOrder(ctx, req.OrderID)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	body, _ := json.Marshal(map[string]string{
		"status":  "success",
		"message": "Order canceled successfully, tickets deleted and seats released",
	})

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type": "application/json;charset=UTF-8",
			"Vary":         "Origin",
		},
		Body: string(body),
	}, nil
}

// HandleGetActiveOrder - GET /api/payment/active-order?seatIds=1,2,3
func (h *TicketHandler) HandleGetActiveOrder(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	seatIDsStr := request.QueryStringParameters["seatIds"]
	if seatIDsStr == "" {
		seatIDsStr = request.QueryStringParameters["seatId"]
	}
	if seatIDsStr == "" {
		return createMessageResponse(http.StatusBadRequest, "Missing seatIds")
	}

	seatIDs := []int{}
	for _, part := range strings.Split(seatIDsStr, ",") {
		id, err := strconv.Atoi(strings.TrimSpace(part))
		if err == nil {
			seatIDs = append(seatIDs, id)
		}
	}

	if len(seatIDs) == 0 {
		return createMessageResponse(http.StatusBadRequest, "No valid seatIds provided")
	}

	orderData, err := h.useCase.GetActiveOrderForSeats(ctx, seatIDs)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	if orderData == nil {
		body, _ := json.Marshal(map[string]interface{}{"active": false})
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusOK,
			Headers: map[string]string{
				"Content-Type": "application/json;charset=UTF-8",
				"Vary":         "Origin",
			},
			Body: string(body),
		}, nil
	}

	body, _ := json.Marshal(map[string]interface{}{
		"active": true,
		"order":  orderData,
	})

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type": "application/json;charset=UTF-8",
			"Vary":         "Origin",
		},
		Body: string(body),
	}, nil
}

// checkIdempotency checks if a transaction is already in progress.
// It returns true if it's a duplicate, and the generated key.
func checkIdempotency(userID, eventID int, seatIDs []int, clientKey string) (bool, string) {
	// Generate key based on user_id, event_id, and sorted seat_ids
	sortedSeats := make([]int, len(seatIDs))
	copy(sortedSeats, seatIDs)
	for i := 0; i < len(sortedSeats); i++ {
		for j := i + 1; j < len(sortedSeats); j++ {
			if sortedSeats[i] > sortedSeats[j] {
				sortedSeats[i], sortedSeats[j] = sortedSeats[j], sortedSeats[i]
			}
		}
	}

	seatsStr := ""
	for i, id := range sortedSeats {
		if i > 0 {
			seatsStr += ","
		}
		seatsStr += strconv.Itoa(id)
	}

	key := fmt.Sprintf("%d:%d:%s", userID, eventID, seatsStr)
	if clientKey != "" {
		key = clientKey
	}

	now := time.Now()
	if val, ok := idempotencyStore.Load(key); ok {
		if expireTime, ok := val.(time.Time); ok {
			if now.Before(expireTime) {
				return true, key
			}
		}
	}

	// Store key with 5 minutes expiration
	idempotencyStore.Store(key, now.Add(5*time.Minute))
	return false, key
}

func extractUserIDFromHeaders(headers map[string]string) string {
	keys := []string{"X-User-Id", "x-user-id", "X-User-ID", "user-id", "User-Id"}
	for _, key := range keys {
		if val, ok := headers[key]; ok && val != "" {
			return val
		}
	}
	// Fallback to case-insensitive check
	for k, v := range headers {
		if strings.EqualFold(k, "X-User-Id") || strings.EqualFold(k, "user-id") {
			if v != "" {
				return v
			}
		}
	}
	return ""
}
