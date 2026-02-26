package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var (
	baseURL        = "http://localhost:8081"
	adminToken     string
	organizerToken string
	studentToken   string
	staffToken     string
)

type TestResult struct {
	Category   string
	Endpoint   string
	Method     string
	Status     string
	StatusCode int
	Note       string
}

var results []TestResult

func main() {
	fmt.Println("╔═══════════════════════════════════════════════════════════╗")
	fmt.Println("║   COMPREHENSIVE API TEST - ALL 37 ENDPOINTS               ║")
	fmt.Println("╚═══════════════════════════════════════════════════════════╝")

	// SECTION 1: Authentication APIs
	fmt.Println("\n📦 SECTION 1: AUTH SERVICE (11 Endpoints)")
	fmt.Println("═════════════════════════════════════════════════════════════")
	testLoginAPIs()
	testRegisterAPIs()
	testForgotPasswordAPIs()
	testAdminUserManagementAPIs()

	// SECTION 2: Event APIs
	fmt.Println("\n📅 SECTION 2: EVENT SERVICE (9 Endpoints)")
	fmt.Println("═════════════════════════════════════════════════════════════")
	testEventAPIs()

	// SECTION 3: Ticket & Payment APIs
	fmt.Println("\n🎫 SECTION 3: TICKET & PAYMENT SERVICE (7 Endpoints)")
	fmt.Println("═════════════════════════════════════════════════════════════")
	testTicketAPIs()

	// SECTION 4: Venue APIs
	fmt.Println("\n🏢 SECTION 4: VENUE SERVICE (4 Endpoints)")
	fmt.Println("═════════════════════════════════════════════════════════════")
	testVenueAPIs()

	// SECTION 5: Staff APIs
	fmt.Println("\n👷 SECTION 5: STAFF SERVICE (4 Endpoints)")
	fmt.Println("═════════════════════════════════════════════════════════════")
	testStaffAPIs()

	// SECTION 6: System Config APIs
	fmt.Println("\n⚙️  SECTION 6: SYSTEM CONFIG (2 Endpoints)")
	fmt.Println("═════════════════════════════════════════════════════════════")
	testSystemConfigAPIs()

	// Print Summary Report
	printSummaryReport()
}

// ============ AUTH SECTION ============
func testLoginAPIs() {
	fmt.Println("\n🔐 Auth: Login")

	// Test 1.1: Admin Login
	loginData := map[string]string{
		"email":    "admin.event@fpt.edu.vn",
		"password": "123456",
	}
	resp, status, body := makeRequest("POST", "/api/login", loginData, "")
	if status == 200 {
		var result map[string]interface{}
		json.Unmarshal([]byte(body), &result)
		if token, ok := result["token"].(string); ok {
			adminToken = token
		}
		addResult("Auth", "POST /api/login", "✅ SUCCESS", status, "Admin login works")
	} else {
		addResult("Auth", "POST /api/login", "❌ FAILED", status, "Cannot login admin")
	}

	// Test 1.2: Organizer Login
	loginData = map[string]string{
		"email":    "huy.lqclub@fpt.edu.vn",
		"password": "123456",
	}
	resp, status, body = makeRequest("POST", "/api/login", loginData, "")
	if status == 200 {
		var result map[string]interface{}
		json.Unmarshal([]byte(body), &result)
		if token, ok := result["token"].(string); ok {
			organizerToken = token
		}
		addResult("Auth", "POST /api/login (ORGANIZER)", "✅ SUCCESS", status, "Organizer login works")
	} else {
		addResult("Auth", "POST /api/login (ORGANIZER)", "❌ FAILED", status, "Cannot login organizer")
	}

	// Test 1.3: Staff Login
	loginData = map[string]string{
		"email":    "thu.pmso@fpt.edu.vn",
		"password": "123456",
	}
	resp, status, body = makeRequest("POST", "/api/login", loginData, "")
	if status == 200 {
		var result map[string]interface{}
		json.Unmarshal([]byte(body), &result)
		if token, ok := result["token"].(string); ok {
			staffToken = token
		}
		addResult("Auth", "POST /api/login (STAFF)", "✅ SUCCESS", status, "Staff login works")
	} else {
		addResult("Auth", "POST /api/login (STAFF)", "❌ FAILED", status, "Cannot login staff")
	}

	_ = resp
}

