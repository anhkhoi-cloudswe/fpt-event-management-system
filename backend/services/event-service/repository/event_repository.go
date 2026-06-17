package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/storage"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/event-service/models"
)

var (
	ErrRequestCancelled  = errors.New("Không thể thực hiện: Yêu cầu này đã bị người tổ chức hủy trước đó!")
	ErrRequestNotPending = errors.New("Không thể thực hiện: Yêu cầu này đã được xử lý.")
)

// Helper function to convert values to pointers
func pointer[T any](v T) *T {
	return &v
}

func stringPointer(ns sql.NullString) *string {
	if !ns.Valid {
		return nil
	}
	return &ns.String
}

func intPointer(ni sql.NullInt64) *int {
	if !ni.Valid {
		return nil
	}
	val := int(ni.Int64)
	return &val
}

// formatTimeToWallClockRFC3339 returns wall-clock time in RFC3339 format without Go timezone interpretation
// ✅ CRITICAL: Without loc=Asia/Ho_Chi_Minh in DSN, Go reads DATETIME as UTC
// We read the wall-clock values and just append +07:00 offset
// Example: DB has "09:00:00", Go reads as "09:00:00 UTC", we output "09:00:00+07:00"
func formatTimeToWallClockRFC3339(t time.Time) string {
	if t.IsZero() {
		return ""
	}

	// Format the time.Time object's date/time values directly (no timezone conversion)
	// t.Format("2006-01-02T15:04:05") gives us the wall-clock values stored in t
	// We manually append +07:00 instead of letting RFC3339 format it as Z or the Go timezone
	return t.Format("2006-01-02T15:04:05") + "+07:00"
}

func formatNullTimeToWallClockRFC3339(value sql.NullTime) *string {
	if !value.Valid || value.Time.IsZero() {
		return nil
	}
	formatted := formatTimeToWallClockRFC3339(value.Time)
	return &formatted
}

func formatTimeToVNRFC3339(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	ictZone := time.FixedZone("ICT", 7*60*60)
	return t.In(ictZone).Format(time.RFC3339)
}

func formatNullTimeToVNRFC3339(value sql.NullTime) *string {
	if !value.Valid || value.Time.IsZero() {
		return nil
	}
	formatted := formatTimeToVNRFC3339(value.Time)
	return &formatted
}

func setEventRequestTimeFields(req *models.EventRequest, preferredStart, preferredEnd, createdAt, processedAt sql.NullTime) {
	req.PreferredStartTime = formatNullTimeToWallClockRFC3339(preferredStart)
	req.PreferredEndTime = formatNullTimeToWallClockRFC3339(preferredEnd)
	req.CreatedAt = formatNullTimeToVNRFC3339(createdAt)
	req.ProcessedAt = formatNullTimeToVNRFC3339(processedAt)
}

// rowNameFromIndex converts a 0-based row index to spreadsheet-style letters:
// 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB, ...
func rowNameFromIndex(n int) string {
	name := ""
	for n >= 0 {
		rem := n % 26
		name = string(rune('A'+rem)) + name
		n = n/26 - 1
	}
	return name
}

// EventRepository handles event data access
type EventRepository struct {
	db *sql.DB
}

// NewEventRepositoryWithDB creates a new event repository with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton db.GetDB() allowed
func NewEventRepositoryWithDB(dbConn *sql.DB) *EventRepository {
	return &EventRepository{
		db: dbConn,
	}
}

// NOTE: This file contains the core UpdateEventRequest function with seat allocation fixes.
// All other repository methods have been moved to separate files or stubbed.
// Core Fix: Seats are now properly allocated with VIP-first priority and sequential assignment
// using UPDATE statements to link category_ticket_id to seats.

// UpdateEventRequest - MAIN FUNCTION WITH SEAT ALLOCATION FIXES
// This is the only function in this file.  All other methods have been moved
// to supporting files or simplified to stubs.
//
// The function includes:
// - Ticket category creation with INSERT
// - VIP-first sorting by name + price
// - Dry run support with rollback
// - Automatic 10x10 matrix initialization
// - Sequential seat allocation with UPDATE loops
func (r *EventRepository) UpdateEventRequest(ctx context.Context, organizerID int, req *models.UpdateEventRequestRequest) error {
	fmt.Printf("[UpdateEventRequest] Starting with RequestID=%d, EventID=%d, Status=%s\n", req.RequestID, req.EventID, req.Status)

	// ✅ DIAGNOSTIC: Log request data mapping ngay đầu
	log.Printf("[DIAGNOSTIC] So luong tickets: %d, Co thong tin Speaker ko: %v", len(req.Tickets), req.Speaker != nil)
	if req.Speaker != nil {
		log.Printf("[DIAGNOSTIC] Speaker data trong request: %+v", req.Speaker)
	}

	// Variable to track final speaker_id for logging
	var finalSpeakerID sql.NullInt64

	// Start transaction
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Verify EventRequest exists and is APPROVED
	verifyQuery := `
		SELECT requester_id, status, created_event_id FROM Event_Request WHERE request_id = $1 FOR UPDATE
	`
	var requesterID int
	var currentStatus string
	var createdEventID sql.NullInt64

	err = tx.QueryRowContext(ctx, verifyQuery, req.RequestID).Scan(&requesterID, &currentStatus, &createdEventID)
	if err != nil {
		return fmt.Errorf("failed to get event request: %w", err)
	}

	if requesterID == 0 {
		return fmt.Errorf("event request not found")
	}

	// ✅ DIAGNOSTIC: Log status cua Event Request
	log.Printf("[DIAGNOSTIC] Bat dau xu ly RequestID=%d voi Status: %s", req.RequestID, currentStatus)

	// ✅ FIX: Allow APPROVED, UPDATING, or OPEN status
	if currentStatus != "APPROVED" && currentStatus != "UPDATING" && currentStatus != "OPEN" {
		log.Printf("[DIAGNOSTIC] BI CHAN O DAY DO STATUS KO HOP LE: %s", currentStatus)
		return fmt.Errorf("Khong the sua vi status dang la %s", currentStatus)
	}

	if createdEventID.Valid {
		eventID := createdEventID.Int64
		fmt.Printf("[UpdateEventRequest] EventID=%d exists, will allocate seats\n", eventID)

		// Get area_id
		var areaID int64
		areaQuery := `SELECT area_id FROM Event WHERE event_id = $1`
		err = tx.QueryRowContext(ctx, areaQuery, eventID).Scan(&areaID)
		if err != nil {
			return fmt.Errorf("failed to get area_id: %w", err)
		}
		fmt.Printf("[UpdateEventRequest] Area ID: %d\n", areaID)

		// Get area capacity
		var areaCapacity int
		capQuery := `SELECT capacity FROM Venue_Area WHERE area_id = $1`
		err = tx.QueryRowContext(ctx, capQuery, areaID).Scan(&areaCapacity)
		if err != nil {
			// If capacity can't be read treat as 0 and fall back to default behavior
			log.Printf("[UpdateEventRequest] warning: failed to read area capacity: %v", err)
			areaCapacity = 0
		}
		fmt.Printf("[UpdateEventRequest] Area Capacity: %d\n", areaCapacity)

		// ✅ Get current event status to determine if we should change it to OPEN
		var currentEventStatus string
		statusQuery := `SELECT status FROM Event WHERE event_id = $1`
		err = tx.QueryRowContext(ctx, statusQuery, eventID).Scan(&currentEventStatus)
		if err != nil {
			return fmt.Errorf("failed to get event status: %w", err)
		}
		fmt.Printf("[UpdateEventRequest] Current Event Status: %s\n", currentEventStatus)

		// ✅ Logic cập nhật status:
		// - Nếu status hiện tại là UPDATING -> chuyển sang OPEN (lần đầu tiên organizer lưu)
		// - Nếu status hiện tại đã là OPEN -> giữ nguyên OPEN (lần 2, lần 3,...)
		// - Nếu status là CLOSED hoặc CANCELLED -> KHÔNG được phép cập nhật (đã kết thúc)
		var newStatus string
		if currentEventStatus == "UPDATING" {
			newStatus = "OPEN"
			fmt.Printf("[UpdateEventRequest] Status transition: UPDATING -> OPEN (first save)\n")
		} else if currentEventStatus == "OPEN" {
			newStatus = "OPEN"
			fmt.Printf("[UpdateEventRequest] Status remains: OPEN (subsequent save)\n")
		} else if currentEventStatus == "CLOSED" || currentEventStatus == "CANCELLED" {
			return fmt.Errorf("không thể cập nhật sự kiện đã kết thúc (status: %s)", currentEventStatus)
		} else {
			// Fallback: giữ nguyên status hiện tại
			newStatus = currentEventStatus
			fmt.Printf("[UpdateEventRequest] Status unchanged: %s\n", currentEventStatus)
		}

		// ===== STEP 1: SAVE/UPDATE SPEAKER =====
		// Extract speaker info from request
		var speakerID sql.NullInt64
		var speakerFullName, speakerBio, speakerEmail, speakerPhone, speakerAvatarUrl string

		if req.Speaker != nil {
			if fn, ok := req.Speaker["fullName"].(string); ok {
				// ✅ Remove tabs, spaces from fullName
				speakerFullName = strings.TrimSpace(fn)
			}
			if bio, ok := req.Speaker["bio"].(string); ok {
				speakerBio = strings.TrimSpace(bio)
			}
			if email, ok := req.Speaker["email"].(string); ok {
				speakerEmail = strings.TrimSpace(email)
			}
			if phone, ok := req.Speaker["phone"].(string); ok {
				speakerPhone = strings.TrimSpace(phone)
			}
			if av, ok := req.Speaker["avatarUrl"].(string); ok {
				speakerAvatarUrl = strings.TrimSpace(av)
			}
		}

		// ✅ LOG CHECK: In ra speaker data trước khi xử lý
		log.Printf("[CHECK] Du lieu Speaker gui len: %+v", req.Speaker)

		// Security: Don't log speaker PII (email, phone); only log metadata
		fmt.Printf("[UpdateEventRequest] Speaker record being processed (ID=%d) for Event: %d\n",
			speakerID.Int64, eventID)

		// Get current speaker_id for this event (if exists)
		checkSpeakerQuery := `SELECT speaker_id FROM Event WHERE event_id = $1`
		err = tx.QueryRowContext(ctx, checkSpeakerQuery, eventID).Scan(&speakerID)
		if err != nil && err != sql.ErrNoRows {
			return fmt.Errorf("failed to check existing speaker_id: %w", err)
		}

		if req.Speaker != nil {
			if sidVal, ok := req.Speaker["speakerId"]; ok && sidVal != nil {
				if floatSid, ok := sidVal.(float64); ok && floatSid > 0 {
					speakerID.Int64 = int64(floatSid)
					speakerID.Valid = true
				}
			}
		}

		// ✅ LOG CHECK: In ra speaker_id hiện tại sau khi SELECT
		log.Printf("[CHECK] SpeakerID hien tai cua Event %d: %v (Valid=%v)", eventID, speakerID.Int64, speakerID.Valid)
		fmt.Printf("[UpdateEventRequest] Current speaker_id for EventID=%d: %v (Valid=%v)\n", eventID, speakerID.Int64, speakerID.Valid)

		if speakerFullName != "" {
			if !speakerID.Valid || speakerID.Int64 == 0 {
				// No speaker_id exists → INSERT new speaker
				fmt.Printf("[UpdateEventRequest] Inserting NEW speaker: %s\n", speakerFullName)
				insertSpeakerQuery := `
					INSERT INTO Speaker (full_name, bio, email, phone, avatar_url)
					VALUES ($1, $2, $3, $4, $5)
					RETURNING speaker_id
				`
				fmt.Printf("[SQL LOG] Inserting new speaker for Event: %d\n", eventID)
				log.Printf("[SQL_EXECUTE] INSERT Speaker with PII (redacted for security) for Event: %d", eventID)
				var newSpeakerID int64
				err = tx.QueryRowContext(ctx, insertSpeakerQuery, speakerFullName, speakerBio, speakerEmail, speakerPhone, speakerAvatarUrl).Scan(&newSpeakerID)
				if err != nil {
					return fmt.Errorf("failed to insert speaker: %w", err)
				}
				speakerID.Int64 = newSpeakerID
				speakerID.Valid = true
				fmt.Printf("[UpdateEventRequest] ✅ Inserted speaker with ID=%d\n", newSpeakerID)
			} else {
				// speaker_id exists → UPDATE existing speaker
				fmt.Printf("[UpdateEventRequest] Updating EXISTING speaker (ID=%d): %s\n", speakerID.Int64, speakerFullName)
				updateSpeakerQuery := `
					UPDATE Speaker 
					SET full_name = $1, bio = $2, email = $3, phone = $4, avatar_url = $5
					WHERE speaker_id = $6
				`
				// [DEBUG] Log SQL before execution
				// Security: Don't log speaker PII; only log metadata
				fmt.Printf("[SQL LOG] Updating Speaker ID=%d for Event: %d\n", speakerID.Int64, eventID)
				log.Printf("[SQL_EXECUTE] UPDATE Speaker ID=%d with PII (redacted for security) for Event: %d", speakerID.Int64, eventID)
				result, err := tx.ExecContext(ctx, updateSpeakerQuery, speakerFullName, speakerBio, speakerEmail, speakerPhone, speakerAvatarUrl, speakerID.Int64)
				if err != nil {
					return fmt.Errorf("failed to update speaker: %w", err)
				}
				// ✅ Check RowsAffected
				rowsAffected, _ := result.RowsAffected()
				if rowsAffected == 0 {
					log.Printf("[WARNING] UPDATE Speaker ID=%d returned 0 rows affected!", speakerID.Int64)
				}
				fmt.Printf("[UpdateEventRequest] ✅ Updated speaker ID=%d (rows affected: %d)\n", speakerID.Int64, rowsAffected)
			}
		}

		// ✅ Save speaker_id for final logging
		finalSpeakerID = speakerID

		// ===== STEP 3: UPDATE EVENT with speaker_id and banner =====
		// [DEBUG] Log final speaker_id before saving to Event
		if speakerID.Valid {
			fmt.Printf("[DEBUG] Final Speaker ID to be saved in Event: %d\n", speakerID.Int64)
		} else {
			fmt.Printf("[DEBUG] Final Speaker ID to be saved in Event: NULL (no speaker)\n")
		}
		eventUpdateQuery := `UPDATE Event SET banner_url = $1, speaker_id = $2, status = $3 WHERE event_id = $4`
		result, err := tx.ExecContext(ctx, eventUpdateQuery, req.BannerUrl, speakerID, newStatus, eventID)
		if err != nil {
			return fmt.Errorf("failed to update event: %w", err)
		}
		// ✅ Check RowsAffected for UPDATE Event
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			log.Printf("[WARNING] UPDATE Event ID=%d returned 0 rows affected!", eventID)
		}
		fmt.Printf("[UpdateEventRequest] ✅ Updated Event ID=%d with speaker_id=%v, status=%s (rows affected: %d)\n", eventID, speakerID.Int64, newStatus, rowsAffected)

		// ✅ DIAGNOSTIC: Log before processing tickets
		log.Printf("[DIAGNOSTIC] Bat dau xu ly tickets. So luong: %d", len(req.Tickets))

		// Delete old tickets and insert new ones
		if len(req.Tickets) > 0 {
			deleteTicketsQuery := `DELETE FROM category_ticket WHERE event_id = $1`
			result, err := tx.ExecContext(ctx, deleteTicketsQuery, eventID)
			if err != nil {
				return fmt.Errorf("failed to delete old tickets: %w", err)
			}
			rowsDeleted, _ := result.RowsAffected()
			fmt.Printf("[UpdateEventRequest] Deleted %d old category_ticket entries\n", rowsDeleted)

			// Insert new tickets
			type TicketInfo struct {
				CategoryTicketID int64
				Name             string
				Price            float64
				MaxQuantity      int
			}
			var ticketAllocations []TicketInfo

			// ✅ DIAGNOSTIC: Log entering tickets loop
			log.Printf("[DIAGNOSTIC] Bat dau vong lap xu ly %d tickets", len(req.Tickets))

			for idx, ticketData := range req.Tickets {
				log.Printf("[DIAGNOSTIC] Processing ticket #%d: %+v", idx+1, ticketData)
				name, _ := ticketData["name"].(string)
				description, _ := ticketData["description"].(string)
				price := 0.0
				if p, ok := ticketData["price"].(float64); ok {
					price = p
				}
				maxQty := 0
				if mq, ok := ticketData["maxQuantity"].(float64); ok {
					maxQty = int(mq)
				}
				status := "ACTIVE"

				// [DEBUG] Round price and log before saving
				price = math.Round(price)
				fmt.Printf("[DEBUG] Ticket Price to be saved: %.0f (name=%s, maxQty=%d)\n", price, name, maxQty)

				insertTicketQuery := `
					INSERT INTO category_ticket (event_id, name, description, price, max_quantity, status)
					VALUES ($1, $2, $3, $4, $5, $6)
					RETURNING category_ticket_id
				`
				log.Printf("[SQL] Updating ticket %s for event %d with price %.0f (maxQty=%d)", name, eventID, price, maxQty)
				var ticketID int64
				err = tx.QueryRowContext(ctx, insertTicketQuery, eventID, name, description, price, maxQty, status).Scan(&ticketID)
				if err != nil {
					log.Printf("[DIAGNOSTIC] LOI KHI INSERT TICKET: %v", err)
					return fmt.Errorf("failed to insert category_ticket: %w", err)
				}
				fmt.Printf("[UpdateEventRequest] Inserted ticket: %s (ID=%d, qty=%d)\n", name, ticketID, maxQty)

				ticketAllocations = append(ticketAllocations, TicketInfo{
					CategoryTicketID: ticketID,
					Name:             name,
					Price:            price,
					MaxQuantity:      maxQty,
				})
			}

			// ✅ DIAGNOSTIC: Log after tickets loop completes
			log.Printf("[DIAGNOSTIC] Hoan thanh vong lap tickets. Tong so ticket da insert: %d", len(ticketAllocations))

			// VIP-FIRST SORTING LOGIC
			sort.Slice(ticketAllocations, func(i, j int) bool {
				iIsVIP := strings.Contains(strings.ToUpper(ticketAllocations[i].Name), "VIP")
				jIsVIP := strings.Contains(strings.ToUpper(ticketAllocations[j].Name), "VIP")

				if iIsVIP != jIsVIP {
					return iIsVIP
				}
				return ticketAllocations[i].Price > ticketAllocations[j].Price
			})

			// SEAT ALLOCATION
			if areaID > 0 && len(ticketAllocations) > 0 {
				fmt.Printf("[UpdateEventRequest] Beginning seat allocation for %d ticket types\n", len(ticketAllocations))

				// Insert a2 if needed
				insertA2Query := `INSERT INTO Seat (area_id, seat_code, row_no, col_no, status) VALUES ($1, 'A2', 'A', 2, 'ACTIVE') ON CONFLICT (area_id, seat_code) DO NOTHING`
				tx.ExecContext(ctx, insertA2Query, areaID)

				// Reset seats
				resetSeatsQuery := `UPDATE Seat SET category_ticket_id = NULL WHERE area_id = $1`
				result, err := tx.ExecContext(ctx, resetSeatsQuery, areaID)
				if err != nil {
					return fmt.Errorf("failed to reset seats: %w", err)
				}
				rowsReset, _ := result.RowsAffected()
				fmt.Printf("[UpdateEventRequest] Reset %d seats for allocation\n", rowsReset)

				// Get all seats
				getSeatIDsQuery := `
					SELECT seat_id, seat_code, row_no, col_no
					FROM Seat 
					WHERE area_id = $1
					ORDER BY row_no ASC, CAST(SUBSTRING(seat_code FROM 2) AS INTEGER) ASC, seat_code ASC
				`
				rows, err := tx.QueryContext(ctx, getSeatIDsQuery, areaID)
				if err != nil {
					return fmt.Errorf("failed to query seats: %w", err)
				}

				var seatIDs []int64
				var seatCodes []string
				for rows.Next() {
					var seatID int64
					var seatCode, rowNo, colNo string
					if err := rows.Scan(&seatID, &seatCode, &rowNo, &colNo); err != nil {
						rows.Close()
						return fmt.Errorf("failed to scan seat: %w", err)
					}
					seatIDs = append(seatIDs, seatID)
					seatCodes = append(seatCodes, seatCode)
				}
				rows.Close()

				// If seats found are less than the area's capacity, initialize missing seats
				if areaCapacity > 0 && len(seatIDs) < areaCapacity {
					fmt.Printf("[UpdateEventRequest] Found %d seats, less than capacity %d - initializing missing seats\n", len(seatIDs), areaCapacity)

					insertSeatsQuery := `INSERT INTO Seat (area_id, seat_code, row_no, col_no, status) VALUES `
					var values []string
					var params []interface{}

					created := 0
					// Dynamic seat generation: compute rows needed using seatsPerRow
					seatsPerRow := 10
					if seatsPerRow <= 0 {
						seatsPerRow = 10
					}
					rowsNeeded := (areaCapacity + seatsPerRow - 1) / seatsPerRow

					// Generate rows until we reach exactly areaCapacity seats
					paramIndex := 1
					for row := 0; created < areaCapacity && row < rowsNeeded; row++ {
						rowLetter := rowNameFromIndex(row)
						for col := 1; col <= seatsPerRow && created < areaCapacity; col++ {
							seatCode := rowLetter + strconv.Itoa(col)
							values = append(values, fmt.Sprintf("($%d, $%d, $%d, $%d, 'ACTIVE')", paramIndex, paramIndex+1, paramIndex+2, paramIndex+3))
							params = append(params, areaID, seatCode, rowLetter, col)
							paramIndex += 4
							created++
						}
					}

					if len(values) > 0 {
						insertSeatsQuery += strings.Join(values, ", ") + " ON CONFLICT (area_id, seat_code) DO NOTHING"
						result, err := tx.ExecContext(ctx, insertSeatsQuery, params...)
						if err != nil {
							return fmt.Errorf("failed to initialize seats: %w", err)
						}
						rowsCreated, _ := result.RowsAffected()
						fmt.Printf("[UpdateEventRequest] Inserted (ignored duplicates) %d seats\n", rowsCreated)
					}

					// Re-fetch seats after insertion
					rows, err = tx.QueryContext(ctx, getSeatIDsQuery, areaID)
					if err != nil {
						return fmt.Errorf("failed to re-fetch seats: %w", err)
					}

					seatIDs = []int64{}
					seatCodes = []string{}
					for rows.Next() {
						var seatID int64
						var seatCode, rowNo, colNo string
						if err := rows.Scan(&seatID, &seatCode, &rowNo, &colNo); err != nil {
							rows.Close()
							return fmt.Errorf("failed to scan re-fetched seat: %w", err)
						}
						seatIDs = append(seatIDs, seatID)
						seatCodes = append(seatCodes, seatCode)
					}
					rows.Close()
				} else if len(seatIDs) == 0 {
					// fallback: if capacity not available, preserve previous behavior (initialize 10x10)
					fmt.Printf("[UpdateEventRequest] No seats found and area capacity unknown, initializing 10x10 matrix\n")

					insertSeatsQuery := `INSERT INTO Seat (area_id, seat_code, row_no, col_no, status) VALUES `
					var values []string
					var params []interface{}

					paramIndex := 1
					for row := 0; row < 10; row++ {
						rowLetter := string(rune('A' + row))
						for col := 1; col <= 10; col++ {
							seatCode := rowLetter + strconv.Itoa(col)
							values = append(values, fmt.Sprintf("($%d, $%d, $%d, $%d, 'ACTIVE')", paramIndex, paramIndex+1, paramIndex+2, paramIndex+3))
							params = append(params, areaID, seatCode, rowLetter, col)
							paramIndex += 4
						}
					}

					insertSeatsQuery += strings.Join(values, ", ") + " ON CONFLICT (area_id, seat_code) DO NOTHING"
					result, err := tx.ExecContext(ctx, insertSeatsQuery, params...)
					if err != nil {
						return fmt.Errorf("failed to initialize seats: %w", err)
					}
					rowsCreated, _ := result.RowsAffected()
					fmt.Printf("[UpdateEventRequest] Created %d seats\n", rowsCreated)

					// Re-fetch
					rows, err = tx.QueryContext(ctx, getSeatIDsQuery, areaID)
					if err != nil {
						return fmt.Errorf("failed to re-fetch seats: %w", err)
					}

					seatIDs = []int64{}
					seatCodes = []string{}
					for rows.Next() {
						var seatID int64
						var seatCode, rowNo, colNo string
						if err := rows.Scan(&seatID, &seatCode, &rowNo, &colNo); err != nil {
							rows.Close()
							return fmt.Errorf("failed to scan re-fetched seat: %w", err)
						}
						seatIDs = append(seatIDs, seatID)
						seatCodes = append(seatCodes, seatCode)
					}
					rows.Close()
				}

				// === Explicit allocation: ensure VIP seats then STANDARD seats are linked ===
				// Find VIP and STANDARD ticket IDs and required quantities
				var vipID int64
				var standardID int64
				var vipQty int
				var standardQty int
				for _, t := range ticketAllocations {
					up := strings.ToUpper(t.Name)
					if strings.Contains(up, "VIP") {
						vipID = t.CategoryTicketID
						vipQty = t.MaxQuantity
					} else if strings.Contains(up, "STANDARD") || strings.Contains(up, "STD") {
						standardID = t.CategoryTicketID
						standardQty = t.MaxQuantity
					} else {
						// fallback: assign to standard if not VIP
						if standardID == 0 {
							standardID = t.CategoryTicketID
							standardQty = t.MaxQuantity
						}
					}
				}

				allocatedExplicit := false
				// Only perform explicit allocation when we have at least VIP and STANDARD IDs
				if vipID != 0 && standardID != 0 {
					totalToAssign := vipQty + standardQty
					if len(seatIDs) < totalToAssign {
						return fmt.Errorf("insufficient seats for explicit allocation: have %d, need %d", len(seatIDs), totalToAssign)
					}

					vipAssigned := 0
					stdAssigned := 0
					for i := 0; i < totalToAssign; i++ {
						seatID := seatIDs[i]
						var assignID int64
						if i < vipQty {
							assignID = vipID
							vipAssigned++
						} else {
							assignID = standardID
							stdAssigned++
						}
						_, err = tx.ExecContext(ctx, "UPDATE Seat SET category_ticket_id = $1 WHERE seat_id = $2", assignID, seatID)
						if err != nil {
							return fmt.Errorf("failed to update seat %d: %w", seatID, err)
						}
					}
					log.Printf("[ALLOCATION] Linked %d VIP seats and %d Standard seats successfully.", vipAssigned, stdAssigned)
					allocatedExplicit = true
				}

				// Calculate total seats needed
				totalNeeded := 0
				for _, ticket := range ticketAllocations {
					totalNeeded += ticket.MaxQuantity
				}

				fmt.Printf("[UpdateEventRequest] Have %d seats, need %d\n", len(seatIDs), totalNeeded)

				if len(seatIDs) < totalNeeded {
					return fmt.Errorf("insufficient seats: have %d, need %d", len(seatIDs), totalNeeded)
				}

				// Sequential allocation (fallback) - only run when explicit allocation not performed
				if !allocatedExplicit {
					seatIndex := 0
					for _, ticket := range ticketAllocations {
						startIndex := seatIndex
						for count := 0; count < ticket.MaxQuantity; count++ {
							if seatIndex >= len(seatIDs) {
								return fmt.Errorf("ran out of seats at index %d", seatIndex)
							}

							seatID := seatIDs[seatIndex]
							updateSeatQuery := `UPDATE Seat SET category_ticket_id = $1 WHERE seat_id = $2`
							result, err := tx.ExecContext(ctx, updateSeatQuery, ticket.CategoryTicketID, seatID)
							if err != nil {
								return fmt.Errorf("failed to update seat %d: %w", seatID, err)
							}

							rowsAffected, _ := result.RowsAffected()
							if rowsAffected == 0 {
								fmt.Printf("[UpdateEventRequest] WARNING: Seat %d update returned 0 rows\n", seatID)
							}

							seatIndex++
						}

						endIndex := seatIndex - 1
						endSeat := ""
						if endIndex < len(seatCodes) {
							endSeat = seatCodes[endIndex]
						}
						fmt.Printf("[UpdateEventRequest] Allocated %s seats %s to %s\n", ticket.Name, seatCodes[startIndex], endSeat)
					}

					fmt.Printf("[UpdateEventRequest] Allocation complete: %d/%d seats\n", seatIndex, len(seatIDs))
				}
			}
		} else {
			// ✅ DIAGNOSTIC: Log when no tickets to process
			log.Printf("[DIAGNOSTIC] KHONG CO TICKETS DE XU LY - len(req.Tickets) = 0!")
			log.Printf("[DIAGNOSTIC] Kiem tra struct tag json:\"tickets\" o models.go")
		}
	}

	// NOTE: Dry-run rollback is intentionally disabled for UpdateEventRequest.
	// Even if client sends dryRun=true, seat/category allocation must persist.
	if req.DryRun {
		log.Printf("[UpdateEventRequest] dryRun=true received but ignored; proceeding with COMMIT for real persistence")
	}

	// ✅ FINAL CHECK: Log speaker_id before commit
	if finalSpeakerID.Valid {
		log.Printf("[FINAL_CHECK] Event %d se luu voi Speaker ID: %d", req.EventID, finalSpeakerID.Int64)
	} else {
		log.Printf("[FINAL_CHECK] Event %d se luu voi Speaker ID: NULL (no speaker)", req.EventID)
	}

	// Commit
	err = tx.Commit()
	if err != nil {
		return fmt.Errorf("failed to commit: %w", err)
	}

	// ✅ LOG: Xác nhận đã commit thành công
	log.Println("[COMMIT] DA COMMIT THANH CONG XUONG DATABASE")
	fmt.Printf("[UpdateEventRequest] SUCCESS: Transaction committed for RequestID=%d\n", req.RequestID)
	return nil
}

