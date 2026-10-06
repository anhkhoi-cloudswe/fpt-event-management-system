package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/services/ticket-service/models"
)

// requireAdminDB kiểm tra định danh và vai trò ADMIN trực tiếp từ DB (không tin JWT)
// Trả về: (adminID, statusCode, error)
func (h *TicketHandler) requireAdminDB(ctx context.Context, request events.APIGatewayProxyRequest) (int, int, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return 0, http.StatusUnauthorized, fmt.Errorf("Unauthorized: thiếu thông tin xác thực (userId)")
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil || userID <= 0 {
		return 0, http.StatusUnauthorized, fmt.Errorf("Invalid userId format")
	}

	isAdmin, err := h.useCase.VerifyAdminUser(ctx, userID)
	if err != nil {
		log.Error("[ADMIN_AUTH_DB_ERROR] VerifyAdminUser failed: %v", err)
		return 0, http.StatusServiceUnavailable, fmt.Errorf("Dịch vụ xác thực tạm thời không khả dụng, vui lòng thử lại sau")
	}
	if !isAdmin {
		return 0, http.StatusForbidden, fmt.Errorf("Forbidden: chỉ Quản trị viên (Role ADMIN trong cơ sở dữ liệu) mới có quyền truy cập module này")
	}

	return userID, http.StatusOK, nil
}

// HandleGetRoleFeePolicies - GET /api/v1/admin/role-policies
func (h *TicketHandler) HandleGetRoleFeePolicies(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if _, statusCode, err := h.requireAdminDB(ctx, request); err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	policies, err := h.useCase.GetRoleFeePolicies(ctx)
	if err != nil {
		log.Error("[ADMIN_FEE_HANDLER_ERROR] HandleGetRoleFeePolicies: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Đã xảy ra lỗi hệ thống khi tải danh sách chính sách phí")
	}
	return createJSONResponse(http.StatusOK, policies)
}

// HandleUpdateRoleFeePolicy - PUT /api/v1/admin/role-policies
func (h *TicketHandler) HandleUpdateRoleFeePolicy(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	adminID, statusCode, err := h.requireAdminDB(ctx, request)
	if err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	var body struct {
		RoleCode           string `json:"roleCode"`
		CommissionBps      int    `json:"commissionBps"`
		MaxCapacityLimit   int    `json:"maxCapacityLimit"`
		HasAdvancedReports bool   `json:"hasAdvancedReports"`
		IsActive           bool   `json:"isActive"`
		Reason             string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(request.Body), &body); err != nil || body.RoleCode == "" {
		return createMessageResponse(http.StatusBadRequest, "Dữ liệu không hợp lệ")
	}

	err = h.useCase.UpdateRoleFeePolicy(ctx, adminID, body.RoleCode, body.CommissionBps, body.MaxCapacityLimit, body.HasAdvancedReports, body.IsActive, body.Reason)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Cập nhật chính sách phí theo vai trò thành công",
	})
}

// HandleGetAdminSubscriptionTiers - GET /api/v1/admin/subscription-tiers
func (h *TicketHandler) HandleGetAdminSubscriptionTiers(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if _, statusCode, err := h.requireAdminDB(ctx, request); err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	tiers, err := h.useCase.GetSubscriptionTiers(ctx)
	if err != nil {
		log.Error("[ADMIN_FEE_HANDLER_ERROR] HandleGetAdminSubscriptionTiers: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Đã xảy ra lỗi hệ thống khi tải danh sách gói dịch vụ")
	}
	return createJSONResponse(http.StatusOK, tiers)
}

// HandleUpdateAdminSubscriptionTier - PUT /api/v1/admin/subscription-tiers
func (h *TicketHandler) HandleUpdateAdminSubscriptionTier(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	adminID, statusCode, err := h.requireAdminDB(ctx, request)
	if err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	var body struct {
		TierID             int    `json:"tierId"`
		PriceVND           int64  `json:"priceVnd"`
		CommissionBps      int    `json:"commissionBps"`
		MaxCapacityLimit   int    `json:"maxCapacityLimit"`
		HasAdvancedReports bool   `json:"hasAdvancedReports"`
		IsActive           bool   `json:"isActive"`
		Reason             string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(request.Body), &body); err != nil || body.TierID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Dữ liệu không hợp lệ")
	}

	err = h.useCase.UpdateSubscriptionTier(ctx, adminID, body.TierID, body.PriceVND, body.CommissionBps, body.MaxCapacityLimit, body.HasAdvancedReports, body.IsActive, body.Reason)
	if err != nil {
		log.Error("[ADMIN_FEE_HANDLER_ERROR] UpdateSubscriptionTier: %v", err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Cập nhật gói dịch vụ thành công",
	})
}

