package usecase

import (
	"context"
	"database/sql"

	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/services/event-lambda/models"
	"github.com/fpt-event-services/services/event-lambda/repository"
)

// EventUseCase handles event business logic
type EventUseCase struct {
	eventRepo *repository.EventRepository
}

// NewEventUseCaseWithDB creates a new event use case with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewEventUseCaseWithDB(dbConn *sql.DB) *EventUseCase {
	return &EventUseCase{
		eventRepo: repository.NewEventRepositoryWithDB(dbConn),
	}
}

// ============================================================
// GetAllEventsSeparated - KHỚP VỚI Java EventListServlet
// Trả về 2 list: openEvents và closedEvents
// With permission filtering: role and userID
// ============================================================
func (uc *EventUseCase) GetAllEventsSeparated(ctx context.Context, role string, userID int) (openEvents []models.EventListItem, closedEvents []models.EventListItem, err error) {
	return uc.eventRepo.GetAllEventsSeparated(ctx, role, userID)
}

// ============================================================
// GetAllEventsSeparatedWithPagination - ✅ NEW: WITH PAGINATION SUPPORT
// Trả về 2 list: openEvents và closedEvents, cùng với total count
// With permission filtering: role and userID
// Pagination: limit items per page, calculate offset
// ============================================================
func (uc *EventUseCase) GetAllEventsSeparatedWithPagination(ctx context.Context, role string, userID int, page int, limit int) (
	openEvents []models.EventListItem,
	closedEvents []models.EventListItem,
	totalOpen int,
	totalClosed int,
	err error,
) {
	return uc.eventRepo.GetAllEventsSeparatedWithPagination(ctx, role, userID, page, limit)
}

// ============================================================
// GetEventDetail - KHỚP VỚI Java EventDetailServlet
// Trả về thông tin chi tiết event với tickets
// ============================================================
func (uc *EventUseCase) GetEventDetail(ctx context.Context, eventID int) (*models.EventDetailDto, error) {
	return uc.eventRepo.GetEventDetail(ctx, eventID)
}

// ============================================================
// GetOpenEvents - Lấy chỉ events có status OPEN
// ============================================================
func (uc *EventUseCase) GetOpenEvents(ctx context.Context) ([]models.EventListItem, error) {
	return uc.eventRepo.GetOpenEvents(ctx)
}

// ============================================================
// CreateEventRequest - Tạo yêu cầu sự kiện mới
// KHỚP VỚI Java CreateEventRequestController
// ============================================================
func (uc *EventUseCase) CreateEventRequest(ctx context.Context, requesterID int, req *models.CreateEventRequestBody) (int, error) {
	return uc.eventRepo.CreateEventRequest(ctx, requesterID, req)
}

// ============================================================
// GetMyEventRequests - Lấy danh sách yêu cầu của user
// KHỚP VỚI Java GetMyEventRequestsController
// ============================================================
func (uc *EventUseCase) GetMyEventRequests(ctx context.Context, requesterID int) ([]models.EventRequest, error) {
	return uc.eventRepo.GetMyEventRequests(ctx, requesterID)
}

// ============================================================
// GetMyActiveEventRequests - Lấy yêu cầu hoạt động (tab "Chờ")
// Active = (PENDING OR UPDATING) OR (APPROVED AND endTime > NOW)
// Hỗ trợ pagination (limit, offset)
// ============================================================
type MyActiveEventRequestsResult struct {
	Requests   []models.EventRequest `json:"requests"`
	TotalCount int                   `json:"totalCount"`
}

func (uc *EventUseCase) GetMyActiveEventRequests(ctx context.Context, requesterID int, limit int, offset int) (*MyActiveEventRequestsResult, error) {
	requests, totalCount, err := uc.eventRepo.GetMyActiveEventRequests(ctx, requesterID, limit, offset)
	if err != nil {
		return nil, err
	}
	return &MyActiveEventRequestsResult{
		Requests:   requests,
		TotalCount: totalCount,
	}, nil
}

// ============================================================
// GetMyArchivedEventRequests - Lấy yêu cầu đã lưu trữ (tab "Đã xử lý")
// Archived = (REJECTED OR CANCELLED OR FINISHED) OR (APPROVED AND endTime <= NOW)
// Hỗ trợ pagination (limit, offset)
// ============================================================
type MyArchivedEventRequestsResult struct {
	Requests   []models.EventRequest `json:"requests"`
	TotalCount int                   `json:"totalCount"`
}