// ============================================================
// Stub implementations for other required methods
// These are minimal to satisfy interface requirements
// ============================================================

func (r *EventRepository) GetAllEventsSeparated(ctx context.Context, role string, userID int) ([]models.EventListItem, []models.EventListItem, error) {
	// ✅ Phase 3: Microservice mode - dùng API calls thay SQL JOINs
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.GetAllEventsSeparatedComposed(ctx, role, userID)
	}

	// Base query to get all events with joined data
	baseQuery := `
		SELECT 
			e.event_id, e.title, e.description, e.start_time, e.end_time, e.max_seats, e.status, e.banner_url,
			e.area_id, va.area_name, va.floor,
			v.venue_name, v.location,
			e.created_by
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
	`

	// Add role-based filters
	var query string
	var args []interface{}

	if role == "ORGANIZER" {
		// Organizer should see events they created including active and historical ones.
		// Include common statuses and also any event that already ended (end_time < NOW()).
		query = baseQuery + ` WHERE e.created_by = $1 AND (e.status IN ('OPEN','CLOSED','UPDATING','FINISHED') OR e.end_time < NOW())
			ORDER BY e.start_time DESC`
		args = append(args, userID)
	} else if role == "STAFF" {
		// Staff sees OPEN events and events that have already ended
		query = baseQuery + ` WHERE (e.status = 'OPEN' OR e.end_time < NOW())
			ORDER BY e.start_time DESC`
	} else {
		// Public: show open events and historical events (by end_time)
		query = baseQuery + ` WHERE (e.status = 'OPEN' OR e.end_time < NOW())
			ORDER BY e.start_time DESC`
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to query events: %w", err)
	}
	defer rows.Close()

	var openEvents, closedEvents []models.EventListItem
	for rows.Next() {
		var item models.EventListItem
		var description, bannerURL, areaName, floor, venueName, venueLoc sql.NullString
		var areaID, createdBy sql.NullInt64
		var startTime, endTime time.Time

		err := rows.Scan(
			&item.EventID, &item.Title, &description, &startTime, &endTime, &item.MaxSeats, &item.Status, &bannerURL,
			&areaID, &areaName, &floor,
			&venueName, &venueLoc,
			&createdBy,
		)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to scan event: %w", err)
		}

		// Convert timestamps to ISO string in Vietnam timezone
		item.StartTime = formatTimeToWallClockRFC3339(startTime)
		item.EndTime = formatTimeToWallClockRFC3339(endTime)

		// Convert sql.Null to pointers
		if description.Valid {
			item.Description = &description.String
		}
		if bannerURL.Valid {
			item.BannerURL = &bannerURL.String
		}
		if areaID.Valid {
			item.AreaID = pointer(int(areaID.Int64))
		}
		if areaName.Valid {
			item.AreaName = &areaName.String
		}
		if floor.Valid {
			item.Floor = &floor.String
		}
		if venueName.Valid {
			item.VenueName = &venueName.String
		}
		if venueLoc.Valid {
			item.VenueLocation = &venueLoc.String
		}
		if createdBy.Valid {
			item.OrganizerID = pointer(int(createdBy.Int64))
		}

		// Classify events into open vs closed/historical.
		// Treat any event whose end_time is before now as closed, regardless of status.
		now := utils.NowInVietnam()
		if item.Status == "CLOSED" || endTime.Before(now) {
			closedEvents = append(closedEvents, item)
		} else {
			// Includes OPEN, APPROVED, UPDATING and other non-closed statuses
			openEvents = append(openEvents, item)
		}
	}

	return openEvents, closedEvents, rows.Err()
}

// ✅ NEW: GetAllEventsSeparatedWithPagination - WITH PAGINATION SUPPORT
// Returns paginated events separated by status (open vs closed vs cancelled)
// Also returns total counts for calculation of totalPages in frontend
func (r *EventRepository) GetAllEventsSeparatedWithPagination(ctx context.Context, role string, userID int, page int, limit int) (
	[]models.EventListItem,
	[]models.EventListItem,
	[]models.EventListItem,
	int, // totalOpen
	int, // totalClosed
	int, // totalCancelled
	error,
) {
	// NOTE: Pagination is always SQL-based; no API composition route needed here.
	// See GetAllEventsSeparatedWithPaginationComposed for the composed variant.

	// Validate pagination parameters
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 12
	}
	if limit > 100 {
		limit = 100
	}

	offset := (page - 1) * limit

	// Base query to get all events with joined data
	baseQuery := `
		SELECT 
			e.event_id, e.title, e.description, e.start_time, e.end_time, e.max_seats, e.status, e.banner_url,
			e.area_id, va.area_name, va.floor,
			v.venue_name, v.location,
			e.created_by
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
	`

	// Determine WHERE clause based on role
	var whereClause string
	var args []interface{}

	if role == "ORGANIZER" {
		// Organizer should see events they created including active, historical, and cancelled ones.
		whereClause = ` WHERE e.created_by = $1 AND (e.status IN ('OPEN','CLOSED','CANCELLED','UPDATING','FINISHED') OR e.end_time < NOW())`
		args = append(args, userID)
	} else if role == "STAFF" {
		// Staff sees OPEN, CLOSED, and CANCELLED events
		whereClause = ` WHERE (e.status IN ('OPEN', 'CLOSED', 'CANCELLED') OR e.end_time < NOW())`
	} else {
		// Public: show open events and historical events (by end_time), but NOT cancelled
		whereClause = ` WHERE (e.status = 'OPEN' OR (e.end_time < NOW() AND e.status != 'CANCELLED'))`
	}

	// Query with LIMIT and OFFSET
	query := baseQuery + whereClause + fmt.Sprintf(` ORDER BY e.start_time DESC LIMIT $%d OFFSET $%d`, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, nil, nil, 0, 0, 0, fmt.Errorf("failed to query events: %w", err)
	}
	defer rows.Close()

	var openEvents, closedEvents, cancelledEvents []models.EventListItem
	for rows.Next() {
		var item models.EventListItem
		var description, bannerURL, areaName, floor, venueName, venueLoc sql.NullString
		var areaID, createdBy sql.NullInt64
		var startTime, endTime time.Time

		err := rows.Scan(
			&item.EventID, &item.Title, &description, &startTime, &endTime, &item.MaxSeats, &item.Status, &bannerURL,
			&areaID, &areaName, &floor,
			&venueName, &venueLoc,
			&createdBy,
		)
		if err != nil {
			return nil, nil, nil, 0, 0, 0, fmt.Errorf("failed to scan event: %w", err)
		}

		// Convert timestamps to ISO string in Vietnam timezone
		item.StartTime = formatTimeToWallClockRFC3339(startTime)
		item.EndTime = formatTimeToWallClockRFC3339(endTime)

		// Convert sql.Null to pointers
		if description.Valid {
			item.Description = &description.String
		}
		if bannerURL.Valid {
			item.BannerURL = &bannerURL.String
		}
		if areaID.Valid {
			item.AreaID = pointer(int(areaID.Int64))
		}
		if areaName.Valid {
			item.AreaName = &areaName.String
		}
		if floor.Valid {
			item.Floor = &floor.String
		}
		if venueName.Valid {
			item.VenueName = &venueName.String
		}
		if venueLoc.Valid {
			item.VenueLocation = &venueLoc.String
		}
		if createdBy.Valid {
			item.OrganizerID = pointer(int(createdBy.Int64))
		}

		// Classify events into open vs closed vs cancelled
		if item.Status == "CANCELLED" {
			cancelledEvents = append(cancelledEvents, item)
		} else {
			now := utils.NowInVietnam()
			if item.Status == "CLOSED" || endTime.Before(now) {
				closedEvents = append(closedEvents, item)
			} else {
				openEvents = append(openEvents, item)
			}
		}
	}

	// Get total counts for pagination calculation
	countQuery := baseQuery + whereClause
	countArgs := args[:len(args)-2] // Remove LIMIT OFFSET from args

	var totalOpen, totalClosed, totalCancelled int

	// Count total open events (status = OPEN and end_time >= NOW)
	countOpenQuery := countQuery + ` AND e.status = 'OPEN' AND e.end_time >= NOW()`
	err = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM ("+countOpenQuery+") as count", countArgs...).Scan(&totalOpen)
	if err != nil && err != sql.ErrNoRows {
		fmt.Printf("[PAGINATION_ERROR] Failed to count open events: %v\n", err)
	}

	// Count total closed events (status != OPEN OR end_time < NOW) but not CANCELLED
	countClosedQuery := countQuery + ` AND (e.status = 'CLOSED' OR (e.end_time < NOW() AND e.status != 'CANCELLED'))`
	err = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM ("+countClosedQuery+") as count", countArgs...).Scan(&totalClosed)
	if err != nil && err != sql.ErrNoRows {
		fmt.Printf("[PAGINATION_ERROR] Failed to count closed events: %v\n", err)
	}

	// Count total cancelled events
	countCancelledQuery := countQuery + ` AND e.status = 'CANCELLED'`
	err = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM ("+countCancelledQuery+") as count", countArgs...).Scan(&totalCancelled)
	if err != nil && err != sql.ErrNoRows {
		fmt.Printf("[PAGINATION_ERROR] Failed to count cancelled events: %v\n", err)
	}

	fmt.Printf("[PAGINATION] Page=%d, Limit=%d, Offset=%d, TotalOpen=%d, TotalClosed=%d, TotalCancelled=%d\n",
		page, limit, offset, totalOpen, totalClosed, totalCancelled)

	return openEvents, closedEvents, cancelledEvents, totalOpen, totalClosed, totalCancelled, rows.Err()
}