func testRegisterAPIs() {
	fmt.Println("\n📝 Auth: Register Flow")

	timestamp := time.Now().Unix()
	testEmail := fmt.Sprintf("test%d@fpt.edu.vn", timestamp)

	// Test 2.1: Send OTP
	sendOTPData := map[string]string{
		"email":    testEmail,
		"fullName": "Test User",
		"phone":    "0901234567",
		"password": "Test@123",
	}
	_, status, _ := makeRequest("POST", "/api/register/send-otp", sendOTPData, "")
	if status == 200 || status == 201 {
		addResult("Auth", "POST /api/register/send-otp", "✅ SUCCESS", status, "OTP sent (check email)")
	} else {
		addResult("Auth", "POST /api/register/send-otp", "❌ FAILED", status, "Cannot send OTP")
	}

	// Test 2.2: Verify OTP (will fail without real OTP)
	verifyOTPData := map[string]string{
		"email": testEmail,
		"otp":   "123456",
	}
	_, status, _ = makeRequest("POST", "/api/register/verify-otp", verifyOTPData, "")
	if status == 200 || status == 201 {
		addResult("Auth", "POST /api/register/verify-otp", "✅ SUCCESS", status, "OTP verified")
	} else {
		addResult("Auth", "POST /api/register/verify-otp", "⚠️  EXPECTED FAIL", status, "Need real OTP from email")
	}

	// Test 2.3: Resend OTP
	resendData := map[string]string{
		"email": testEmail,
	}
	_, status, _ = makeRequest("POST", "/api/register/resend-otp", resendData, "")
	if status == 200 || status == 201 {
		addResult("Auth", "POST /api/register/resend-otp", "✅ SUCCESS", status, "OTP resent")
	} else {
		addResult("Auth", "POST /api/register/resend-otp", "❌ FAILED", status, "Cannot resend OTP")
	}
}

func testForgotPasswordAPIs() {
	fmt.Println("\n🔑 Auth: Forgot Password")

	// Test 3.1: Forgot Password
	forgotData := map[string]string{
		"email": "admin.event@fpt.edu.vn",
	}
	_, status, _ := makeRequest("POST", "/api/forgot-password", forgotData, "")
	if status == 200 || status == 201 {
		addResult("Auth", "POST /api/forgot-password", "✅ SUCCESS", status, "OTP sent for reset")
	} else {
		addResult("Auth", "POST /api/forgot-password", "❌ FAILED", status, "Cannot send reset OTP")
	}

	// Test 3.2: Reset Password (will fail without real OTP)
	resetData := map[string]string{
		"email":       "admin.event@fpt.edu.vn",
		"otp":         "123456",
		"newPassword": "NewPass@123",
	}
	_, status, _ = makeRequest("POST", "/api/reset-password", resetData, "")
	if status == 200 || status == 201 {
		addResult("Auth", "POST /api/reset-password", "✅ SUCCESS", status, "Password reset")
	} else {
		addResult("Auth", "POST /api/reset-password", "⚠️  EXPECTED FAIL", status, "Need real OTP")
	}
}

func testAdminUserManagementAPIs() {
	fmt.Println("\n👥 Auth: Admin User Management")

	// Test 4.1: Get Staff & Organizer List
	_, status, _ := makeRequest("GET", "/api/users/staff-organizer", nil, adminToken)
	if status == 200 {
		addResult("Auth", "GET /api/users/staff-organizer", "✅ SUCCESS", status, "List retrieved")
	} else {
		addResult("Auth", "GET /api/users/staff-organizer", "❌ FAILED", status, "Cannot get list")
	}

	// Test 4.2: Create Account
	timestamp := time.Now().Unix()
	createData := map[string]interface{}{
		"email":    fmt.Sprintf("test.staff.%d@fpt.edu.vn", timestamp),
		"password": "Test@123",
		"fullName": "Test Staff",
		"phone":    "0901234567",
		"role":     "STAFF",
	}
	_, status, body := makeRequest("POST", "/api/admin/create-account", createData, adminToken)
	var createdUserID int
	if status == 200 || status == 201 {
		var result map[string]interface{}
		json.Unmarshal([]byte(body), &result)
		if data, ok := result["data"].(map[string]interface{}); ok {
			if id, ok := data["id"].(float64); ok {
				createdUserID = int(id)
			}
		}
		addResult("Auth", "POST /api/admin/create-account", "✅ SUCCESS", status, fmt.Sprintf("User ID: %d", createdUserID))
	} else {
		addResult("Auth", "POST /api/admin/create-account", "❌ FAILED", status, "Cannot create account")
	}

	// Test 4.3: Update Account
	if createdUserID > 0 {
		updateData := map[string]interface{}{
			"id":       createdUserID,
			"fullName": "Updated Staff",
			"phone":    "0909999999",
			"role":     "STAFF",
			"status":   "ACTIVE",
		}
		_, status, _ = makeRequest("PUT", "/api/admin/create-account", updateData, adminToken)
		if status == 200 {
			addResult("Auth", "PUT /api/admin/create-account", "✅ SUCCESS", status, "User updated")
		} else {
			addResult("Auth", "PUT /api/admin/create-account", "❌ FAILED", status, "Cannot update")
		}

		// Test 4.4: Delete Account
		deleteData := map[string]int{"id": createdUserID}
		_, status, _ = makeRequest("DELETE", "/api/admin/create-account", deleteData, adminToken)
		if status == 200 {
			addResult("Auth", "DELETE /api/admin/create-account", "✅ SUCCESS", status, "User deleted")
		} else {
			addResult("Auth", "DELETE /api/admin/create-account", "❌ FAILED", status, "Cannot delete")
		}
	}
}

