package repository

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/services/event-lambda/models"
)

// Helper function to convert values to pointers
func pointer[T any](v T) *T {
	return &v
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

// NewEventRepository creates a new event repository
func NewEventRepository() *EventRepository {
	return &EventRepository{
		db: db.GetDB(),
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
		SELECT requester_id, status, created_event_id FROM Event_Request WHERE request_id = ? FOR UPDATE
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
		areaQuery := `SELECT area_id FROM Event WHERE event_id = ?`
		err = tx.QueryRowContext(ctx, areaQuery, eventID).Scan(&areaID)
		if err != nil {
			return fmt.Errorf("failed to get area_id: %w", err)
		}
		fmt.Printf("[UpdateEventRequest] Area ID: %d\n", areaID)

		// Get area capacity
		var areaCapacity int
		capQuery := `SELECT capacity FROM Venue_Area WHERE area_id = ?`
		err = tx.QueryRowContext(ctx, capQuery, areaID).Scan(&areaCapacity)
		if err != nil {
			// If capacity can't be read treat as 0 and fall back to default behavior
			log.Printf("[UpdateEventRequest] warning: failed to read area capacity: %v", err)
			areaCapacity = 0
		}
		fmt.Printf("[UpdateEventRequest] Area Capacity: %d\n", areaCapacity)

		// ✅ Get current event status to determine if we should change it to OPEN
		var currentEventStatus string
		statusQuery := `SELECT status FROM Event WHERE event_id = ?`
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

		fmt.Printf("[UpdateEventRequest] Speaker data: fullName=%s, bio=%s, email=%s, phone=%s, avatarUrl=%s\n",
			speakerFullName, speakerBio, speakerEmail, speakerPhone, speakerAvatarUrl)

		// Get current speaker_id for this event (if exists)
		checkSpeakerQuery := `SELECT speaker_id FROM Event WHERE event_id = ?`
		err = tx.QueryRowContext(ctx, checkSpeakerQuery, eventID).Scan(&speakerID)
		if err != nil && err != sql.ErrNoRows {
			return fmt.Errorf("failed to check existing speaker_id: %w", err)
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
					VALUES (?, ?, ?, ?, ?)
				`
				// [DEBUG] Log SQL before execution
				fmt.Printf("[SQL LOG] About to INSERT Speaker: fullName=%s, bio=%s, email=%s, phone=%s, avatarUrl=%s\n",
					speakerFullName, speakerBio, speakerEmail, speakerPhone, speakerAvatarUrl)
				// ✅ STRONG LOG: Confirm SQL execution
				log.Printf("[SQL_EXECUTE] Dang thuc hien INSERT Speaker cho Event: %d (fullName=%s)", eventID, speakerFullName)
				result, err := tx.ExecContext(ctx, insertSpeakerQuery, speakerFullName, speakerBio, speakerEmail, speakerPhone, speakerAvatarUrl)
				if err != nil {
					return fmt.Errorf("failed to insert speaker: %w", err)
				}

				// STEP 2: Get speaker_id from LastInsertId
				newSpeakerID, err := result.LastInsertId()
				if err != nil {
					return fmt.Errorf("failed to get LastInsertId for speaker: %w", err)
				}
				speakerID.Int64 = newSpeakerID
				speakerID.Valid = true
				fmt.Printf("[UpdateEventRequest] ✅ Inserted speaker with ID=%d\n", newSpeakerID)
			} else {
				// speaker_id exists → UPDATE existing speaker
				fmt.Printf("[UpdateEventRequest] Updating EXISTING speaker (ID=%d): %s\n", speakerID.Int64, speakerFullName)
				updateSpeakerQuery := `
					UPDATE Speaker 
					SET full_name = ?, bio = ?, email = ?, phone = ?, avatar_url = ? 
					WHERE speaker_id = ?
				`
				// [DEBUG] Log SQL before execution
				fmt.Printf("[SQL LOG] About to UPDATE Speaker ID=%d: fullName=%s, bio=%s, email=%s, phone=%s, avatarUrl=%s\n",
					speakerID.Int64, speakerFullName, speakerBio, speakerEmail, speakerPhone, speakerAvatarUrl)
				// ✅ STRONG LOG: Confirm SQL execution
				log.Printf("[SQL_EXECUTE] Dang thuc hien UPDATE Speaker ID=%d cho Event: %d (fullName=%s)", speakerID.Int64, eventID, speakerFullName)
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
		eventUpdateQuery := `UPDATE Event SET banner_url = ?, speaker_id = ?, status = ? WHERE event_id = ?`
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
			deleteTicketsQuery := `DELETE FROM category_ticket WHERE event_id = ?`
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
					VALUES (?, ?, ?, ?, ?, ?)
				`
				// ✅ STRONG LOG: Confirm ticket INSERT with rounded price
				log.Printf("[SQL] Updating ticket %s for event %d with price %.0f (maxQty=%d)", name, eventID, price, maxQty)
				result, err := tx.ExecContext(ctx, insertTicketQuery, eventID, name, description, price, maxQty, status)
				if err != nil {
					log.Printf("[DIAGNOSTIC] LOI KHI INSERT TICKET: %v", err)
					return fmt.Errorf("failed to insert category_ticket: %w", err)
				}

				ticketID, _ := result.LastInsertId()
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
				insertA2Query := `INSERT IGNORE INTO Seat (area_id, seat_code, row_no, col_no, status) VALUES (?, 'A2', 'A', 2, 'ACTIVE')`
				tx.ExecContext(ctx, insertA2Query, areaID)

				// Reset seats
				resetSeatsQuery := `UPDATE Seat SET category_ticket_id = NULL WHERE area_id = ?`
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
					WHERE area_id = ?
					ORDER BY row_no ASC, CAST(SUBSTRING(seat_code, 2) AS UNSIGNED) ASC, seat_code ASC
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

					insertSeatsQuery := `INSERT IGNORE INTO Seat (area_id, seat_code, row_no, col_no, status) VALUES `
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
					for row := 0; created < areaCapacity && row < rowsNeeded; row++ {
						rowLetter := rowNameFromIndex(row)
						for col := 1; col <= seatsPerRow && created < areaCapacity; col++ {
							seatCode := rowLetter + strconv.Itoa(col)
							values = append(values, "(?, ?, ?, ?, 'ACTIVE')")
							params = append(params, areaID, seatCode, rowLetter, col)
							created++
						}
					}

					if len(values) > 0 {
						insertSeatsQuery += strings.Join(values, ", ")
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

					insertSeatsQuery := `INSERT IGNORE INTO Seat (area_id, seat_code, row_no, col_no, status) VALUES `
					var values []string
					var params []interface{}

					for row := 0; row < 10; row++ {
						rowLetter := string(rune('A' + row))
						for col := 1; col <= 10; col++ {
							seatCode := rowLetter + strconv.Itoa(col)
							values = append(values, "(?, ?, ?, ?, 'ACTIVE')")
							params = append(params, areaID, seatCode, rowLetter, col)
						}
					}

					insertSeatsQuery += strings.Join(values, ", ")
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
						_, err = tx.ExecContext(ctx, "UPDATE Seat SET category_ticket_id = ? WHERE seat_id = ?", assignID, seatID)
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
							updateSeatQuery := `UPDATE Seat SET category_ticket_id = ? WHERE seat_id = ?`
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

	// Handle dry run
	if req.DryRun {
		fmt.Printf("[UpdateEventRequest] DRY_RUN: Rolling back all changes\n")
		tx.Rollback()
		return nil
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
		query = baseQuery + ` WHERE e.created_by = ? AND (e.status IN ('OPEN','CLOSED','APPROVED','UPDATING') OR e.end_time < NOW())
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

		// Convert timestamps to ISO string
		item.StartTime = startTime.Format(time.RFC3339)
		item.EndTime = endTime.Format(time.RFC3339)

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
		now := time.Now()
		if item.Status == "CLOSED" || endTime.Before(now) {
			closedEvents = append(closedEvents, item)
		} else {
			// Includes OPEN, APPROVED, UPDATING and other non-closed statuses
			openEvents = append(openEvents, item)
		}
	}

	return openEvents, closedEvents, rows.Err()
}

func (r *EventRepository) GetEventDetail(ctx context.Context, eventID int) (*models.EventDetailDto, error) {
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
		WHERE e.event_id = ?
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
	detail.StartTime = startTime.Format(time.RFC3339)
	detail.EndTime = endTime.Format(time.RFC3339)
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

	// Check if any bookings exist for event (to indicate locked seating)
	var bookingCount int
	err = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM Ticket WHERE event_id = ? AND status IN ('PENDING','BOOKED','CHECKED_IN')", eventID).Scan(&bookingCount)
	if err == nil {
		has := bookingCount > 0
		detail.HasBookings = &has
	}

	// ✅ DEBUG LOG: Log speaker info before returning
	speakerNameVal := "nil"
	if detail.SpeakerName != nil {
		speakerNameVal = *detail.SpeakerName
	}
	speakerBioVal := "nil"
	if detail.SpeakerBio != nil {
		speakerBioVal = *detail.SpeakerBio
	}
	speakerEmailVal := "nil"
	if detail.SpeakerEmail != nil {
		speakerEmailVal = *detail.SpeakerEmail
	}
	speakerPhoneVal := "nil"
	if detail.SpeakerPhone != nil {
		speakerPhoneVal = *detail.SpeakerPhone
	}
	log.Printf("[GetEventDetail] EventID=%d after mapping: SpeakerName=%s, SpeakerBio=%s, SpeakerEmail=%s, SpeakerPhone=%s",
		eventID, speakerNameVal, speakerBioVal, speakerEmailVal, speakerPhoneVal)

	return &detail, nil
}

func (r *EventRepository) GetCategoryTicketsByEventID(ctx context.Context, eventID int) ([]models.CategoryTicket, error) {
	query := `SELECT category_ticket_id, name, description, price, max_quantity, status FROM Category_Ticket WHERE event_id = ? ORDER BY price ASC`
	rows, err := r.db.QueryContext(ctx, query, eventID)
	if err != nil {
		return nil, fmt.Errorf("failed to query category tickets: %w", err)
	}
	defer rows.Close()

	var cats []models.CategoryTicket
	for rows.Next() {
		var ct models.CategoryTicket
		var desc sql.NullString
		var price sql.NullFloat64
		var maxQty sql.NullInt64
		if err := rows.Scan(&ct.CategoryTicketID, &ct.Name, &desc, &price, &maxQty, &ct.Status); err != nil {
			return nil, fmt.Errorf("failed to scan category ticket: %w", err)
		}
		if desc.Valid {
			ct.Description = &desc.String
		}
		if price.Valid {
			// Round price to avoid floating-point precision issues (e.g., 49999.999 -> 50000)
			ct.Price = math.Round(price.Float64)
		}
		if maxQty.Valid {
			ct.MaxQuantity = int(maxQty.Int64)
		}
		cats = append(cats, ct)
	}
	return cats, rows.Err()
}

func (r *EventRepository) GetOpenEvents(ctx context.Context) ([]models.EventListItem, error) {
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

		// Convert timestamps to ISO string
		item.StartTime = startTime.Format(time.RFC3339)
		item.EndTime = endTime.Format(time.RFC3339)

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

func (r *EventRepository) CreateEventRequest(ctx context.Context, requesterID int, req *models.CreateEventRequestBody) (int, error) {
	log.Printf("[DB_INSERT] Starting insert for requesterID=%d, title=%s", requesterID, req.Title)

	query := `
		INSERT INTO Event_Request 
		(requester_id, title, description, preferred_start_time, preferred_end_time, expected_capacity, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NOW())
	`

	result, err := r.db.ExecContext(ctx, query,
		requesterID,
		req.Title,
		req.Description,
		req.PreferredStartTime,
		req.PreferredEndTime,
		req.ExpectedCapacity,
	)

	if err != nil {
		log.Printf("[DB_INSERT] Insert failed: %v", err)
		return 0, fmt.Errorf("failed to insert event request: %w", err)
	}

	requestID, err := result.LastInsertId()
	if err != nil {
		log.Printf("[DB_INSERT] Failed to get last insert ID: %v", err)
		return 0, fmt.Errorf("failed to get last insert ID: %w", err)
	}

	log.Printf("[DB_INSERT] Successfully inserted request ID: %d", requestID)
	return int(requestID), nil
}

func (r *EventRepository) GetMyEventRequests(ctx context.Context, requesterID int) ([]models.EventRequest, error) {
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
			v.venue_name, va.area_name, va.floor, va.capacity
		FROM Event_Request er
		LEFT JOIN Users u ON er.requester_id = u.user_id
		LEFT JOIN Users u2 ON er.processed_by = u2.user_id
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE er.requester_id = ?
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
		var processedAt, createdAt sql.NullTime
		var venueName, areaName, floor sql.NullString
		var areaCapacity sql.NullInt64

		err := rows.Scan(
			&req.RequestID, &req.RequesterID, &requesterName,
			&req.Title, &req.Description,
			&req.PreferredStartTime, &req.PreferredEndTime,
			&req.ExpectedCapacity, &req.Status,
			&createdAt, &processedBy, &processedByName,
			&processedAt, &req.OrganizerNote, &req.RejectReason,
			&req.CreatedEventID,
			&venueName, &areaName, &floor, &areaCapacity,
		)
		if err != nil {
			log.Printf("[GetMyEventRequests] Scan error: %v", err)
			return nil, fmt.Errorf("failed to scan event request: %w", err)
		}

		// Convert sql.Null to pointers
		if requesterName.Valid {
			req.RequesterName = &requesterName.String
		}
		if createdAt.Valid {
			req.CreatedAt = pointer(createdAt.Time.Format(time.RFC3339))
		}
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		if processedByName.Valid {
			req.ProcessedByName = &processedByName.String
		}
		if processedAt.Valid {
			req.ProcessedAt = pointer(processedAt.Time.Format(time.RFC3339))
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

		requests = append(requests, req)
	}

	log.Printf("[GetMyEventRequests] Returned %d requests for requesterID=%d", len(requests), requesterID)
	return requests, rows.Err()
}

func (r *EventRepository) GetMyActiveEventRequests(ctx context.Context, requesterID int, limit int, offset int) ([]models.EventRequest, int, error) {
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
			v.venue_name, va.area_name, va.floor, va.capacity
		FROM Event_Request er
		LEFT JOIN Users u ON er.requester_id = u.user_id
		LEFT JOIN Users u2 ON er.processed_by = u2.user_id
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE er.requester_id = ? 
		  AND (er.status = 'PENDING' OR (er.status = 'APPROVED' AND e.status = 'UPDATING'))
		ORDER BY er.created_at DESC
		LIMIT ? OFFSET ?
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
		var processedAt, createdAt sql.NullTime
		var eventStatus sql.NullString
		var venueName, areaName, floor sql.NullString
		var areaCapacity sql.NullInt64

		err := rows.Scan(
			&req.RequestID, &req.RequesterID, &requesterName,
			&req.Title, &req.Description,
			&req.PreferredStartTime, &req.PreferredEndTime,
			&req.ExpectedCapacity, &req.Status,
			&createdAt, &processedBy, &processedByName,
			&processedAt, &req.OrganizerNote, &req.RejectReason,
			&req.CreatedEventID, &eventStatus,
			&venueName, &areaName, &floor, &areaCapacity,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan event request: %w", err)
		}

		// Convert sql.Null to pointers
		if requesterName.Valid {
			req.RequesterName = &requesterName.String
		}
		if createdAt.Valid {
			req.CreatedAt = pointer(createdAt.Time.Format(time.RFC3339))
		}
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		if processedByName.Valid {
			req.ProcessedByName = &processedByName.String
		}
		if processedAt.Valid {
			req.ProcessedAt = pointer(processedAt.Time.Format(time.RFC3339))
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

		requests = append(requests, req)
	}

	// Get total count
	countQuery := `
		SELECT COUNT(*) 
		FROM Event_Request er
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		WHERE er.requester_id = ? 
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
			v.venue_name, va.area_name, va.floor, va.capacity
		FROM Event_Request er
		LEFT JOIN Users u ON er.requester_id = u.user_id
		LEFT JOIN Users u2 ON er.processed_by = u2.user_id
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE er.requester_id = ? 
		  AND (er.status IN ('REJECTED', 'CANCELLED') 
		       OR (er.status = 'APPROVED' AND e.status IN ('OPEN', 'CLOSED', 'CANCELLED', 'FINISHED')))
		ORDER BY er.created_at DESC
		LIMIT ? OFFSET ?
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
		var processedAt, createdAt sql.NullTime
		var eventStatus sql.NullString
		var venueName, areaName, floor sql.NullString
		var areaCapacity sql.NullInt64

		err := rows.Scan(
			&req.RequestID, &req.RequesterID, &requesterName,
			&req.Title, &req.Description,
			&req.PreferredStartTime, &req.PreferredEndTime,
			&req.ExpectedCapacity, &req.Status,
			&createdAt, &processedBy, &processedByName,
			&processedAt, &req.OrganizerNote, &req.RejectReason,
			&req.CreatedEventID, &eventStatus,
			&venueName, &areaName, &floor, &areaCapacity,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan event request: %w", err)
		}

		// Convert sql.Null to pointers
		if requesterName.Valid {
			req.RequesterName = &requesterName.String
		}
		if createdAt.Valid {
			req.CreatedAt = pointer(createdAt.Time.Format(time.RFC3339))
		}
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		if processedByName.Valid {
			req.ProcessedByName = &processedByName.String
		}
		if processedAt.Valid {
			req.ProcessedAt = pointer(processedAt.Time.Format(time.RFC3339))
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

		requests = append(requests, req)
	}

	// Get total count
	countQuery := `
		SELECT COUNT(*) 
		FROM Event_Request er
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		WHERE er.requester_id = ? 
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
			v.venue_name, va.area_name, va.floor, va.capacity
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
		var processedAt, createdAt sql.NullTime
		var venueName, areaName, floor sql.NullString
		var areaCapacity sql.NullInt64

		err := rows.Scan(
			&req.RequestID, &req.RequesterID, &requesterName,
			&req.Title, &req.Description,
			&req.PreferredStartTime, &req.PreferredEndTime,
			&req.ExpectedCapacity, &req.Status,
			&createdAt, &processedBy, &processedByName,
			&processedAt, &req.OrganizerNote, &req.RejectReason,
			&req.CreatedEventID,
			&venueName, &areaName, &floor, &areaCapacity,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event request: %w", err)
		}

		// Convert sql.Null to pointers
		if requesterName.Valid {
			req.RequesterName = &requesterName.String
		}
		if createdAt.Valid {
			req.CreatedAt = pointer(createdAt.Time.Format(time.RFC3339))
		}
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		if processedByName.Valid {
			req.ProcessedByName = &processedByName.String
		}
		if processedAt.Valid {
			req.ProcessedAt = pointer(processedAt.Time.Format(time.RFC3339))
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

		requests = append(requests, req)
	}

	return requests, rows.Err()
}

func (r *EventRepository) GetEventRequestByID(ctx context.Context, requestID int) (*models.EventRequest, error) {
	query := `
		SELECT 
			er.request_id, er.requester_id, u.full_name as requester_name,
			er.title, er.description,
			er.preferred_start_time, er.preferred_end_time,
			er.expected_capacity, er.status,
			er.created_at, er.processed_by, u2.full_name as processed_by_name,
			er.processed_at, er.organizer_note, er.reject_reason,
			er.created_event_id,
			v.venue_name, va.area_name, va.floor, va.capacity
		FROM Event_Request er
		LEFT JOIN Users u ON er.requester_id = u.user_id
		LEFT JOIN Users u2 ON er.processed_by = u2.user_id
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE er.request_id = ?
		LIMIT 1
	`

	var req models.EventRequest
	var requesterName, processedByName sql.NullString
	var processedBy sql.NullInt64
	var processedAt, createdAt sql.NullTime
	var venueName, areaName, floor sql.NullString
	var areaCapacity sql.NullInt64

	err := r.db.QueryRowContext(ctx, query, requestID).Scan(
		&req.RequestID, &req.RequesterID, &requesterName,
		&req.Title, &req.Description,
		&req.PreferredStartTime, &req.PreferredEndTime,
		&req.ExpectedCapacity, &req.Status,
		&createdAt, &processedBy, &processedByName,
		&processedAt, &req.OrganizerNote, &req.RejectReason,
		&req.CreatedEventID,
		&venueName, &areaName, &floor, &areaCapacity,
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
	if createdAt.Valid {
		req.CreatedAt = pointer(createdAt.Time.Format(time.RFC3339))
	}
	if processedBy.Valid {
		req.ProcessedBy = pointer(int(processedBy.Int64))
	}
	if processedByName.Valid {
		req.ProcessedByName = &processedByName.String
	}
	if processedAt.Valid {
		req.ProcessedAt = pointer(processedAt.Time.Format(time.RFC3339))
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

	// ============================================================
	// SCENARIO 1: REJECTED
	// ============================================================
	if req.Action == "REJECTED" {
		// Validate: reject_reason is required
		if req.RejectReason == nil || *req.RejectReason == "" {
			return fmt.Errorf("reject reason is required when rejecting")
		}

		updateQuery := `
			UPDATE Event_Request 
			SET status = 'REJECTED', 
			    processed_by = ?, 
			    processed_at = NOW(),
			    reject_reason = ?
			WHERE request_id = ?
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
		var requestTitle, requestDesc string
		var requestStartTime, requestEndTime string
		var requestCapacity int
		var requesterID int

		getRequestQuery := `
			SELECT title, description, preferred_start_time, preferred_end_time, 
			       expected_capacity, requester_id
			FROM Event_Request 
			WHERE request_id = ?
		`

		err := tx.QueryRowContext(ctx, getRequestQuery, req.RequestID).Scan(
			&requestTitle, &requestDesc, &requestStartTime, &requestEndTime,
			&requestCapacity, &requesterID,
		)
		if err != nil {
			fmt.Printf("[DB_PROCESS] Failed to get request details: %v\n", err)
			return fmt.Errorf("failed to get request details: %w", err)
		}

		// B1: Update Event_Request to APPROVED
		updateRequestQuery := `
			UPDATE Event_Request 
			SET status = 'APPROVED', 
			    processed_by = ?, 
			    processed_at = NOW(),
			    organizer_note = ?
			WHERE request_id = ?
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
				banner_url, area_id, speaker_id, status, created_by, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UPDATING', ?, NOW())
		`

		speakerIDValue := sql.NullInt64{Valid: false}
		if req.SpeakerID != nil && *req.SpeakerID > 0 {
			speakerIDValue = sql.NullInt64{Int64: int64(*req.SpeakerID), Valid: true}
		}

		bannerURLValue := sql.NullString{Valid: false}
		if req.BannerURL != nil && *req.BannerURL != "" {
			bannerURLValue = sql.NullString{String: *req.BannerURL, Valid: true}
		}

		eventResult, err := tx.ExecContext(ctx, insertEventQuery,
			requestTitle, requestDesc, requestStartTime, requestEndTime, requestCapacity,
			bannerURLValue, *req.AreaID, speakerIDValue, requesterID,
		)
		if err != nil {
			fmt.Printf("[DB_PROCESS] Failed to create Event: %v\n", err)
			return fmt.Errorf("failed to create event: %w", err)
		}

		eventID, err := eventResult.LastInsertId()
		if err != nil {
			fmt.Printf("[DB_PROCESS] Failed to get event ID: %v\n", err)
			return fmt.Errorf("failed to get event ID: %w", err)
		}

		fmt.Printf("[DB_PROCESS] Step B2: Created Event %d with status UPDATING\n", eventID)

		// B3: Update Event_Request.created_event_id
		updateCreatedEventQuery := `
			UPDATE Event_Request 
			SET created_event_id = ?
			WHERE request_id = ?
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
			WHERE area_id = ?
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
	verifyQuery := `SELECT created_by, status FROM Event WHERE event_id = ?`
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
	getAreaQuery := `SELECT area_id FROM Event WHERE event_id = ?`
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
		WHERE ct.event_id = ? AND t.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT')
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
	checkSpeakerQuery := `SELECT speaker_id FROM Event WHERE event_id = ?`
	err = tx.QueryRowContext(ctx, checkSpeakerQuery, updateReq.EventID).Scan(&speakerID)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("failed to check existing speaker: %w", err)
	}

	log.Printf("[CHECK] Current speaker_id for Event %d: %v (Valid=%v)", updateReq.EventID, speakerID.Int64, speakerID.Valid)

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

		log.Printf("[CHECK] Processing Speaker: fullName=%s, bio=%s, email=%s, phone=%s",
			speakerFullName, speakerBio, speakerEmail, speakerPhone)

		if !speakerID.Valid || speakerID.Int64 == 0 {
			// INSERT new speaker
			insertSpeakerQuery := `
				INSERT INTO Speaker (full_name, bio, email, phone, avatar_url)
				VALUES (?, ?, ?, ?, ?)
			`
			log.Printf("[SQL_EXECUTE] INSERT Speaker for Event %d: fullName=%s", updateReq.EventID, speakerFullName)
			result, err := tx.ExecContext(ctx, insertSpeakerQuery, speakerFullName, speakerBio, speakerEmail, speakerPhone, speakerAvatarURL)
			if err != nil {
				return fmt.Errorf("failed to insert speaker: %w", err)
			}

			newSpeakerID, err := result.LastInsertId()
			if err != nil {
				return fmt.Errorf("failed to get LastInsertId for speaker: %w", err)
			}
			speakerID.Int64 = newSpeakerID
			speakerID.Valid = true
			log.Printf("[UpdateEventDetails] ✅ Inserted speaker with ID=%d", newSpeakerID)
		} else {
			// UPDATE existing speaker
			updateSpeakerQuery := `
				UPDATE Speaker
				SET full_name = ?, bio = ?, email = ?, phone = ?, avatar_url = ?
				WHERE speaker_id = ?
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

	updateEventQuery := `UPDATE Event SET banner_url = ?, speaker_id = ? WHERE event_id = ?`
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
			// Delete old tickets
			deleteTicketsQuery := `DELETE FROM category_ticket WHERE event_id = ?`
			result, err := tx.ExecContext(ctx, deleteTicketsQuery, updateReq.EventID)
			if err != nil {
				return fmt.Errorf("failed to delete old tickets: %w", err)
			}
			rowsDeleted, _ := result.RowsAffected()
			log.Printf("[UpdateEventDetails] Deleted %d old tickets", rowsDeleted)

			// Reset seats to clear category_ticket_id linkage
			if areaID.Valid {
				resetSeatsQuery := `UPDATE Seat SET category_ticket_id = NULL WHERE area_id = ?`
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
				VALUES (?, ?, ?, ?, ?, ?)
			`
				log.Printf("[SQL] Inserting ticket #%d: %s for event %d with price %.0f (maxQty=%d)",
					idx+1, ticket.Name, updateReq.EventID, roundedPrice, ticket.MaxQuantity)

				result, err := tx.ExecContext(ctx, insertTicketQuery, updateReq.EventID, ticket.Name, description, roundedPrice, ticket.MaxQuantity, status)
				if err != nil {
					log.Printf("[DIAGNOSTIC] Failed to insert ticket: %v", err)
					return fmt.Errorf("failed to insert ticket: %w", err)
				}

				ticketID, _ := result.LastInsertId()
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
				getSeatIDsQuery := `SELECT seat_id, seat_code, row_no, col_no FROM Seat WHERE area_id = ? ORDER BY row_no, col_no`
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
						updateSeatQuery := `UPDATE Seat SET category_ticket_id = ? WHERE seat_id = ?`
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
	return nil
}

func (r *EventRepository) GetEventConfigById(ctx context.Context, eventID int) (*models.EventConfigResponse, error) {
	return nil, nil // Returns nil if no per-event config exists
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
			AND DATE(e.start_time) = ?
			AND e.status IN ('OPEN', 'APPROVED')
		WHERE COALESCE(va.capacity, 0) >= ?
		GROUP BY va.area_id, va.area_name, v.venue_name, va.floor, va.capacity, va.status
		HAVING event_count_on_date < 2
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
		WHERE e.event_id = ?
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
			AND e.organizer_id = ?
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
	log.Printf("[DB_UPDATE] Starting cancel event for EventID=%d, UserID=%d", eventID, userID)

	// Step 1: Get event info and verify ownership
	var status string
	var createdBy int
	var requestID sql.NullInt64
	var startTime time.Time
	var eventTitle string

	checkQuery := `
		SELECT e.status, e.created_by, e.start_time, e.title,
		       (SELECT request_id FROM Event_Request WHERE created_event_id = e.event_id LIMIT 1) as request_id
		FROM Event e
		WHERE e.event_id = ?
	`
	err := r.db.QueryRowContext(ctx, checkQuery, eventID).Scan(&status, &createdBy, &startTime, &eventTitle, &requestID)
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
	now := time.Now()
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
		WHERE event_id = ? AND status IN ('PENDING', 'BOOKED', 'CHECKED_IN')
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
		WHERE event_id = ? AND created_by = ?
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
			WHERE request_id = ?
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
	areaQuery := `SELECT area_id FROM Event WHERE event_id = ?`
	err = tx.QueryRowContext(ctx, areaQuery, eventID).Scan(&areaID)
	if err == nil && areaID.Valid {
		// Cập nhật venue_area status thành AVAILABLE để có thể đặt lại
		releaseQuery := `
			UPDATE Venue_Area 
			SET status = 'AVAILABLE' 
			WHERE area_id = ? AND status = 'UNAVAILABLE'
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

	log.Printf("[DB_UPDATE] ✅ Successfully cancelled Event ID: %d (Title: %s, Tickets Sold: %d)", eventID, eventTitle, ticketsSoldCount)
	return nil
}

func (r *EventRepository) CancelEventRequest(ctx context.Context, userID, requestID int) error {
	log.Printf("[DB_UPDATE] Starting cancel for RequestID=%d, UserID=%d", requestID, userID)

	// Step 1: Get request info and verify ownership
	var status string
	var requesterID int
	var createdEventID sql.NullInt64

	checkQuery := `
		SELECT status, requester_id, created_event_id 
		FROM Event_Request 
		WHERE request_id = ?
	`
	err := r.db.QueryRowContext(ctx, checkQuery, requestID).Scan(&status, &requesterID, &createdEventID)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("[DB_UPDATE] Request ID %d not found", requestID)
			return fmt.Errorf("yêu cầu không tồn tại")
		}
		log.Printf("[DB_UPDATE] Query error: %v", err)
		return fmt.Errorf("lỗi kiểm tra yêu cầu: %w", err)
	}

	// Verify ownership
	if requesterID != userID {
		log.Printf("[DB_UPDATE] User %d tried to cancel request %d owned by %d", userID, requestID, requesterID)
		return fmt.Errorf("bạn không có quyền hủy yêu cầu này")
	}

	// Check if already cancelled
	if status == "CANCELLED" {
		log.Printf("[DB_UPDATE] Request %d already cancelled", requestID)
		return fmt.Errorf("yêu cầu đã được hủy trước đó")
	}

	// Case 1: No created_event_id (chưa được duyệt) - Simple UPDATE
	if !createdEventID.Valid {
		log.Printf("[DB_UPDATE] Case 1: Request %d has no linked event, simple cancel", requestID)

		updateQuery := `
			UPDATE Event_Request 
			SET status = 'CANCELLED' 
			WHERE request_id = ? AND requester_id = ?
		`
		result, err := r.db.ExecContext(ctx, updateQuery, requestID, userID)
		if err != nil {
			log.Printf("[DB_UPDATE] Failed to update request: %v", err)
			return fmt.Errorf("lỗi cập nhật yêu cầu: %w", err)
		}

		rowsAffected, err := result.RowsAffected()
		if err != nil {
			log.Printf("[DB_UPDATE] Failed to get rows affected: %v", err)
			return fmt.Errorf("lỗi kiểm tra kết quả: %w", err)
		}

		if rowsAffected == 0 {
			log.Printf("[DB_UPDATE] No rows affected for request %d", requestID)
			return fmt.Errorf("không thể hủy yêu cầu")
		}

		log.Printf("[DB_UPDATE] Cancelled Request ID: %d (Linked Event: none)", requestID)
		return nil
	}

	// Case 2: Has created_event_id (đã được duyệt) - Transaction với cả 2 bảng
	eventID := int(createdEventID.Int64)
	log.Printf("[DB_UPDATE] Case 2: Request %d linked to Event %d, need transaction", requestID, eventID)

	// Start transaction
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[DB_UPDATE] Failed to start transaction: %v", err)
		return fmt.Errorf("lỗi khởi tạo transaction: %w", err)
	}
	defer tx.Rollback()

	// Update Event_Request
	updateRequestQuery := `
		UPDATE Event_Request 
		SET status = 'CANCELLED' 
		WHERE request_id = ?
	`
	result1, err := tx.ExecContext(ctx, updateRequestQuery, requestID)
	if err != nil {
		log.Printf("[DB_UPDATE] Failed to update Event_Request in transaction: %v", err)
		return fmt.Errorf("lỗi cập nhật yêu cầu: %w", err)
	}

	rowsAffected1, _ := result1.RowsAffected()
	if rowsAffected1 == 0 {
		log.Printf("[DB_UPDATE] No rows affected in Event_Request for ID %d", requestID)
		return fmt.Errorf("không thể cập nhật yêu cầu")
	}

	// Update Event
	updateEventQuery := `
		UPDATE Event 
		SET status = 'CANCELLED' 
		WHERE event_id = ?
	`
	result2, err := tx.ExecContext(ctx, updateEventQuery, eventID)
	if err != nil {
		log.Printf("[DB_UPDATE] Failed to update Event in transaction: %v", err)
		return fmt.Errorf("lỗi cập nhật sự kiện: %w", err)
	}

	rowsAffected2, _ := result2.RowsAffected()
	if rowsAffected2 == 0 {
		log.Printf("[DB_UPDATE] No rows affected in Event for ID %d", eventID)
		return fmt.Errorf("không thể cập nhật sự kiện")
	}

	// ✅ RELEASE VENUE AREA - Giải phóng địa điểm khi hủy yêu cầu đã được duyệt
	// Lấy area_id từ Event để giải phóng
	var areaID sql.NullInt64
	areaQuery := `SELECT area_id FROM Event WHERE event_id = ?`
	err = tx.QueryRowContext(ctx, areaQuery, eventID).Scan(&areaID)
	if err == nil && areaID.Valid {
		// Cập nhật venue_area status thành AVAILABLE để có thể đặt lại
		releaseQuery := `
			UPDATE Venue_Area 
			SET status = 'AVAILABLE' 
			WHERE area_id = ? AND status = 'UNAVAILABLE'
		`
		result3, err := tx.ExecContext(ctx, releaseQuery, areaID.Int64)
		if err != nil {
			log.Printf("[DB_UPDATE] Failed to release venue area: %v", err)
			return fmt.Errorf("lỗi giải phóng địa điểm: %w", err)
		}

		rowsAffected3, _ := result3.RowsAffected()
		if rowsAffected3 > 0 {
			log.Printf("[DB_PROCESS] Successfully RELEASED Area [%d] to AVAILABLE after Cancellation of Request [%d]", areaID.Int64, requestID)
		}
	} else if err != nil && err != sql.ErrNoRows {
		log.Printf("[DB_UPDATE] Warning: Failed to query area_id for event %d: %v", eventID, err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		log.Printf("[DB_UPDATE] Failed to commit transaction: %v", err)
		return fmt.Errorf("lỗi commit transaction: %w", err)
	}

	log.Printf("[DB_UPDATE] Cancelled Request ID: %d (Linked Event: %d)", requestID, eventID)
	return nil
}

func (r *EventRepository) AutoReleaseVenues(ctx context.Context) error {
	// Sử dụng câu lệnh SQL an toàn: Chỉ giải phóng venue_area không còn sự kiện OPEN hoặc UPDATING
	updateQuery := `
		UPDATE Venue_Area va
		SET va.status = 'AVAILABLE'
		WHERE va.status = 'UNAVAILABLE'
		AND va.area_id NOT IN (
			SELECT e.area_id 
			FROM Event e 
			WHERE e.status IN ('OPEN', 'UPDATING')
			AND e.area_id IS NOT NULL
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
	// Query: Count approved/open events on the specific date
	// Rule: Maximum 2 events per day
	query := `
		SELECT COUNT(*) as event_count
		FROM Event
		WHERE DATE(start_time) = ?
		AND status IN ('OPEN', 'APPROVED')
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
		warningMessage = fmt.Sprintf("Đã đạt giới hạn %d sự kiện/ngày. Không thể duyệt thêm.", maxAllowed)
	} else if currentCount == maxAllowed-1 {
		warningMessage = fmt.Sprintf("Đây là sự kiện cuối cùng được phép trong ngày (Tổng: %d/%d)", currentCount+1, maxAllowed)
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