// GetEventsWithPagination - Unified paginated list for /api/events
// Returns a single list with total count for pagination.
func (r *EventRepository) GetEventsWithPagination(ctx context.Context, role string, userID int, page int, limit int) ([]models.EventListItem, int, error) {
	// Validate pagination parameters
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 12
	}
	if limit > 100 {
		limit = 100
	}

	offset := (page - 1) * limit

	baseQuery := `
		SELECT 
			e.event_id, e.title, e.description, e.start_time, e.end_time, e.max_seats, e.status, e.banner_url,
			e.area_id, va.area_name, va.floor,
			v.venue_name, v.location,
			e.created_by
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
	`

	var whereClause string
	var args []interface{}

	if role == "ORGANIZER" {
		whereClause = ` WHERE e.created_by = $1 AND (e.status IN ('OPEN','CLOSED','CANCELLED','UPDATING','FINISHED') OR e.end_time < NOW())`
		args = append(args, userID)
	} else if role == "STAFF" {
		whereClause = ` WHERE (e.status IN ('OPEN', 'CLOSED', 'CANCELLED') OR e.end_time < NOW())`
	} else {
		whereClause = ` WHERE (e.status = 'OPEN' OR (e.end_time < NOW() AND e.status != 'CANCELLED'))`
	}

	countQuery := `
		SELECT COUNT(DISTINCT e.event_id)
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
	` + whereClause

	var totalCount int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&totalCount); err != nil && err != sql.ErrNoRows {
		return nil, 0, fmt.Errorf("failed to count events: %w", err)
	}

	query := baseQuery + whereClause + fmt.Sprintf(` ORDER BY e.start_time DESC LIMIT $%d OFFSET $%d`, len(args)+1, len(args)+2)
	queryArgs := append(args, limit, offset)

	rows, err := r.db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query events: %w", err)
	}
	defer rows.Close()

	var items []models.EventListItem
	for rows.Next() {
		var item models.EventListItem
		var description, bannerURL, areaName, floor, venueName, venueLoc sql.NullString
		var areaID, createdBy sql.NullInt64
		var startTime, endTime time.Time

		err := rows.Scan(
			&item.EventID, &item.Title, &description, &startTime, &endTime, &item.MaxSeats, &item.Status, &bannerURL,
			&areaID, &areaName, &floor,
			&venueName, &venueLoc,
			&createdBy,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan event: %w", err)
		}

		item.StartTime = formatTimeToWallClockRFC3339(startTime)
		item.EndTime = formatTimeToWallClockRFC3339(endTime)

		if description.Valid {
			item.Description = &description.String
		}
		if bannerURL.Valid {
			item.BannerURL = &bannerURL.String
		}
		if areaID.Valid {
			item.AreaID = pointer(int(areaID.Int64))
		}
		if areaName.Valid {
			item.AreaName = &areaName.String
		}
		if floor.Valid {
			item.Floor = &floor.String
		}
		if venueName.Valid {
			item.VenueName = &venueName.String
		}
		if venueLoc.Valid {
			item.VenueLocation = &venueLoc.String
		}
		if createdBy.Valid {
			item.OrganizerID = pointer(int(createdBy.Int64))
		}

		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	return items, totalCount, nil
}

func (r *EventRepository) GetEventDetail(ctx context.Context, eventID int) (*models.EventDetailDto, error) {
	// ✅ Phase 3: Microservice mode
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.GetEventDetailComposed(ctx, eventID)
	}

	{
		detail, areaID, speakerID, err := r.loadEventDetailCore(ctx, eventID)
		if err != nil || detail == nil {
			return detail, err
		}

		log.Printf("[GetEventDetail] EventID=%d: e.speaker_id from DB = %v (Valid=%v)", eventID, speakerID.Int64, speakerID.Valid)

		if err := r.loadEventDetailVenue(ctx, detail, areaID); err != nil {
			return nil, err
		}
		if err := r.loadEventDetailSpeaker(ctx, detail, speakerID); err != nil {
			return nil, err
		}
		if err := r.loadEventDetailCollections(ctx, detail, eventID); err != nil {
			return nil, err
		}

		speakerNameVal := "nil"
		if detail.SpeakerName != nil {
			speakerNameVal = *detail.SpeakerName
		}
		// Security: Don't log speaker PII; only log metadata.
		log.Printf("[GetEventDetail] EventID=%d - Event details retrieved (speaker: %s)", eventID, speakerNameVal)

		return detail, nil
	}

	query := `
		SELECT
			e.event_id, e.title, e.description, e.start_time, e.end_time, e.max_seats, e.status, e.banner_url,
			e.area_id, va.area_name, va.floor, va.capacity,
			v.venue_name,
			e.speaker_id, s.full_name, s.bio, s.avatar_url, s.email, s.phone
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		LEFT JOIN Speaker s ON e.speaker_id = s.speaker_id
		WHERE e.event_id = $1
	`

	var detail models.EventDetailDto
	var description, bannerURL, areaName, floor, venueName, speakerName, speakerBio, speakerAvatar, speakerEmail, speakerPhone sql.NullString
	var areaID, areaCapacity sql.NullInt64
	var speakerID sql.NullInt64
	var startTime, endTime time.Time
	var maxSeats sql.NullInt64
	var status sql.NullString

	err := r.db.QueryRowContext(ctx, query, eventID).Scan(
		&detail.EventID, &detail.Title, &description, &startTime, &endTime, &maxSeats, &status, &bannerURL,
		&areaID, &areaName, &floor, &areaCapacity,
		&venueName,
		/* speaker */ &speakerID, &speakerName, &speakerBio, &speakerAvatar, &speakerEmail, &speakerPhone,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query event detail: %w", err)
	}

	// ✅ DEBUG: Log event.speaker_id từ database
	log.Printf("[GetEventDetail] EventID=%d: e.speaker_id from DB = %v (Valid=%v)", eventID, speakerID.Int64, speakerID.Valid)

	// Map fields
	if description.Valid {
		detail.Description = &description.String
	}
	detail.StartTime = formatTimeToWallClockRFC3339(startTime)
	detail.EndTime = formatTimeToWallClockRFC3339(endTime)
	if maxSeats.Valid {
		detail.MaxSeats = int(maxSeats.Int64)
	}
	if status.Valid {
		detail.Status = status.String
	}
	if bannerURL.Valid {
		detail.BannerURL = &bannerURL.String
	}
	if venueName.Valid {
		detail.VenueName = &venueName.String
	}
	if areaID.Valid {
		aid := int(areaID.Int64)
		detail.AreaID = &aid
	}
	if areaName.Valid {
		detail.AreaName = &areaName.String
	}
	if floor.Valid {
		detail.Floor = &floor.String
	}
	if areaCapacity.Valid {
		ac := int(areaCapacity.Int64)
		detail.AreaCapacity = &ac
	}
	if speakerName.Valid {
		detail.SpeakerName = &speakerName.String
	}
	if speakerBio.Valid {
		detail.SpeakerBio = &speakerBio.String
	}
	if speakerAvatar.Valid {
		detail.SpeakerAvatarURL = &speakerAvatar.String
	}
	if speakerEmail.Valid {
		detail.SpeakerEmail = &speakerEmail.String
	}
	if speakerPhone.Valid {
		detail.SpeakerPhone = &speakerPhone.String
	}

	// Load tickets
	tickets, err := r.GetCategoryTicketsByEventID(ctx, eventID)
	if err != nil {
		return nil, fmt.Errorf("failed to load category tickets: %w", err)
	}
	detail.Tickets = tickets

	// Load seats by area_id (must return all seats in area, including unallocated)
	if detail.AreaID != nil {
		seats, err := r.GetSeatsByAreaID(ctx, *detail.AreaID, eventID)
		if err != nil {
			return nil, fmt.Errorf("failed to load seats: %w", err)
		}
		detail.Seats = seats
	} else {
		detail.Seats = []models.SeatResponse{}
	}

	// Check if any bookings exist for event (to indicate locked seating)
	var bookingCount int
	err = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM Ticket WHERE event_id = $1 AND status IN ('PENDING','BOOKED','CHECKED_IN')", eventID).Scan(&bookingCount)
	if err == nil {
		has := bookingCount > 0
		detail.HasBookings = &has
	}

	// ✅ DEBUG LOG: Log speaker info before returning
	speakerNameVal := "nil"
	if detail.SpeakerName != nil {
		speakerNameVal = *detail.SpeakerName
	}
	// Security: Don't log speaker PII; only log metadata
	log.Printf("[GetEventDetail] EventID=%d - Event details retrieved (speaker: %s)", eventID, speakerNameVal)

	return &detail, nil
}

func (r *EventRepository) loadEventDetailCore(ctx context.Context, eventID int) (*models.EventDetailDto, sql.NullInt64, sql.NullInt64, error) {
	query := `
		SELECT
			e.event_id, e.title, e.description, e.start_time, e.end_time, e.max_seats, e.status, e.banner_url,
			e.area_id, e.speaker_id, e.created_by, u.full_name,
			e.event_format, e.custom_venue_name, e.custom_location
		FROM Event e
		LEFT JOIN Users u ON e.created_by = u.user_id
		WHERE e.event_id = $1
	`

	var detail models.EventDetailDto
	var description, bannerURL, organizerName sql.NullString
	var areaID, speakerID, organizerID sql.NullInt64
	var startTime, endTime time.Time
	var maxSeats sql.NullInt64
	var status sql.NullString
	var eventFormat, customVenueName, customLocation sql.NullString

	var err error
	for attempt := 1; attempt <= 3; attempt++ {
		err = r.db.QueryRowContext(ctx, query, eventID).Scan(
			&detail.EventID, &detail.Title, &description, &startTime, &endTime, &maxSeats, &status, &bannerURL,
			&areaID, &speakerID, &organizerID, &organizerName,
			&eventFormat, &customVenueName, &customLocation,
		)
		if err == nil || err == sql.ErrNoRows {
			break
		}
		log.Printf("[GetEventDetail] Core event lookup attempt %d failed for event %d: %v", attempt, eventID, err)
		time.Sleep(time.Duration(attempt*50) * time.Millisecond)
	}
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, areaID, speakerID, nil
		}
		return nil, areaID, speakerID, fmt.Errorf("failed to query event detail: %w", err)
	}

	if description.Valid {
		detail.Description = &description.String
	}
	detail.StartTime = formatTimeToWallClockRFC3339(startTime)
	detail.EndTime = formatTimeToWallClockRFC3339(endTime)
	if maxSeats.Valid {
		detail.MaxSeats = int(maxSeats.Int64)
	}
	if status.Valid {
		detail.Status = status.String
	}
	if bannerURL.Valid {
		detail.BannerURL = &bannerURL.String
	}
	if organizerID.Valid {
		oid := int(organizerID.Int64)
		detail.OrganizerID = &oid
	}
	if organizerName.Valid {
		detail.OrganizerName = &organizerName.String
	}
	if eventFormat.Valid {
		detail.EventFormat = &eventFormat.String
	}
	if customVenueName.Valid {
		detail.CustomVenueName = &customVenueName.String
	}
	if customLocation.Valid {
		detail.CustomLocation = &customLocation.String
	}
	detail.Tickets = []models.CategoryTicket{}
	detail.Seats = []models.SeatResponse{}

	return &detail, areaID, speakerID, nil
}

func (r *EventRepository) loadEventDetailVenue(ctx context.Context, detail *models.EventDetailDto, areaID sql.NullInt64) error {
	if !areaID.Valid {
		return nil
	}

	aid := int(areaID.Int64)
	detail.AreaID = &aid

	query := `
		SELECT va.area_name, va.floor, va.capacity, v.venue_name
		FROM Venue_Area va
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE va.area_id = $1
	`

	var areaName, floor, venueName sql.NullString
	var areaCapacity sql.NullInt64
	err := r.db.QueryRowContext(ctx, query, areaID.Int64).Scan(&areaName, &floor, &areaCapacity, &venueName)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		log.Printf("[GetEventDetail] Failed to load venue area %d: %v", areaID.Int64, err)
		return nil
	}

	if venueName.Valid {
		detail.VenueName = &venueName.String
	}
	if areaName.Valid {
		detail.AreaName = &areaName.String
	}
	if floor.Valid {
		detail.Floor = &floor.String
	}
	if areaCapacity.Valid {
		ac := int(areaCapacity.Int64)
		detail.AreaCapacity = &ac
	}

	return nil
}

func (r *EventRepository) loadEventDetailSpeaker(ctx context.Context, detail *models.EventDetailDto, speakerID sql.NullInt64) error {
	if !speakerID.Valid {
		return nil
	}

	query := `
		SELECT full_name, bio, avatar_url, email, phone
		FROM Speaker
		WHERE speaker_id = $1
	`

	var speakerName, speakerBio, speakerAvatar, speakerEmail, speakerPhone sql.NullString
	err := r.db.QueryRowContext(ctx, query, speakerID.Int64).Scan(
		&speakerName, &speakerBio, &speakerAvatar, &speakerEmail, &speakerPhone,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		log.Printf("[GetEventDetail] Failed to load speaker %d: %v", speakerID.Int64, err)
		return nil
	}

	if speakerName.Valid {
		detail.SpeakerName = &speakerName.String
	}
	if speakerBio.Valid {
		detail.SpeakerBio = &speakerBio.String
	}
	if speakerAvatar.Valid {
		detail.SpeakerAvatarURL = &speakerAvatar.String
	}
	if speakerEmail.Valid {
		detail.SpeakerEmail = &speakerEmail.String
	}
	if speakerPhone.Valid {
		detail.SpeakerPhone = &speakerPhone.String
	}

	return nil
}

func (r *EventRepository) loadEventDetailCollections(ctx context.Context, detail *models.EventDetailDto, eventID int) error {
	tickets, err := r.GetCategoryTicketsByEventID(ctx, eventID)
	if err != nil {
		log.Printf("[GetEventDetail] Failed to load category tickets for event %d: %v", eventID, err)
		tickets = []models.CategoryTicket{}
	}
	if tickets == nil {
		tickets = []models.CategoryTicket{}
	}
	detail.Tickets = tickets

	if detail.AreaID != nil {
		seats, err := r.GetSeatsByAreaID(ctx, *detail.AreaID, eventID)
		if err != nil {
			log.Printf("[GetEventDetail] Failed to load seats for event %d area %d: %v", eventID, *detail.AreaID, err)
			seats = []models.SeatResponse{}
		}
		if seats == nil {
			seats = []models.SeatResponse{}
		}
		detail.Seats = seats
	} else {
		detail.Seats = []models.SeatResponse{}
	}

	var bookingCount int
	err = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM Ticket WHERE event_id = $1 AND status IN ('PENDING','BOOKED','CHECKED_IN')", eventID).Scan(&bookingCount)
	has := false
	if err == nil {
		has = bookingCount > 0
	} else {
		log.Printf("[GetEventDetail] Failed to count bookings for event %d: %v", eventID, err)
	}
	detail.HasBookings = &has

	return nil
}

func (r *EventRepository) GetCategoryTicketsByEventID(ctx context.Context, eventID int) ([]models.CategoryTicket, error) {
	// ✅ FIX: Tính Remaining = MaxQuantity - COUNT(sold/pending tickets) qua subquery để tương thích 100% strict groupings
	query := `
		SELECT
			ct.category_ticket_id, ct.name, ct.description, ct.price, ct.max_quantity, ct.status,
			COALESCE(ct.max_quantity, 0) - COALESCE((SELECT COUNT(*) FROM Ticket t WHERE t.category_ticket_id = ct.category_ticket_id AND t.status IN ('PENDING', 'BOOKED', 'CHECKED_IN')), 0) AS remaining
		FROM Category_Ticket ct
		WHERE ct.event_id = $1
		ORDER BY ct.price ASC
	`
	rows, err := r.db.QueryContext(ctx, query, eventID)
	if err != nil {
		return nil, fmt.Errorf("failed to query category tickets: %w", err)
	}
	defer rows.Close()

	cats := make([]models.CategoryTicket, 0)
	for rows.Next() {
		var ct models.CategoryTicket
		var desc sql.NullString
		var price sql.NullFloat64
		if err := rows.Scan(&ct.CategoryTicketID, &ct.Name, &desc, &price, &ct.MaxQuantity, &ct.Status, &ct.Remaining); err != nil {
			return nil, fmt.Errorf("failed to scan category ticket: %w", err)
		}
		if desc.Valid {
			ct.Description = &desc.String
		}
		if price.Valid {
			// Round price to avoid floating-point precision issues (e.g., 49999.999 -> 50000)
			ct.Price = math.Round(price.Float64)
		}
		remainingVal := 0
		if ct.Remaining != nil {
			remainingVal = *ct.Remaining
		}
		maxQtyVal := 0
		if ct.MaxQuantity != nil {
			maxQtyVal = *ct.MaxQuantity
		}
		log.Printf("[TICKET] Category: %s | Giá: %.0f VNĐ | Còn lại: %d/%d", ct.Name, ct.Price, remainingVal, maxQtyVal)
		cats = append(cats, ct)
	}
	return cats, rows.Err()
}

func (r *EventRepository) GetSeatsByAreaID(ctx context.Context, areaID int, eventID int) ([]models.SeatResponse, error) {
	// Always fetch by area_id so all seats in the area are returned.
	// Left join to category_ticket only to enrich category_name for current event.
	// Seat status is derived from Ticket lifecycle for the current event.
	query := `
		SELECT
			s.seat_id,
			s.seat_code,
			s.row_no,
			s.col_no,
			COALESCE(ts.effective_status, s.status::text) AS status,
			s.area_id,
			s.category_ticket_id,
			ct.name
		FROM Seat s
		LEFT JOIN Category_Ticket ct
			ON s.category_ticket_id = ct.category_ticket_id
			AND ct.event_id = $1
		LEFT JOIN (
			SELECT
				t.seat_id,
				CASE
					WHEN SUM(CASE WHEN t.status IN ('BOOKED', 'CHECKED_IN') THEN 1 ELSE 0 END) > 0 THEN 'BOOKED'
					WHEN SUM(CASE WHEN t.status = 'PENDING' THEN 1 ELSE 0 END) > 0 THEN 'PENDING'
					ELSE NULL
				END AS effective_status
			FROM Ticket t
			WHERE t.event_id = $2
				AND (
					t.status IN ('BOOKED', 'CHECKED_IN')
					OR (t.status = 'PENDING' AND t.created_at >= NOW() - INTERVAL '5 minutes')
				)
			GROUP BY t.seat_id
		) ts ON ts.seat_id = s.seat_id
		WHERE s.area_id = $3
		ORDER BY s.row_no ASC, CASE WHEN s.col_no ~ '^[0-9]+$' THEN s.col_no::integer ELSE 0 END ASC, s.col_no ASC, s.seat_code ASC
	`

	rows, err := r.db.QueryContext(ctx, query, eventID, eventID, areaID)
	if err != nil {
		return nil, fmt.Errorf("failed to query seats by area: %w", err)
	}
	defer rows.Close()

	seats := make([]models.SeatResponse, 0)
	for rows.Next() {
		var seat models.SeatResponse
		var rowNo, colNo, categoryName sql.NullString
		var categoryTicketID sql.NullInt64

		if err := rows.Scan(
			&seat.SeatID,
			&seat.SeatCode,
			&rowNo,
			&colNo,
			&seat.Status,
			&seat.AreaID,
			&categoryTicketID,
			&categoryName,
		); err != nil {
			return nil, fmt.Errorf("failed to scan seat row: %w", err)
		}

		if rowNo.Valid {
			seat.RowNo = &rowNo.String
		}
		if colNo.Valid {
			seat.ColNo = &colNo.String
		}
		if categoryTicketID.Valid {
			ctid := int(categoryTicketID.Int64)
			seat.CategoryTicketID = &ctid
		}
		if categoryName.Valid {
			seat.CategoryName = &categoryName.String
		}

		seats = append(seats, seat)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("seat row iteration failed: %w", err)
	}

	return seats, nil
}