func (uc *EventUseCase) GetMyArchivedEventRequests(ctx context.Context, requesterID int, limit int, offset int) (*MyArchivedEventRequestsResult, error) {
	requests, totalCount, err := uc.eventRepo.GetMyArchivedEventRequests(ctx, requesterID, limit, offset)
	if err != nil {
		return nil, err
	}
	return &MyArchivedEventRequestsResult{
		Requests:   requests,
		TotalCount: totalCount,
	}, nil
}

// ============================================================
// GetPendingEventRequests - Lấy danh sách yêu cầu chờ duyệt (ADMIN)
// KHỚP VỚI Java GetPendingEventRequestsController
// ============================================================
func (uc *EventUseCase) GetPendingEventRequests(ctx context.Context) ([]models.EventRequest, error) {
	return uc.eventRepo.GetPendingEventRequests(ctx)
}

// ============================================================
// GetEventRequestByID - Lấy thông tin chi tiết một yêu cầu sự kiện
// Dùng để so sánh giá trị ban đầu khi update
// ============================================================
func (uc *EventUseCase) GetEventRequestByID(ctx context.Context, requestID int) (*models.EventRequest, error) {
	return uc.eventRepo.GetEventRequestByID(ctx, requestID)
}

// ============================================================
// ProcessEventRequest - Duyệt hoặc từ chối yêu cầu (ADMIN)
// KHỚP VỚI Java ProcessEventRequestController
// ============================================================
func (uc *EventUseCase) ProcessEventRequest(ctx context.Context, adminID int, req *models.ProcessEventRequestBody) error {
	return uc.eventRepo.ProcessEventRequest(ctx, adminID, req)
}

// ============================================================
// CheckEventUpdateEligibility - Kiểm tra xem sự kiện có thể cập nhật không
// Quy tắc:
// 1. Nếu event status là CLOSED, CANCELLED, FINISHED → return error 403
// 2. Nếu Now() + 24h > event start_time → return error 400
// 3. Nếu không có createdEventId → return eligible (chưa tạo event)
// ============================================================
func (uc *EventUseCase) CheckEventUpdateEligibility(ctx context.Context, requestID int) (bool, *models.EligibilityError) {
	return uc.eventRepo.CheckEventUpdateEligibility(ctx, requestID)
}

// ============================================================
// UpdateEventRequest - Cập nhật thông tin yêu cầu sự kiện
// Organizer cập nhật request ở tab "Đã xử lý" (status = APPROVED)
// Status sẽ tự động chuyển thành UPDATING
// ============================================================
func (uc *EventUseCase) UpdateEventRequest(ctx context.Context, organizerID int, req *models.UpdateEventRequestRequest) error {
	return uc.eventRepo.UpdateEventRequest(ctx, organizerID, req)
}

// ============================================================
// UpdateEvent - Cập nhật thông tin event
// KHỚP VỚI Java UpdateEventDetailController
// ============================================================
func (uc *EventUseCase) UpdateEvent(ctx context.Context, req *models.UpdateEventRequest) error {
	return uc.eventRepo.UpdateEvent(ctx, req)
}

// ============================================================
// UpdateEventDetails - Cập nhật speaker và tickets
// KHỚP VỚI Java UpdateEventDetailsController
// ✅ FIX: Thêm tham số role để bypass ownership check cho Admin
// ============================================================
func (uc *EventUseCase) UpdateEventDetails(ctx context.Context, userID int, role string, req *models.UpdateEventDetailsRequest) error {
	return uc.eventRepo.UpdateEventDetails(ctx, userID, role, req)
}

// ============================================================
// UpdateEventConfig - Cập nhật cấu hình check-in/out
// eventID = -1: Update global config (Admin only)
// eventID > 0: Update per-event config (Admin or Organizer with ownership)
// ============================================================
func (uc *EventUseCase) UpdateEventConfig(ctx context.Context, userID int, role string, req *models.UpdateEventConfigRequest) error {
	return uc.eventRepo.UpdateEventConfig(ctx, userID, role, req)
}