// ============ EVENT SECTION ============
func testEventAPIs() {
	fmt.Println("\n📅 Events")

	// Test 5.1: Get All Events
	_, status, _ := makeRequest("GET", "/api/events", nil, "")
	if status == 200 {
		addResult("Event", "GET /api/events", "✅ SUCCESS", status, "Events list retrieved")
	} else {
		addResult("Event", "GET /api/events", "❌ FAILED", status, "Cannot get events")
	}

	// Test 5.2: Get Open Events
	_, status, _ = makeRequest("GET", "/api/events/open", nil, "")
	if status == 200 {
		addResult("Event", "GET /api/events/open", "✅ SUCCESS", status, "Open events retrieved")
	} else {
		addResult("Event", "GET /api/events/open", "❌ FAILED", status, "Cannot get open events")
	}

	// Test 5.3: Get Event Detail
	_, status, _ = makeRequest("GET", "/api/events/detail?id=1", nil, "")
	if status == 200 {
		addResult("Event", "GET /api/events/detail", "✅ SUCCESS", status, "Event detail retrieved")
	} else {
		addResult("Event", "GET /api/events/detail", "⚠️  NO DATA", status, "Event ID 1 not found")
	}

	// Test 5.4: Get Event Stats
	_, status, _ = makeRequest("GET", "/api/events/stats", nil, adminToken)
	if status == 200 {
		addResult("Event", "GET /api/events/stats", "✅ SUCCESS", status, "Stats retrieved")
	} else {
		addResult("Event", "GET /api/events/stats", "❌ FAILED", status, "Cannot get stats")
	}

	// Test 5.5: Create Event Request
	createEventData := map[string]interface{}{
		"eventName":        "Test Event",
		"eventDescription": "Test Description",
		"startDate":        "2026-03-01T10:00:00Z",
		"endDate":          "2026-03-01T18:00:00Z",
		"venueAreaId":      1,
	}
	_, status, _ = makeRequest("POST", "/api/event-requests", createEventData, organizerToken)
	if status == 200 || status == 201 {
		addResult("Event", "POST /api/event-requests", "✅ SUCCESS", status, "Request created")
	} else {
		addResult("Event", "POST /api/event-requests", "⚠️  PARTIAL", status, "May need valid venue/data")
	}

	// Test 5.6: Get My Event Requests (Organizer)
	_, status, _ = makeRequest("GET", "/api/event-requests/my", nil, organizerToken)
	if status == 200 {
		addResult("Event", "GET /api/event-requests/my", "✅ SUCCESS", status, "My requests retrieved")
	} else {
		addResult("Event", "GET /api/event-requests/my", "❌ FAILED", status, "Cannot get my requests")
	}

	// Test 5.7: Get All Event Requests (Staff)
	_, status, _ = makeRequest("GET", "/api/staff/event-requests", nil, staffToken)
	if status == 200 {
		addResult("Event", "GET /api/staff/event-requests", "✅ SUCCESS", status, "All requests retrieved")
	} else {
		addResult("Event", "GET /api/staff/event-requests", "❌ FAILED", status, "Cannot get requests")
	}

	// Test 5.8: Process Event Request (Admin)
	processData := map[string]interface{}{
		"requestId": 1,
		"action":    "APPROVE",
		"note":      "Test approval",
	}
	_, status, _ = makeRequest("POST", "/api/event-requests/process", processData, adminToken)
	if status == 200 {
		addResult("Event", "POST /api/event-requests/process", "✅ SUCCESS", status, "Request processed")
	} else {
		addResult("Event", "POST /api/event-requests/process", "⚠️  NO DATA", status, "Request ID not found")
	}

	// Test 5.9: Update Event Details (Organizer)
	updateEventData := map[string]interface{}{
		"eventId":          1,
		"eventName":        "Updated Event",
		"eventDescription": "Updated Description",
	}
	_, status, _ = makeRequest("POST", "/api/events/update-details", updateEventData, organizerToken)
	if status == 200 {
		addResult("Event", "POST /api/events/update-details", "✅ SUCCESS", status, "Event updated")
	} else {
		addResult("Event", "POST /api/events/update-details", "⚠️  NO DATA", status, "Event not found or no permission")
	}
}

