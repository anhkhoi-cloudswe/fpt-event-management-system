package usecase

import (
	"context"
	"fmt"
	"strings"

	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/models"
	"github.com/fpt-event-services/services/staff-lambda/repository"
)

// ReportUseCase handles report/refund business logic
type ReportUseCase struct {
	reportRepo *repository.ReportRepository
}

// NewReportUseCase creates a new report use case
func NewReportUseCase() *ReportUseCase {
	return &ReportUseCase{
		reportRepo: repository.NewReportRepository(),
	}
}

// ============================================================
// GetReportDetail - Lấy chi tiết report cho staff
// ============================================================
func (uc *ReportUseCase) GetReportDetail(ctx context.Context, reportID int) (*models.ReportDetailStaffDTO, error) {
	log := logger.Default().WithContext(ctx)

	if reportID <= 0 {
		return nil, fmt.Errorf("invalid reportID")
	}

	dto, err := uc.reportRepo.GetReportDetailForStaff(ctx, reportID)
	if err != nil {
		log.Info("Failed to get report detail", "reportID", reportID, "error", err)
		return nil, err
	}

	if dto == nil {
		return nil, fmt.Errorf("report not found")
	}

	return dto, nil
}

// ============================================================
// ListReports - List reports với pagination & filter
// ============================================================
func (uc *ReportUseCase) ListReports(ctx context.Context, status string, page, pageSize int) ([]models.ReportListStaffDTO, error) {
	log := logger.Default().WithContext(ctx)

	// Validate status filter
	if status != "" {
		status = strings.ToUpper(strings.TrimSpace(status))
		if status != "PENDING" && status != "APPROVED" && status != "REJECTED" {
			return nil, fmt.Errorf("invalid status filter: %s", status)
		}
	}

	list, err := uc.reportRepo.ListReportsForStaff(ctx, status, page, pageSize)
	if err != nil {
		log.Info("Failed to list reports", "status", status, "page", page, "error", err)
		return nil, err
	}

	return list, nil
}

// ============================================================
// ProcessReport - APPROVE/REJECT report (main business logic)
// KHỚP VỚI Java StaffProcessReportController + ReportDAO.processReport
//
// Validation Rules:
// 1. reportID > 0
// 2. action = "APPROVE" hoặc "REJECT"
// 3. Nếu APPROVE: ticket phải CHECKED_IN
// 4. Transaction: refund → update wallet → update ticket → update report
// ============================================================
func (uc *ReportUseCase) ProcessReport(ctx context.Context, req *models.ProcessReportRequest, staffID int) (*models.ProcessReportResponse, error) {
	log := logger.Default().WithContext(ctx)

	// 1) Validate request
	if req.ReportID <= 0 {
		return &models.ProcessReportResponse{
			Status:  "fail",
			Message: "reportId không hợp lệ",
		}, nil
	}

	action := strings.ToUpper(strings.TrimSpace(req.Action))
	if action == "" {
		return &models.ProcessReportResponse{
			Status:  "fail",
			Message: "action là bắt buộc (APPROVE/REJECT)",
		}, nil
	}

	var approve bool
	if action == "APPROVE" {
		approve = true
	} else if action == "REJECT" {
		approve = false
	} else {
		return &models.ProcessReportResponse{
			Status:  "fail",
			Message: "action không hợp lệ",
		}, nil
	}

	// 2) Process report trong repository (transaction-based)
	result, err := uc.reportRepo.ProcessReport(ctx, req.ReportID, staffID, approve, req.StaffNote)
	if err != nil {
		log.Info("Failed to process report", "reportID", req.ReportID, "action", action, "error", err)
		return nil, fmt.Errorf("lỗi server khi xử lý report: %w", err)
	}

	// 3) Map result to response
	resp := &models.ProcessReportResponse{
		Status:  "success",
		Message: result.Message,
	}

	if !result.Success {
		resp.Status = "fail"
	}

	if approve && result.RefundAmount != nil {
		resp.RefundAmount = result.RefundAmount
	}

	log.Info("Report processed",
		"reportID", req.ReportID,
		"action", action,
		"success", result.Success,
		"refundAmount", result.RefundAmount,
	)

	return resp, nil
}
