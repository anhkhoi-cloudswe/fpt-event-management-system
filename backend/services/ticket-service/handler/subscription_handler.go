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

// HandleGetSubscriptionTiers - GET /api/v1/subscription/tiers
func (h *TicketHandler) HandleGetSubscriptionTiers(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	tiers, err := h.useCase.GetSubscriptionTiers(ctx)
	if err != nil {
		log.Error("HandleGetSubscriptionTiers error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Lỗi lấy danh sách gói dịch vụ: "+err.Error())
	}
	return createJSONResponse(http.StatusOK, tiers)
}

// HandleGetCurrentSubscription - GET /api/v1/subscription/current
func (h *TicketHandler) HandleGetCurrentSubscription(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: thiếu thông tin xác thực")
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	role := extractUserRoleFromHeaders(request.Headers)
	if role == "ADMIN" {
		return createMessageResponse(http.StatusForbidden, "Tài khoản Quản trị viên (ADMIN) có toàn quyền trên hệ thống và không cần sử dụng hoặc mua gói dịch vụ.")
	}

	sub, err := h.useCase.GetCurrentSubscription(ctx, userID)
	if err != nil {
		log.Error("HandleGetCurrentSubscription error for user %d: %v", userID, err)
		return createMessageResponse(http.StatusInternalServerError, "Lỗi xác thực gói hiện tại: "+err.Error())
	}
	return createJSONResponse(http.StatusOK, sub)
}

// HandleSubscribeOrUpgrade - POST /api/v1/subscription/subscribe
func (h *TicketHandler) HandleSubscribeOrUpgrade(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: thiếu thông tin xác thực")
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	role := extractUserRoleFromHeaders(request.Headers)
	if role == "ADMIN" {
		return createMessageResponse(http.StatusForbidden, "Quản trị viên (ADMIN) không được phép thực hiện giao dịch mua gói dịch vụ.")
	}

	var req models.SubscribeRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Dữ liệu yêu cầu không hợp lệ")
	}

	if req.TierCode == "" {
		return createMessageResponse(http.StatusBadRequest, "Vui lòng chọn gói dịch vụ (tierCode)")
	}

	resp, err := h.useCase.SubscribeOrUpgrade(ctx, userID, req)
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "số dư ví không đủ") || strings.Contains(errMsg, "không thể đăng ký") {
			return createMessageResponse(http.StatusBadRequest, errMsg)
		}
		if strings.Contains(errMsg, "bạn hiện đang sử dụng") || strings.Contains(errMsg, "xung đột đồng thời") {
			return createMessageResponse(http.StatusConflict, errMsg)
		}
		log.Error("HandleSubscribeOrUpgrade error for user %d: %v", userID, err)
		return createMessageResponse(http.StatusInternalServerError, errMsg)
	}

	return createJSONResponse(http.StatusOK, resp)
}

// HandleScheduleDowngrade - POST /api/v1/subscription/downgrade
func (h *TicketHandler) HandleScheduleDowngrade(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized")
	}
	userID, _ := strconv.Atoi(userIDStr)

	var body struct {
		TargetTierCode string `json:"targetTierCode"`
	}
	if err := json.Unmarshal([]byte(request.Body), &body); err != nil || body.TargetTierCode == "" {
		return createMessageResponse(http.StatusBadRequest, "TargetTierCode là bắt buộc")
	}

	err := h.useCase.ScheduleDowngrade(ctx, userID, body.TargetTierCode)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Đã đặt lịch hạ cấp thành công. Gói mới sẽ có hiệu lực sau khi gói hiện tại hết hạn.",
	})
}

// HandleCancelSubscription - POST /api/v1/subscription/cancel
func (h *TicketHandler) HandleCancelSubscription(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized")
	}
	userID, _ := strconv.Atoi(userIDStr)

	err := h.useCase.CancelSubscription(ctx, userID)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Đã hủy gói dịch vụ thành công. Tài khoản sẽ chuyển về gói FREE sau khi hết chu kỳ.",
	})
}

// HandleSetAutoRenew - POST /api/v1/subscription/auto-renew
func (h *TicketHandler) HandleSetAutoRenew(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: thiếu thông tin xác thực")
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	var body models.UpdateAutoRenewRequest
	if err := json.Unmarshal([]byte(request.Body), &body); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Dữ liệu yêu cầu không hợp lệ")
	}

	if err := h.useCase.SetAutoRenew(ctx, userID, body.AutoRenew); err != nil {
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	statusMsg := "đã tắt"
	if body.AutoRenew {
		statusMsg = "đã bật"
	}
	return createJSONResponse(http.StatusOK, map[string]string{
		"message": fmt.Sprintf("Cấu hình tự động gia hạn %s thành công.", statusMsg),
	})
}

// HandlePreviewUpgrade - POST /api/v1/subscription/preview-upgrade
func (h *TicketHandler) HandlePreviewUpgrade(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: thiếu thông tin xác thực")
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid userId format")
	}

	var req models.PreviewUpgradeRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Dữ liệu yêu cầu không hợp lệ")
	}

	if req.TargetTierCode == "" {
		return createMessageResponse(http.StatusBadRequest, "Vui lòng chỉ định gói mục tiêu (targetTierCode)")
	}

	preview, err := h.useCase.PreviewUpgrade(ctx, userID, req.TargetTierCode)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return createJSONResponse(http.StatusOK, preview)
}

// HandleGetPublicFeeParameters - GET /api/v1/fee-policy/public-parameters
func (h *TicketHandler) HandleGetPublicFeeParameters(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	params, err := h.useCase.GetPublicFeeParameters(ctx)
	if err != nil {
		log.Error("HandleGetPublicFeeParameters error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Lỗi lấy tham số biểu phí công khai: "+err.Error())
	}
	return createJSONResponse(http.StatusOK, params)
}

