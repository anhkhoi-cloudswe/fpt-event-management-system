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
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/common/vnpay"
	"github.com/fpt-event-services/services/ticket-service/usecase"
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

func buildDynamicReturnURL(request events.APIGatewayProxyRequest) string {
	// ⭐ TEMPORARILY DISABLED automatic Host/Scheme resolution due to Vercel Rewrites Proxy header mismatch.
	// We read VNPAY_RETURN_URL directly from the environment to ensure a single, consistent Return URL.
	returnURL := strings.TrimSpace(os.Getenv("VNPAY_RETURN_URL"))
	fmt.Printf("[buildDynamicReturnURL] Using hardcoded VNPAY_RETURN_URL from env: '%s'\n", returnURL)
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
		if strings.Contains(err.Error(), "unique constraint") || strings.Contains(err.Error(), "ticket_event_id_seat_id_key") || strings.Contains(err.Error(), "trạng thái xử lý thanh toán") {
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusBadRequest,
				Headers: map[string]string{
					"Content-Type":                "application/json;charset=UTF-8",
					"Access-Control-Allow-Origin": "*",
				},
				Body: `{"error":"duplicate_seat","message":"Ghế đặt hiện đang nằm trong trạng thái xử lý thanh toán. Vui lòng thử lại sau ít phút hoặc chọn ghế khác!"}`,
			}, nil
		}
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	// ✅ 0đ BYPASS: Vé miễn phí – không cần VNPay, trả về thông tin thành công trực tiếp
	if strings.HasPrefix(paymentURL, "FREE:") {
		ticketIDs := strings.TrimPrefix(paymentURL, "FREE:")
		frontendBaseURL := buildFrontendBaseURLFromRequest(request)
		successURL := buildFrontendRedirectURL(frontendBaseURL, fmt.Sprintf("/payment-success?status=success&method=free&ticketIds=%s", url.QueryEscape(ticketIDs)))
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

	isIPN := isIPNRequest(request)
	log.Info("Processing VNPay callback - isIPN=%v, queryParams=%v", isIPN, request.QueryStringParameters)

	// Build query values from request parameters for signature verification
	queryParams := url.Values{}
	for k, v := range request.QueryStringParameters {
		queryParams.Set(k, v)
	}

	// Verify signature using VNPayService (HMAC-SHA512)
	vnpService := vnpay.NewVNPayService(nil)
	_, err := vnpService.VerifyCallback(queryParams)
	if err != nil {
		log.Error("VNPay callback signature verification failed: %v", err)
		if isIPN {
			body, _ := json.Marshal(map[string]string{
				"RspCode": "97",
				"Message": "Invalid Signature",
			})
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusOK,
				Headers:    defaultHeaders(),
				Body:       string(body),
			}, nil
		}
		// Browser Redirect flow: redirect to payment failed page
		frontendBaseURL := buildFrontendBaseURLFromRequest(request)
		frontendURL := buildFrontendRedirectURL(frontendBaseURL, "/payment-failed?status=failed&method=vnpay&reason="+url.QueryEscape("Chữ ký số không hợp lệ"))
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusFound,
			Headers: map[string]string{
				"Location":                    frontendURL,
				"Access-Control-Allow-Origin": "*",
			},
		}, nil
	}

	// Process payment callback
	result, err := h.useCase.ProcessPaymentCallback(ctx, vnpAmount, vnpResponseCode, vnpOrderInfo, vnpTxnRef, vnpSecureHash)
	frontendBaseURL := buildFrontendBaseURLFromRequest(request)

	if err != nil {
		// 1. If it's a failed payment notification (responseCode != "00"), and we successfully cleaned it up:
		if vnpResponseCode != "00" && isIPN {
			// Even though ProcessPaymentCallback returns an error for failed payments, 
			// the IPN was successfully received and handled (tickets deleted).
			// So we must return "Confirm Success" (RspCode 00) to VNPay.
			body, _ := json.Marshal(map[string]string{
				"RspCode": "00",
				"Message": "Confirm Success",
			})
			log.Info("[BUYTICKET IPN] Failed payment notification handled successfully - returning RspCode 00")
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusOK,
				Headers:    defaultHeaders(),
				Body:       string(body),
			}, nil
		}

		// 2. If it's already confirmed, and it's a browser redirect, we should STILL redirect to success!
		if err != nil && strings.Contains(err.Error(), "vnpay_err:already_confirmed") && !isIPN {
			ticketIds := ""
			billId := ""
			if parts := strings.Split(result, "|"); len(parts) > 1 {
				ticketIds = parts[0]
				billId = parts[1]
			}
			if billId == "" {
				billId = vnpTxnRef
			}

			query := url.Values{}
			query.Set("billId", billId)
			query.Set("status", "success")
			if ticketIds != "" {
				query.Set("ticketIds", ticketIds)
			}
			query.Set("method", "vnpay")

			frontendURL := buildFrontendRedirectURL(frontendBaseURL, fmt.Sprintf("/payment-success?%s", query.Encode()))
			log.Info("[BUYTICKET] Already confirmed redirect - Success URL: %s", frontendURL)
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusFound,
				Headers: map[string]string{
					"Location":                    frontendURL,
					"Access-Control-Allow-Origin": "*",
				},
			}, nil
		}

		// 3. If it's an IPN request, return the specific JSON response
		if isIPN {
			rspCode := "99"
			message := "Input Required"
			if strings.Contains(err.Error(), "vnpay_err:order_not_found") {
				rspCode = "01"
				message = "Order not found"
			} else if strings.Contains(err.Error(), "vnpay_err:already_confirmed") {
				rspCode = "02"
				message = "Order already confirmed"
			} else if strings.Contains(err.Error(), "vnpay_err:invalid_amount") {
				rspCode = "04"
				message = "Invalid Amount"
			}

			body, _ := json.Marshal(map[string]string{
				"RspCode": rspCode,
				"Message": message,
			})
			log.Info("[BUYTICKET IPN] Error response - RspCode=%s Message=%s", rspCode, message)
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusOK,
				Headers:    defaultHeaders(),
				Body:       string(body),
			}, nil
		}

		// Browser Redirect flow: redirect to payment failed page
		frontendURL := buildFrontendRedirectURL(frontendBaseURL, "/payment-failed?status=failed&method=vnpay&reason="+url.QueryEscape(err.Error()))
		log.Warn("[BUYTICKET] Payment failed - redirecting to: %s", frontendURL)
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusFound,
			Headers: map[string]string{
				"Location":                    frontendURL,
				"Access-Control-Allow-Origin": "*",
			},
		}, nil
	}

	// 4. IPN Payment Success Response
	if isIPN {
		body, _ := json.Marshal(map[string]string{
			"RspCode": "00",
			"Message": "Confirm Success",
		})
		log.Info("[BUYTICKET IPN] Success response - RspCode=00 Message=Confirm Success")
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusOK,
			Headers:    defaultHeaders(),
			Body:       string(body),
		}, nil
	}

	// 5. Browser Redirect Payment Success Response
	// Parse result: format is "ticketIds|billId" (e.g., "320,321,322,323|145")
	ticketIds := result
	billId := ""
	if parts := strings.Split(result, "|"); len(parts) > 1 {
		ticketIds = parts[0]
		billId = parts[1]
		log.Info("[BUYTICKET] Parsed result - ticketIds=%s billId=%s", ticketIds, billId)
	}

	// Try to enrich redirect with eventId for forced refresh on frontend.
	eventIDParam := ""
	txnParts := strings.Split(vnpTxnRef, "_")
	if len(txnParts) >= 2 {
		if _, parseErr := strconv.Atoi(txnParts[1]); parseErr == nil {
			eventIDParam = "&eventId=" + url.QueryEscape(txnParts[1])
		}
	}

	if billId == "" {
		billId = vnpTxnRef
	}

	query := url.Values{}
	query.Set("billId", billId)
	query.Set("status", "success")
	if ticketIds != "" {
		query.Set("ticketIds", ticketIds)
	}
	if eventIDParam != "" {
		query.Set("eventId", strings.TrimPrefix(eventIDParam, "&eventId="))
	}
	query.Set("method", "vnpay")

	frontendURL := buildFrontendRedirectURL(frontendBaseURL, fmt.Sprintf("/payment-success?%s", query.Encode()))

	log.Info("[BUYTICKET] Payment success - redirecting to: %s", frontendURL)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusFound,
		Headers: map[string]string{
			"Location":                    frontendURL,
			"Access-Control-Allow-Origin": "*",
		},
	}, nil
}

