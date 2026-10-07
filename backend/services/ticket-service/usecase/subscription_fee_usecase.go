package usecase

import (
	"context"
	"time"

	"github.com/fpt-event-services/services/ticket-service/models"
)

// ============================================================
// Subscription Lifecycle UseCase Methods (Pha 3)
// ============================================================

func (uc *TicketUseCase) GetSubscriptionTiers(ctx context.Context) ([]models.SubscriptionTier, error) {
	return uc.ticketRepo.GetSubscriptionTiers(ctx)
}

func (uc *TicketUseCase) GetCurrentSubscription(ctx context.Context, userID int) (*models.CurrentSubscriptionResponse, error) {
	return uc.ticketRepo.GetCurrentSubscription(ctx, userID)
}

func (uc *TicketUseCase) SubscribeOrUpgrade(ctx context.Context, userID int, req models.SubscribeRequest) (*models.SubscribeResponse, error) {
	return uc.ticketRepo.SubscribeOrUpgrade(ctx, userID, req)
}

func (uc *TicketUseCase) PreviewUpgrade(ctx context.Context, userID int, targetTierCode string) (*models.PreviewUpgradeResponse, error) {
	return uc.ticketRepo.PreviewUpgrade(ctx, userID, targetTierCode)
}

func (uc *TicketUseCase) GetPublicFeeParameters(ctx context.Context) (*models.PublicFeeParametersResponse, error) {
	return uc.ticketRepo.GetPublicFeeParameters(ctx)
}

func (uc *TicketUseCase) ScheduleDowngrade(ctx context.Context, userID int, targetTierCode string) error {
	return uc.ticketRepo.ScheduleDowngrade(ctx, userID, targetTierCode)
}

func (uc *TicketUseCase) CancelSubscription(ctx context.Context, userID int) error {
	return uc.ticketRepo.CancelSubscription(ctx, userID)
}

func (uc *TicketUseCase) SetAutoRenew(ctx context.Context, userID int, autoRenew bool) error {
	return uc.ticketRepo.SetAutoRenew(ctx, userID, autoRenew)
}

func (uc *TicketUseCase) ProcessExpiredSubscriptions(ctx context.Context) (int, int, error) {
	return uc.ticketRepo.ProcessExpiredSubscriptions(ctx)
}

// ============================================================
// Admin Fee & Policy Management UseCase Methods (Pha 4)
// ============================================================

func (uc *TicketUseCase) VerifyAdminUser(ctx context.Context, userID int) (bool, error) {
	return uc.ticketRepo.VerifyAdminUser(ctx, userID)
}

func (uc *TicketUseCase) GetRoleFeePolicies(ctx context.Context) ([]models.RoleFeePolicy, error) {
	return uc.ticketRepo.GetRoleFeePolicies(ctx)
}

func (uc *TicketUseCase) UpdateRoleFeePolicy(
	ctx context.Context, adminID int, roleCode string,
	bps, maxCap int, hasReports, isActive bool, reason string,
) error {
	return uc.ticketRepo.UpdateRoleFeePolicy(ctx, adminID, roleCode, bps, maxCap, hasReports, isActive, reason)
}

func (uc *TicketUseCase) CreateSubscriptionTier(
	ctx context.Context, adminID int, req models.CreateSubscriptionTierRequest,
) error {
	return uc.ticketRepo.CreateSubscriptionTier(ctx, adminID, req)
}

func (uc *TicketUseCase) UpdateSubscriptionTier(
	ctx context.Context, adminID, tierID int,
	price int64, bps, maxCap int, hasReports, isActive bool, reason string,
) error {
	return uc.ticketRepo.UpdateSubscriptionTier(ctx, adminID, tierID, price, bps, maxCap, hasReports, isActive, reason)
}

func (uc *TicketUseCase) DeleteSubscriptionTier(
	ctx context.Context, adminID, tierID int,
) error {
	return uc.ticketRepo.DeleteSubscriptionTier(ctx, adminID, tierID)
}