// HandleGetFeeOverrides - GET /api/v1/admin/fee-overrides
func (h *TicketHandler) HandleGetFeeOverrides(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if _, statusCode, err := h.requireAdminDB(ctx, request); err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	var organizerID *int
	if orgIDStr := request.QueryStringParameters["organizerId"]; orgIDStr != "" {
		if id, err := strconv.Atoi(orgIDStr); err == nil {
			organizerID = &id
		}
	}

	overrides, err := h.useCase.GetFeeOverrides(ctx, organizerID)
	if err != nil {
		log.Error("[ADMIN_FEE_HANDLER_ERROR] HandleGetFeeOverrides: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Đã xảy ra lỗi hệ thống khi tải danh sách ưu đãi")
	}
	return createJSONResponse(http.StatusOK, overrides)
}

// HandleCreateFeeOverride - POST /api/v1/admin/fee-overrides
func (h *TicketHandler) HandleCreateFeeOverride(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	adminID, statusCode, err := h.requireAdminDB(ctx, request)
	if err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	var body struct {
		OrganizerID   int    `json:"organizerId"`
		CommissionBps int    `json:"commissionBps"`
		Reason        string `json:"reason"`
		StartTime     string `json:"startTime"`
		EndTime       string `json:"endTime"`
		ConfirmHigher bool   `json:"confirmHigher"`
	}
	if err := json.Unmarshal([]byte(request.Body), &body); err != nil || body.OrganizerID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Dữ liệu ưu đãi không hợp lệ")
	}

	start, err := time.Parse(time.RFC3339, body.StartTime)
	if err != nil {
		start, err = time.Parse("2006-01-02 15:04:05", body.StartTime)
		if err != nil {
			return createMessageResponse(http.StatusBadRequest, "Định dạng startTime không hợp lệ (hỗ trợ RFC3339 hoặc YYYY-MM-DD HH:MM:SS)")
		}
	}

	end, err := time.Parse(time.RFC3339, body.EndTime)
	if err != nil {
		end, err = time.Parse("2006-01-02 15:04:05", body.EndTime)
		if err != nil {
			return createMessageResponse(http.StatusBadRequest, "Định dạng endTime không hợp lệ (hỗ trợ RFC3339 hoặc YYYY-MM-DD HH:MM:SS)")
		}
	}

	override, err := h.useCase.CreateFeeOverride(ctx, adminID, body.OrganizerID, body.CommissionBps, body.Reason, start, end, body.ConfirmHigher)
	if err != nil {
		var confErr *models.ConfirmationRequiredError
		if errors.As(err, &confErr) {
			return createJSONResponse(http.StatusUnprocessableEntity, map[string]interface{}{
				"error":                 confErr.Error(),
				"requiresConfirmation": true,
				"warning":               confErr.Message,
			})
		}
		if errors.Is(err, models.ErrOverrideOverlap) {
			return createMessageResponse(http.StatusConflict, err.Error())
		}
		log.Error("[ADMIN_FEE_HANDLER_ERROR] CreateFeeOverride failed: %v", err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return createJSONResponse(http.StatusCreated, override)
}

// HandleDeleteFeeOverride - DELETE /api/v1/admin/fee-overrides
func (h *TicketHandler) HandleDeleteFeeOverride(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	adminID, statusCode, err := h.requireAdminDB(ctx, request)
	if err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	overrideIDStr := request.QueryStringParameters["overrideId"]
	if overrideIDStr == "" {
		return createMessageResponse(http.StatusBadRequest, "Thiếu tham số overrideId")
	}
	overrideID, _ := strconv.Atoi(overrideIDStr)

	reason := request.QueryStringParameters["reason"]
	if reason == "" {
		reason = "Admin xóa ưu đãi qua bảng điều khiển"
	}

	err = h.useCase.DeleteFeeOverride(ctx, adminID, overrideID, reason)
	if err != nil {
		log.Error("[ADMIN_FEE_HANDLER_ERROR] DeleteFeeOverride: %v", err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Đã xóa ưu đãi hoa hồng thành công",
	})
}

// HandleAssignSchoolOrganizerRole - POST /api/v1/admin/users/school-role
func (h *TicketHandler) HandleAssignSchoolOrganizerRole(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	adminID, statusCode, err := h.requireAdminDB(ctx, request)
	if err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	var body struct {
		UserID int    `json:"userId"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(request.Body), &body); err != nil || body.UserID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Dữ liệu không hợp lệ")
	}

	err = h.useCase.AssignSchoolOrganizerRole(ctx, adminID, body.UserID, body.Reason)
	if err != nil {
		log.Error("[ADMIN_FEE_HANDLER_ERROR] AssignSchoolOrganizerRole: %v", err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Đã cấp quyền School Organizer thành công cho tài khoản",
	})
}

// HandleRevokeSchoolOrganizerRole - DELETE /api/v1/admin/users/school-role
func (h *TicketHandler) HandleRevokeSchoolOrganizerRole(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	adminID, statusCode, err := h.requireAdminDB(ctx, request)
	if err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	var body struct {
		UserID int    `json:"userId"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(request.Body), &body); err != nil || body.UserID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Dữ liệu không hợp lệ")
	}

	err = h.useCase.RevokeSchoolOrganizerRole(ctx, adminID, body.UserID, body.Reason)
	if err != nil {
		log.Error("[ADMIN_FEE_HANDLER_ERROR] RevokeSchoolOrganizerRole: %v", err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Đã thu hồi quyền School Organizer và hoàn trả vai trò cũ thành công",
	})
}