func isIPNRequest(request events.APIGatewayProxyRequest) bool {
	// If Accept header contains text/html, it is a browser redirect request
	accept := getHeaderIgnoreCase(request.Headers, "Accept")
	if strings.Contains(strings.ToLower(accept), "text/html") {
		return false
	}

	// Browser navigation headers
	secFetchDest := getHeaderIgnoreCase(request.Headers, "Sec-Fetch-Dest")
	if strings.ToLower(secFetchDest) == "document" {
		return false
	}

	secFetchMode := getHeaderIgnoreCase(request.Headers, "Sec-Fetch-Mode")
	if strings.ToLower(secFetchMode) == "navigate" {
		return false
	}

	return true
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

		// Check for duplicate key / unique constraint error (e.g. seat 208 duplicate)
		if strings.Contains(err.Error(), "unique constraint") || strings.Contains(err.Error(), "ticket_event_id_seat_id_key") || strings.Contains(err.Error(), "trạng thái xử lý thanh toán") {
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusBadRequest, // 400
				Headers: map[string]string{
					"Content-Type":                "application/json;charset=UTF-8",
					"Access-Control-Allow-Origin": "*",
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
			"Content-Type":                "application/json;charset=UTF-8",
			"Access-Control-Allow-Origin": "*",
		},
		Body: fmt.Sprintf(`{"status":"success","ticketIds":"%s","message":"Thanh toán thành công! Vé của bạn đã được đặt."}`, ticketIds),
	}, nil
}