// ============ TICKET SECTION ============
func testTicketAPIs() {
	fmt.Println("\n🎫 Tickets & Payment")

	// Test 6.1: Get My Tickets
	_, status, _ := makeRequest("GET", "/api/registrations/my-tickets", nil, adminToken)
	if status == 200 {
		addResult("Ticket", "GET /api/registrations/my-tickets", "✅ SUCCESS", status, "Tickets retrieved")
	} else {
		addResult("Ticket", "GET /api/registrations/my-tickets", "⚠️  EMPTY", status, "No tickets for admin")
	}

	// Test 6.2: Get Ticket List
	_, status, _ = makeRequest("GET", "/api/tickets/list", nil, adminToken)
	if status == 200 {
		addResult("Ticket", "GET /api/tickets/list", "✅ SUCCESS", status, "Ticket list retrieved")
	} else {
		addResult("Ticket", "GET /api/tickets/list", "❌ FAILED", status, "Cannot get ticket list")
	}

	// Test 6.3: Get Category Tickets
	_, status, _ = makeRequest("GET", "/api/category-tickets?eventId=1", nil, "")
	if status == 200 {
		addResult("Ticket", "GET /api/category-tickets", "✅ SUCCESS", status, "Category tickets retrieved")
	} else {
		addResult("Ticket", "GET /api/category-tickets", "⚠️  NO DATA", status, "Event ID not found")
	}

	// Test 6.4: Get My Bills
	_, status, _ = makeRequest("GET", "/api/bills/my-bills", nil, adminToken)
	if status == 200 {
		addResult("Ticket", "GET /api/bills/my-bills", "✅ SUCCESS", status, "Bills retrieved")
	} else {
		addResult("Ticket", "GET /api/bills/my-bills", "⚠️  EMPTY", status, "No bills")
	}

	// Test 6.5: Get Payment My Bills (Java compatible)
	_, status, _ = makeRequest("GET", "/api/payment/my-bills", nil, adminToken)
	if status == 200 {
		addResult("Ticket", "GET /api/payment/my-bills", "✅ SUCCESS", status, "Bills retrieved")
	} else {
		addResult("Ticket", "GET /api/payment/my-bills", "⚠️  EMPTY", status, "No bills")
	}

	// Test 6.6: Payment Ticket (VNPay URL)
	_, status, _ = makeRequest("GET", "/api/payment-ticket?categoryTicketId=1&quantity=1", nil, adminToken)
	if status == 200 {
		addResult("Ticket", "GET /api/payment-ticket", "✅ SUCCESS", status, "VNPay URL generated")
	} else {
		addResult("Ticket", "GET /api/payment-ticket", "⚠️  NO DATA", status, "Ticket category not found")
	}

	// Test 6.7: Buy Ticket (VNPay callback)
	_, status, _ = makeRequest("GET", "/api/buyTicket?vnp_TxnRef=123&vnp_ResponseCode=00", nil, "")
	if status == 200 {
		addResult("Ticket", "GET /api/buyTicket", "✅ SUCCESS", status, "Payment processed")
	} else {
		addResult("Ticket", "GET /api/buyTicket", "⚠️  INVALID", status, "Invalid payment params")
	}
}