// HandleGetSystemParameters - GET /api/v1/admin/system-parameters
func (h *TicketHandler) HandleGetSystemParameters(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if _, statusCode, err := h.requireAdminDB(ctx, request); err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	params, err := h.useCase.GetSystemParameters(ctx)
	if err != nil {
		log.Error("[ADMIN_FEE_HANDLER_ERROR] HandleGetSystemParameters: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Đã xảy ra lỗi hệ thống khi tải tham số cấu hình")
	}
	return createJSONResponse(http.StatusOK, params)
}

// HandleUpdateSystemParameter - PUT /api/v1/admin/system-parameters
func (h *TicketHandler) HandleUpdateSystemParameter(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	adminID, statusCode, err := h.requireAdminDB(ctx, request)
	if err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	var body struct {
		ParamKey   string `json:"paramKey"`
		ParamValue string `json:"paramValue"`
		Reason     string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(request.Body), &body); err != nil || body.ParamKey == "" {
		return createMessageResponse(http.StatusBadRequest, "Dữ liệu tham số không hợp lệ")
	}

	err = h.useCase.UpdateSystemParameter(ctx, adminID, body.ParamKey, body.ParamValue, body.Reason)
	if err != nil {
		log.Error("[ADMIN_FEE_HANDLER_ERROR] UpdateSystemParameter: %v", err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Cập nhật tham số hệ thống thành công",
	})
}

// HandleSimulateFeeCalculation - POST /api/v1/admin/fee-sandbox/simulate
func (h *TicketHandler) HandleSimulateFeeCalculation(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	var req models.FeeSimulationRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Dữ liệu mô phỏng không hợp lệ")
	}

	res, err := h.useCase.SimulateFeeCalculation(ctx, req)
	if err != nil {
		log.Error("[ADMIN_FEE_HANDLER_ERROR] SimulateFeeCalculation: %v", err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}
	return createJSONResponse(http.StatusOK, res)
}

// HandleGetFeeAuditLogs - GET /api/v1/admin/fee-audit-logs
func (h *TicketHandler) HandleGetFeeAuditLogs(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if _, statusCode, err := h.requireAdminDB(ctx, request); err != nil {
		return createMessageResponse(statusCode, err.Error())
	}

	page, _ := strconv.Atoi(request.QueryStringParameters["page"])
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(request.QueryStringParameters["limit"])
	if limit < 1 {
		limit = 20
	}
	entity := request.QueryStringParameters["entity"]
	action := request.QueryStringParameters["action"]

	logs, total, err := h.useCase.GetFeeAuditLogs(ctx, page, limit, entity, action)
	if err != nil {
		log.Error("[ADMIN_FEE_HANDLER_ERROR] HandleGetFeeAuditLogs: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Đã xảy ra lỗi hệ thống khi tải nhật ký kiểm toán")
	}

	return createJSONResponse(http.StatusOK, map[string]interface{}{
		"logs":         logs,
		"totalRecords": total,
		"currentPage":  page,
		"limit":        limit,
	})
}