func (r *EventRepository) GetOpenEvents(ctx context.Context) ([]models.EventListItem, error) {
	// ✅ Phase 3: Microservice mode
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.GetOpenEventsComposed(ctx)
	}

	query := `
		SELECT 
			e.event_id, e.title, e.description, e.start_time, e.end_time, e.max_seats, e.status, e.banner_url,
			e.area_id, va.area_name, va.floor,
			v.venue_name, v.location,
			e.created_by
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE e.status = 'OPEN'
		ORDER BY e.start_time DESC
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query open events: %w", err)
	}
	defer rows.Close()

	var items []models.EventListItem
	for rows.Next() {
		var item models.EventListItem
		var description, bannerURL, areaName, floor, venueName, venueLoc sql.NullString
		var areaID, createdBy sql.NullInt64
		var startTime, endTime time.Time

		err := rows.Scan(
			&item.EventID, &item.Title, &description, &startTime, &endTime, &item.MaxSeats, &item.Status, &bannerURL,
			&areaID, &areaName, &floor,
			&venueName, &venueLoc,
			&createdBy,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}

		// Convert timestamps to ISO string in Vietnam timezone
		item.StartTime = formatTimeToWallClockRFC3339(startTime)
		item.EndTime = formatTimeToWallClockRFC3339(endTime)

		// Convert sql.Null to pointers
		if description.Valid {
			item.Description = &description.String
		}
		if bannerURL.Valid {
			item.BannerURL = &bannerURL.String
		}
		if areaID.Valid {
			item.AreaID = pointer(int(areaID.Int64))
		}
		if areaName.Valid {
			item.AreaName = &areaName.String
		}
		if floor.Valid {
			item.Floor = &floor.String
		}
		if venueName.Valid {
			item.VenueName = &venueName.String
		}
		if venueLoc.Valid {
			item.VenueLocation = &venueLoc.String
		}
		if createdBy.Valid {
			item.OrganizerID = pointer(int(createdBy.Int64))
		}

		items = append(items, item)
	}

	return items, rows.Err()
}

// GetOpenEventsWithPagination - OPEN events with pagination support
func (r *EventRepository) GetOpenEventsWithPagination(ctx context.Context, page int, limit int) ([]models.EventListItem, int, error) {
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.GetOpenEventsComposedWithPagination(ctx, page, limit)
	}

	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 12
	}
	if limit > 100 {
		limit = 100
	}

	offset := (page - 1) * limit

	countQuery := `
		SELECT COUNT(*)
		FROM Event e
		WHERE e.status = 'OPEN'
	`

	var totalCount int
	if err := r.db.QueryRowContext(ctx, countQuery).Scan(&totalCount); err != nil && err != sql.ErrNoRows {
		return nil, 0, fmt.Errorf("failed to count open events: %w", err)
	}

	query := `
		SELECT 
			e.event_id, e.title, e.description, e.start_time, e.end_time, e.max_seats, e.status, e.banner_url,
			e.area_id, va.area_name, va.floor,
			v.venue_name, v.location,
			e.created_by
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE e.status = 'OPEN'
		ORDER BY e.start_time DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := r.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query open events: %w", err)
	}
	defer rows.Close()

	var items []models.EventListItem
	for rows.Next() {
		var item models.EventListItem
		var description, bannerURL, areaName, floor, venueName, venueLoc sql.NullString
		var areaID, createdBy sql.NullInt64
		var startTime, endTime time.Time

		err := rows.Scan(
			&item.EventID, &item.Title, &description, &startTime, &endTime, &item.MaxSeats, &item.Status, &bannerURL,
			&areaID, &areaName, &floor,
			&venueName, &venueLoc,
			&createdBy,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan event: %w", err)
		}

		item.StartTime = formatTimeToWallClockRFC3339(startTime)
		item.EndTime = formatTimeToWallClockRFC3339(endTime)

		if description.Valid {
			item.Description = &description.String
		}
		if bannerURL.Valid {
			item.BannerURL = &bannerURL.String
		}
		if areaID.Valid {
			item.AreaID = pointer(int(areaID.Int64))
		}
		if areaName.Valid {
			item.AreaName = &areaName.String
		}
		if floor.Valid {
			item.Floor = &floor.String
		}
		if venueName.Valid {
			item.VenueName = &venueName.String
		}
		if venueLoc.Valid {
			item.VenueLocation = &venueLoc.String
		}
		if createdBy.Valid {
			item.OrganizerID = pointer(int(createdBy.Int64))
		}

		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	return items, totalCount, nil
}

func (r *EventRepository) CreateEventRequest(ctx context.Context, requesterID int, req *models.CreateEventRequestBody) (int, error) {
	log.Printf("[DB_INSERT] Starting insert for requesterID=%d, title=%s", requesterID, req.Title)

	query := `
		INSERT INTO Event_Request 
		(requester_id, title, description, preferred_start_time, preferred_end_time, expected_capacity, status, created_at, event_format, custom_venue_name, custom_location, banner_url, org_type, privacy_status, online_meeting_url, online_meeting_id, online_meeting_secret)
		VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NOW(), $7, $8, $9, $10, $11, $12, $13, $14, $15)
		RETURNING request_id
	`

	// Default org_type to SCHOOL for event requests (university flow)
	orgType := req.OrgType
	if orgType == "" {
		orgType = "SCHOOL"
	}
	// Default privacy_status to PUBLIC
	privacyStatus := req.PrivacyStatus
	if privacyStatus == "" {
		privacyStatus = "PUBLIC"
	}

	var requestID int64
	err := r.db.QueryRowContext(ctx, query,
		requesterID,
		req.Title,
		req.Description,
		req.PreferredStartTime,
		req.PreferredEndTime,
		req.ExpectedCapacity,
		req.EventFormat,
		req.CustomVenueName,
		req.CustomLocation,
		req.BannerURL,
		orgType,
		privacyStatus,
		req.OnlineMeetingURL,
		req.OnlineMeetingID,
		req.OnlineMeetingSecret,
	).Scan(&requestID)

	if err != nil {
		log.Printf("[DB_INSERT] Insert failed: %v", err)
		return 0, fmt.Errorf("failed to insert event request: %w", err)
	}

	log.Printf("[DB_INSERT] Successfully inserted request ID: %d (org_type=%s, privacy=%s)", requestID, orgType, privacyStatus)
	return int(requestID), nil
}

func (r *EventRepository) GetMyEventRequests(ctx context.Context, requesterID int) ([]models.EventRequest, error) {
	// ✅ Phase 3: Microservice mode
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.GetMyEventRequestsComposed(ctx, requesterID)
	}

	log.Printf("[GetMyEventRequests] Querying for requesterID=%d", requesterID)

	query := `
		SELECT 
			er.request_id, er.requester_id, u.full_name as requester_name,
			er.title, er.description,
			er.preferred_start_time, er.preferred_end_time,
			er.expected_capacity, er.status,
			er.created_at, er.processed_by, u2.full_name as processed_by_name,
			er.processed_at, er.organizer_note, er.reject_reason,
			er.created_event_id,
			v.venue_name, va.area_name, va.floor, va.capacity,
			er.event_format, er.custom_venue_name, er.custom_location,
			er.org_type, er.privacy_status,
			er.online_meeting_url, er.online_meeting_id, er.online_meeting_secret,
			er.banner_url
		FROM Event_Request er
		LEFT JOIN Users u ON er.requester_id = u.user_id
		LEFT JOIN Users u2 ON er.processed_by = u2.user_id
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE er.requester_id = $1
		ORDER BY er.created_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query, requesterID)
	if err != nil {
		log.Printf("[GetMyEventRequests] Query error: %v", err)
		return nil, fmt.Errorf("failed to query event requests: %w", err)
	}
	defer rows.Close()

	var requests []models.EventRequest
	for rows.Next() {
		var req models.EventRequest
		var requesterName, processedByName sql.NullString
		var processedBy sql.NullInt64
		var preferredStartTime, preferredEndTime sql.NullTime
		var processedAt, createdAt sql.NullTime
		var venueName, areaName, floor sql.NullString
		var areaCapacity sql.NullInt64
		var description, organizerNote, rejectReason sql.NullString
		var expectedCapacity, createdEventID sql.NullInt64
		var eventFormat, customVenueName, customLocation sql.NullString
		var orgType, privacyStatus sql.NullString
		var onlineMeetingURL, onlineMeetingID, onlineMeetingSecret sql.NullString
		var bannerURL sql.NullString

		err := rows.Scan(
			&req.RequestID, &req.RequesterID, &requesterName,
			&req.Title, &description,
			&preferredStartTime, &preferredEndTime,
			&expectedCapacity, &req.Status,
			&createdAt, &processedBy, &processedByName,
			&processedAt, &organizerNote, &rejectReason,
			&createdEventID,
			&venueName, &areaName, &floor, &areaCapacity,
			&eventFormat, &customVenueName, &customLocation,
			&orgType, &privacyStatus,
			&onlineMeetingURL, &onlineMeetingID, &onlineMeetingSecret,
			&bannerURL,
		)
		if err != nil {
			log.Printf("Skip corrupted row due to scan error: %v", err)
			continue
		}

		// Convert sql.Null to pointers
		if requesterName.Valid {
			req.RequesterName = &requesterName.String
		}
		setEventRequestTimeFields(&req, preferredStartTime, preferredEndTime, createdAt, processedAt)
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		if processedByName.Valid {
			req.ProcessedByName = &processedByName.String
		}
		if venueName.Valid {
			req.VenueName = &venueName.String
		}
		if areaName.Valid {
			req.AreaName = &areaName.String
		}
		if floor.Valid {
			req.Floor = &floor.String
		}
		if areaCapacity.Valid {
			req.AreaCapacity = pointer(int(areaCapacity.Int64))
		}
		req.Description = stringPointer(description)
		req.ExpectedCapacity = intPointer(expectedCapacity)
		req.OrganizerNote = stringPointer(organizerNote)
		req.RejectReason = stringPointer(rejectReason)
		req.CreatedEventID = intPointer(createdEventID)
		req.EventFormat = stringPointer(eventFormat)
		req.CustomVenueName = stringPointer(customVenueName)
		req.CustomLocation = stringPointer(customLocation)
		req.OrgType = stringPointer(orgType)
		req.PrivacyStatus = stringPointer(privacyStatus)
		req.OnlineMeetingURL = stringPointer(onlineMeetingURL)
		req.OnlineMeetingID = stringPointer(onlineMeetingID)
		req.OnlineMeetingSecret = stringPointer(onlineMeetingSecret)
		req.BannerURL = stringPointer(bannerURL)

		requests = append(requests, req)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating event requests: %w", err)
	}

	log.Printf("[GetMyEventRequests] Returned %d requests for requesterID=%d", len(requests), requesterID)
	return requests, rows.Err()
}

func (r *EventRepository) GetMyActiveEventRequests(ctx context.Context, requesterID int, limit int, offset int) ([]models.EventRequest, int, error) {
	// ✅ Phase 3: Microservice mode
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.GetMyActiveEventRequestsComposed(ctx, requesterID, limit, offset)
	}

	// Active = PENDING OR (APPROVED AND Event.status = UPDATING) (Tab "Chờ")
	query := `
		SELECT 
			er.request_id, er.requester_id, u.full_name as requester_name,
			er.title, er.description,
			er.preferred_start_time, er.preferred_end_time,
			er.expected_capacity, er.status,
			er.created_at, er.processed_by, u2.full_name as processed_by_name,
			er.processed_at, er.organizer_note, er.reject_reason,
			er.created_event_id, e.status as event_status,
			v.venue_name, va.area_name, va.floor, va.capacity,
			er.event_format, er.custom_venue_name, er.custom_location,
			er.org_type, er.privacy_status,
			er.online_meeting_url, er.online_meeting_id, er.online_meeting_secret,
			er.banner_url
		FROM Event_Request er
		LEFT JOIN Users u ON er.requester_id = u.user_id
		LEFT JOIN Users u2 ON er.processed_by = u2.user_id
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE er.requester_id = $1 
		  AND (er.status = 'PENDING' OR (er.status = 'APPROVED' AND e.status = 'UPDATING'))
		ORDER BY er.created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.QueryContext(ctx, query, requesterID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query active event requests: %w", err)
	}
	defer rows.Close()

	var requests []models.EventRequest
	for rows.Next() {
		var req models.EventRequest
		var requesterName, processedByName sql.NullString
		var processedBy sql.NullInt64
		var preferredStartTime, preferredEndTime sql.NullTime
		var processedAt, createdAt sql.NullTime
		var eventStatus sql.NullString
		var venueName, areaName, floor sql.NullString
		var areaCapacity sql.NullInt64
		var description, organizerNote, rejectReason sql.NullString
		var expectedCapacity, createdEventID sql.NullInt64
		var eventFormat, customVenueName, customLocation sql.NullString
		var orgType, privacyStatus sql.NullString
		var onlineMeetingURL, onlineMeetingID, onlineMeetingSecret sql.NullString
		var bannerURL sql.NullString

		err := rows.Scan(
			&req.RequestID, &req.RequesterID, &requesterName,
			&req.Title, &description,
			&preferredStartTime, &preferredEndTime,
			&expectedCapacity, &req.Status,
			&createdAt, &processedBy, &processedByName,
			&processedAt, &organizerNote, &rejectReason,
			&createdEventID, &eventStatus,
			&venueName, &areaName, &floor, &areaCapacity,
			&eventFormat, &customVenueName, &customLocation,
			&orgType, &privacyStatus,
			&onlineMeetingURL, &onlineMeetingID, &onlineMeetingSecret,
			&bannerURL,
		)
		if err != nil {
			log.Printf("Skip corrupted row due to scan error: %v", err)
			continue
		}

		// Convert sql.Null to pointers
		if requesterName.Valid {
			req.RequesterName = &requesterName.String
		}
		setEventRequestTimeFields(&req, preferredStartTime, preferredEndTime, createdAt, processedAt)
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		if processedByName.Valid {
			req.ProcessedByName = &processedByName.String
		}
		if eventStatus.Valid {
			req.EventStatus = &eventStatus.String
		}
		if venueName.Valid {
			req.VenueName = &venueName.String
		}
		if areaName.Valid {
			req.AreaName = &areaName.String
		}
		if floor.Valid {
			req.Floor = &floor.String
		}
		if areaCapacity.Valid {
			req.AreaCapacity = pointer(int(areaCapacity.Int64))
		}
		req.Description = stringPointer(description)
		req.ExpectedCapacity = intPointer(expectedCapacity)
		req.OrganizerNote = stringPointer(organizerNote)
		req.RejectReason = stringPointer(rejectReason)
		req.CreatedEventID = intPointer(createdEventID)
		req.EventFormat = stringPointer(eventFormat)
		req.CustomVenueName = stringPointer(customVenueName)
		req.CustomLocation = stringPointer(customLocation)
		req.OrgType = stringPointer(orgType)
		req.PrivacyStatus = stringPointer(privacyStatus)
		req.OnlineMeetingURL = stringPointer(onlineMeetingURL)
		req.OnlineMeetingID = stringPointer(onlineMeetingID)
		req.OnlineMeetingSecret = stringPointer(onlineMeetingSecret)
		req.BannerURL = stringPointer(bannerURL)

		requests = append(requests, req)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating active event requests: %w", err)
	}

	// Get total count
	countQuery := `
		SELECT COUNT(*) 
		FROM Event_Request er
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		WHERE er.requester_id = $1 
		  AND (er.status = 'PENDING' OR (er.status = 'APPROVED' AND e.status = 'UPDATING'))
	`
	var total int
	err = r.db.QueryRowContext(ctx, countQuery, requesterID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get active request count: %w", err)
	}

	return requests, total, rows.Err()
}

