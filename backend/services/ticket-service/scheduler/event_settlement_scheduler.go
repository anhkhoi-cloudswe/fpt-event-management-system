package scheduler

import (
	"context"
	"database/sql"
	"log"
	"time"

	"github.com/fpt-event-services/services/ticket-service/repository"
)

// EventSettlementScheduler tự động quét và giải phóng pending_balance sang available_balance cho sự kiện kết thúc
type EventSettlementScheduler struct {
	db         *sql.DB
	ticketRepo *repository.TicketRepository
	interval   time.Duration
	stopChan   chan bool
}

// NewEventSettlementScheduler khởi tạo scheduler với kết nối DB
func NewEventSettlementScheduler(dbConn *sql.DB, intervalMinutes int) *EventSettlementScheduler {
	return &EventSettlementScheduler{
		db:         dbConn,
		ticketRepo: repository.NewTicketRepositoryWithDB(dbConn),
		interval:   time.Duration(intervalMinutes) * time.Minute,
		stopChan:   make(chan bool),
	}
}

// Start bắt đầu tiến trình chạy định kỳ
func (s *EventSettlementScheduler) Start() {
	log.Printf("[SETTLEMENT_SCHEDULER] Event settlement job started (interval: %v, local ticker: %v)",
		s.interval, isLocalMode())

	// Chạy kiểm tra ngay khi khởi động
	s.settleEndedEvents()

	if isLocalMode() {
		ticker := time.NewTicker(s.interval)
		go func() {
			for {
				select {
				case <-ticker.C:
					s.settleEndedEvents()
				case <-s.stopChan:
					ticker.Stop()
					log.Println("[SETTLEMENT_SCHEDULER] Event settlement job stopped")
					return
				}
			}
		}()
	}
}

// RunOnce kích hoạt chạy một lần (cho EventBridge / Lambda trigger)
func (s *EventSettlementScheduler) RunOnce() {
	s.settleEndedEvents()
}

// Stop dừng scheduler
func (s *EventSettlementScheduler) Stop() {
	close(s.stopChan)
}

func (s *EventSettlementScheduler) settleEndedEvents() {
	ctx := context.Background()

	// Tìm các sự kiện đã FINISHED hoặc đã qua end_time nhưng chưa được quyết toán (is_settled = FALSE)
	query := `
		SELECT event_id, title, status, end_time
		FROM Event
		WHERE (status = 'FINISHED' OR (status = 'OPEN' AND end_time < NOW()))
		  AND (is_settled IS FALSE OR is_settled IS NULL)
	`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		log.Printf("[SETTLEMENT_SCHEDULER] Error querying unsettled events: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var eventID int
		var title string
		var status string
		var endTime time.Time

		if err := rows.Scan(&eventID, &title, &status, &endTime); err != nil {
			log.Printf("[SETTLEMENT_SCHEDULER] Error scanning row: %v", err)
			continue
		}

		// Nếu status chưa là FINISHED, cập nhật sang FINISHED
		if status != "FINISHED" {
			_, err = s.db.ExecContext(ctx, "UPDATE Event SET status = 'FINISHED' WHERE event_id = $1", eventID)
			if err != nil {
				log.Printf("[SETTLEMENT_SCHEDULER] Error setting event #%d to FINISHED: %v", eventID, err)
				continue
			}
		}

		// Thực hiện giải phóng pending_balance sang available_balance
		if err := s.ticketRepo.ReleaseEventPendingPayout(ctx, eventID); err != nil {
			log.Printf("[SETTLEMENT_SCHEDULER] Error releasing payout for event #%d: %v", eventID, err)
		} else {
			log.Printf("[SETTLEMENT_SCHEDULER] ✅ Successfully settled and released payout for event #%d: %s", eventID, title)
		}
	}
}