// ============================================================
// GetEventConfig - Lấy cấu hình check-in/out hiện tại (global)
// ============================================================
func (uc *EventUseCase) GetEventConfig(ctx context.Context) *config.SystemConfig {
	return config.GetConfig()
}

// ============================================================
// GetEventConfigById - Lấy cấu hình check-in/out cho event cụ thể
// eventId = -1: Trả về global config
// eventId > 0: Trả về per-event config hoặc fallback global nếu chưa cấu hình
// ============================================================
func (uc *EventUseCase) GetEventConfigById(ctx context.Context, eventID int) (*models.EventConfigResponse, error) {
	// Case 1: eventId = -1 → global config
	if eventID == -1 {
		globalCfg := config.GetConfig()
		return &models.EventConfigResponse{
			CheckinAllowedBeforeStartMinutes: globalCfg.CheckinAllowedBeforeStartMinutes,
			MinMinutesAfterStart:             globalCfg.MinMinutesAfterStart,
			Source:                           "global",
		}, nil
	}

	// Case 2: eventId > 0 → per-event config
	eventCfg, err := uc.eventRepo.GetEventConfigById(ctx, eventID)
	if err != nil {
		return nil, err
	}

	// Nếu event chưa có config riêng (trả về nil) → dùng global config
	if eventCfg == nil {
		globalCfg := config.GetConfig()
		return &models.EventConfigResponse{
			CheckinAllowedBeforeStartMinutes: globalCfg.CheckinAllowedBeforeStartMinutes,
			MinMinutesAfterStart:             globalCfg.MinMinutesAfterStart,
			Source:                           "global",
		}, nil
	}

	// Event có config riêng, nhưng có thể 1 field NULL → fallback giá trị đó về global
	globalCfg := config.GetConfig()

	return &models.EventConfigResponse{
		CheckinAllowedBeforeStartMinutes: func() int {
			if eventCfg.HasCheckinOffset {
				return eventCfg.CheckinAllowedBeforeStartMinutes
			}
			return globalCfg.CheckinAllowedBeforeStartMinutes
		}(),
		MinMinutesAfterStart: func() int {
			if eventCfg.HasCheckoutOffset {
				return eventCfg.MinMinutesAfterStart
			}
			return globalCfg.MinMinutesAfterStart
		}(),
		Source: eventCfg.Source,
	}, nil
}

// ============================================================
// DisableEvent - Disable event (đổi status)
// KHỚP VỚI Java EventDisableController
// ============================================================
func (uc *EventUseCase) DisableEvent(ctx context.Context, eventID int) error {
	return uc.eventRepo.DisableEvent(ctx, eventID)
}

// ============================================================
// GetAvailableAreas - 💡 Lấy danh sách địa điểm trống
// YÊU CẦU #4: Hiển thị Frontend có danh sách địa điểm trống
// Dùng khi Staff chọn địa điểm trong danh sách
// expectedCapacity: Sức chứa tối thiểu (lấy tất cả phòng >= expectedCapacity)
// ============================================================
func (uc *EventUseCase) GetAvailableAreas(ctx context.Context, startTime, endTime string, expectedCapacity int) ([]models.AvailableAreaInfo, error) {
	areas, err := uc.eventRepo.GetAvailableAreas(ctx, startTime, endTime, expectedCapacity)
	if err != nil {
		return nil, err
	}

	// Chuyển từ repository struct sang models struct nếu khác
	result := []models.AvailableAreaInfo{}
	for _, area := range areas {
		result = append(result, models.AvailableAreaInfo{
			AreaID:    area.AreaID,
			AreaName:  area.AreaName,
			VenueName: area.VenueName,
			Floor:     area.Floor,
			Capacity:  area.Capacity,
			Status:    area.Status,
		})
	}
	return result, nil
}

// ============================================================
// ReleaseAreaOnEventClose - Giải phóng địa điểm khi sự kiện đóng
// YÊU CẦU #2: Tối ưu hóa Scheduler với logging rõ ràng
// ============================================================
func (uc *EventUseCase) ReleaseAreaOnEventClose(ctx context.Context, eventID int, areaID int) error {
	return uc.eventRepo.ReleaseAreaOnEventClose(ctx, eventID, areaID)
}

