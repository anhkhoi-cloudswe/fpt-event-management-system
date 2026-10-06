package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/services/ticket-service/models"
)

// ============================================================
// Organizer Wallet HTTP Handlers
// ============================================================

// HandleGetOrganizerWallet - GET /api/v1/organizer/wallet
func (h *TicketHandler) HandleGetOrganizerWallet(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing userId")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	wallet, err := h.useCase.GetOrganizerWallet(ctx, userID)
	if err != nil {
		log.Error("HandleGetOrganizerWallet error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	body, _ := json.Marshal(wallet)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleGetOrganizerWalletTransactions - GET /api/v1/organizer/wallet/transactions
func (h *TicketHandler) HandleGetOrganizerWalletTransactions(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing userId")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	params := request.QueryStringParameters
	page, _ := strconv.Atoi(params["page"])
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(params["limit"])
	if limit < 1 {
		limit = 20
	}
	txType := params["type"]
	startDate := params["startDate"]
	endDate := params["endDate"]

	resp, err := h.useCase.GetOrganizerWalletTransactions(ctx, userID, page, limit, txType, startDate, endDate)
	if err != nil {
		log.Error("HandleGetOrganizerWalletTransactions error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	body, _ := json.Marshal(resp)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleGetEventFinancialReport - GET /api/v1/organizer/events/{id}/financial-report
func (h *TicketHandler) HandleGetEventFinancialReport(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing userId")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	// Trích xuất eventID từ Path hoặc Query
	path := request.Path
	eventIDStr := ""
	if strings.Contains(path, "/financial-report") {
		parts := strings.Split(path, "/")
		for i, part := range parts {
			if part == "events" && i+1 < len(parts) {
				eventIDStr = parts[i+1]
				break
			}
		}
	}
	if eventIDStr == "" {
		eventIDStr = request.QueryStringParameters["eventId"]
	}

	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil || eventID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Missing or invalid eventId")
	}

	report, err := h.useCase.GetEventFinancialReport(ctx, userID, eventID)
	if err != nil {
		log.Error("HandleGetEventFinancialReport error: %v", err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	body, _ := json.Marshal(report)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleOrganizerWalletTopup - POST /api/v1/organizer/wallet/topup
func (h *TicketHandler) HandleOrganizerWalletTopup(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing userId")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	var req models.TopupWalletRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid JSON body: "+err.Error())
	}

	resp, err := h.useCase.CreateOrganizerTopupOrder(ctx, userID, req.Amount, req.TierCode)
	if err != nil {
		log.Error("HandleOrganizerWalletTopup error: %v", err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	body, _ := json.Marshal(resp)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleCreateOrganizerBankAccount - POST /api/v1/organizer/bank-accounts
func (h *TicketHandler) HandleCreateOrganizerBankAccount(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing userId")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	var req models.CreateBankAccountRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid JSON body: "+err.Error())
	}

	if req.BankCode == "" || req.AccountNumber == "" || req.AccountHolderName == "" {
		return createMessageResponse(http.StatusBadRequest, "Thiếu thông tin tài khoản ngân hàng bắt buộc")
	}

	account, err := h.useCase.AddOrganizerBankAccount(ctx, userID, req)
	if err != nil {
		log.Error("HandleCreateOrganizerBankAccount error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	body, _ := json.Marshal(account)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleGetOrganizerBankAccounts - GET /api/v1/organizer/bank-accounts
func (h *TicketHandler) HandleGetOrganizerBankAccounts(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing userId")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	accounts, err := h.useCase.GetOrganizerBankAccounts(ctx, userID)
	if err != nil {
		log.Error("HandleGetOrganizerBankAccounts error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	body, _ := json.Marshal(accounts)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleRequestPayout - POST /api/v1/organizer/wallet/payout
func (h *TicketHandler) HandleRequestPayout(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing userId")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	var req models.CreatePayoutRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid JSON body: "+err.Error())
	}

	if req.BankAccountID <= 0 || req.Amount <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Thiếu thông tin rút tiền hoặc số tiền không hợp lệ")
	}

	payout, err := h.useCase.RequestPayout(ctx, userID, req)
	if err != nil {
		log.Warn("HandleRequestPayout rejected: %v", err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	body, _ := json.Marshal(payout)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleGetPayoutRequests - GET /api/v1/organizer/wallet/payouts
func (h *TicketHandler) HandleGetPayoutRequests(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing userId")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	params := request.QueryStringParameters
	page, _ := strconv.Atoi(params["page"])
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(params["limit"])
	if limit < 1 {
		limit = 20
	}

	items, total, err := h.useCase.GetPayoutRequests(ctx, userID, page, limit)
	if err != nil {
		log.Error("HandleGetPayoutRequests error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	resp := map[string]interface{}{
		"payouts":      items,
		"totalRecords": total,
		"currentPage":  page,
		"limit":        limit,
	}

	body, _ := json.Marshal(resp)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleSettleEventPayout - POST /api/v1/organizer/events/{id}/settle
// Only the owning organizer (or ADMIN) should call this.
// The ReleaseEventPendingPayout repo func already guards against non-FINISHED events
// and is idempotent via is_settled flag.
func (h *TicketHandler) HandleSettleEventPayout(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Require authenticated user
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing userId")
	}

	path := request.Path
	eventIDStr := ""
	if strings.Contains(path, "/settle") {
		parts := strings.Split(path, "/")
		for i, part := range parts {
			if part == "events" && i+1 < len(parts) {
				eventIDStr = parts[i+1]
				break
			}
		}
	}
	if eventIDStr == "" {
		eventIDStr = request.QueryStringParameters["eventId"]
	}

	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil || eventID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Missing or invalid eventId")
	}

	if err := h.useCase.ReleaseEventPendingPayout(ctx, eventID); err != nil {
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       fmt.Sprintf(`{"status":"success","message":"Quyết toán sự kiện #%d thành công, doanh thu tạm giữ đã được giải phóng vào số dư khả dụng."}`, eventID),
	}, nil
}