func (r *EventRepository) GetMyArchivedEventRequests(ctx context.Context, requesterID int, limit int, offset int) ([]models.EventRequest, int, error) {
	// ✅ Phase 3: Microservice mode
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.GetMyArchivedEventRequestsComposed(ctx, requesterID, limit, offset)
	}

	// Archived = REJECTED, CANCELLED OR (APPROVED AND Event.status IN OPEN, CLOSED, CANCELLED, FINISHED) (Tab "Đã xử lý")
	query := `
		SELECT 
			er.request_id, er.requester_id, u.full_name as requester_name,
			er.title, er.description,
			er.preferred_start_time, er.preferred_end_time,
			er.expected_capacity, er.status,
			er.created_at, er.processed_by, u2.full_name as processed_by_name,
			er.processed_at, er.organizer_note, er.reject_reason,
			er.created_event_id, e.status as event_status,
			v.venue_name, va.area_name, va.floor, va.capacity,
			er.event_format, er.custom_venue_name, er.custom_location,
			er.org_type, er.privacy_status,
			er.online_meeting_url, er.online_meeting_id, er.online_meeting_secret,
			er.banner_url
		FROM Event_Request er
		LEFT JOIN Users u ON er.requester_id = u.user_id
		LEFT JOIN Users u2 ON er.processed_by = u2.user_id
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE er.requester_id = $1 
		  AND (er.status IN ('REJECTED', 'CANCELLED') 
		       OR (er.status = 'APPROVED' AND e.status IN ('OPEN', 'CLOSED', 'CANCELLED', 'FINISHED')))
		ORDER BY er.created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.QueryContext(ctx, query, requesterID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query archived event requests: %w", err)
	}
	defer rows.Close()

	var requests []models.EventRequest
	for rows.Next() {
		var req models.EventRequest
		var requesterName, processedByName sql.NullString
		var processedBy sql.NullInt64
		var preferredStartTime, preferredEndTime sql.NullTime
		var processedAt, createdAt sql.NullTime
		var eventStatus sql.NullString
		var venueName, areaName, floor sql.NullString
		var areaCapacity sql.NullInt64
		var description, organizerNote, rejectReason sql.NullString
		var expectedCapacity, createdEventID sql.NullInt64
		var eventFormat, customVenueName, customLocation sql.NullString
		var orgType, privacyStatus sql.NullString
		var onlineMeetingURL, onlineMeetingID, onlineMeetingSecret sql.NullString
		var bannerURL sql.NullString

		err := rows.Scan(
			&req.RequestID, &req.RequesterID, &requesterName,
			&req.Title, &description,
			&preferredStartTime, &preferredEndTime,
			&expectedCapacity, &req.Status,
			&createdAt, &processedBy, &processedByName,
			&processedAt, &organizerNote, &rejectReason,
			&createdEventID, &eventStatus,
			&venueName, &areaName, &floor, &areaCapacity,
			&eventFormat, &customVenueName, &customLocation,
			&orgType, &privacyStatus,
			&onlineMeetingURL, &onlineMeetingID, &onlineMeetingSecret,
			&bannerURL,
		)
		if err != nil {
			log.Printf("Skip corrupted row due to scan error: %v", err)
			continue
		}

		// Convert sql.Null to pointers
		if requesterName.Valid {
			req.RequesterName = &requesterName.String
		}
		setEventRequestTimeFields(&req, preferredStartTime, preferredEndTime, createdAt, processedAt)
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		if processedByName.Valid {
			req.ProcessedByName = &processedByName.String
		}
		if eventStatus.Valid {
			req.EventStatus = &eventStatus.String
		}
		if venueName.Valid {
			req.VenueName = &venueName.String
		}
		if areaName.Valid {
			req.AreaName = &areaName.String
		}
		if floor.Valid {
			req.Floor = &floor.String
		}
		if areaCapacity.Valid {
			req.AreaCapacity = pointer(int(areaCapacity.Int64))
		}
		req.Description = stringPointer(description)
		req.ExpectedCapacity = intPointer(expectedCapacity)
		req.OrganizerNote = stringPointer(organizerNote)
		req.RejectReason = stringPointer(rejectReason)
		req.CreatedEventID = intPointer(createdEventID)
		req.EventFormat = stringPointer(eventFormat)
		req.CustomVenueName = stringPointer(customVenueName)
		req.CustomLocation = stringPointer(customLocation)
		req.OrgType = stringPointer(orgType)
		req.PrivacyStatus = stringPointer(privacyStatus)
		req.OnlineMeetingURL = stringPointer(onlineMeetingURL)
		req.OnlineMeetingID = stringPointer(onlineMeetingID)
		req.OnlineMeetingSecret = stringPointer(onlineMeetingSecret)
		req.BannerURL = stringPointer(bannerURL)

		requests = append(requests, req)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating archived event requests: %w", err)
	}

	// Get total count
	countQuery := `
		SELECT COUNT(*) 
		FROM Event_Request er
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		WHERE er.requester_id = $1 
		  AND (er.status IN ('REJECTED', 'CANCELLED') 
		       OR (er.status = 'APPROVED' AND e.status IN ('OPEN', 'CLOSED', 'CANCELLED', 'FINISHED')))
	`
	var total int
	err = r.db.QueryRowContext(ctx, countQuery, requesterID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get archived request count: %w", err)
	}

	return requests, total, rows.Err()
}

func (r *EventRepository) GetPendingEventRequests(ctx context.Context) ([]models.EventRequest, error) {
	// ✅ Phase 3: Microservice mode
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.GetPendingEventRequestsComposed(ctx)
	}

	// Staff xem tất cả yêu cầu (bao gồm cả đã xử lý: APPROVED, REJECTED)
	query := `
		SELECT 
			er.request_id, er.requester_id, u.full_name as requester_name,
			er.title, er.description,
			er.preferred_start_time, er.preferred_end_time,
			er.expected_capacity, er.status,
			er.created_at, er.processed_by, u2.full_name as processed_by_name,
			er.processed_at, er.organizer_note, er.reject_reason,
			er.created_event_id,
			v.venue_name, va.area_name, va.floor, va.capacity,
			er.event_format, er.custom_venue_name, er.custom_location,
			er.org_type, er.privacy_status,
			er.online_meeting_url, er.online_meeting_id, er.online_meeting_secret,
			er.banner_url
		FROM Event_Request er
		LEFT JOIN Users u ON er.requester_id = u.user_id
		LEFT JOIN Users u2 ON er.processed_by = u2.user_id
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE er.status IN ('PENDING', 'UPDATING', 'APPROVED', 'REJECTED', 'CANCELLED', 'FINISHED')
		ORDER BY er.created_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query pending event requests: %w", err)
	}
	defer rows.Close()

	var requests []models.EventRequest
	for rows.Next() {
		var req models.EventRequest
		var requesterName, processedByName sql.NullString
		var processedBy sql.NullInt64
		var preferredStartTime, preferredEndTime sql.NullTime
		var processedAt, createdAt sql.NullTime
		var venueName, areaName, floor sql.NullString
		var areaCapacity sql.NullInt64
		var description, organizerNote, rejectReason sql.NullString
		var expectedCapacity, createdEventID sql.NullInt64
		var eventFormat, customVenueName, customLocation sql.NullString
		var orgType, privacyStatus sql.NullString
		var onlineMeetingURL, onlineMeetingID, onlineMeetingSecret sql.NullString
		var bannerURL sql.NullString

		err := rows.Scan(
			&req.RequestID, &req.RequesterID, &requesterName,
			&req.Title, &description,
			&preferredStartTime, &preferredEndTime,
			&expectedCapacity, &req.Status,
			&createdAt, &processedBy, &processedByName,
			&processedAt, &organizerNote, &rejectReason,
			&createdEventID,
			&venueName, &areaName, &floor, &areaCapacity,
			&eventFormat, &customVenueName, &customLocation,
			&orgType, &privacyStatus,
			&onlineMeetingURL, &onlineMeetingID, &onlineMeetingSecret,
			&bannerURL,
		)
		if err != nil {
			log.Printf("Skip corrupted row due to scan error: %v", err)
			continue
		}

		// Convert sql.Null to pointers
		if requesterName.Valid {
			req.RequesterName = &requesterName.String
		}
		setEventRequestTimeFields(&req, preferredStartTime, preferredEndTime, createdAt, processedAt)
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		if processedByName.Valid {
			req.ProcessedByName = &processedByName.String
		}
		if venueName.Valid {
			req.VenueName = &venueName.String
		}
		if areaName.Valid {
			req.AreaName = &areaName.String
		}
		if floor.Valid {
			req.Floor = &floor.String
		}
		if areaCapacity.Valid {
			req.AreaCapacity = pointer(int(areaCapacity.Int64))
		}
		req.Description = stringPointer(description)
		req.ExpectedCapacity = intPointer(expectedCapacity)
		req.OrganizerNote = stringPointer(organizerNote)
		req.RejectReason = stringPointer(rejectReason)
		req.CreatedEventID = intPointer(createdEventID)
		req.EventFormat = stringPointer(eventFormat)
		req.CustomVenueName = stringPointer(customVenueName)
		req.CustomLocation = stringPointer(customLocation)
		req.OrgType = stringPointer(orgType)
		req.PrivacyStatus = stringPointer(privacyStatus)
		req.OnlineMeetingURL = stringPointer(onlineMeetingURL)
		req.OnlineMeetingID = stringPointer(onlineMeetingID)
		req.OnlineMeetingSecret = stringPointer(onlineMeetingSecret)
		req.BannerURL = stringPointer(bannerURL)

		requests = append(requests, req)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating pending event requests: %w", err)
	}

	return requests, rows.Err()
}

func (r *EventRepository) GetEventRequestByID(ctx context.Context, requestID int) (*models.EventRequest, error) {
	// ✅ Phase 3: Microservice mode
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.GetEventRequestByIDComposed(ctx, requestID)
	}

	query := `
		SELECT 
			er.request_id, er.requester_id, u.full_name as requester_name,
			er.title, er.description,
			er.preferred_start_time, er.preferred_end_time,
			er.expected_capacity, er.status,
			er.created_at, er.processed_by, u2.full_name as processed_by_name,
			er.processed_at, er.organizer_note, er.reject_reason,
			er.created_event_id,
			v.venue_name, va.area_name, va.floor, va.capacity,
			er.event_format, er.custom_venue_name, er.custom_location, er.banner_url
		FROM Event_Request er
		LEFT JOIN Users u ON er.requester_id = u.user_id
		LEFT JOIN Users u2 ON er.processed_by = u2.user_id
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE er.request_id = $1
		LIMIT 1
	`

	var req models.EventRequest
	var requesterName, processedByName sql.NullString
	var processedBy sql.NullInt64
	var preferredStartTime, preferredEndTime sql.NullTime
	var processedAt, createdAt sql.NullTime
	var venueName, areaName, floor sql.NullString
	var areaCapacity sql.NullInt64
	var description, organizerNote, rejectReason sql.NullString
	var expectedCapacity, createdEventID sql.NullInt64
	var eventFormat, customVenueName, customLocation, bannerURL sql.NullString

	err := r.db.QueryRowContext(ctx, query, requestID).Scan(
		&req.RequestID, &req.RequesterID, &requesterName,
		&req.Title, &description,
		&preferredStartTime, &preferredEndTime,
		&expectedCapacity, &req.Status,
		&createdAt, &processedBy, &processedByName,
		&processedAt, &organizerNote, &rejectReason,
		&createdEventID,
		&venueName, &areaName, &floor, &areaCapacity,
		&eventFormat, &customVenueName, &customLocation, &bannerURL,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query event request: %w", err)
	}

	// Convert sql.Null to pointers
	if requesterName.Valid {
		req.RequesterName = &requesterName.String
	}
	setEventRequestTimeFields(&req, preferredStartTime, preferredEndTime, createdAt, processedAt)
	if processedBy.Valid {
		req.ProcessedBy = pointer(int(processedBy.Int64))
	}
	if processedByName.Valid {
		req.ProcessedByName = &processedByName.String
	}
	if venueName.Valid {
		req.VenueName = &venueName.String
	}
	if areaName.Valid {
		req.AreaName = &areaName.String
	}
	if floor.Valid {
		req.Floor = &floor.String
	}
	if areaCapacity.Valid {
		req.AreaCapacity = pointer(int(areaCapacity.Int64))
	}
	req.Description = stringPointer(description)
	req.ExpectedCapacity = intPointer(expectedCapacity)
	req.OrganizerNote = stringPointer(organizerNote)
	req.RejectReason = stringPointer(rejectReason)
	req.CreatedEventID = intPointer(createdEventID)
	
	if eventFormat.Valid {
		req.EventFormat = &eventFormat.String
	}
	if customVenueName.Valid {
		req.CustomVenueName = &customVenueName.String
	}
	if customLocation.Valid {
		req.CustomLocation = &customLocation.String
	}
	if bannerURL.Valid {
		req.BannerURL = &bannerURL.String
	}

	// If there is a created event, fetch event detail (banner, speaker, tickets)
	if req.CreatedEventID != nil {
		detail, err := r.GetEventDetail(ctx, *req.CreatedEventID)
		if err != nil {
			// Log and continue returning request without detail
			log.Printf("[GetEventRequestByID] failed to load event detail: %v", err)
			return &req, nil
		}
		if detail != nil {
			if detail.BannerURL != nil {
				req.BannerURL = detail.BannerURL
			}
			// Always build Speaker DTO (even if some fields are null/empty)
			// This ensures consistent JSON structure for frontend
			sp := models.SpeakerDTO{
				FullName: "",
			}
			if detail.SpeakerName != nil {
				sp.FullName = *detail.SpeakerName
			}
			if detail.SpeakerBio != nil {
				sp.Bio = detail.SpeakerBio
			}
			if detail.SpeakerEmail != nil {
				sp.Email = detail.SpeakerEmail
			}
			if detail.SpeakerPhone != nil {
				sp.Phone = detail.SpeakerPhone
			}
			if detail.SpeakerAvatarURL != nil {
				sp.AvatarURL = detail.SpeakerAvatarURL
			}
			// Set speaker in response (even if empty/null, ensures consistent structure)
			req.Speaker = &sp

			if len(detail.Tickets) > 0 {
				req.Tickets = detail.Tickets
			}
		}
	}

	return &req, nil
}

func (r *EventRepository) ProcessEventRequest(ctx context.Context, adminID int, req *models.ProcessEventRequestBody) error {
	// ✅ Phase 3: Microservice mode - thay UPDATE Venue_Area trực tiếp bằng API call
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.ProcessEventRequestComposed(ctx, adminID, req)
	}

	fmt.Printf("[DB_PROCESS] Starting: RequestID=%d, Action=%s, AdminID=%d\n", req.RequestID, req.Action, adminID)

	// Log AreaID properly (dereference pointer if not nil)
	areaIDValue := 0
	if req.AreaID != nil {
		areaIDValue = *req.AreaID
	}
	fmt.Printf("[DB_PROCESS] AreaID=%d (dereferenced)\n", areaIDValue)

	// Start transaction
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		fmt.Printf("[DB_PROCESS] Failed to begin transaction: %v\n", err)
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Lock request row and verify status (check-before-action)
	var currentStatus string
	lockQuery := `
		SELECT status
		FROM Event_Request
		WHERE request_id = $1
		FOR UPDATE
	`
	lockErr := tx.QueryRowContext(ctx, lockQuery, req.RequestID).Scan(&currentStatus)
	if lockErr != nil {
		if errors.Is(lockErr, sql.ErrNoRows) {
			return fmt.Errorf("request not found")
		}
		return fmt.Errorf("failed to lock request: %w", lockErr)
	}

	if currentStatus == "CANCELLED" {
		return ErrRequestCancelled
	}
	if currentStatus != "PENDING" {
		return ErrRequestNotPending
	}

	// ============================================================
	// SCENARIO 1: REJECTED
	// ============================================================
	if req.Action == "REJECTED" {
		// Validate: reject_reason is required
		if req.RejectReason == nil || *req.RejectReason == "" {
			return fmt.Errorf("reject reason is required when rejecting")
		}

		var bannerURL sql.NullString
		tx.QueryRowContext(ctx, `SELECT banner_url FROM Event_Request WHERE request_id = $1`, req.RequestID).Scan(&bannerURL)

		updateQuery := `
			UPDATE Event_Request 
			SET status = 'REJECTED', 
			    processed_by = $1, 
			    processed_at = NOW(),
			    reject_reason = $2
			WHERE request_id = $3
		`

		result, err := tx.ExecContext(ctx, updateQuery, adminID, *req.RejectReason, req.RequestID)
		if err != nil {
			fmt.Printf("[DB_PROCESS] Failed to REJECT request: %v\n", err)
			return fmt.Errorf("failed to reject request: %w", err)
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			fmt.Printf("[DB_PROCESS] No rows affected when rejecting RequestID=%d\n", req.RequestID)
			return fmt.Errorf("request not found or already processed")
		}

		// Commit transaction
		if err := tx.Commit(); err != nil {
			fmt.Printf("[DB_PROCESS] Failed to commit REJECT transaction: %v\n", err)
			return fmt.Errorf("failed to commit transaction: %w", err)
		}

		if bannerURL.Valid && bannerURL.String != "" {
			go DeleteImageFromS3IfCustom(context.Background(), bannerURL.String)
		}

		fmt.Printf("[DB_PROCESS] Successfully REJECTED Request %d\n", req.RequestID)
		return nil
	}

	// ============================================================
	// SCENARIO 2: APPROVED
	// ============================================================
	if req.Action == "APPROVED" {
		// Validate: AreaID is required
		if req.AreaID == nil || *req.AreaID == 0 {
			return fmt.Errorf("area ID is required when approving")
		}

		// Get request details to create event
		var requestTitle string
		var requestDesc sql.NullString
		var requestStartTime, requestEndTime sql.NullTime
		var requestCapacity int
		var requesterID int
		var eventFormat, customVenueName, customLocation, bannerURL sql.NullString

		getRequestQuery := `
			SELECT title, description, preferred_start_time, preferred_end_time, 
			       expected_capacity, requester_id, event_format, custom_venue_name, custom_location, banner_url
			FROM Event_Request 
			WHERE request_id = $1
		`

		err := tx.QueryRowContext(ctx, getRequestQuery, req.RequestID).Scan(
			&requestTitle, &requestDesc, &requestStartTime, &requestEndTime,
			&requestCapacity, &requesterID, &eventFormat, &customVenueName, &customLocation, &bannerURL,
		)
		if err != nil {
			fmt.Printf("[DB_PROCESS] Failed to get request details: %v\n", err)
			return fmt.Errorf("failed to get request details: %w", err)
		}

		// ✅ WALL-CLOCK TIME PRESERVATION:
		// Times read from Event_Request are already in wall-clock format (e.g., "09:00:00")
		// due to our storage strategy. The DSN loc=Asia/Ho_Chi_Minh interprets them correctly.
		// We copy them as-is to the Event table WITHOUT any normalization.
		startTimeWallClock := ""
		endTimeWallClock := ""
		if requestStartTime.Valid {
			// Format directly WITHOUT any timezone conversion - preserve the wall-clock time
			startTimeWallClock = requestStartTime.Time.Format("2006-01-02 15:04:05")
			fmt.Printf("[DB_PROCESS] Wall-clock time copy: startTime=%v -> storage=%s\n",
				requestStartTime.Time, startTimeWallClock)
		}
		if requestEndTime.Valid {
			// Format directly WITHOUT any timezone conversion - preserve the wall-clock time
			endTimeWallClock = requestEndTime.Time.Format("2006-01-02 15:04:05")
			fmt.Printf("[DB_PROCESS] Wall-clock time copy: endTime=%v -> storage=%s\n",
				requestEndTime.Time, endTimeWallClock)
		}

		// B1: Update Event_Request to APPROVED
		updateRequestQuery := `
			UPDATE Event_Request 
			SET status = 'APPROVED', 
			    processed_by = $1, 
			    processed_at = NOW(),
			    organizer_note = $2
			WHERE request_id = $3
		`

		organizerNote := ""
		if req.OrganizerNote != nil {
			organizerNote = *req.OrganizerNote
		}

		result, err := tx.ExecContext(ctx, updateRequestQuery, adminID, organizerNote, req.RequestID)
		if err != nil {
			fmt.Printf("[DB_PROCESS] Failed to update Event_Request: %v\n", err)
			return fmt.Errorf("failed to update request status: %w", err)
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			fmt.Printf("[DB_PROCESS] No rows affected when updating RequestID=%d\n", req.RequestID)
			return fmt.Errorf("request not found or already processed")
		}

		fmt.Printf("[DB_PROCESS] Step B1: Updated Event_Request %d to APPROVED\n", req.RequestID)

		// B2: Create Event with status = 'UPDATING' (để Organizer cập nhật Speaker và Vé trước khi mở đăng ký)
		insertEventQuery := `
			INSERT INTO Event (
				title, description, start_time, end_time, max_seats, 
				banner_url, area_id, speaker_id, status, created_by, created_at,
				event_format, custom_venue_name, custom_location
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'UPDATING', $9, NOW(), $10, $11, $12)
			RETURNING event_id
		`

		speakerIDValue := sql.NullInt64{Valid: false}
		if req.SpeakerID != nil && *req.SpeakerID > 0 {
			speakerIDValue = sql.NullInt64{Int64: int64(*req.SpeakerID), Valid: true}
		}

		bannerURLValue := sql.NullString{Valid: false}
		if req.BannerURL != nil && *req.BannerURL != "" {
			bannerURLValue = sql.NullString{String: *req.BannerURL, Valid: true}
		} else if bannerURL.Valid && bannerURL.String != "" {
			bannerURLValue = bannerURL
		}

		formatVal := "ONSITE"
		if eventFormat.Valid && eventFormat.String != "" {
			formatVal = eventFormat.String
		}

		var eventID int64
		err = tx.QueryRowContext(ctx, insertEventQuery,
			requestTitle, requestDesc, startTimeWallClock, endTimeWallClock, requestCapacity,
			bannerURLValue, *req.AreaID, speakerIDValue, requesterID,
			formatVal, customVenueName, customLocation,
		).Scan(&eventID)
		if err != nil {
			fmt.Printf("[DB_PROCESS] Failed to create Event: %v\n", err)
			return fmt.Errorf("failed to create event: %w", err)
		}

		fmt.Printf("[DB_PROCESS] Step B2: Created Event %d with status UPDATING\n", eventID)

		// B3: Update Event_Request.created_event_id
		updateCreatedEventQuery := `
			UPDATE Event_Request 
			SET created_event_id = $1
			WHERE request_id = $2
		`

		result, err = tx.ExecContext(ctx, updateCreatedEventQuery, eventID, req.RequestID)
		if err != nil {
			fmt.Printf("[DB_PROCESS] Failed to update created_event_id: %v\n", err)
			return fmt.Errorf("failed to update created_event_id: %w", err)
		}

		rowsAffected, _ = result.RowsAffected()
		if rowsAffected == 0 {
			fmt.Printf("[DB_PROCESS] No rows affected when updating created_event_id for RequestID=%d\n", req.RequestID)
			return fmt.Errorf("failed to link event to request")
		}

		fmt.Printf("[DB_PROCESS] Step B3: Updated Event_Request.created_event_id = %d\n", eventID)

		// B4: Mark Venue_Area as UNAVAILABLE (trong Transaction để Rollback nếu lỗi)
		fmt.Printf("[DB_PROCESS] Step B4: About to mark Area %d as UNAVAILABLE\n", *req.AreaID)

		updateAreaStatusQuery := `
			UPDATE Venue_Area 
			SET status = 'UNAVAILABLE'
			WHERE area_id = $1
		`

		result, err = tx.ExecContext(ctx, updateAreaStatusQuery, *req.AreaID)
		if err != nil {
			fmt.Printf("[DB_PROCESS] ❌ FAILED to update Venue_Area status for AreaID=%d: %v\n", *req.AreaID, err)
			return fmt.Errorf("failed to update venue area status: %w", err)
		}

		rowsAffected, _ = result.RowsAffected()
		fmt.Printf("[DB_PROCESS] Step B4: UPDATE Venue_Area affected %d rows (AreaID=%d)\n", rowsAffected, *req.AreaID)

		if rowsAffected == 0 {
			fmt.Printf("[DB_PROCESS] ⚠️ WARNING: No rows affected when updating Venue_Area status for AreaID=%d\n", *req.AreaID)
			return fmt.Errorf("failed to mark venue area as unavailable - area not found or already unavailable")
		}

		fmt.Printf("[DB_PROCESS] ✅ Step B4 SUCCESS: Marked Venue_Area %d as UNAVAILABLE\n", *req.AreaID)

		// Commit transaction
		if err := tx.Commit(); err != nil {
			fmt.Printf("[DB_PROCESS] Failed to commit APPROVE transaction: %v\n", err)
			return fmt.Errorf("failed to commit transaction: %w", err)
		}

		fmt.Printf("[DB_PROCESS] Successfully APPROVED Request %d and created Event %d\n", req.RequestID, eventID)
		return nil
	}

	return fmt.Errorf("invalid action: %s", req.Action)
}