// ============================================================
// GetEventStats - Thống kê sự kiện
// KHỚP VỚI Java EventStatsController
// ============================================================
func (uc *EventUseCase) GetEventStats(ctx context.Context, eventID int) (*models.EventStatsResponse, error) {
	return uc.eventRepo.GetEventStats(ctx, eventID)
}

// ============================================================
// GetAggregateEventStats - Thống kê tất cả sự kiện (tổng hợp)
// Nếu Role = "ADMIN": Tính tổng cho tất cả vé trong hệ thống
// Nếu Role = "ORGANIZER": Tính tổng cho tất cả vé của sự kiện mà user tạo
// ============================================================
func (uc *EventUseCase) GetAggregateEventStats(ctx context.Context, role string, userID int) (*models.EventStatsResponse, error) {
	return uc.eventRepo.GetAggregateEventStats(ctx, role, userID)
}

// ============================================================
// CheckEventOwnership - Kiểm tra xem user có sở hữu event không
// Trả về true nếu user là created_by
// ============================================================
func (uc *EventUseCase) CheckEventOwnership(ctx context.Context, eventID, userID int) (bool, error) {
	return uc.eventRepo.CheckEventOwnership(ctx, eventID, userID)
}

// ============================================================
// CancelEvent - Hủy sự kiện (chỉ Organizer được hủy sự kiện của mình)
// Scenario: APPROVED event -> có refund + release area
// ============================================================
func (uc *EventUseCase) CancelEvent(ctx context.Context, userID int, eventID int) error {
	return uc.eventRepo.CancelEvent(ctx, userID, eventID)
}

// ============================================================
// CancelEventRequest - Hủy/Rút lại yêu cầu (chỉ Organizer được rút lại yêu cầu của mình)
// Scenario: PENDING/UPDATING request -> chỉ update status, không cần refund
// ============================================================
func (uc *EventUseCase) CancelEventRequest(ctx context.Context, userID int, requestID int) error {
	return uc.eventRepo.CancelEventRequest(ctx, userID, requestID)
}

// ============================================================
// DisableEventByStaff - STAFF/ADMIN hủy sự kiện bất kỳ (bypass 24h + ownership)
// ============================================================
func (uc *EventUseCase) DisableEventByStaff(ctx context.Context, eventID int) error {
	return uc.eventRepo.DisableEventByStaff(ctx, eventID)
}

// ============================================================
// CheckDailyQuota - Kiểm tra hạn ngạch sự kiện hàng ngày (tối đa 2 sự kiện/ngày)
// ============================================================
func (uc *EventUseCase) CheckDailyQuota(ctx context.Context, eventDate string) (*models.CheckDailyQuotaResponse, error) {
	return uc.eventRepo.CheckDailyQuota(ctx, eventDate)
}

// ============================================================
// GetEventsByStatusV1 - ✅ NEW API V1: Get events with unified filtering
// Endpoint: GET /api/v1/events
// Parameters:
//   - status: 'today' | 'upcoming' | 'past'
//   - search: search query (optional)
//   - page: page number (default 1)
//   - limit: items per page (default 10, max 100)
//
// Returns paginated list with:
//   - data: array of EventListItem
//   - total: total matching records
//   - page: current page
//   - limit: items per page
//   - totalPages: calculated total pages
//
// No role filtering (public view - all events shown)
// ============================================================
func (uc *EventUseCase) GetEventsByStatusV1(ctx context.Context, status string, search string, page int, limit int) (*repository.EventListV1Result, error) {
	return uc.eventRepo.GetEventsByStatusV1(ctx, status, search, page, limit)
}

// ============================================================
// GetEventsByStatusV1WithRole - ✅ NEW API V1: Get events with role-based filtering
// Same as GetEventsByStatusV1, but adds organizer filtering:
//   - ADMIN: See all events regardless of creator
//   - ORGANIZER: See only events created by this user
//   - PUBLIC/GUEST: See all events (no filtering)
//
// Endpoint: GET /api/v1/events (with X-User-Role and X-User-Id headers)
// ============================================================
func (uc *EventUseCase) GetEventsByStatusV1WithRole(ctx context.Context, status string, search string, page int, limit int, role string, userID int) (*repository.EventListV1Result, error) {
	return uc.eventRepo.GetEventsByStatusV1WithRole(ctx, status, search, page, limit, role, userID)
}
