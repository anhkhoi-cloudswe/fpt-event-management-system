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
// Admin Financial Center Handlers
// ============================================================

func extractUserRoleFromHeaders(headers map[string]string) string {
	keys := []string{"X-User-Role", "x-user-role", "user-role", "User-Role"}
	for _, key := range keys {
		if val, ok := headers[key]; ok && val != "" {
			return strings.ToUpper(strings.TrimSpace(val))
		}
	}
	for k, v := range headers {
		if strings.EqualFold(k, "X-User-Role") || strings.EqualFold(k, "user-role") {
			if v != "" {
				return strings.ToUpper(strings.TrimSpace(v))
			}
		}
	}
	return ""
}

// requireAdmin kiểm tra định danh và quyền ADMIN từ header gateway
func requireAdmin(request events.APIGatewayProxyRequest) (int, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return 0, fmt.Errorf("Unauthorized: thiếu thông tin xác thực (userId)")
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return 0, fmt.Errorf("Invalid userId format")
	}

	role := extractUserRoleFromHeaders(request.Headers)
	if role != "ADMIN" {
		return 0, fmt.Errorf("Forbidden: chỉ Quản trị viên (Role ADMIN) mới có quyền truy cập module này")
	}

	return userID, nil
}

// HandleGetAdminFinanceOverview - GET /api/v1/admin/finance/overview
func (h *TicketHandler) HandleGetAdminFinanceOverview(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	_, err := requireAdmin(request)
	if err != nil {
		if strings.HasPrefix(err.Error(), "Unauthorized") {
			return createMessageResponse(http.StatusUnauthorized, err.Error())
		}
		return createMessageResponse(http.StatusForbidden, err.Error())
	}

	overview, err := h.useCase.GetAdminFinanceOverview(ctx)
	if err != nil {
		log.Error("HandleGetAdminFinanceOverview error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	body, _ := json.Marshal(overview)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleGetAdminPayouts - GET /api/v1/admin/finance/payouts
func (h *TicketHandler) HandleGetAdminPayouts(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	_, err := requireAdmin(request)
	if err != nil {
		if strings.HasPrefix(err.Error(), "Unauthorized") {
			return createMessageResponse(http.StatusUnauthorized, err.Error())
		}
		return createMessageResponse(http.StatusForbidden, err.Error())
	}

	status := request.QueryStringParameters["status"]
	page, _ := strconv.Atoi(request.QueryStringParameters["page"])
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(request.QueryStringParameters["limit"])
	if limit < 1 {
		limit = 20
	}

	resp, err := h.useCase.GetAdminPayouts(ctx, status, page, limit)
	if err != nil {
		log.Error("HandleGetAdminPayouts error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	body, _ := json.Marshal(resp)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleProcessAdminPayout - POST /api/v1/admin/finance/payouts/{id}/process
func (h *TicketHandler) HandleProcessAdminPayout(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	adminID, err := requireAdmin(request)
	if err != nil {
		if strings.HasPrefix(err.Error(), "Unauthorized") {
			return createMessageResponse(http.StatusUnauthorized, err.Error())
		}
		return createMessageResponse(http.StatusForbidden, err.Error())
	}

	// Extract payout ID from path
	// e.g. /api/v1/admin/finance/payouts/12/process
	path := request.Path
	payoutIDStr := ""
	if strings.Contains(path, "/payouts/") {
		parts := strings.Split(path, "/")
		for i, part := range parts {
			if part == "payouts" && i+1 < len(parts) {
				payoutIDStr = parts[i+1]
				break
			}
		}
	}
	if payoutIDStr == "" {
		payoutIDStr = request.QueryStringParameters["id"]
	}

	payoutID, err := strconv.Atoi(payoutIDStr)
	if err != nil || payoutID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Missing or invalid payoutId in path")
	}

	var req models.ProcessPayoutRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid JSON body: "+err.Error())
	}

	if req.Action == "" {
		return createMessageResponse(http.StatusBadRequest, "Missing required field: action (APPROVE, COMPLETE, REJECT)")
	}

	if err := h.useCase.ProcessAdminPayout(ctx, adminID, payoutID, req); err != nil {
		log.Warn("HandleProcessAdminPayout rejected: %v", err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	msg := "Đã hoàn tất xử lý lệnh rút tiền thành công"
	if strings.EqualFold(req.Action, "REJECT") {
		msg = "Đã từ chối lệnh rút tiền và hoàn trả số dư vào ví Organizer thành công"
	}

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       fmt.Sprintf(`{"status":"success","message":"%s"}`, msg),
	}, nil
}

// HandleGetAdminFinancialReceipts - GET /api/v1/admin/finance/receipts
func (h *TicketHandler) HandleGetAdminFinancialReceipts(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	_, err := requireAdmin(request)
	if err != nil {
		if strings.HasPrefix(err.Error(), "Unauthorized") {
			return createMessageResponse(http.StatusUnauthorized, err.Error())
		}
		return createMessageResponse(http.StatusForbidden, err.Error())
	}

	search := request.QueryStringParameters["search"]
	page, _ := strconv.Atoi(request.QueryStringParameters["page"])
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(request.QueryStringParameters["limit"])
	if limit < 1 {
		limit = 20
	}

	resp, err := h.useCase.GetAdminFinancialReceipts(ctx, page, limit, search)
	if err != nil {
		log.Error("HandleGetAdminFinancialReceipts error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	body, _ := json.Marshal(resp)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

// HandleExportAdminFinancialReceipts - GET /api/v1/admin/finance/receipts/export
func (h *TicketHandler) HandleExportAdminFinancialReceipts(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	_, err := requireAdmin(request)
	if err != nil {
		if strings.HasPrefix(err.Error(), "Unauthorized") {
			return createMessageResponse(http.StatusUnauthorized, err.Error())
		}
		return createMessageResponse(http.StatusForbidden, err.Error())
	}

	csvData, err := h.useCase.ExportAdminFinancialReceiptsCSV(ctx)
	if err != nil {
		log.Error("HandleExportAdminFinancialReceipts error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, err.Error())
	}

	headers := defaultHeaders()
	headers["Content-Type"] = "text/csv; charset=utf-8"
	headers["Content-Disposition"] = `attachment; filename="financial_receipts_export.csv"`

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    headers,
		Body:       string(csvData),
	}, nil
}