func (uc *TicketUseCase) GetFeeOverrides(ctx context.Context, organizerID *int) ([]models.OrganizerFeeOverride, error) {
	return uc.ticketRepo.GetFeeOverrides(ctx, organizerID)
}

func (uc *TicketUseCase) CreateFeeOverride(
	ctx context.Context, adminID, organizerID, bps int,
	reason string, startTime, endTime time.Time, confirmHigher bool,
) (*models.OrganizerFeeOverride, error) {
	return uc.ticketRepo.CreateFeeOverride(ctx, adminID, organizerID, bps, reason, startTime, endTime, confirmHigher)
}

func (uc *TicketUseCase) DeleteFeeOverride(ctx context.Context, adminID, overrideID int, reason string) error {
	return uc.ticketRepo.DeleteFeeOverride(ctx, adminID, overrideID, reason)
}

func (uc *TicketUseCase) AssignSchoolOrganizerRole(ctx context.Context, adminID, targetUserID int, reason string) error {
	return uc.ticketRepo.AssignSchoolOrganizerRole(ctx, adminID, targetUserID, reason)
}

func (uc *TicketUseCase) RevokeSchoolOrganizerRole(ctx context.Context, adminID, targetUserID int, reason string) error {
	return uc.ticketRepo.RevokeSchoolOrganizerRole(ctx, adminID, targetUserID, reason)
}

func (uc *TicketUseCase) GetSystemParameters(ctx context.Context) ([]models.PlatformSystemParameter, error) {
	return uc.ticketRepo.GetSystemParameters(ctx)
}

func (uc *TicketUseCase) UpdateSystemParameter(ctx context.Context, adminID int, key, value, reason string) error {
	return uc.ticketRepo.UpdateSystemParameter(ctx, adminID, key, value, reason)
}

func (uc *TicketUseCase) SimulateFeeCalculation(ctx context.Context, req models.FeeSimulationRequest) (*models.FeeSimulationResponse, error) {
	return uc.ticketRepo.SimulateFeeCalculation(ctx, req)
}

func (uc *TicketUseCase) GetFeeAuditLogs(ctx context.Context, page, limit int, entity, action string) ([]models.FeeAuditLog, int, error) {
	return uc.ticketRepo.GetFeeAuditLogs(ctx, page, limit, entity, action)
}

// ============================================================
// Event Analytics & Financial Reports UseCase Methods (Pha 5 & 6)
// ============================================================

func (uc *TicketUseCase) GetEventFinancialOverview(ctx context.Context, eventID, organizerID int) (*models.EventFinancialOverview, error) {
	return uc.ticketRepo.GetEventFinancialOverview(ctx, eventID, organizerID)
}

func (uc *TicketUseCase) GetEventCheckInList(ctx context.Context, eventID, organizerID int) ([]models.EventCheckInItem, error) {
	return uc.ticketRepo.GetEventCheckInList(ctx, eventID, organizerID)
}

func (uc *TicketUseCase) GetEventSeatStatus(ctx context.Context, eventID, organizerID int) (*models.EventRealtimeSeatStatusResponse, error) {
	return uc.ticketRepo.GetEventSeatStatus(ctx, eventID, organizerID)
}

func (uc *TicketUseCase) GetEventAdvancedAnalytics(ctx context.Context, eventID, organizerID int) (*models.EventAdvancedAnalyticsResponse, error) {
	return uc.ticketRepo.GetEventAdvancedAnalytics(ctx, eventID, organizerID)
}

func (uc *TicketUseCase) ExportEventCSV(ctx context.Context, eventID, organizerID int) ([]byte, error) {
	return uc.ticketRepo.GenerateEventCSVReport(ctx, eventID, organizerID)
}

func (uc *TicketUseCase) GetAdminSubscriptionAnalytics(ctx context.Context) (*models.AdminSubscriptionAnalyticsResponse, error) {
	return uc.ticketRepo.GetAdminSubscriptionAnalytics(ctx)
}