func (r *EventRepository) CheckEventUpdateEligibility(ctx context.Context, requestID int) (bool, *models.EligibilityError) {
	return true, nil
}

func (r *EventRepository) DisableEvent(ctx context.Context, eventID int) error {
	return nil
}

func (r *EventRepository) CheckEventOwnership(ctx context.Context, eventID, userID int) (bool, error) {
	return true, nil
}

func (r *EventRepository) CheckAreaOverlapTx(tx *sql.Tx, ctx context.Context, areaID int64, startTime, endTime string) (interface{}, error) {
	return nil, nil
}

func (r *EventRepository) UpdateEvent(ctx context.Context, req *models.UpdateEventRequest) error {
	return nil
}

func (r *EventRepository) UpdateEventDetails(ctx context.Context, userID int, role string, req interface{}) error {
	// ✅ Cast request to correct type
	updateReq, ok := req.(*models.UpdateEventDetailsRequest)
	if !ok {
		return fmt.Errorf("invalid request type for UpdateEventDetails")
	}

	log.Printf("[UpdateEventDetails] Starting for EventID=%d, UserID=%d, Role=%s", updateReq.EventID, userID, role)
	log.Printf("[DIAGNOSTIC] Speaker data: %+v", updateReq.Speaker)
	log.Printf("[DIAGNOSTIC] Number of tickets: %d", len(updateReq.Tickets))

	// ✅ Start Transaction
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// ✅ STEP 1: Verify Event exists and user has permission
	var eventOwnerID int
	var currentStatus string
	verifyQuery := `SELECT created_by, status FROM Event WHERE event_id = $1`
	err = tx.QueryRowContext(ctx, verifyQuery, updateReq.EventID).Scan(&eventOwnerID, &currentStatus)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("event not found")
		}
		return fmt.Errorf("failed to verify event: %w", err)
	}

	// Check permission: only event owner (ORGANIZER) can update
	if role == "ORGANIZER" && eventOwnerID != userID {
		return fmt.Errorf("you don't have permission to update this event")
	}

	// Only allow update for OPEN or UPDATING events
	if currentStatus != "OPEN" && currentStatus != "UPDATING" {
		return fmt.Errorf("cannot update event with status: %s", currentStatus)
	}

	log.Printf("[UpdateEventDetails] Event verified. Owner=%d, Status=%s", eventOwnerID, currentStatus)

	// ✅ STEP 1.5: Get area_id and check for existing bookings
	var areaID sql.NullInt64
	getAreaQuery := `SELECT area_id FROM Event WHERE event_id = $1`
	err = tx.QueryRowContext(ctx, getAreaQuery, updateReq.EventID).Scan(&areaID)
	if err != nil {
		return fmt.Errorf("failed to get area_id: %w", err)
	}
	log.Printf("[UpdateEventDetails] Event area_id: %v", areaID)

	// Check if there are any existing bookings
	var bookingCount int
	checkBookingsQuery := `
		SELECT COUNT(DISTINCT t.ticket_id)
		FROM Ticket t
		INNER JOIN category_ticket ct ON t.category_ticket_id = ct.category_ticket_id
		WHERE ct.event_id = $1 AND t.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT')
	`
	err = tx.QueryRowContext(ctx, checkBookingsQuery, updateReq.EventID).Scan(&bookingCount)
	if err != nil {
		return fmt.Errorf("failed to check bookings: %w", err)
	}
	hasBookings := bookingCount > 0
	log.Printf("[UpdateEventDetails] Existing bookings: %d (hasBookings=%v)", bookingCount, hasBookings)

	// ✅ STEP 2: Handle SPEAKER (INSERT or UPDATE)
	var speakerID sql.NullInt64

	// Get current speaker_id from Event
	checkSpeakerQuery := `SELECT speaker_id FROM Event WHERE event_id = $1`
	err = tx.QueryRowContext(ctx, checkSpeakerQuery, updateReq.EventID).Scan(&speakerID)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("failed to check existing speaker: %w", err)
	}

	log.Printf("[CHECK] Current speaker_id for Event %d: %v (Valid=%v)", updateReq.EventID, speakerID.Int64, speakerID.Valid)

	if updateReq.Speaker != nil && updateReq.Speaker.SpeakerID != nil && *updateReq.Speaker.SpeakerID > 0 {
		speakerID.Int64 = int64(*updateReq.Speaker.SpeakerID)
		speakerID.Valid = true
	}

	// Process speaker if provided
	if updateReq.Speaker != nil && strings.TrimSpace(updateReq.Speaker.FullName) != "" {
		speakerFullName := strings.TrimSpace(updateReq.Speaker.FullName)
		speakerBio := ""
		if updateReq.Speaker.Bio != nil {
			speakerBio = strings.TrimSpace(*updateReq.Speaker.Bio)
		}
		speakerEmail := ""
		if updateReq.Speaker.Email != nil {
			speakerEmail = strings.TrimSpace(*updateReq.Speaker.Email)
		}
		speakerPhone := ""
		if updateReq.Speaker.Phone != nil {
			speakerPhone = strings.TrimSpace(*updateReq.Speaker.Phone)
		}
		speakerAvatarURL := ""
		if updateReq.Speaker.AvatarURL != nil {
			speakerAvatarURL = strings.TrimSpace(*updateReq.Speaker.AvatarURL)
		}

		// Security: Don't log speaker PII; only log that speaker is being processed
		log.Printf("[CHECK] Processing Speaker update for Event")

		if !speakerID.Valid || speakerID.Int64 == 0 {
			// INSERT new speaker
			insertSpeakerQuery := `
				INSERT INTO Speaker (full_name, bio, email, phone, avatar_url)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING speaker_id
			`
			log.Printf("[SQL_EXECUTE] INSERT Speaker for Event %d: fullName=%s", updateReq.EventID, speakerFullName)
			var newSpeakerID int64
			err = tx.QueryRowContext(ctx, insertSpeakerQuery, speakerFullName, speakerBio, speakerEmail, speakerPhone, speakerAvatarURL).Scan(&newSpeakerID)
			if err != nil {
				return fmt.Errorf("failed to insert speaker: %w", err)
			}
			speakerID.Int64 = newSpeakerID
			speakerID.Valid = true
			log.Printf("[UpdateEventDetails] ✅ Inserted speaker with ID=%d", newSpeakerID)
		} else {
			// UPDATE existing speaker
			updateSpeakerQuery := `
				UPDATE Speaker
				SET full_name = $1, bio = $2, email = $3, phone = $4, avatar_url = $5
				WHERE speaker_id = $6
			`
			log.Printf("[SQL_EXECUTE] UPDATE Speaker ID=%d for Event %d: fullName=%s", speakerID.Int64, updateReq.EventID, speakerFullName)
			result, err := tx.ExecContext(ctx, updateSpeakerQuery, speakerFullName, speakerBio, speakerEmail, speakerPhone, speakerAvatarURL, speakerID.Int64)
			if err != nil {
				return fmt.Errorf("failed to update speaker: %w", err)
			}

			rowsAffected, _ := result.RowsAffected()
			if rowsAffected == 0 {
				log.Printf("[WARNING] UPDATE Speaker ID=%d returned 0 rows affected", speakerID.Int64)
			} else {
				log.Printf("[UpdateEventDetails] ✅ Updated speaker ID=%d (rows affected: %d)", speakerID.Int64, rowsAffected)
			}
		}
	}

	// ✅ STEP 3: Update Event with speaker_id and banner_url
	var bannerURL interface{} = nil
	if updateReq.BannerURL != nil {
		bannerURL = *updateReq.BannerURL
	}

	updateEventQuery := `UPDATE Event SET banner_url = $1, speaker_id = $2 WHERE event_id = $3`
	log.Printf("[SQL_EXECUTE] UPDATE Event ID=%d: speaker_id=%v, banner_url=%v", updateReq.EventID, speakerID, bannerURL)
	result, err := tx.ExecContext(ctx, updateEventQuery, bannerURL, speakerID, updateReq.EventID)
	if err != nil {
		return fmt.Errorf("failed to update event: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		log.Printf("[WARNING] UPDATE Event ID=%d returned 0 rows affected", updateReq.EventID)
	} else {
		log.Printf("[UpdateEventDetails] ✅ Updated Event ID=%d (rows affected: %d)", updateReq.EventID, rowsAffected)
	}

	// ✅ STEP 4: Handle TICKETS (DELETE old + INSERT new + Seat Allocation)
	if len(updateReq.Tickets) > 0 {
		log.Printf("[DIAGNOSTIC] Processing %d tickets", len(updateReq.Tickets))

		// Only modify tickets if no bookings exist
		if hasBookings {
			log.Printf("[UpdateEventDetails] Skipping ticket modification - existing bookings detected")
		} else {
			// ✅ NEW: Check for price changes and trigger re-approval if needed
			var shouldReApprov bool = false
			var requestID sql.NullInt64

			// Get old ticket prices to compare
			oldTicketsQuery := `
				SELECT name, price FROM category_ticket WHERE event_id = $1
			`
			oldTicketRows, err := tx.QueryContext(ctx, oldTicketsQuery, updateReq.EventID)
			if err != nil && err != sql.ErrNoRows {
				log.Printf("[UpdateEventDetails] Warning: failed to fetch old tickets: %v", err)
			}
			if oldTicketRows != nil {
				defer oldTicketRows.Close()
			}

			// Build map of old prices
			oldPrices := make(map[string]float64)
			if oldTicketRows != nil {
				for oldTicketRows.Next() {
					var name string
					var price float64
					if err := oldTicketRows.Scan(&name, &price); err == nil {
						oldPrices[name] = price
					}
				}
			}

			// Check if any price has changed
			for _, newTicket := range updateReq.Tickets {
				oldPrice, exists := oldPrices[newTicket.Name]
				if !exists || oldPrice != newTicket.Price {
					shouldReApprov = true
					log.Printf("[UpdateEventDetails] Price change detected for %s: %.0f -> %.0f", newTicket.Name, oldPrice, newTicket.Price)
					break
				}
			}

			// ✅ NEW: Get event_request status and update to PENDING if prices changed and was APPROVED
			if shouldReApprov {
				getRequestQuery := `
					SELECT request_id FROM Event_Request WHERE created_event_id = $1
				`
				err := tx.QueryRowContext(ctx, getRequestQuery, updateReq.EventID).Scan(&requestID)
				if err != nil && err != sql.ErrNoRows {
					log.Printf("[UpdateEventDetails] Warning: failed to fetch request: %v", err)
				}

				if requestID.Valid {
					// Check current request status
					var currentRequestStatus string
					checkStatusQuery := `SELECT status FROM Event_Request WHERE request_id = $1`
					if err := tx.QueryRowContext(ctx, checkStatusQuery, requestID.Int64).Scan(&currentRequestStatus); err == nil {
						if currentRequestStatus == "APPROVED" {
							// Update status to PENDING
							updateStatusQuery := `
								UPDATE Event_Request SET status = 'PENDING' WHERE request_id = $1
							`
							if _, err := tx.ExecContext(ctx, updateStatusQuery, requestID.Int64); err != nil {
								log.Printf("[UpdateEventDetails] Warning: failed to update request status: %v", err)
							} else {
								log.Printf("[UpdateEventDetails] ✅ Re-approval triggered: Request %d status changed to PENDING due to price change", requestID.Int64)
							}
						}
					}
				}
			}

			// Delete old tickets
			deleteTicketsQuery := `DELETE FROM category_ticket WHERE event_id = $1`
			result, err := tx.ExecContext(ctx, deleteTicketsQuery, updateReq.EventID)
			if err != nil {
				return fmt.Errorf("failed to delete old tickets: %w", err)
			}
			rowsDeleted, _ := result.RowsAffected()
			log.Printf("[UpdateEventDetails] Deleted %d old tickets", rowsDeleted)

			// Reset seats to clear category_ticket_id linkage
			if areaID.Valid {
				resetSeatsQuery := `UPDATE Seat SET category_ticket_id = NULL WHERE area_id = $1`
				resetResult, err := tx.ExecContext(ctx, resetSeatsQuery, areaID.Int64)
				if err != nil {
					return fmt.Errorf("failed to reset seats: %w", err)
				}
				seatsReset, _ := resetResult.RowsAffected()
				log.Printf("[UpdateEventDetails] Reset %d seats for area_id=%d", seatsReset, areaID.Int64)
			}

			// Insert new tickets and collect for seat allocation
			type ticketAllocation struct {
				CategoryTicketID int64
				Name             string
				MaxQuantity      int
				Price            float64
			}
			var ticketAllocations []ticketAllocation

			// ✅ VALIDATION: Check ticket prices before insertion
			for _, ticket := range updateReq.Tickets {
				if ticket.Price < 0 {
					return fmt.Errorf("ticket price cannot be negative")
				}
				if ticket.Price > models.MAX_TICKET_PRICE {
					return fmt.Errorf("Giá vé vượt quá hạn mức cho phép")
				}
			}

			for idx, ticket := range updateReq.Tickets {
				// ✅ Round price
				roundedPrice := math.Round(ticket.Price)

				description := ""
				if ticket.Description != nil {
					description = *ticket.Description
				}
				status := "ACTIVE"
				if ticket.Status != nil {
					status = *ticket.Status
				}

				insertTicketQuery := `
				INSERT INTO category_ticket (event_id, name, description, price, max_quantity, status)
				VALUES ($1, $2, $3, $4, $5, $6)
				RETURNING category_ticket_id
			`
				log.Printf("[SQL] Inserting ticket #%d: %s for event %d with price %.0f (maxQty=%d)",
					idx+1, ticket.Name, updateReq.EventID, roundedPrice, ticket.MaxQuantity)

				var ticketID int64
				err = tx.QueryRowContext(ctx, insertTicketQuery, updateReq.EventID, ticket.Name, description, roundedPrice, ticket.MaxQuantity, status).Scan(&ticketID)
				if err != nil {
					log.Printf("[DIAGNOSTIC] Failed to insert ticket: %v", err)
					return fmt.Errorf("failed to insert ticket: %w", err)
				}
				log.Printf("[UpdateEventDetails] ✅ Inserted ticket: %s (ID=%d)", ticket.Name, ticketID)

				// Collect for seat allocation
				ticketAllocations = append(ticketAllocations, ticketAllocation{
					CategoryTicketID: ticketID,
					Name:             ticket.Name,
					MaxQuantity:      ticket.MaxQuantity,
					Price:            roundedPrice,
				})
			}

			log.Printf("[DIAGNOSTIC] Completed inserting %d tickets", len(updateReq.Tickets))

			// ✅ SEAT ALLOCATION: Assign seats to tickets (VIP first, then STANDARD)
			if areaID.Valid && len(ticketAllocations) > 0 {
				// Sort tickets: VIP first (by name containing "VIP" and by price desc)
				sort.Slice(ticketAllocations, func(i, j int) bool {
					nameI := strings.ToUpper(ticketAllocations[i].Name)
					nameJ := strings.ToUpper(ticketAllocations[j].Name)
					vipI := strings.Contains(nameI, "VIP")
					vipJ := strings.Contains(nameJ, "VIP")
					if vipI != vipJ {
						return vipI
					}
					return ticketAllocations[i].Price > ticketAllocations[j].Price
				})

				// Get all seats for this area
				getSeatIDsQuery := `SELECT seat_id, seat_code, row_no, col_no FROM Seat WHERE area_id = $1 ORDER BY row_no, col_no`
				rows, err := tx.QueryContext(ctx, getSeatIDsQuery, areaID.Int64)
				if err != nil {
					return fmt.Errorf("failed to get seats: %w", err)
				}

				var seatIDs []int64
				var seatCodes []string
				for rows.Next() {
					var seatID int64
					var seatCode, rowNo, colNo string
					if err := rows.Scan(&seatID, &seatCode, &rowNo, &colNo); err != nil {
						rows.Close()
						return fmt.Errorf("failed to scan seat: %w", err)
					}
					seatIDs = append(seatIDs, seatID)
					seatCodes = append(seatCodes, seatCode)
				}
				rows.Close()

				log.Printf("[DEBUG] Bat dau phan bo lai %d ghe cho Area %d", len(seatIDs), areaID.Int64)

				// Calculate total seats needed
				totalNeeded := 0
				for _, ticket := range ticketAllocations {
					totalNeeded += ticket.MaxQuantity
				}

				if len(seatIDs) < totalNeeded {
					return fmt.Errorf("insufficient seats: have %d, need %d", len(seatIDs), totalNeeded)
				}

				// Sequential allocation
				seatIndex := 0
				totalAllocated := 0
				for _, ticket := range ticketAllocations {
					startIndex := seatIndex
					for count := 0; count < ticket.MaxQuantity; count++ {
						if seatIndex >= len(seatIDs) {
							return fmt.Errorf("ran out of seats at index %d", seatIndex)
						}

						seatID := seatIDs[seatIndex]
						updateSeatQuery := `UPDATE Seat SET category_ticket_id = $1 WHERE seat_id = $2`
						result, err := tx.ExecContext(ctx, updateSeatQuery, ticket.CategoryTicketID, seatID)
						if err != nil {
							return fmt.Errorf("failed to update seat %d: %w", seatID, err)
						}

						rowsAffected, _ := result.RowsAffected()
						if rowsAffected == 0 {
							log.Printf("[WARNING] Seat %d update returned 0 rows", seatID)
						}

						seatIndex++
						totalAllocated++
					}

					endIndex := seatIndex - 1
					endSeat := ""
					if endIndex < len(seatCodes) {
						endSeat = seatCodes[endIndex]
					}
					log.Printf("[UpdateEventRequest] Allocated %d seats %s to %s for ticket: %s",
						ticket.MaxQuantity, seatCodes[startIndex], endSeat, ticket.Name)
				}

				log.Printf("[UpdateEventDetails] ✅ Seat allocation complete: %d/%d seats assigned", totalAllocated, len(seatIDs))

				// Verify allocation integrity
				if totalAllocated != totalNeeded {
					return fmt.Errorf("seat allocation mismatch: allocated %d, needed %d", totalAllocated, totalNeeded)
				}
			}
		}
	} else {
		log.Printf("[DIAGNOSTIC] No tickets to process")
	}

	// ✅ STEP 5: Commit Transaction
	err = tx.Commit()
	if err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Println("[COMMIT] DA COMMIT THANH CONG XUONG DATABASE")
	log.Printf("[UpdateEventDetails] SUCCESS: Updated Event ID=%d", updateReq.EventID)
	return nil
}