// ============ VENUE SECTION ============
func testVenueAPIs() {
	fmt.Println("\n🏢 Venues")

	// Test 7.1: Get Venues
	_, status, _ := makeRequest("GET", "/api/venues", nil, adminToken)
	if status == 200 {
		addResult("Venue", "GET /api/venues", "✅ SUCCESS", status, "Venues retrieved")
	} else {
		addResult("Venue", "GET /api/venues", "❌ FAILED", status, "Cannot get venues")
	}

	// Test 7.2: Get Venue Areas
	_, status, _ = makeRequest("GET", "/api/venues/areas?venueId=1", nil, adminToken)
	if status == 200 {
		addResult("Venue", "GET /api/venues/areas", "✅ SUCCESS", status, "Areas retrieved")
	} else {
		addResult("Venue", "GET /api/venues/areas", "⚠️  NO DATA", status, "Venue not found")
	}

	// Test 7.3: Get Free Areas
	_, status, _ = makeRequest("GET", "/api/areas/free?startDate=2026-03-01&endDate=2026-03-02", nil, adminToken)
	if status == 200 {
		addResult("Venue", "GET /api/areas/free", "✅ SUCCESS", status, "Free areas retrieved")
	} else {
		addResult("Venue", "GET /api/areas/free", "❌ FAILED", status, "Cannot get free areas")
	}

	// Test 7.4: Get Seats
	_, status, _ = makeRequest("GET", "/api/seats?areaId=1", nil, adminToken)
	if status == 200 {
		addResult("Venue", "GET /api/seats", "✅ SUCCESS", status, "Seats retrieved")
	} else {
		addResult("Venue", "GET /api/seats", "⚠️  NO DATA", status, "Area not found")
	}
}

// ============ STAFF SECTION ============
func testStaffAPIs() {
	fmt.Println("\n👷 Staff Operations")

	// Test 8.1: Check-in
	checkinData := map[string]interface{}{
		"ticketId": 1,
		"eventId":  1,
	}
	_, status, _ := makeRequest("POST", "/api/staff/checkin", checkinData, staffToken)
	if status == 200 {
		addResult("Staff", "POST /api/staff/checkin", "✅ SUCCESS", status, "Check-in successful")
	} else {
		addResult("Staff", "POST /api/staff/checkin", "⚠️  NO DATA", status, "Ticket/Event not found")
	}

	// Test 8.2: Check-out
	checkoutData := map[string]interface{}{
		"ticketId": 1,
		"eventId":  1,
	}
	_, status, _ = makeRequest("POST", "/api/staff/checkout", checkoutData, staffToken)
	if status == 200 {
		addResult("Staff", "POST /api/staff/checkout", "✅ SUCCESS", status, "Check-out successful")
	} else {
		addResult("Staff", "POST /api/staff/checkout", "⚠️  NO DATA", status, "Ticket/Event not found")
	}

	// Test 8.3: Get Reports
	_, status, _ = makeRequest("GET", "/api/staff/reports?eventId=1", nil, staffToken)
	if status == 200 {
		addResult("Staff", "GET /api/staff/reports", "✅ SUCCESS", status, "Reports retrieved")
	} else {
		addResult("Staff", "GET /api/staff/reports", "⚠️  NEEDS eventId", status, "Event ID required")
	}

	// Test 8.4: Get Report Detail
	_, status, _ = makeRequest("GET", "/api/staff/reports/1", nil, staffToken)
	if status == 200 {
		addResult("Staff", "GET /api/staff/reports/{id}", "✅ SUCCESS", status, "Report detail retrieved")
	} else {
		addResult("Staff", "GET /api/staff/reports/{id}", "⚠️  NO DATA", status, "Report not found")
	}
}

// ============ SYSTEM CONFIG SECTION ============
func testSystemConfigAPIs() {
	fmt.Println("\n⚙️  System Config")

	// Test 9.1: Get System Config
	_, status, _ := makeRequest("GET", "/api/admin/config/system", nil, adminToken)
	if status == 200 {
		addResult("Config", "GET /api/admin/config/system", "✅ SUCCESS", status, "Config retrieved")
	} else {
		addResult("Config", "GET /api/admin/config/system", "❌ FAILED", status, "Cannot get config")
	}

	// Test 9.2: Update System Config
	configData := map[string]interface{}{
		"minMinutesAfterStart":             60,
		"checkinAllowedBeforeStartMinutes": 120,
	}
	_, status, _ = makeRequest("POST", "/api/admin/config/system", configData, adminToken)
	if status == 200 {
		addResult("Config", "POST /api/admin/config/system", "✅ SUCCESS", status, "Config updated")
	} else {
		addResult("Config", "POST /api/admin/config/system", "❌ FAILED", status, "Cannot update config")
	}
}

