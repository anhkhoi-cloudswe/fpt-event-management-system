package repository

import (
	"context"
	"github.com/fpt-event-services/common/policy"
)

// Re-export types from shared policy package
type OrganizerLimits = policy.OrganizerPolicy
type PlanRequiredError = policy.PlanRequiredError

// GetOrganizerLimits phân giải quyền lợi và hạn mức sức chứa của Organizer qua shared policy
func (r *EventRepository) GetOrganizerLimits(ctx context.Context, organizerID int) (*OrganizerLimits, error) {
	return policy.ResolveOrganizerPolicy(ctx, r.db, organizerID)
}

// ValidateCapacityLimit kiểm tra sức chứa yêu cầu so với giới hạn của Organizer
func ValidateCapacityLimit(limits *OrganizerLimits, requestedCapacity int) error {
	return policy.ValidateCapacityLimit(limits, requestedCapacity)
}

// CalculateEffectiveCapacity tính tổng sức chứa thực tế qua shared policy
func CalculateEffectiveCapacity(ctx context.Context, exec policy.DBExecutor, eventID int, requestCapacity *int, requestTicketsSum int) (int, error) {
	return policy.CalculateEffectiveCapacity(ctx, exec, eventID, requestCapacity, requestTicketsSum)
}