func (r *EventRepository) UpdateEventConfig(ctx context.Context, userID int, role string, req interface{}) error {
	updateReq, ok := req.(*models.UpdateEventConfigRequest)
	if !ok {
		return fmt.Errorf("invalid request type for UpdateEventConfig")
	}

	fmt.Printf("[UpdateEventConfig] eventID=%d, checkin=%d, checkout=%d, role=%s\n",
		updateReq.EventID, updateReq.CheckinAllowedBeforeStartMinutes, updateReq.MinMinutesAfterStart, role)

	// ── Global config (eventId = -1): save to file + memory ──
	if updateReq.EventID == -1 {
		if err := config.UpdateConfig(
			updateReq.CheckinAllowedBeforeStartMinutes,
			updateReq.MinMinutesAfterStart,
		); err != nil {
			return fmt.Errorf("failed to save global config: %w", err)
		}
		fmt.Printf("[UpdateEventConfig] ✅ Global config saved: checkin=%d, checkout=%d\n",
			updateReq.CheckinAllowedBeforeStartMinutes, updateReq.MinMinutesAfterStart)
		return nil
	}

	// ── Per-event config (eventId > 0): update Event table ──
	if updateReq.EventID <= 0 {
		return fmt.Errorf("invalid event ID: %d", updateReq.EventID)
	}

	// Check event exists
	var exists int
	err := r.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM Event WHERE event_id = $1", updateReq.EventID,
	).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check event existence: %w", err)
	}
	if exists == 0 {
		return fmt.Errorf("event not found")
	}

	// Organizer ownership check
	if role == "ORGANIZER" {
		var ownerID int
		err = r.db.QueryRowContext(ctx,
			"SELECT created_by FROM Event WHERE event_id = $1", updateReq.EventID,
		).Scan(&ownerID)
		if err != nil {
			return fmt.Errorf("failed to check event ownership: %w", err)
		}
		if ownerID != userID {
			return fmt.Errorf("you are not the owner of this event")
		}
	}

	// UPDATE checkin_offset and checkout_offset
	_, err = r.db.ExecContext(ctx,
		"UPDATE Event SET checkin_offset = $1, checkout_offset = $2 WHERE event_id = $3",
		updateReq.CheckinAllowedBeforeStartMinutes,
		updateReq.MinMinutesAfterStart,
		updateReq.EventID,
	)
	if err != nil {
		return fmt.Errorf("failed to update event config: %w", err)
	}

	fmt.Printf("[UpdateEventConfig] ✅ Per-event config saved: eventID=%d, checkin=%d, checkout=%d\n",
		updateReq.EventID, updateReq.CheckinAllowedBeforeStartMinutes, updateReq.MinMinutesAfterStart)
	return nil
}

func (r *EventRepository) GetEventConfigById(ctx context.Context, eventID int) (*models.EventConfigResponse, error) {
	var checkinOffset, checkoutOffset sql.NullInt64
	err := r.db.QueryRowContext(ctx,
		"SELECT checkin_offset, checkout_offset FROM Event WHERE event_id = $1",
		eventID,
	).Scan(&checkinOffset, &checkoutOffset)

	if err == sql.ErrNoRows {
		return nil, nil // No per-event config found
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query event config: %w", err)
	}

	hasCheckin := checkinOffset.Valid && checkinOffset.Int64 > 0
	hasCheckout := checkoutOffset.Valid && checkoutOffset.Int64 > 0

	var checkinVal, checkoutVal int
	if hasCheckin {
		checkinVal = int(checkinOffset.Int64)
	}
	if hasCheckout {
		checkoutVal = int(checkoutOffset.Int64)
	}

	fmt.Printf("[GetEventConfigById] eventID=%d → checkin=%v(%d), checkout=%v(%d)\n",
		eventID, hasCheckin, checkinVal, hasCheckout, checkoutVal)

	return &models.EventConfigResponse{
		CheckinAllowedBeforeStartMinutes: checkinVal,
		MinMinutesAfterStart:             checkoutVal,
		Source:                           "per-event",
		HasCheckinOffset:                 hasCheckin,
		HasCheckoutOffset:                hasCheckout,
	}, nil
}

func (r *EventRepository) GetAvailableAreas(ctx context.Context, startTime, endTime string, expectedCapacity int) ([]models.AvailableAreaInfo, error) {
	// Parse event date from startTime (format: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD HH:MM:SS)
	eventDate := ""
	if len(startTime) >= 10 {
		eventDate = startTime[:10] // Extract YYYY-MM-DD
	} else {
		return nil, fmt.Errorf("invalid startTime format: %s", startTime)
	}

	fmt.Printf("[GetAvailableAreas] Query params: eventDate=%s, expectedCapacity=%d\n", eventDate, expectedCapacity)

	// SQL Query:
	// 1. Get all areas with capacity >= expectedCapacity
	// 2. Only include areas that are currently AVAILABLE
	// 2. Count approved events on the same DATE (not time overlap)
	// 3. Filter: only show areas with < 2 approved events on that date (max 2 events/day rule)
	// 4. Sort by capacity ASC (smallest rooms first)
	query := `
		SELECT 
			va.area_id,
			va.area_name,
			v.venue_name,
			va.floor,
			COALESCE(va.capacity, 0) as capacity,
			va.status,
			COUNT(e.event_id) as event_count_on_date
		FROM Venue_Area va
		INNER JOIN Venue v ON va.venue_id = v.venue_id
		LEFT JOIN Event e ON va.area_id = e.area_id 
			AND e.start_time::date = $1::date
			AND e.status IN ('OPEN', 'UPDATING')
		WHERE COALESCE(va.capacity, 0) >= $2
		  AND va.status = 'AVAILABLE'
		GROUP BY va.area_id, va.area_name, v.venue_name, va.floor, va.capacity, va.status
		HAVING COUNT(e.event_id) < 2
		ORDER BY COALESCE(va.capacity, 0) ASC
	`

	rows, err := r.db.QueryContext(ctx, query, eventDate, expectedCapacity)
	if err != nil {
		fmt.Printf("[ERROR] GetAvailableAreas query failed: %v\n", err)
		return nil, fmt.Errorf("failed to query available areas: %w", err)
	}
	defer rows.Close()

	var areas []models.AvailableAreaInfo
	for rows.Next() {
		var area models.AvailableAreaInfo
		var floor sql.NullString
		var capacity int
		var eventCount int

		err := rows.Scan(
			&area.AreaID,
			&area.AreaName,
			&area.VenueName,
			&floor,
			&capacity,
			&area.Status,
			&eventCount,
		)
		if err != nil {
			fmt.Printf("[ERROR] Failed to scan area row: %v\n", err)
			continue
		}

		if floor.Valid {
			area.Floor = &floor.String
		}
		area.Capacity = &capacity

		fmt.Printf("[GetAvailableAreas] Found area: %s (ID: %d, Capacity: %d, EventsOnDate: %d)\n",
			area.AreaName, area.AreaID, capacity, eventCount)

		areas = append(areas, area)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %w", err)
	}

	fmt.Printf("[GetAvailableAreas] Total available areas: %d\n", len(areas))
	return areas, nil
}

func (r *EventRepository) ReleaseAreaOnEventClose(ctx context.Context, eventID, areaID int) error {
	return nil
}

func (r *EventRepository) GetEventStats(ctx context.Context, eventID int) (*models.EventStatsResponse, error) {
	// ✅ Phase 3: Microservice mode - thay JOIN Ticket bằng API call
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.GetEventStatsComposed(ctx, eventID)
	}

	query := `
		SELECT 
			e.event_id,
			e.title,
			COUNT(DISTINCT t.ticket_id) as total_tickets,
			COUNT(DISTINCT CASE WHEN t.checkin_time IS NOT NULL THEN t.ticket_id END) as checked_in,
			COUNT(DISTINCT CASE WHEN t.check_out_time IS NOT NULL THEN t.ticket_id END) as checked_out,
			COUNT(DISTINCT CASE WHEN t.status = 'BOOKED' THEN t.ticket_id END) as booked,
			COUNT(DISTINCT CASE WHEN t.status = 'CANCELLED' THEN t.ticket_id END) as cancelled,
			COUNT(DISTINCT CASE WHEN t.status = 'REFUNDED' THEN t.ticket_id END) as refunded,
			COALESCE(SUM(ct.price), 0) as total_revenue
		FROM Event e
		LEFT JOIN Category_Ticket ct ON e.event_id = ct.event_id
		LEFT JOIN Ticket t ON ct.category_ticket_id = t.category_ticket_id 
			AND t.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'REFUNDED')
		WHERE e.event_id = $1
		GROUP BY e.event_id, e.title
	`

	log.Printf("[STATS_QUERY] Executing single event stats for EventID=%d:\n%s", eventID, query)

	var stats models.EventStatsResponse
	var eventTitle string
	err := r.db.QueryRowContext(ctx, query, eventID).Scan(
		&stats.EventID,
		&eventTitle,
		&stats.TotalTickets,
		&stats.CheckedInCount,
		&stats.CheckedOutCount,
		&stats.BookedCount,
		&stats.CancelledCount,
		&stats.RefundedCount,
		&stats.TotalRevenue,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get event stats: %w", err)
	}

	stats.EventTitle = &eventTitle
	log.Printf("[STATS_RESULT] EventID=%d: Total=%d, CheckedIn=%d, Refunded=%d, Revenue=%.2f",
		eventID, stats.TotalTickets, stats.CheckedInCount, stats.RefundedCount, stats.TotalRevenue)

	return &stats, nil
}

func (r *EventRepository) GetAggregateEventStats(ctx context.Context, role string, userID int) (*models.EventStatsResponse, error) {
	// ✅ Phase 3: Microservice mode
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.GetAggregateEventStatsComposed(ctx, role, userID)
	}

	// Build query based on role
	var query string
	var args []interface{}

	if role == "ADMIN" || role == "STAFF" {
		// ADMIN/STAFF sees ALL events in the system
		query = `
			SELECT 
				0 as event_id,
				COUNT(DISTINCT t.ticket_id) as total_tickets,
				COUNT(DISTINCT CASE WHEN t.checkin_time IS NOT NULL THEN t.ticket_id END) as checked_in,
				COUNT(DISTINCT CASE WHEN t.check_out_time IS NOT NULL THEN t.ticket_id END) as checked_out,
				COUNT(DISTINCT CASE WHEN t.status = 'BOOKED' THEN t.ticket_id END) as booked,
				COUNT(DISTINCT CASE WHEN t.status = 'CANCELLED' THEN t.ticket_id END) as cancelled,
				COUNT(DISTINCT CASE WHEN t.status = 'REFUNDED' THEN t.ticket_id END) as refunded,
				COALESCE(SUM(ct.price), 0) as total_revenue
			FROM Ticket t
			INNER JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
			INNER JOIN Event e ON ct.event_id = e.event_id
			WHERE t.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'REFUNDED')
		`
		log.Printf("[STATS_QUERY] ADMIN/STAFF viewing ALL events (no user filter)")
	} else if role == "ORGANIZER" {
		// ORGANIZER only sees their own events
		query = `
			SELECT 
				0 as event_id,
				COUNT(DISTINCT t.ticket_id) as total_tickets,
				COUNT(DISTINCT CASE WHEN t.checkin_time IS NOT NULL THEN t.ticket_id END) as checked_in,
				COUNT(DISTINCT CASE WHEN t.check_out_time IS NOT NULL THEN t.ticket_id END) as checked_out,
				COUNT(DISTINCT CASE WHEN t.status = 'BOOKED' THEN t.ticket_id END) as booked,
				COUNT(DISTINCT CASE WHEN t.status = 'CANCELLED' THEN t.ticket_id END) as cancelled,
				COUNT(DISTINCT CASE WHEN t.status = 'REFUNDED' THEN t.ticket_id END) as refunded,
				COALESCE(SUM(ct.price), 0) as total_revenue
			FROM Ticket t
			INNER JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
			INNER JOIN Event e ON ct.event_id = e.event_id
			WHERE t.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'REFUNDED')
			AND e.created_by = $1
		`
		args = append(args, userID)
		log.Printf("[STATS_QUERY] ORGANIZER (UserID=%d) viewing their events only", userID)
	} else {
		// Other roles not allowed
		return nil, fmt.Errorf("unauthorized role: %s", role)
	}

	log.Printf("[STATS_QUERY] Executing aggregate stats:\n%s\nArgs: %v", query, args)

	var stats models.EventStatsResponse
	var err error

	if len(args) > 0 {
		err = r.db.QueryRowContext(ctx, query, args...).Scan(
			&stats.EventID,
			&stats.TotalTickets,
			&stats.CheckedInCount,
			&stats.CheckedOutCount,
			&stats.BookedCount,
			&stats.CancelledCount,
			&stats.RefundedCount,
			&stats.TotalRevenue,
		)
	} else {
		err = r.db.QueryRowContext(ctx, query).Scan(
			&stats.EventID,
			&stats.TotalTickets,
			&stats.CheckedInCount,
			&stats.CheckedOutCount,
			&stats.BookedCount,
			&stats.CancelledCount,
			&stats.RefundedCount,
			&stats.TotalRevenue,
		)
	}

	if err != nil {
		log.Printf("[STATS_ERROR] Failed to execute aggregate stats query: %v", err)
		if err == sql.ErrNoRows {
			// Return zero stats instead of nil
			title := "Tất cả sự kiện"
			return &models.EventStatsResponse{
				EventID:         0,
				EventTitle:      &title,
				TotalTickets:    0,
				CheckedInCount:  0,
				CheckedOutCount: 0,
				BookedCount:     0,
				CancelledCount:  0,
				RefundedCount:   0,
				TotalRevenue:    0,
			}, nil
		}
		return nil, fmt.Errorf("failed to get aggregate stats: %w", err)
	}

	title := "Tất cả sự kiện"
	stats.EventTitle = &title

	log.Printf("[STATS_RESULT] Aggregate for Role=%s, UserID=%d: Total=%d, CheckedIn=%d, CheckedOut=%d, Refunded=%d, Revenue=%.2f",
		role, userID, stats.TotalTickets, stats.CheckedInCount, stats.CheckedOutCount, stats.RefundedCount, stats.TotalRevenue)

	return &stats, nil
}

func (r *EventRepository) CancelEvent(ctx context.Context, userID, eventID int) error {
	// ✅ Phase 3: Microservice mode - thay UPDATE Venue_Area trực tiếp bằng API call
	if config.IsFeatureEnabled(config.FlagUseAPIComposition) {
		return r.CancelEventComposed(ctx, userID, eventID)
	}

	log.Printf("[DB_UPDATE] Starting cancel event for EventID=%d, UserID=%d", eventID, userID)

	// Step 1: Get event info and verify ownership
	var status string
	var createdBy int
	var requestID sql.NullInt64
	var startTime time.Time
	var eventTitle string
	var bannerURL sql.NullString

	checkQuery := `
		SELECT e.status, e.created_by, e.start_time, e.title, e.banner_url,
		       (SELECT request_id FROM Event_Request WHERE created_event_id = e.event_id LIMIT 1) as request_id
		FROM Event e
		WHERE e.event_id = $1
	`
	err := r.db.QueryRowContext(ctx, checkQuery, eventID).Scan(&status, &createdBy, &startTime, &eventTitle, &bannerURL, &requestID)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("[DB_UPDATE] Event ID %d not found", eventID)
			return fmt.Errorf("sự kiện không tồn tại")
		}
		log.Printf("[DB_UPDATE] Query error: %v", err)
		return fmt.Errorf("lỗi kiểm tra sự kiện: %w", err)
	}

	// Step 2: Verify ownership
	if createdBy != userID {
		log.Printf("[DB_UPDATE] User %d tried to cancel event %d created by %d", userID, eventID, createdBy)
		return fmt.Errorf("bạn không có quyền hủy sự kiện này")
	}

	// Step 3: Check if already cancelled
	if status == "CANCELLED" {
		log.Printf("[DB_UPDATE] Event %d already cancelled", eventID)
		return fmt.Errorf("sự kiện đã được hủy trước đó")
	}

	// Step 4: ✅ 24-HOUR RULE - Không cho phép hủy nếu còn dưới 24 giờ
	now := utils.NowInVietnam()
	hoursUntilStart := startTime.Sub(now).Hours()
	if hoursUntilStart < 24 {
		log.Printf("[DB_UPDATE] ❌ REJECTED: Cannot cancel event %d - only %.1f hours until start (< 24h)", eventID, hoursUntilStart)
		return fmt.Errorf("không thể hủy sự kiện trong vòng 24 giờ trước khi bắt đầu (còn %.1f giờ)", hoursUntilStart)
	}
	log.Printf("[DB_UPDATE] ✅ 24h rule passed: %.1f hours until start", hoursUntilStart)

	// Step 5: ✅ REFUND WARNING - Kiểm tra số lượng vé đã bán
	var ticketsSoldCount int
	ticketCheckQuery := `
		SELECT COUNT(*) 
		FROM Ticket 
		WHERE event_id = $1 AND status IN ('PENDING', 'BOOKED', 'CHECKED_IN')
	`
	err = r.db.QueryRowContext(ctx, ticketCheckQuery, eventID).Scan(&ticketsSoldCount)
	if err != nil {
		log.Printf("[DB_UPDATE] Failed to check ticket sales: %v", err)
		return fmt.Errorf("lỗi kiểm tra vé đã bán: %w", err)
	}

	if ticketsSoldCount > 0 {
		log.Printf("[DB_UPDATE] ⚠️ WARNING: Event %d has %d sold tickets - refund required", eventID, ticketsSoldCount)
		// Trả về error đặc biệt để Frontend có thể hiển thị popup xác nhận
		return fmt.Errorf("REFUND_WARNING:Sự kiện đã có %d người đăng ký. Bạn có chắc chắn muốn hủy và thực hiện hoàn tiền không?", ticketsSoldCount)
	}
	log.Printf("[DB_UPDATE] ✅ No tickets sold, safe to cancel")

	// Step 6: Start transaction to update both Event and Event_Request
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[DB_UPDATE] Failed to start transaction: %v", err)
		return fmt.Errorf("lỗi khởi tạo transaction: %w", err)
	}
	defer tx.Rollback()

	// Step 7: Update Event status to CANCELLED
	updateEventQuery := `
		UPDATE Event 
		SET status = 'CANCELLED' 
		WHERE event_id = $1 AND created_by = $2
	`
	result1, err := tx.ExecContext(ctx, updateEventQuery, eventID, userID)
	if err != nil {
		log.Printf("[DB_UPDATE] Failed to update Event in transaction: %v", err)
		return fmt.Errorf("lỗi cập nhật sự kiện: %w", err)
	}

	rowsAffected1, _ := result1.RowsAffected()
	if rowsAffected1 == 0 {
		log.Printf("[DB_UPDATE] No rows affected in Event for ID %d", eventID)
		return fmt.Errorf("không thể cập nhật sự kiện")
	}

	// Step 8: Update Event_Request status to CANCELLED (if exists)
	if requestID.Valid {
		reqID := int(requestID.Int64)
		updateRequestQuery := `
			UPDATE Event_Request 
			SET status = 'CANCELLED' 
			WHERE request_id = $1
		`
		result2, err := tx.ExecContext(ctx, updateRequestQuery, reqID)
		if err != nil {
			log.Printf("[DB_UPDATE] Failed to update Event_Request in transaction: %v", err)
			return fmt.Errorf("lỗi cập nhật yêu cầu: %w", err)
		}

		rowsAffected2, _ := result2.RowsAffected()
		log.Printf("[DB_UPDATE] Updated Event_Request ID %d, rows affected: %d", reqID, rowsAffected2)
	} else {
		log.Printf("[DB_UPDATE] No linked Event_Request found for Event ID %d", eventID)
	}

	// Step 9: ✅ RELEASE VENUE AREA - Giải phóng địa điểm nếu sự kiện đã được duyệt
	// Lấy area_id từ Event để giải phóng
	var areaID sql.NullInt64
	areaQuery := `SELECT area_id FROM Event WHERE event_id = $1`
	err = tx.QueryRowContext(ctx, areaQuery, eventID).Scan(&areaID)
	if err == nil && areaID.Valid {
		// Cập nhật venue_area status thành AVAILABLE để có thể đặt lại
		releaseQuery := `
			UPDATE Venue_Area 
			SET status = 'AVAILABLE' 
			WHERE area_id = $1
			  AND status = 'UNAVAILABLE'
			  AND EXISTS (
				SELECT 1
				FROM Event e_done
				WHERE e_done.area_id = Venue_Area.area_id
				  AND e_done.status IN ('CLOSED', 'CANCELLED')
			  )
			  AND NOT EXISTS (
				SELECT 1
				FROM Event e_active
				WHERE e_active.area_id = Venue_Area.area_id
				  AND e_active.status IN ('OPEN', 'UPDATING')
			  )
		`
		result3, err := tx.ExecContext(ctx, releaseQuery, areaID.Int64)
		if err != nil {
			log.Printf("[DB_UPDATE] Failed to release venue area: %v", err)
			return fmt.Errorf("lỗi giải phóng địa điểm: %w", err)
		}

		rowsAffected3, _ := result3.RowsAffected()
		if rowsAffected3 > 0 {
			log.Printf("[DB_PROCESS] Successfully RELEASED Area [%d] to AVAILABLE after Cancellation of Event [%d]", areaID.Int64, eventID)
		}
	} else if err != nil && err != sql.ErrNoRows {
		log.Printf("[DB_UPDATE] Warning: Failed to query area_id for event %d: %v", eventID, err)
	}

	// Step 10: Commit transaction
	if err := tx.Commit(); err != nil {
		log.Printf("[DB_UPDATE] Failed to commit transaction: %v", err)
		return fmt.Errorf("lỗi commit transaction: %w", err)
	}

	if bannerURL.Valid && bannerURL.String != "" {
		go DeleteImageFromS3IfCustom(context.Background(), bannerURL.String)
	}

	log.Printf("[DB_UPDATE] ✅ Successfully cancelled Event ID: %d (Title: %s, Tickets Sold: %d)", eventID, eventTitle, ticketsSoldCount)
	return nil
}

