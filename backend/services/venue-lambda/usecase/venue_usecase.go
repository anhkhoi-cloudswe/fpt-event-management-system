package usecase

import (
	"context"
	"fmt"

	"github.com/fpt-event-services/services/venue-lambda/models"
	"github.com/fpt-event-services/services/venue-lambda/repository"
)

type VenueUseCase struct {
	venueRepo *repository.VenueRepository
}

func NewVenueUseCase() *VenueUseCase {
	return &VenueUseCase{
		venueRepo: repository.NewVenueRepository(),
	}
}

// GetAllVenues - Lấy tất cả venues với nested areas
func (uc *VenueUseCase) GetAllVenues(ctx context.Context) ([]models.Venue, error) {
	return uc.venueRepo.GetAllVenues(ctx)
}

// GetVenueByID - Lấy venue theo ID
func (uc *VenueUseCase) GetVenueByID(ctx context.Context, venueID int) (*models.Venue, error) {
	return uc.venueRepo.GetVenueByID(ctx, venueID)
}

// CreateVenue - Tạo venue mới
func (uc *VenueUseCase) CreateVenue(ctx context.Context, req models.CreateVenueRequest) (int64, error) {
	return uc.venueRepo.CreateVenue(ctx, req)
}

// UpdateVenue - Cập nhật venue
func (uc *VenueUseCase) UpdateVenue(ctx context.Context, req models.UpdateVenueRequest) error {
	return uc.venueRepo.UpdateVenue(ctx, req)
}

// DeleteVenue - Soft delete venue with constraint checking
func (uc *VenueUseCase) DeleteVenue(ctx context.Context, venueID int) error {
	// Check if venue has any active events (OPEN or DRAFT status)
	hasActive, err := uc.venueRepo.HasActiveEvents(ctx, venueID)
	if err != nil {
		return fmt.Errorf("failed to check active events: %w", err)
	}

	if hasActive {
		// Return a special error with specific message
		// We use a prefix to indicate this is a validation error that should return 400
		return fmt.Errorf("VALIDATION_ERROR:Không thể xóa địa điểm vì đang có sự kiện sắp diễn ra. Vui lòng hủy hoặc kết thúc các sự kiện liên quan trước.")
	}

	return uc.venueRepo.DeleteVenue(ctx, venueID)
}

// GetAllAreas - Lấy tất cả areas
func (uc *VenueUseCase) GetAllAreas(ctx context.Context) ([]models.VenueArea, error) {
	return uc.venueRepo.GetAllAreas(ctx)
}

// GetAreasByVenueID - Lấy areas theo venue ID
func (uc *VenueUseCase) GetAreasByVenueID(ctx context.Context, venueID int) ([]models.VenueArea, error) {
	return uc.venueRepo.GetAreasByVenueID(ctx, venueID)
}

// GetFreeAreas - Lấy các area còn trống
func (uc *VenueUseCase) GetFreeAreas(ctx context.Context, startTime, endTime string) ([]models.FreeAreaResponse, error) {
	return uc.venueRepo.GetFreeAreas(ctx, startTime, endTime)
}

// GetAllSeats - Lấy seats theo area (ghế vật lý)
func (uc *VenueUseCase) GetAllSeats(ctx context.Context, areaID int) ([]models.Seat, error) {
	return uc.venueRepo.GetAllSeats(ctx, areaID)
}

// GetSeatsForEvent - Lấy seats theo event (từ Event_Seat_Layout)
func (uc *VenueUseCase) GetSeatsForEvent(ctx context.Context, eventID int, seatType string) ([]models.Seat, error) {
	return uc.venueRepo.GetSeatsForEvent(ctx, eventID, seatType)
}

// CreateArea - Tạo area mới
func (uc *VenueUseCase) CreateArea(ctx context.Context, req models.CreateAreaRequest) (int64, error) {
	return uc.venueRepo.CreateArea(ctx, req)
}

// UpdateArea - Cập nhật area
func (uc *VenueUseCase) UpdateArea(ctx context.Context, req models.UpdateAreaRequest) error {
	return uc.venueRepo.UpdateArea(ctx, req)
}

// DeleteArea - Soft delete area
func (uc *VenueUseCase) DeleteArea(ctx context.Context, areaID int) error {
	return uc.venueRepo.DeleteArea(ctx, areaID)
}