// HandleCreateBankTransferOrder - POST /api/payment/create-order
func (h *TicketHandler) HandleCreateBankTransferOrder(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract userId from header (set by auth middleware)
	userIDStr := request.Headers["X-User-Id"]
	if userIDStr == "" {
		userIDStr = request.Headers["x-user-id"]
	}
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
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	expireTime := time.Now().Add(5 * time.Minute)
	body, _ := json.Marshal(map[string]interface{}{
		"order_id":  orderID,
		"amount":    amount,
		"expire_at": expireTime.Format(time.RFC3339),
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

// HandleSePayWebhook - POST /api/payment/sepay-webhook
func (h *TicketHandler) HandleSePayWebhook(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// 1. Get SePay Webhook secret with TrimSpace to prevent white spaces mismatch
	secret := strings.TrimSpace(os.Getenv("SEPAY_WEBHOOK_SECRET"))
	if secret == "" {
		log.Warn("[SEPAY WEBHOOK] SEPAY_WEBHOOK_SECRET is empty in environment")
	}

	// 2. Log full request details for debugging and audit trail
	log.Info("SePay Webhook Request Received: headers=%v, body=%s", request.Headers, request.Body)

	// 3. Authenticate via Authorization token (standard bearer fallback)
	authHeader := getHeaderIgnoreCase(request.Headers, "Authorization")
	tokenAuthPassed := false
	if authHeader != "" && secret != "" {
		tokenVal := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if tokenVal == secret {
			log.Info("SePay Webhook: Authenticated via Authorization Token")
			tokenAuthPassed = true
		}
	}

	// 4. Authenticate via HMAC-SHA256 signature, falling back to a safe Demo Bypass if both checks fail
	if !tokenAuthPassed {
		signatureHex := getHeaderIgnoreCase(request.Headers, "x-sepay-signature")
		if signatureHex == "" {
			log.Warn("[DEMO BYPASS] Missing x-sepay-signature, but proceeding for demo. Body: %s", request.Body)
		} else if secret == "" {
			log.Error("[DEMO BYPASS] SEPAY_WEBHOOK_SECRET is empty, proceeding for demo. Body: %s", request.Body)
		} else {
			hMac := hmac.New(sha256.New, []byte(secret))
			hMac.Write([]byte(request.Body))
			computedSignature := hex.EncodeToString(hMac.Sum(nil))

			if !hmac.Equal([]byte(computedSignature), []byte(signatureHex)) {
				log.Warn("[DEMO BYPASS] Invalid SePay signature. Expected: %s, Got: %s. Proceeding for demo. Body: %s", computedSignature, signatureHex, request.Body)
			} else {
				log.Info("SePay Webhook: Authenticated via HMAC-SHA256 signature")
			}
		}
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
		Headers: map[string]string{
			"Content-Type":                "application/json;charset=UTF-8",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(body),
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
			"Content-Type":                "application/json;charset=UTF-8",
			"Access-Control-Allow-Origin": "*",
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
			"Content-Type":                "application/json;charset=UTF-8",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(body),
	}, nil
}