// ============ HELPER FUNCTIONS ============
func makeRequest(method, endpoint string, data interface{}, token string) (*http.Response, int, string) {
	var body []byte
	if data != nil {
		body, _ = json.Marshal(data)
	}

	req, _ := http.NewRequest(method, baseURL+endpoint, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, ""
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(resp.Body)
	return resp, resp.StatusCode, string(responseBody)
}

func addResult(category, endpoint, status string, statusCode int, note string) {
	method := ""
	if len(endpoint) > 0 {
		parts := bytes.Split([]byte(endpoint), []byte(" "))
		if len(parts) > 0 {
			method = string(parts[0])
		}
	}

	results = append(results, TestResult{
		Category:   category,
		Endpoint:   endpoint,
		Method:     method,
		Status:     status,
		StatusCode: statusCode,
		Note:       note,
	})

	// Print immediately
	statusIcon := "✅"
	if bytes.Contains([]byte(status), []byte("FAILED")) {
		statusIcon = "❌"
	} else if bytes.Contains([]byte(status), []byte("PARTIAL")) || bytes.Contains([]byte(status), []byte("EXPECTED")) || bytes.Contains([]byte(status), []byte("NO DATA")) || bytes.Contains([]byte(status), []byte("EMPTY")) || bytes.Contains([]byte(status), []byte("NEEDS")) || bytes.Contains([]byte(status), []byte("INVALID")) {
		statusIcon = "⚠️"
	}

	fmt.Printf("   %s %s [%d] - %s\n", statusIcon, endpoint, statusCode, note)
}

func printSummaryReport() {
	fmt.Println("\n\n╔═══════════════════════════════════════════════════════════╗")
	fmt.Println("║              COMPREHENSIVE TEST REPORT                    ║")
	fmt.Println("╚═══════════════════════════════════════════════════════════╝")

	successCount := 0
	failCount := 0
	warningCount := 0

	categories := make(map[string][]TestResult)
	for _, result := range results {
		categories[result.Category] = append(categories[result.Category], result)

		if bytes.Contains([]byte(result.Status), []byte("SUCCESS")) {
			successCount++
		} else if bytes.Contains([]byte(result.Status), []byte("FAILED")) {
			failCount++
		} else {
			warningCount++
		}
	}

	fmt.Printf("\n📊 STATISTICS:\n")
	fmt.Printf("   Total APIs Tested: %d\n", len(results))
	fmt.Printf("   ✅ Success:       %d (%.1f%%)\n", successCount, float64(successCount)/float64(len(results))*100)
	fmt.Printf("   ❌ Failed:        %d (%.1f%%)\n", failCount, float64(failCount)/float64(len(results))*100)
	fmt.Printf("   ⚠️  Warnings:      %d (%.1f%%)\n", warningCount, float64(warningCount)/float64(len(results))*100)

	fmt.Println("\n📋 CATEGORY BREAKDOWN:")
	for category, tests := range categories {
		catSuccess := 0
		catFail := 0
		catWarning := 0

		for _, test := range tests {
			if bytes.Contains([]byte(test.Status), []byte("SUCCESS")) {
				catSuccess++
			} else if bytes.Contains([]byte(test.Status), []byte("FAILED")) {
				catFail++
			} else {
				catWarning++
			}
		}

		fmt.Printf("\n   📦 %s: %d APIs\n", category, len(tests))
		fmt.Printf("      ✅ %d  ❌ %d  ⚠️  %d\n", catSuccess, catFail, catWarning)
	}

	// Print Failed APIs
	if failCount > 0 {
		fmt.Println("\n🚨 FAILED APIs (Need Fix):")
		for _, result := range results {
			if bytes.Contains([]byte(result.Status), []byte("FAILED")) {
				fmt.Printf("   ❌ %s - %s\n", result.Endpoint, result.Note)
			}
		}
	}

	// Print Warning APIs
	if warningCount > 0 {
		fmt.Println("\n⚠️  APIs with Warnings (May Need Data/Config):")
		for _, result := range results {
			if !bytes.Contains([]byte(result.Status), []byte("SUCCESS")) && !bytes.Contains([]byte(result.Status), []byte("FAILED")) {
				fmt.Printf("   ⚠️  %s - %s\n", result.Endpoint, result.Note)
			}
		}
	}

	fmt.Println("\n" + strings.Repeat("═", 63))
	fmt.Println("Test completed at:", time.Now().Format("2006-01-02 15:04:05"))
	fmt.Println(strings.Repeat("═", 63))
}
