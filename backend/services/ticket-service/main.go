package main

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/localserver"
	"github.com/fpt-event-services/common/logger"
	tracer "github.com/fpt-event-services/common/xray"
	"github.com/fpt-event-services/services/ticket-service/handler"
)

var (
	ticketHandler          *handler.TicketHandler
	ticketInternalHandler  *handler.TicketInternalHandler
	walletInternalHandler  *handler.WalletInternalHandler
	ticketSchedulerHandler *handler.TicketSchedulerHandler
)

func init() {
	// Load .env and sync JWT secret FIRST before database/config variables rely on them
	localserver.LoadEnvAndSyncJWT("Ticket")

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
	if path == "/internal/scheduler/event-settlement" && method == "POST" {
		return ticketSchedulerHandler.HandleEventSettlement(ctx, request)
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
		case path == "/internal/scheduler/pending-ticket-cleanup" && method == "POST":
			return ticketSchedulerHandler.HandlePendingTicketCleanup(ctx, request)
		case path == "/internal/scheduler/event-settlement" && method == "POST":
			return ticketSchedulerHandler.HandleEventSettlement(ctx, request)
		case path == "/internal/scheduler/subscription-expiry" && method == "POST":
			return ticketSchedulerHandler.HandleSubscriptionExpiry(ctx, request)
		}
	}

	// ========== API Routes (Internal Access via /api/internal prefix) ==========
	if strings.HasPrefix(path, "/api/internal/wallet/") {
		switch {
		case path == "/api/internal/wallet/balance" && method == "GET":
			return walletInternalHandler.HandleGetBalance(ctx, request)
		case path == "/api/internal/wallet/check" && method == "GET":
			return walletInternalHandler.HandleCheckBalance(ctx, request)
		case path == "/api/internal/wallet/debit" && method == "POST":
			return walletInternalHandler.HandleDebit(ctx, request)
		case path == "/api/internal/wallet/credit" && method == "POST":
			return walletInternalHandler.HandleCredit(ctx, request)
		case path == "/api/internal/wallet/reserve" && method == "POST":
			return walletInternalHandler.HandleReserve(ctx, request)
		case path == "/api/internal/wallet/confirm" && method == "POST":
			return walletInternalHandler.HandleConfirm(ctx, request)
		case path == "/api/internal/wallet/release" && method == "POST":
			return walletInternalHandler.HandleRelease(ctx, request)
		}
	}

	if strings.HasPrefix(path, "/api/internal/") {
		switch {
		case path == "/api/internal/category-ticket/info" && method == "GET":
			return ticketInternalHandler.HandleGetCategoryTicketInfo(ctx, request)
		case path == "/api/internal/category-tickets/by-event" && method == "GET":
			return ticketInternalHandler.HandleGetCategoryTicketsByEvent(ctx, request)
		case path == "/api/internal/tickets/seat-statuses" && method == "GET":
			return ticketInternalHandler.HandleGetSeatStatuses(ctx, request)
		case path == "/api/internal/ticket/count" && method == "GET":
			return ticketInternalHandler.HandleGetTicketStats(ctx, request)
		case path == "/api/internal/ticket/refund" && method == "POST":
			return ticketInternalHandler.HandleRefundTicket(ctx, request)
		case path == "/api/internal/ticket/revert-refund" && method == "POST":
			return ticketInternalHandler.HandleRevertRefund(ctx, request)
		case path == "/api/internal/ticket/checkin" && method == "POST":
			return ticketInternalHandler.HandleCheckinTicket(ctx, request)
		case path == "/api/internal/ticket/checkout" && method == "POST":
			return ticketInternalHandler.HandleCheckoutTicket(ctx, request)
		case path == "/api/internal/ticket/info" && method == "GET":
			return ticketInternalHandler.HandleGetTicketInfo(ctx, request)
		case path == "/api/internal/tickets/refund-all-by-event" && method == "POST":
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
	case path == "/api/attendance/confirm" && method == "POST":
		return ticketHandler.HandleConfirmAttendance(ctx, request)

	case path == "/api/payment/create-order" && method == "POST":
		return ticketHandler.HandleCreateBankTransferOrder(ctx, request)
	case (path == "/api/payment/cancel" || path == "/api/payment/cancel-order") && method == "POST":
		return ticketHandler.HandleCancelOrder(ctx, request)
	case path == "/api/payment/payos-webhook" && method == "POST":
		return ticketHandler.HandlePayOSWebhook(ctx, request)
	case path == "/api/payment/sepay-webhook" && method == "POST":
		return ticketHandler.HandleSePayWebhook(ctx, request)
	case path == "/api/payment/active-order" && method == "GET":
		return ticketHandler.HandleGetActiveOrder(ctx, request)
	case strings.HasPrefix(path, "/api/payment/check-status/") && method == "GET":
		return ticketHandler.HandleCheckPaymentStatus(ctx, request)
	case path == "/api/wallet/balance" && method == "GET":
		return ticketHandler.HandleGetWalletBalance(ctx, request)
	case path == "/api/wallet/pay-ticket" && method == "POST":
		return ticketHandler.HandleWalletPayTicket(ctx, request)

	// ========== Organizer Wallet & Settlement Routes ==========
	case path == "/api/v1/organizer/wallet" && method == "GET":
		return ticketHandler.HandleGetOrganizerWallet(ctx, request)
	case path == "/api/v1/organizer/wallet/transactions" && method == "GET":
		return ticketHandler.HandleGetOrganizerWalletTransactions(ctx, request)
	case strings.HasPrefix(path, "/api/v1/organizer/events/") && strings.HasSuffix(path, "/financial-report") && method == "GET":
		return ticketHandler.HandleGetEventFinancialReport(ctx, request)
	case path == "/api/v1/organizer/wallet/topup" && method == "POST":
		return ticketHandler.HandleOrganizerWalletTopup(ctx, request)
	case path == "/api/v1/organizer/bank-accounts" && method == "POST":
		return ticketHandler.HandleCreateOrganizerBankAccount(ctx, request)
	case path == "/api/v1/organizer/bank-accounts" && method == "GET":
		return ticketHandler.HandleGetOrganizerBankAccounts(ctx, request)
	case path == "/api/v1/organizer/wallet/payout" && method == "POST":
		return ticketHandler.HandleRequestPayout(ctx, request)
	case (path == "/api/v1/organizer/wallet/payouts" || path == "/api/v1/organizer/payouts") && method == "GET":
		return ticketHandler.HandleGetPayoutRequests(ctx, request)
	case strings.HasPrefix(path, "/api/v1/organizer/events/") && strings.HasSuffix(path, "/settle") && method == "POST":
		return ticketHandler.HandleSettleEventPayout(ctx, request)

	// ========== Admin Financial Center Routes ==========
	case path == "/api/v1/admin/finance/overview" && method == "GET":
		return ticketHandler.HandleGetAdminFinanceOverview(ctx, request)
	case path == "/api/v1/admin/finance/payouts" && method == "GET":
		return ticketHandler.HandleGetAdminPayouts(ctx, request)
	case strings.HasPrefix(path, "/api/v1/admin/finance/payouts/") && strings.HasSuffix(path, "/process") && method == "POST":
		return ticketHandler.HandleProcessAdminPayout(ctx, request)
	case path == "/api/v1/admin/finance/receipts" && method == "GET":
		return ticketHandler.HandleGetAdminFinancialReceipts(ctx, request)
	case path == "/api/v1/admin/finance/receipts/export" && method == "GET":
		return ticketHandler.HandleExportAdminFinancialReceipts(ctx, request)
	case path == "/api/v1/admin/finance/subscriptions" && method == "GET":
		return ticketHandler.HandleGetAdminSubscriptionAnalytics(ctx, request)

	// ========== Subscription Lifecycle Routes (Pha 3) ==========
	case path == "/api/v1/subscription/tiers" && method == "GET":
		return ticketHandler.HandleGetSubscriptionTiers(ctx, request)
	case path == "/api/v1/subscription/current" && method == "GET":
		return ticketHandler.HandleGetCurrentSubscription(ctx, request)
	case path == "/api/v1/subscription/subscribe" && method == "POST":
		return ticketHandler.HandleSubscribeOrUpgrade(ctx, request)
	case path == "/api/v1/subscription/preview-upgrade" && method == "POST":
		return ticketHandler.HandlePreviewUpgrade(ctx, request)
	case path == "/api/v1/subscription/downgrade" && method == "POST":
		return ticketHandler.HandleScheduleDowngrade(ctx, request)
	case path == "/api/v1/subscription/cancel" && method == "POST":
		return ticketHandler.HandleCancelSubscription(ctx, request)
	case path == "/api/v1/fee-policy/public-parameters" && method == "GET":
		return ticketHandler.HandleGetPublicFeeParameters(ctx, request)

	// ========== Admin Fee & Policy Management Routes (Pha 4) ==========
	case path == "/api/v1/admin/role-policies" && method == "GET":
		return ticketHandler.HandleGetRoleFeePolicies(ctx, request)
	case path == "/api/v1/admin/role-policies" && method == "PUT":
		return ticketHandler.HandleUpdateRoleFeePolicy(ctx, request)
	case path == "/api/v1/admin/subscription-tiers" && method == "GET":
		return ticketHandler.HandleGetAdminSubscriptionTiers(ctx, request)
	case path == "/api/v1/admin/subscription-tiers" && method == "POST":
		return ticketHandler.HandleCreateAdminSubscriptionTier(ctx, request)
	case path == "/api/v1/admin/subscription-tiers" && method == "PUT":
		return ticketHandler.HandleUpdateAdminSubscriptionTier(ctx, request)
	case path == "/api/v1/admin/subscription-tiers" && method == "DELETE":
		return ticketHandler.HandleDeleteAdminSubscriptionTier(ctx, request)
	case path == "/api/v1/admin/fee-overrides" && method == "GET":
		return ticketHandler.HandleGetFeeOverrides(ctx, request)
	case path == "/api/v1/admin/fee-overrides" && method == "POST":
		return ticketHandler.HandleCreateFeeOverride(ctx, request)
	case path == "/api/v1/admin/fee-overrides" && method == "DELETE":
		return ticketHandler.HandleDeleteFeeOverride(ctx, request)
	case path == "/api/v1/admin/users/school-role" && method == "POST":
		return ticketHandler.HandleAssignSchoolOrganizerRole(ctx, request)
	case path == "/api/v1/admin/users/school-role" && method == "DELETE":
		return ticketHandler.HandleRevokeSchoolOrganizerRole(ctx, request)
	case path == "/api/v1/admin/system-parameters" && method == "GET":
		return ticketHandler.HandleGetSystemParameters(ctx, request)
	case path == "/api/v1/admin/system-parameters" && method == "PUT":
		return ticketHandler.HandleUpdateSystemParameter(ctx, request)
	case path == "/api/v1/admin/fee-sandbox/simulate" && method == "POST":
		return ticketHandler.HandleSimulateFeeCalculation(ctx, request)
	case path == "/api/v1/admin/fee-audit-logs" && method == "GET":
		return ticketHandler.HandleGetFeeAuditLogs(ctx, request)

	// ========== Event Financial Overview & Advanced Analytics Routes (Pha 5 & 6) ==========
	case strings.HasPrefix(path, "/api/v1/organizer/events/") && strings.HasSuffix(path, "/financial-overview") && method == "GET":
		return ticketHandler.HandleGetEventFinancialOverview(ctx, request)
	case strings.HasPrefix(path, "/api/v1/organizer/events/") && strings.HasSuffix(path, "/check-in-list") && method == "GET":
		return ticketHandler.HandleGetEventCheckInList(ctx, request)
	case strings.HasPrefix(path, "/api/v1/organizer/events/") && strings.HasSuffix(path, "/seat-status") && method == "GET":
		return ticketHandler.HandleGetEventSeatStatus(ctx, request)
	case strings.HasPrefix(path, "/api/v1/organizer/events/") && strings.HasSuffix(path, "/advanced-analytics") && method == "GET":
		return ticketHandler.HandleGetEventAdvancedAnalytics(ctx, request)
	case strings.HasPrefix(path, "/api/v1/organizer/events/") && strings.HasSuffix(path, "/export-csv") && method == "GET":
		return ticketHandler.HandleExportEventCSV(ctx, request)
	}

	return events.APIGatewayProxyResponse{
		StatusCode: 404,
		Body:       `{"error":"Not Found"}`,
		Headers:    map[string]string{"Content-Type": "application/json"},
	}, nil
}

func main() {
	loc, _ := time.LoadLocation("Asia/Ho_Chi_Minh")
	time.Local = loc

	handlerWithAuth := localserver.WithJWTAuth(Handler)

	if localserver.IsLocal() {
		// Start background schedulers only in local mode (goroutine tickers)
		ticketSchedulerHandler.StartSchedulers()
		localserver.Start("8083", handlerWithAuth)
	} else {
		lambda.Start(handlerWithAuth)
	}
}
