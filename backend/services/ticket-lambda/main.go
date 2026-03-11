package main

import (
	"context"
	"database/sql"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/localserver"
	"github.com/fpt-event-services/common/logger"
	tracer "github.com/fpt-event-services/common/xray"
	"github.com/fpt-event-services/services/ticket-lambda/handler"
)

var (
	ticketHandler          *handler.TicketHandler
	ticketInternalHandler  *handler.TicketInternalHandler
	walletInternalHandler  *handler.WalletInternalHandler
	ticketSchedulerHandler *handler.TicketSchedulerHandler
)

func init() {
	tracer.Configure("ticket-service")

	// Log feature flags on startup
	config.LogFeatureFlags()

	// Initialize database connection
	var dbConn *sql.DB
	if config.IsFeatureEnabled(config.FlagServiceSpecificDB) {
		// Service-specific DB: independent connection pool for ticket-lambda
		var err error
		dbConn, err = db.InitServiceDB("TICKET")
		if err != nil {
			logger.Default().Fatal("Failed to initialize service-specific database: %v", err)
		}
	} else {
		// Shared DB: use global singleton
		if err := db.InitDB(); err != nil {
			logger.Default().Fatal("Failed to initialize database: %v", err)
		}
		dbConn = db.GetDB()
	}

	// Initialize handlers with explicit DB connection (DI from main)
	ticketHandler = handler.NewTicketHandlerWithDB(dbConn)
	ticketInternalHandler = handler.NewTicketInternalHandlerWithDB(dbConn)
	walletInternalHandler = handler.NewWalletInternalHandlerWithDB(dbConn)
	ticketSchedulerHandler = handler.NewTicketSchedulerHandlerWithDB(dbConn)
}

// Handler routes all API Gateway requests to the appropriate handler
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	path := request.Path
	method := request.HTTPMethod

	// ========== Health Check ==========
	if path == "/health" && method == "GET" {
		return events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"status":"UP","service":"ticket"}`,
			Headers:    map[string]string{"Content-Type": "application/json"},
		}, nil
	}

	// ========== Scheduler Trigger Routes (EventBridge in AWS / goroutine in Local) ==========
	if path == "/internal/scheduler/pending-ticket-cleanup" && method == "POST" {
		return ticketSchedulerHandler.HandlePendingTicketCleanup(ctx, request)
	}

	// ========== Internal Wallet Routes ==========
	if strings.HasPrefix(path, "/internal/wallet/") {
		switch {
		case path == "/internal/wallet/balance" && method == "GET":
			return walletInternalHandler.HandleGetBalance(ctx, request)
		case path == "/internal/wallet/check" && method == "GET":
			return walletInternalHandler.HandleCheckBalance(ctx, request)
		case path == "/internal/wallet/debit" && method == "POST":
			return walletInternalHandler.HandleDebit(ctx, request)
		case path == "/internal/wallet/credit" && method == "POST":
			return walletInternalHandler.HandleCredit(ctx, request)
		case path == "/internal/wallet/reserve" && method == "POST":
			return walletInternalHandler.HandleReserve(ctx, request)
		case path == "/internal/wallet/confirm" && method == "POST":
			return walletInternalHandler.HandleConfirm(ctx, request)
		case path == "/internal/wallet/release" && method == "POST":
			return walletInternalHandler.HandleRelease(ctx, request)
		}
	}

	// ========== Internal Ticket Routes ==========
	if strings.HasPrefix(path, "/internal/") {
		switch {
		case path == "/internal/category-ticket/info" && method == "GET":
			return ticketInternalHandler.HandleGetCategoryTicketInfo(ctx, request)
		case path == "/internal/category-tickets/by-event" && method == "GET":
			return ticketInternalHandler.HandleGetCategoryTicketsByEvent(ctx, request)
		case path == "/internal/tickets/seat-statuses" && method == "GET":
			return ticketInternalHandler.HandleGetSeatStatuses(ctx, request)
		case path == "/internal/ticket/count" && method == "GET":
			return ticketInternalHandler.HandleGetTicketStats(ctx, request)
		case path == "/internal/ticket/refund" && method == "POST":
			return ticketInternalHandler.HandleRefundTicket(ctx, request)
		case path == "/internal/ticket/revert-refund" && method == "POST":
			return ticketInternalHandler.HandleRevertRefund(ctx, request)
		case path == "/internal/ticket/checkin" && method == "POST":
			return ticketInternalHandler.HandleCheckinTicket(ctx, request)
		case path == "/internal/ticket/checkout" && method == "POST":
			return ticketInternalHandler.HandleCheckoutTicket(ctx, request)
		case path == "/internal/ticket/info" && method == "GET":
			return ticketInternalHandler.HandleGetTicketInfo(ctx, request)
		case path == "/internal/tickets/refund-all-by-event" && method == "POST":
			return ticketInternalHandler.HandleRefundAllByEvent(ctx, request)
		}
	}

	// ========== Public Routes ==========
	switch {
	case path == "/api/registrations/my-tickets" && method == "GET":
		return ticketHandler.HandleGetMyTickets(ctx, request)
	case path == "/api/tickets/list" && method == "GET":
		return ticketHandler.HandleGetTicketList(ctx, request)
	case path == "/api/category-tickets" && method == "GET":
		return ticketHandler.HandleGetCategoryTickets(ctx, request)
	case path == "/api/bills/my-bills" && method == "GET":
		return ticketHandler.HandleGetMyBills(ctx, request)
	case path == "/api/payment/my-bills" && method == "GET":
		return ticketHandler.HandleGetMyBills(ctx, request)
	case path == "/api/payment-ticket" && method == "GET":
		return ticketHandler.HandlePaymentTicket(ctx, request)
	case path == "/api/buyTicket" && method == "GET":
		return ticketHandler.HandleBuyTicket(ctx, request)
	case path == "/api/wallet/balance" && method == "GET":
		return ticketHandler.HandleGetWalletBalance(ctx, request)
	case path == "/api/wallet/pay-ticket" && method == "POST":
		return ticketHandler.HandleWalletPayTicket(ctx, request)
	}

	return events.APIGatewayProxyResponse{
		StatusCode: 404,
		Body:       `{"error":"Not Found"}`,
		Headers:    map[string]string{"Content-Type": "application/json"},
	}, nil
}

func main() {
	// Load .env and sync JWT secret FIRST — in main() so it's guaranteed
	// to run after all package-level vars and init() functions are done.
	localserver.LoadEnvAndSyncJWT("Ticket")

	if localserver.IsLocal() {
		// Start background schedulers only in local mode (goroutine tickers)
		ticketSchedulerHandler.StartSchedulers()
		localserver.Start("8083", Handler)
	} else {
		lambda.Start(Handler)
	}
}