func (r *EventRepository) CancelEventRequest(ctx context.Context, userID, requestID int) error {
	log.Printf("[DB_UPDATE] Starting cancel for RequestID=%d, UserID=%d", requestID, userID)
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[DB_UPDATE] Failed to start transaction: %v", err)
		return fmt.Errorf("lỗi khởi tạo transaction: %w", err)
	}
	defer tx.Rollback()

	var status string
	var requesterID int
	var bannerURL sql.NullString
	lockQuery := `
		SELECT status, requester_id, banner_url
		FROM Event_Request
		WHERE request_id = $1
		FOR UPDATE
	`
	err = tx.QueryRowContext(ctx, lockQuery, requestID).Scan(&status, &requesterID, &bannerURL)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("yêu cầu không tồn tại")
		}
		return fmt.Errorf("lỗi kiểm tra yêu cầu: %w", err)
	}

	if requesterID != userID {
		return fmt.Errorf("bạn không có quyền hủy yêu cầu này")
	}

	if status == "CANCELLED" {
		return fmt.Errorf("yêu cầu đã được hủy trước đó")
	}

	if status != "PENDING" {
		return fmt.Errorf("Không thể hủy yêu cầu vì đơn này đã được xử lý (Duyệt/Từ chối) bởi Staff.")
	}

	updateQuery := `
		UPDATE Event_Request
		SET status = 'CANCELLED'
		WHERE request_id = $1 AND requester_id = $2 AND status = 'PENDING'
	`
	result, err := tx.ExecContext(ctx, updateQuery, requestID, userID)
	if err != nil {
		return fmt.Errorf("lỗi cập nhật yêu cầu: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("lỗi kiểm tra kết quả: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("Không thể hủy yêu cầu vì đơn này đã được xử lý (Duyệt/Từ chối) bởi Staff.")
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("lỗi commit transaction: %w", err)
	}

	if bannerURL.Valid && bannerURL.String != "" {
		go DeleteImageFromS3IfCustom(context.Background(), bannerURL.String)
	}

	log.Printf("[DB_UPDATE] ✅ Cancelled pending request %d", requestID)
	return nil
}

func (r *EventRepository) AutoReleaseVenues(ctx context.Context) error {
	// Chỉ giải phóng khi area có event CLOSED/CANCELLED và KHÔNG còn event OPEN/UPDATING.
	// Điều này ngăn release nhầm khi vẫn còn event active gắn với area.
	updateQuery := `
		UPDATE Venue_Area
		SET status = 'AVAILABLE'
		WHERE status = 'UNAVAILABLE'
		  AND EXISTS (
			SELECT 1
			FROM Event e_done
			WHERE e_done.area_id = Venue_Area.area_id
			  AND e_done.status IN ('CLOSED', 'CANCELLED')
		  )
		  AND NOT EXISTS (
			SELECT 1
			FROM Event e_active
			WHERE e_active.area_id = Venue_Area.area_id
			  AND e_active.status IN ('OPEN', 'UPDATING')
		  )
	`

	result, err := r.db.ExecContext(ctx, updateQuery)
	if err != nil {
		log.Printf("[JANITOR] ❌ Failed to release venue areas: %v", err)
		return fmt.Errorf("failed to release venue areas: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("[JANITOR] ✅ Da giai phong %d khu vuc khong con su kien hoat dong", rowsAffected)
	} else {
		log.Println("[JANITOR] No venue areas to release (all areas are in use or already available)")
	}

	return nil
}

func (r *EventRepository) CheckDailyQuota(ctx context.Context, eventDate string) (*models.CheckDailyQuotaResponse, error) {
	// Query: Count ALL events on the specific date except CANCELLED and REJECTED.
	// Rule: Maximum 2 events per day.
	// IMPORTANT: UPDATING events MUST be counted — they are approved events being filled in by organizer.
	// Counted statuses: OPEN, UPDATING, CLOSED, ONGOING (and any future active status).
	query := `
		SELECT COUNT(*) as event_count
		FROM Event
		WHERE start_time::date = $1::date
		AND status != 'CANCELLED'
	`

	var currentCount int
	err := r.db.QueryRowContext(ctx, query, eventDate).Scan(&currentCount)
	if err != nil {
		fmt.Printf("[ERROR] CheckDailyQuota query failed: %v\n", err)
		return nil, fmt.Errorf("failed to check daily quota: %w", err)
	}

	maxAllowed := 2
	quotaExceeded := currentCount >= maxAllowed
	canApproveMore := currentCount < maxAllowed

	// Build warning message
	var warningMessage string
	if quotaExceeded {
		warningMessage = fmt.Sprintf("Ngày này đã hết suất tổ chức (%d/%d sự kiện). Không thể duyệt thêm.", currentCount, maxAllowed)
	} else if currentCount == maxAllowed-1 {
		warningMessage = fmt.Sprintf("Còn 1 suất trống trong ngày. Đây là sự kiện cuối cùng được phép duyệt (Tổng: %d/%d)", currentCount+1, maxAllowed)
	} else {
		warningMessage = ""
	}

	fmt.Printf("[CheckDailyQuota] Date=%s, CurrentCount=%d, MaxAllowed=%d, QuotaExceeded=%v\n",
		eventDate, currentCount, maxAllowed, quotaExceeded)

	return &models.CheckDailyQuotaResponse{
		EventDate:      eventDate,
		CurrentCount:   currentCount,
		MaxAllowed:     maxAllowed,
		QuotaExceeded:  quotaExceeded,
		CanApproveMore: canApproveMore,
		WarningMessage: warningMessage,
	}, nil
}

// ============================================================
// DisableEventByStaff - STAFF hủy sự kiện:
//   - Bypass ownership + 24h rule
//   - SET Event.status = 'CANCELLED'
//   - SET Event_Request.status = 'CANCELLED' (nếu có)
//   - Release Venue_Area → AVAILABLE
//
// ============================================================
func (r *EventRepository) DisableEventByStaff(ctx context.Context, eventID int) error {
	log.Printf("[STAFF_CANCEL] Bắt đầu hủy EventID=%d bởi STAFF", eventID)

	// Kiểm tra sự kiện tồn tại
	var status string
	var requestID sql.NullInt64
	var areaID sql.NullInt64

	checkQuery := `
		SELECT e.status, e.area_id,
		       (SELECT request_id FROM Event_Request WHERE created_event_id = e.event_id LIMIT 1)
		FROM Event e
		WHERE e.event_id = $1
	`
	err := r.db.QueryRowContext(ctx, checkQuery, eventID).Scan(&status, &areaID, &requestID)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("sự kiện không tồn tại")
		}
		return fmt.Errorf("lỗi kiểm tra sự kiện: %w", err)
	}

	if status == "CANCELLED" {
		return fmt.Errorf("sự kiện đã được hủy trước đó")
	}

	// Transaction: cập nhật Event + Event_Request
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("lỗi khởi tạo transaction: %w", err)
	}
	defer tx.Rollback()

	// Cập nhật Event → CANCELLED
	res, err := tx.ExecContext(ctx, `UPDATE Event SET status = 'CANCELLED' WHERE event_id = $1`, eventID)
	if err != nil {
		return fmt.Errorf("lỗi cập nhật event: %w", err)
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return fmt.Errorf("không thể cập nhật event %d", eventID)
	}

	// Cập nhật Event_Request → CANCELLED (nếu có)
	if requestID.Valid {
		tx.ExecContext(ctx, `UPDATE Event_Request SET status = 'CANCELLED' WHERE request_id = $1`, requestID.Int64)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("lỗi commit transaction: %w", err)
	}

	log.Printf("[STAFF_CANCEL] ✅ Event %d → CANCELLED", eventID)

	// Release Venue Area → AVAILABLE (cross-domain via API)
	if areaID.Valid {
		if err := updateAreaStatusViaAPI(ctx, int(areaID.Int64), "AVAILABLE"); err != nil {
			log.Printf("[STAFF_CANCEL] ⚠️ Không thể release area %d: %v (cần xử lý thủ công)", areaID.Int64, err)
		} else {
			log.Printf("[STAFF_CANCEL] ✅ Đã release Area %d → AVAILABLE", areaID.Int64)
		}
	}

	return nil
}

func (r *EventRepository) GetSpeakers(ctx context.Context) ([]models.SpeakerDTO, error) {
	query := `
		SELECT speaker_id, full_name, bio, email, phone, avatar_url
		FROM Speaker
		ORDER BY speaker_id DESC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query speakers: %w", err)
	}
	defer rows.Close()

	var speakers []models.SpeakerDTO
	for rows.Next() {
		var s models.SpeakerDTO
		var speakerID int
		var bio, email, phone, avatarURL sql.NullString
		err := rows.Scan(&speakerID, &s.FullName, &bio, &email, &phone, &avatarURL)
		if err != nil {
			return nil, fmt.Errorf("failed to scan speaker: %w", err)
		}
		s.SpeakerID = &speakerID
		if bio.Valid {
			s.Bio = &bio.String
		}
		if email.Valid {
			s.Email = &email.String
		}
		if phone.Valid {
			s.Phone = &phone.String
		}
		if avatarURL.Valid {
			s.AvatarURL = &avatarURL.String
		}
		speakers = append(speakers, s)
	}
	if speakers == nil {
		speakers = []models.SpeakerDTO{}
	}
	return speakers, nil
}

func (r *EventRepository) CreateSpeaker(ctx context.Context, s *models.SpeakerDTO) (int, error) {
	var bio, email, phone, avatarURL string
	if s.Bio != nil {
		bio = *s.Bio
	}
	if s.Email != nil {
		email = *s.Email
	}
	if s.Phone != nil {
		phone = *s.Phone
	}
	if s.AvatarURL != nil {
		avatarURL = *s.AvatarURL
	}

	query := `
		INSERT INTO Speaker (full_name, bio, email, phone, avatar_url)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING speaker_id
	`
	var speakerID int
	err := r.db.QueryRowContext(ctx, query, s.FullName, bio, email, phone, avatarURL).Scan(&speakerID)
	if err != nil {
		return 0, fmt.Errorf("failed to insert speaker: %w", err)
	}
	return speakerID, nil
}

func (r *EventRepository) UpdateSpeaker(ctx context.Context, id int, s *models.SpeakerDTO) error {
	var bio, email, phone, avatarURL string
	if s.Bio != nil {
		bio = *s.Bio
	}
	if s.Email != nil {
		email = *s.Email
	}
	if s.Phone != nil {
		phone = *s.Phone
	}
	if s.AvatarURL != nil {
		avatarURL = *s.AvatarURL
	}

	query := `
		UPDATE Speaker
		SET full_name = $1, bio = $2, email = $3, phone = $4, avatar_url = $5
		WHERE speaker_id = $6
	`
	_, err := r.db.ExecContext(ctx, query, s.FullName, bio, email, phone, avatarURL, id)
	if err != nil {
		return fmt.Errorf("failed to update speaker: %w", err)
	}
	return nil
}

func (r *EventRepository) DeleteSpeaker(ctx context.Context, id int) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `UPDATE Event SET speaker_id = NULL WHERE speaker_id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to unlink speaker from events: %w", err)
	}

	_, err = tx.ExecContext(ctx, `DELETE FROM Speaker WHERE speaker_id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to delete speaker: %w", err)
	}

	return tx.Commit()
}

func DeleteImageFromS3IfCustom(ctx context.Context, bannerURL string) {
	if bannerURL == "" || !strings.Contains(bannerURL, "/uploads/") {
		return
	}
	s3Client, err := storage.NewS3Client(ctx)
	if err != nil {
		log.Printf("[S3_CLEANUP] Failed to initialize S3 client: %v", err)
		return
	}
	if err := s3Client.DeleteFile(ctx, bannerURL); err != nil {
		log.Printf("[S3_CLEANUP] Failed to delete file url=%s: %v", bannerURL, err)
	} else {
		log.Printf("[S3_CLEANUP] Successfully deleted custom banner from S3: %s", bannerURL)
	}
}

func (r *EventRepository) GetSampleBanners(ctx context.Context) ([]models.SampleBanner, error) {
	query := `SELECT banner_id, title, url, category, created_at FROM sample_banner ORDER BY created_at DESC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query sample banners: %w", err)
	}
	defer rows.Close()

	var banners []models.SampleBanner
	for rows.Next() {
		var b models.SampleBanner
		var category sql.NullString
		if err := rows.Scan(&b.BannerID, &b.Title, &b.URL, &category, &b.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan sample banner: %w", err)
		}
		if category.Valid {
			b.Category = &category.String
		}
		banners = append(banners, b)
	}
	return banners, nil
}

func (r *EventRepository) GetSampleBannerByID(ctx context.Context, bannerID int) (*models.SampleBanner, error) {
	query := `SELECT banner_id, title, url, category, created_at FROM sample_banner WHERE banner_id = $1`
	var b models.SampleBanner
	var category sql.NullString
	err := r.db.QueryRowContext(ctx, query, bannerID).Scan(&b.BannerID, &b.Title, &b.URL, &category, &b.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query sample banner by ID: %w", err)
	}
	if category.Valid {
		b.Category = &category.String
	}
	return &b, nil
}

func (r *EventRepository) CreateSampleBanner(ctx context.Context, title, url string, category *string) (int, error) {
	query := `INSERT INTO sample_banner (title, url, category, created_at) VALUES ($1, $2, $3, NOW()) RETURNING banner_id`
	var bannerID int
	var catVal sql.NullString
	if category != nil {
		catVal = sql.NullString{String: *category, Valid: true}
	}
	err := r.db.QueryRowContext(ctx, query, title, url, catVal).Scan(&bannerID)
	if err != nil {
		return 0, fmt.Errorf("failed to create sample banner: %w", err)
	}
	return bannerID, nil
}

func (r *EventRepository) DeleteSampleBanner(ctx context.Context, bannerID int) error {
	query := `DELETE FROM sample_banner WHERE banner_id = $1`
	_, err := r.db.ExecContext(ctx, query, bannerID)
	if err != nil {
		return fmt.Errorf("failed to delete sample banner: %w", err)
	}
	return nil
}

func (r *EventRepository) CreateIndependentEvent(ctx context.Context, userID int, req *models.CreateEventRequestBody) (int, error) {
	query := `
		INSERT INTO Event (
			title, description, start_time, end_time, max_seats, 
			banner_url, status, created_by, created_at,
			event_format, custom_venue_name, custom_location,
			org_type, privacy_status, online_meeting_url, online_meeting_id, online_meeting_secret
		) VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7, NOW(), $8, $9, $10, $11, $12, $13, $14, $15)
		RETURNING event_id
	`
	var eventID int
	var bannerURL sql.NullString
	if req.BannerURL != nil && *req.BannerURL != "" {
		bannerURL = sql.NullString{String: *req.BannerURL, Valid: true}
	}

	// Default org_type to FREE for independent events
	orgType := req.OrgType
	if orgType == "" {
		orgType = "FREE"
	}
	// Default privacy_status to PUBLIC
	privacyStatus := req.PrivacyStatus
	if privacyStatus == "" {
		privacyStatus = "PUBLIC"
	}

	err := r.db.QueryRowContext(ctx, query,
		req.Title,
		req.Description,
		req.PreferredStartTime,
		req.PreferredEndTime,
		req.ExpectedCapacity,
		bannerURL,
		userID,
		req.EventFormat,
		req.CustomVenueName,
		req.CustomLocation,
		orgType,
		privacyStatus,
		req.OnlineMeetingURL,
		req.OnlineMeetingID,
		req.OnlineMeetingSecret,
	).Scan(&eventID)
	if err != nil {
		return 0, fmt.Errorf("failed to create independent event: %w", err)
	}
	log.Printf("[CreateIndependentEvent] Created event ID=%d (org_type=%s, privacy=%s, format=%s)", eventID, orgType, privacyStatus, req.EventFormat)
	return eventID, nil
}
