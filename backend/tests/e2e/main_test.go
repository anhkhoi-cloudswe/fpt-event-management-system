package e2e

import (
	"bytes"
	"database/sql"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

type e2eConfig struct {
	BaseURL           string
	OrganizerEmail    string
	OrganizerPassword string
	StaffEmail        string
	StaffPassword     string
	StudentEmail      string
	StudentPassword   string
	VNPayTmnCode      string
	VNPayHashSecret   string
	EventID           int
}

type featureResult struct {
	Feature      string
	Passed       bool
	ResponseTime time.Duration
	Note         string
}

type userSession struct {
	Token  string
	UserID int
}

type apiResponse struct {
	Status   int
	Body     []byte
	Headers  http.Header
	Duration time.Duration
}

type apiClient struct {
	baseURL string
	client  *http.Client
}

type e2eArtifacts struct {
	CreatedRequestID int
	CreatedEventID   int
	CreatedSpeakerID int
	CreatedTicketIDs []int
}

func TestE2ESystemFlows(t *testing.T) {
	cfg := loadConfig()
	c := newAPIClient(cfg.BaseURL)
	artifacts := &e2eArtifacts{}

	results := make([]featureResult, 0, 3)

	flow1Start := time.Now()
	flow1Passed, flow1Note := runFlowEventManagement(t, c, cfg, artifacts)
	results = append(results, featureResult{
		Feature:      "Luong 1 - Quan ly su kien",
		Passed:       flow1Passed,
		ResponseTime: time.Since(flow1Start),
		Note:         flow1Note,
	})

	flow2Start := time.Now()
	flow2Passed, flow2Note := runFlowTicketAndPayment(t, c, cfg, artifacts)
	results = append(results, featureResult{
		Feature:      "Luong 2 - Mua ve va thanh toan",
		Passed:       flow2Passed,
		ResponseTime: time.Since(flow2Start),
		Note:         flow2Note,
	})

	flow3Start := time.Now()
	flow3Passed, flow3Note := runFlowOperationsAndReports(t, c, cfg)
	results = append(results, featureResult{
		Feature:      "Luong 3 - Van hanh va bao cao",
		Passed:       flow3Passed,
		ResponseTime: time.Since(flow3Start),
		Note:         flow3Note,
	})

	cleanupErr := cleanupArtifacts(cfg, artifacts)
	if cleanupErr != nil {
		results = append(results, featureResult{
			Feature:      "Cleanup - Xoa Ticket/Event E2E",
			Passed:       false,
			ResponseTime: 0,
			Note:         cleanupErr.Error(),
		})
	} else {
		results = append(results, featureResult{
			Feature:      "Cleanup - Xoa Ticket/Event E2E",
			Passed:       true,
			ResponseTime: 0,
			Note:         "PASS",
		})
	}

	reportPath := "E2E_TEST_REPORT.md"
	if err := writeReport(reportPath, results); err != nil {
		t.Fatalf("khong the ghi report %s: %v", reportPath, err)
	}

	failed := make([]string, 0)
	for _, r := range results {
		if !r.Passed {
			failed = append(failed, fmt.Sprintf("%s (%s)", r.Feature, r.Note))
		}
	}

	if len(failed) > 0 {
		t.Fatalf("E2E co loi: %s", strings.Join(failed, " | "))
	}
}

func runFlowEventManagement(t *testing.T, c *apiClient, cfg e2eConfig, artifacts *e2eArtifacts) (bool, string) {
	organizer, err := login(c, cfg.OrganizerEmail, cfg.OrganizerPassword)
	if err != nil {
		return false, fmt.Sprintf("Step 1 login organizer that bai: %v", err)
	}
	staff, err := login(c, cfg.StaffEmail, cfg.StaffPassword)
	if err != nil {
		return false, fmt.Sprintf("Step 3 login staff that bai: %v", err)
	}

	startTime, endTime, err := findSchedulableWindow(c, staff.Token)
	if err != nil {
		return false, fmt.Sprintf("Step 2 khong tim thay khung gio hop le: %v", err)
	}
	createReq := map[string]any{
		"title":              fmt.Sprintf("E2E Event %d", time.Now().UnixNano()),
		"description":        "Su kien tao boi E2E test",
		"preferredStartTime": startTime,
		"preferredEndTime":   endTime,
		"expectedCapacity":   120,
	}

	resp, err := c.request(http.MethodPost, "/api/event-requests", nil, organizer.Token, createReq)
	if err != nil {
		return false, fmt.Sprintf("Step 2 tao event request loi: %v", err)
	}
	if resp.Status != http.StatusOK {
		return false, fmt.Sprintf("Step 2 tao event request status=%d body=%s", resp.Status, shortBody(resp.Body))
	}

	var createPayload map[string]any
	if err := json.Unmarshal(resp.Body, &createPayload); err != nil {
		return false, fmt.Sprintf("Step 2 parse response loi: %v", err)
	}
	requestID, ok := asInt(createPayload["requestId"])
	if !ok || requestID <= 0 {
		return false, fmt.Sprintf("Step 2 khong lay duoc requestId: %v", createPayload)
	}
	artifacts.CreatedRequestID = requestID

	availableAreaID, err := fetchAvailableAreaID(c, staff.Token, startTime, endTime)
	if err != nil {
		return false, fmt.Sprintf("Step 4 lay area trong that bai: %v", err)
	}

	processReq := map[string]any{
		"requestId": requestID,
		"action":    "APPROVED",
		"areaId":    availableAreaID,
	}
	resp, err = c.request(http.MethodPost, "/api/event-requests/process", nil, staff.Token, processReq)
	if err != nil {
		return false, fmt.Sprintf("Step 4 approve request loi: %v", err)
	}
	if resp.Status != http.StatusOK {
		return false, fmt.Sprintf("Step 4 approve request status=%d body=%s", resp.Status, shortBody(resp.Body))
	}

	requestDetail, err := getEventRequestDetail(c, organizer.Token, requestID)
	if err != nil {
		return false, fmt.Sprintf("Step 5 doc request detail loi: %v", err)
	}
	createdEventID, ok := asInt(requestDetail["createdEventId"])
	if !ok || createdEventID <= 0 {
		return false, fmt.Sprintf("Step 5 createdEventId khong hop le: %v", requestDetail)
	}
	artifacts.CreatedEventID = createdEventID

	eventDetail, err := getEventDetail(c, organizer.Token, createdEventID)
	if err != nil {
		return false, fmt.Sprintf("Step 5 lay event detail loi: %v", err)
	}
	if speakerID, ok := asInt(eventDetail["speakerId"]); ok && speakerID > 0 {
		artifacts.CreatedSpeakerID = speakerID
	}

	updateReq := buildUpdateEventDetailsPayload(createdEventID, eventDetail)
	resp, err = c.request(http.MethodPost, "/api/events/update-details", nil, organizer.Token, updateReq)
	if err != nil {
		return false, fmt.Sprintf("Step 5 update-details loi: %v", err)
	}
	if resp.Status != http.StatusOK {
		return false, fmt.Sprintf("Step 5 update-details status=%d body=%s", resp.Status, shortBody(resp.Body))
	}

	// Sau khi Organizer update-details, gọi /api/event-requests/update để kích hoạt transition UPDATING -> OPEN.
	publicReq := map[string]any{
		"requestId": requestID,
		"status":    "UPDATING",
		"speaker":   updateReq["speaker"],
		"tickets":   updateReq["tickets"],
		"bannerUrl": updateReq["bannerUrl"],
	}
	resp, err = c.request(http.MethodPost, "/api/event-requests/update", nil, organizer.Token, publicReq)
	if err != nil {
		return false, fmt.Sprintf("Step 5.1 event-request update/public loi: %v", err)
	}
	if resp.Status != http.StatusOK {
		return false, fmt.Sprintf("Step 5.1 event-request update/public status=%d body=%s", resp.Status, shortBody(resp.Body))
	}

	if err := waitForEventStatus(c, organizer.Token, createdEventID, "OPEN", 60*time.Second); err != nil {
		return false, fmt.Sprintf("Step 5 su kien chua ve OPEN: %v", err)
	}

	updatedDetail, err := getEventDetail(c, organizer.Token, createdEventID)
	if err == nil {
		if speakerID, ok := asInt(updatedDetail["speakerId"]); ok && speakerID > 0 {
			artifacts.CreatedSpeakerID = speakerID
		}
	}

	return true, "PASS"
}

func runFlowTicketAndPayment(t *testing.T, c *apiClient, cfg e2eConfig, artifacts *e2eArtifacts) (bool, string) {
	student, err := login(c, cfg.StudentEmail, cfg.StudentPassword)
	if err != nil {
		return false, fmt.Sprintf("Step 1 login student that bai: %v", err)
	}

	eventID := cfg.EventID
	if eventID <= 0 {
		eventID = artifacts.CreatedEventID
	}
	if eventID <= 0 {
		return false, "Step 2 khong co eventID de mua ve"
	}
	if err := ensureEventStatusIsOpen(c, student.Token, eventID); err != nil {
		return false, fmt.Sprintf("Step 2 event chua OPEN, dung luong mua ve: %v", err)
	}

	eventID, areaID, err := pickEventForPurchase(c, student.Token, eventID)
	if err != nil {
		return false, fmt.Sprintf("Step 2 chon event mua ve that bai: %v", err)
	}

	seatID, categoryTicketID, err := pickSeatAndCategory(c, student.Token, eventID, areaID)
	if err != nil {
		return false, fmt.Sprintf("Step 2 lay ghe trong that bai: %v", err)
	}

	walletReq := map[string]any{
		"eventId":          eventID,
		"categoryTicketId": categoryTicketID,
		"seatIds":          []int{seatID},
	}
	walletResp, err := c.request(http.MethodPost, "/api/wallet/pay-ticket", nil, student.Token, walletReq)
	if err != nil {
		return false, fmt.Sprintf("Step 3 goi wallet loi: %v", err)
	}

	walletStepNote := ""
	if walletResp.Status == http.StatusPaymentRequired {
		bodyText := string(walletResp.Body)
		if !strings.Contains(strings.ToLower(bodyText), "insufficient_balance") {
			return false, fmt.Sprintf("Step 3 wallet 402 nhung message khong dung: %s", shortBody(walletResp.Body))
		}
		walletStepNote = "Wallet khong du so du, he thong tra ve 402"
	} else if walletResp.Status == http.StatusOK {
		walletStepNote = "Wallet du so du, thanh toan bang wallet thanh cong"
		ids := parseTicketIDsFromBody(walletResp.Body)
		artifacts.CreatedTicketIDs = append(artifacts.CreatedTicketIDs, ids...)

		seatID, categoryTicketID, err = pickAnotherSeatAndCategory(c, student.Token, eventID, areaID, map[int]bool{seatID: true})
		if err != nil {
			return false, fmt.Sprintf("Step 4 khong tim duoc ghe khac cho VNPay sau wallet success: %v", err)
		}
	} else {
		return false, fmt.Sprintf("Step 3 wallet status=%d body=%s", walletResp.Status, shortBody(walletResp.Body))
	}

	paymentQuery := url.Values{}
	paymentQuery.Set("userId", strconv.Itoa(student.UserID))
	paymentQuery.Set("eventId", strconv.Itoa(eventID))
	paymentQuery.Set("categoryTicketId", strconv.Itoa(categoryTicketID))
	paymentQuery.Set("seatId", strconv.Itoa(seatID))

	paymentResp, err := c.request(http.MethodGet, "/api/payment-ticket", paymentQuery, student.Token, nil)
	if err != nil {
		return false, fmt.Sprintf("Step 4 tao payment URL loi: %v", err)
	}
	if paymentResp.Status != http.StatusOK {
		return false, fmt.Sprintf("Step 4 payment-ticket status=%d body=%s", paymentResp.Status, shortBody(paymentResp.Body))
	}

	paymentURL, isFree, err := extractPaymentURL(paymentResp.Body)
	if err != nil {
		return false, fmt.Sprintf("Step 4 parse payment URL loi: %v", err)
	}
	if isFree {
		return false, "Step 4 tra ve free ticket, khong mo phong duoc VNPay callback"
	}

	callbackQuery, err := buildVNPaySuccessCallbackQuery(paymentURL, cfg.VNPayTmnCode, cfg.VNPayHashSecret)
	if err != nil {
		return false, fmt.Sprintf("Step 4 build callback query loi: %v", err)
	}

	callbackResp, err := c.request(http.MethodGet, "/api/buyTicket", callbackQuery, "", nil)
	if err != nil {
		return false, fmt.Sprintf("Step 4 goi callback loi: %v", err)
	}
	if callbackResp.Status != http.StatusFound {
		return false, fmt.Sprintf("Step 4 callback status=%d body=%s", callbackResp.Status, shortBody(callbackResp.Body))
	}
	location := callbackResp.Headers.Get("Location")
	if !strings.Contains(location, "payment/success") {
		return false, fmt.Sprintf("Step 4 callback redirect khong phai success: %s", location)
	}
	artifacts.CreatedTicketIDs = append(artifacts.CreatedTicketIDs, parseTicketIDsFromLocation(location)...)

	if walletStepNote == "" {
		walletStepNote = "PASS"
	}
	return true, walletStepNote
}

func runFlowOperationsAndReports(t *testing.T, c *apiClient, cfg e2eConfig) (bool, string) {
	organizer, err := login(c, cfg.OrganizerEmail, cfg.OrganizerPassword)
	if err != nil {
		return false, fmt.Sprintf("Step 1 login organizer that bai: %v", err)
	}

	staff, err := login(c, cfg.StaffEmail, cfg.StaffPassword)
	if err != nil {
		return false, fmt.Sprintf("Step 1 login staff that bai: %v", err)
	}

	fakeQR := fmt.Sprintf("E2E_FAKE_QR_%d", time.Now().UnixNano())
	checkinQuery := url.Values{}
	checkinQuery.Set("ticketCode", fakeQR)

	checkinResp, err := c.request(http.MethodPost, "/api/staff/checkin", checkinQuery, organizer.Token, nil)
	if err != nil {
		return false, fmt.Sprintf("Step 2 checkin loi: %v", err)
	}
	if checkinResp.Status == http.StatusForbidden {
		return false, fmt.Sprintf("Step 2 checkin status=%d body=%s", checkinResp.Status, shortBody(checkinResp.Body))
	}

	reportsResp, err := c.request(http.MethodGet, "/api/staff/reports", nil, staff.Token, nil)
	if err != nil {
		return false, fmt.Sprintf("Step 3 lay reports loi: %v", err)
	}
	if reportsResp.Status != http.StatusOK {
		return false, fmt.Sprintf("Step 3 reports status=%d body=%s", reportsResp.Status, shortBody(reportsResp.Body))
	}

	return true, "PASS"
}

func ensureEventStatusIsOpen(c *apiClient, token string, eventID int) error {
	detail, err := getEventDetail(c, token, eventID)
	if err != nil {
		return err
	}
	status, _ := detail["status"].(string)
	if strings.ToUpper(strings.TrimSpace(status)) != "OPEN" {
		return fmt.Errorf("eventId=%d status=%s", eventID, status)
	}
	return nil
}

func waitForEventStatus(c *apiClient, token string, eventID int, expected string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		detail, err := getEventDetail(c, token, eventID)
		if err == nil {
			status, _ := detail["status"].(string)
			if strings.EqualFold(strings.TrimSpace(status), expected) {
				return nil
			}
		}
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("timeout doi eventId=%d sang %s", eventID, expected)
}

func login(c *apiClient, email, password string) (userSession, error) {
	payload := map[string]any{
		"email":    email,
		"password": password,
	}
	resp, err := c.request(http.MethodPost, "/api/login", nil, "", payload)
	if err != nil {
		return userSession{}, err
	}
	if resp.Status != http.StatusOK {
		return userSession{}, fmt.Errorf("status=%d body=%s", resp.Status, shortBody(resp.Body))
	}

	var body map[string]any
	if err := json.Unmarshal(resp.Body, &body); err != nil {
		return userSession{}, err
	}
	token, _ := body["token"].(string)
	if token == "" {
		return userSession{}, fmt.Errorf("khong co token trong response")
	}

	userMap, _ := body["user"].(map[string]any)
	userID, ok := asInt(userMap["id"])
	if !ok || userID <= 0 {
		return userSession{}, fmt.Errorf("khong lay duoc user.id")
	}

	return userSession{Token: token, UserID: userID}, nil
}

func fetchAvailableAreaID(c *apiClient, token, startTime, endTime string) (int, error) {
	query := url.Values{}
	query.Set("startTime", startTime)
	query.Set("endTime", endTime)
	query.Set("expectedCapacity", "100")

	resp, err := c.request(http.MethodGet, "/api/events/available-areas", query, token, nil)
	if err != nil {
		return 0, err
	}
	if resp.Status != http.StatusOK {
		return 0, fmt.Errorf("status=%d body=%s", resp.Status, shortBody(resp.Body))
	}

	var payload map[string]any
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return 0, err
	}
	areas, _ := payload["availableAreas"].([]any)
	if len(areas) == 0 {
		return 0, fmt.Errorf("khong co area trong khung gio yeu cau")
	}
	firstArea, _ := areas[0].(map[string]any)
	areaID, ok := asInt(firstArea["areaId"])
	if !ok || areaID <= 0 {
		return 0, fmt.Errorf("areaId khong hop le: %v", firstArea)
	}
	return areaID, nil
}

func getEventRequestDetail(c *apiClient, token string, requestID int) (map[string]any, error) {
	path := fmt.Sprintf("/api/event-requests/%d", requestID)
	resp, err := c.request(http.MethodGet, path, nil, token, nil)
	if err != nil {
		return nil, err
	}
	if resp.Status != http.StatusOK {
		return nil, fmt.Errorf("status=%d body=%s", resp.Status, shortBody(resp.Body))
	}
	var payload map[string]any
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func getEventDetail(c *apiClient, token string, eventID int) (map[string]any, error) {
	query := url.Values{}
	query.Set("id", strconv.Itoa(eventID))
	resp, err := c.request(http.MethodGet, "/api/events/detail", query, token, nil)
	if err != nil {
		return nil, err
	}
	if resp.Status != http.StatusOK {
		return nil, fmt.Errorf("status=%d body=%s", resp.Status, shortBody(resp.Body))
	}
	var payload map[string]any
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func buildUpdateEventDetailsPayload(eventID int, eventDetail map[string]any) map[string]any {
	ticketsRaw, _ := eventDetail["tickets"].([]any)
	tickets := make([]map[string]any, 0)
	for _, item := range ticketsRaw {
		t, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name, _ := t["name"].(string)
		if name == "" {
			name = "Standard"
		}
		desc, _ := t["description"].(string)
		price, _ := asFloat64(t["price"])
		maxQty, _ := asInt(t["maxQuantity"])
		if maxQty <= 0 {
			maxQty = 50
		}
		tickets = append(tickets, map[string]any{
			"name":        name,
			"description": desc,
			"price":       price,
			"maxQuantity": maxQty,
			"status":      "ACTIVE",
		})
	}
	if len(tickets) == 0 {
		tickets = append(tickets, map[string]any{
			"name":        "E2E Standard",
			"description": "Ve tao tu E2E",
			"price":       10000,
			"maxQuantity": 100,
			"status":      "ACTIVE",
		})
	}

	bannerURL, _ := eventDetail["bannerUrl"].(string)
	if bannerURL == "" {
		bannerURL = "https://example.com/e2e-banner.png"
	}

	return map[string]any{
		"eventId": eventID,
		"speaker": map[string]any{
			"fullName":  "E2E Speaker",
			"bio":       "Speaker duoc tao boi E2E",
			"email":     "e2e-speaker@example.com",
			"phone":     "0900000000",
			"avatarUrl": "https://example.com/e2e-avatar.png",
		},
		"tickets":   tickets,
		"bannerUrl": bannerURL,
	}
}

func pickEventForPurchase(c *apiClient, token string, preferredEventID int) (int, int, error) {
	if preferredEventID > 0 {
		detail, err := getEventDetail(c, token, preferredEventID)
		if err == nil {
			if areaID, ok := asInt(detail["areaId"]); ok && areaID > 0 {
				return preferredEventID, areaID, nil
			}
		}
	}

	query := url.Values{}
	query.Set("page", "1")
	query.Set("limit", "20")
	resp, err := c.request(http.MethodGet, "/api/events", query, token, nil)
	if err != nil {
		return 0, 0, err
	}
	if resp.Status != http.StatusOK {
		return 0, 0, fmt.Errorf("/api/events status=%d body=%s", resp.Status, shortBody(resp.Body))
	}

	var payload map[string]any
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return 0, 0, err
	}
	openEvents, _ := payload["openEvents"].([]any)
	for _, item := range openEvents {
		e, ok := item.(map[string]any)
		if !ok {
			continue
		}
		eventID, ok1 := asInt(e["eventId"])
		areaID, ok2 := asInt(e["areaId"])
		if ok1 && ok2 && eventID > 0 && areaID > 0 {
			return eventID, areaID, nil
		}
	}

	return 0, 0, fmt.Errorf("khong tim thay event OPEN co areaId")
}

func pickSeatAndCategory(c *apiClient, token string, eventID, areaID int) (int, int, error) {
	catPrices := map[int]float64{}
	catResp, err := c.request(http.MethodGet, "/api/category-tickets", url.Values{"eventId": []string{strconv.Itoa(eventID)}}, token, nil)
	if err == nil && catResp.Status == http.StatusOK {
		var categories []map[string]any
		if json.Unmarshal(catResp.Body, &categories) == nil {
			for _, ct := range categories {
				cid, ok := asInt(ct["categoryTicketId"])
				if !ok {
					continue
				}
				price, _ := asFloat64(ct["price"])
				catPrices[cid] = price
			}
		}
	}

	query := url.Values{}
	query.Set("eventId", strconv.Itoa(eventID))
	query.Set("areaId", strconv.Itoa(areaID))
	resp, err := c.request(http.MethodGet, "/api/seats", query, token, nil)
	if err != nil {
		return 0, 0, err
	}
	if resp.Status != http.StatusOK {
		return 0, 0, fmt.Errorf("/api/seats status=%d body=%s", resp.Status, shortBody(resp.Body))
	}

	var payload map[string]any
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return 0, 0, err
	}
	seats, _ := payload["seats"].([]any)
	if len(seats) == 0 {
		return 0, 0, fmt.Errorf("khong co seat")
	}

	fallbackSeat := 0
	fallbackCategory := 0
	for _, s := range seats {
		seat, ok := s.(map[string]any)
		if !ok {
			continue
		}
		status, _ := seat["status"].(string)
		if !strings.EqualFold(status, "AVAILABLE") {
			continue
		}
		seatID, ok1 := asInt(seat["seatId"])
		catID, ok2 := asInt(seat["categoryTicketId"])
		if !ok1 || !ok2 || seatID <= 0 || catID <= 0 {
			continue
		}
		if fallbackSeat == 0 {
			fallbackSeat = seatID
			fallbackCategory = catID
		}
		if price, exists := catPrices[catID]; exists && price > 0 {
			return seatID, catID, nil
		}
	}

	if fallbackSeat > 0 && fallbackCategory > 0 {
		return fallbackSeat, fallbackCategory, nil
	}

	return 0, 0, fmt.Errorf("khong tim thay seat AVAILABLE hop le")
}

func pickAnotherSeatAndCategory(c *apiClient, token string, eventID, areaID int, blockedSeatIDs map[int]bool) (int, int, error) {
	query := url.Values{}
	query.Set("eventId", strconv.Itoa(eventID))
	query.Set("areaId", strconv.Itoa(areaID))
	resp, err := c.request(http.MethodGet, "/api/seats", query, token, nil)
	if err != nil {
		return 0, 0, err
	}
	if resp.Status != http.StatusOK {
		return 0, 0, fmt.Errorf("/api/seats status=%d body=%s", resp.Status, shortBody(resp.Body))
	}

	var payload map[string]any
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return 0, 0, err
	}
	seats, _ := payload["seats"].([]any)
	for _, s := range seats {
		seat, ok := s.(map[string]any)
		if !ok {
			continue
		}
		status, _ := seat["status"].(string)
		if !strings.EqualFold(status, "AVAILABLE") {
			continue
		}
		seatID, ok1 := asInt(seat["seatId"])
		catID, ok2 := asInt(seat["categoryTicketId"])
		if !ok1 || !ok2 || seatID <= 0 || catID <= 0 {
			continue
		}
		if blockedSeatIDs[seatID] {
			continue
		}
		return seatID, catID, nil
	}
	return 0, 0, fmt.Errorf("khong tim thay ghe thay the AVAILABLE")
}

func parseTicketIDsFromBody(body []byte) []int {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil
	}
	ticketIDsRaw, _ := payload["ticketIds"].(string)
	return parseTicketIDsCSV(ticketIDsRaw)
}

func parseTicketIDsFromLocation(location string) []int {
	u, err := url.Parse(location)
	if err != nil {
		return nil
	}
	ticketIDsRaw := u.Query().Get("ticketIds")
	decoded, _ := url.QueryUnescape(ticketIDsRaw)
	if decoded != "" {
		ticketIDsRaw = decoded
	}
	return parseTicketIDsCSV(ticketIDsRaw)
}

func parseTicketIDsCSV(raw string) []int {
	parts := strings.Split(raw, ",")
	ids := make([]int, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		i, err := strconv.Atoi(p)
		if err == nil && i > 0 {
			ids = append(ids, i)
		}
	}
	return uniqueInts(ids)
}

func uniqueInts(in []int) []int {
	seen := map[int]bool{}
	out := make([]int, 0, len(in))
	for _, v := range in {
		if v <= 0 || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

func cleanupArtifacts(cfg e2eConfig, artifacts *e2eArtifacts) error {
	if artifacts == nil {
		return nil
	}

	dsn := getenv("E2E_DB_URL", getenv("DB_URL", "fpt_app:FPTEventAppPassword2026@tcp(localhost:3306)/fpteventmanagement?parseTime=true&loc=Asia%2FHo_Chi_Minh"))
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return fmt.Errorf("khong mo duoc DB de cleanup: %w", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		return fmt.Errorf("khong ket noi duoc DB de cleanup: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("khong bat dau duoc transaction cleanup: %w", err)
	}
	defer tx.Rollback()

	if len(artifacts.CreatedTicketIDs) > 0 {
		for _, ticketID := range uniqueInts(artifacts.CreatedTicketIDs) {
			if _, err := tx.Exec("DELETE FROM report WHERE ticket_id = ?", ticketID); err != nil {
				return fmt.Errorf("cleanup report theo ticket_id=%d loi: %w", ticketID, err)
			}
			if _, err := tx.Exec("DELETE FROM ticket WHERE ticket_id = ?", ticketID); err != nil {
				return fmt.Errorf("cleanup ticket_id=%d loi: %w", ticketID, err)
			}
		}
	}

	if artifacts.CreatedEventID > 0 {
		if _, err := tx.Exec("DELETE FROM report WHERE ticket_id IN (SELECT ticket_id FROM ticket WHERE event_id = ?)", artifacts.CreatedEventID); err != nil {
			return fmt.Errorf("cleanup report theo event_id loi: %w", err)
		}
		if _, err := tx.Exec("DELETE FROM ticket WHERE event_id = ?", artifacts.CreatedEventID); err != nil {
			return fmt.Errorf("cleanup ticket theo event_id loi: %w", err)
		}
		if _, err := tx.Exec("DELETE FROM event_seat_layout WHERE event_id = ?", artifacts.CreatedEventID); err != nil {
			return fmt.Errorf("cleanup event_seat_layout loi: %w", err)
		}
		if _, err := tx.Exec("UPDATE seat SET category_ticket_id = NULL WHERE category_ticket_id IN (SELECT category_ticket_id FROM category_ticket WHERE event_id = ?)", artifacts.CreatedEventID); err != nil {
			return fmt.Errorf("cleanup seat.category_ticket_id loi: %w", err)
		}
		if _, err := tx.Exec("DELETE FROM category_ticket WHERE event_id = ?", artifacts.CreatedEventID); err != nil {
			return fmt.Errorf("cleanup category_ticket loi: %w", err)
		}
		if _, err := tx.Exec("UPDATE event_request SET created_event_id = NULL WHERE created_event_id = ?", artifacts.CreatedEventID); err != nil {
			return fmt.Errorf("cleanup event_request.created_event_id loi: %w", err)
		}
		if _, err := tx.Exec("DELETE FROM event WHERE event_id = ?", artifacts.CreatedEventID); err != nil {
			return fmt.Errorf("cleanup event loi: %w", err)
		}
	}

	if artifacts.CreatedRequestID > 0 {
		if _, err := tx.Exec("DELETE FROM event_request WHERE request_id = ?", artifacts.CreatedRequestID); err != nil {
			return fmt.Errorf("cleanup event_request loi: %w", err)
		}
	}

	if artifacts.CreatedSpeakerID > 0 {
		if _, err := tx.Exec("DELETE FROM speaker WHERE speaker_id = ? AND NOT EXISTS (SELECT 1 FROM event WHERE speaker_id = ?)", artifacts.CreatedSpeakerID, artifacts.CreatedSpeakerID); err != nil {
			return fmt.Errorf("cleanup speaker loi: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit cleanup that bai: %w", err)
	}

	return nil
}

func extractPaymentURL(body []byte) (string, bool, error) {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", false, err
	}
	if free, ok := payload["free"].(bool); ok && free {
		return "", true, nil
	}
	paymentURL, _ := payload["paymentUrl"].(string)
	if paymentURL == "" {
		return "", false, fmt.Errorf("khong co paymentUrl trong response: %s", shortBody(body))
	}
	return paymentURL, false, nil
}

func buildVNPaySuccessCallbackQuery(paymentURL, tmnCode, secret string) (url.Values, error) {
	u, err := url.Parse(paymentURL)
	if err != nil {
		return nil, err
	}
	params := u.Query()

	params.Del("vnp_SecureHash")
	params.Del("vnp_SecureHashType")

	params.Set("vnp_TmnCode", tmnCode)
	params.Set("vnp_ResponseCode", "00")
	params.Set("vnp_TransactionNo", fmt.Sprintf("%d", time.Now().UnixNano()%1000000000))
	params.Set("vnp_BankTranNo", fmt.Sprintf("BANK%d", time.Now().UnixNano()%1000000))
	params.Set("vnp_BankCode", "NCB")
	params.Set("vnp_CardType", "ATM")
	params.Set("vnp_PayDate", time.Now().Format("20060102150405"))

	hash := computeVNPaySecureHash(params, secret)
	params.Set("vnp_SecureHash", hash)
	return params, nil
}

func computeVNPaySecureHash(params url.Values, secret string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		if k == "vnp_SecureHash" || k == "vnp_SecureHashType" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		v := params.Get(k)
		if v == "" {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s=%s", k, url.QueryEscape(v)))
	}
	signData := strings.Join(parts, "&")

	h := hmac.New(sha512.New, []byte(secret))
	h.Write([]byte(signData))
	return strings.ToUpper(hex.EncodeToString(h.Sum(nil)))
}

func writeReport(reportPath string, results []featureResult) error {
	var b strings.Builder
	b.WriteString("# E2E Test Report\n\n")
	b.WriteString("| Tinh nang | Trang thai (PASS/FAIL) | Thoi gian phan hoi | Ghi chu loi |\n")
	b.WriteString("|---|---|---:|---|\n")
	for _, r := range results {
		status := "FAIL"
		if r.Passed {
			status = "PASS"
		}
		note := escapePipe(r.Note)
		if note == "" {
			note = "-"
		}
		b.WriteString(fmt.Sprintf("| %s | %s | %d ms | %s |\n", r.Feature, status, r.ResponseTime.Milliseconds(), note))
	}
	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("Generated at: %s\n", time.Now().Format(time.RFC3339)))

	return os.WriteFile(reportPath, []byte(b.String()), 0o644)
}

func buildFutureEventTime() (string, string) {
	now := time.Now()
	base := now.Add(48 * time.Hour)
	start := time.Date(base.Year(), base.Month(), base.Day(), 10, 0, 0, 0, base.Location())
	if start.Before(now.Add(24 * time.Hour)) {
		start = start.Add(24 * time.Hour)
	}
	end := start.Add(2 * time.Hour)
	return start.Format("2006-01-02T15:04:05"), end.Format("2006-01-02T15:04:05")
}

func findSchedulableWindow(c *apiClient, token string) (string, string, error) {
	now := time.Now()
	for day := 2; day <= 30; day++ {
		candidateDate := now.AddDate(0, 0, day)
		dateStr := candidateDate.Format("2006-01-02")

		quotaOK, err := canApproveOnDate(c, token, dateStr)
		if err != nil {
			continue
		}
		if !quotaOK {
			continue
		}

		start := time.Date(candidateDate.Year(), candidateDate.Month(), candidateDate.Day(), 10, 0, 0, 0, candidateDate.Location())
		end := start.Add(2 * time.Hour)
		startStr := start.Format("2006-01-02T15:04:05")
		endStr := end.Format("2006-01-02T15:04:05")

		if _, err := fetchAvailableAreaID(c, token, startStr, endStr); err == nil {
			return startStr, endStr, nil
		}
	}

	return "", "", fmt.Errorf("khong tim thay ngay con quota va con area trong")
}

func canApproveOnDate(c *apiClient, token, date string) (bool, error) {
	query := url.Values{}
	query.Set("date", date)
	resp, err := c.request(http.MethodGet, "/api/events/daily-quota", query, token, nil)
	if err != nil {
		return false, err
	}
	if resp.Status != http.StatusOK {
		return false, fmt.Errorf("status=%d", resp.Status)
	}

	var payload map[string]any
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return false, err
	}
	if canApprove, ok := payload["canApproveMore"].(bool); ok {
		return canApprove, nil
	}
	if exceeded, ok := payload["quotaExceeded"].(bool); ok {
		return !exceeded, nil
	}

	return true, nil
}

func newAPIClient(baseURL string) *apiClient {
	return &apiClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		client: &http.Client{
			Timeout: 30 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

func (c *apiClient) request(method, path string, query url.Values, token string, body any) (apiResponse, error) {
	fullURL := c.baseURL + path
	if len(query) > 0 {
		fullURL += "?" + query.Encode()
	}

	var bodyReader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return apiResponse{}, err
		}
		bodyReader = bytes.NewBuffer(payload)
	}

	req, err := http.NewRequest(method, fullURL, bodyReader)
	if err != nil {
		return apiResponse{}, err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	start := time.Now()
	resp, err := c.client.Do(req)
	dur := time.Since(start)
	if err != nil {
		return apiResponse{}, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return apiResponse{}, err
	}

	return apiResponse{
		Status:   resp.StatusCode,
		Body:     respBody,
		Headers:  resp.Header,
		Duration: dur,
	}, nil
}

func loadConfig() e2eConfig {
	cfg := e2eConfig{
		BaseURL:           getenv("E2E_BASE_URL", "http://localhost:8080"),
		OrganizerEmail:    getenv("E2E_ORGANIZER_EMAIL", "huy.lqclub@fpt.edu.vn"),
		OrganizerPassword: getenv("E2E_ORGANIZER_PASSWORD", "123456"),
		StaffEmail:        getenv("E2E_STAFF_EMAIL", "thu.pmso@fpt.edu.vn"),
		StaffPassword:     getenv("E2E_STAFF_PASSWORD", "123456"),
		StudentEmail:      getenv("E2E_STUDENT_EMAIL", "ahkhoinguyen169@gmail.com"),
		StudentPassword:   getenv("E2E_STUDENT_PASSWORD", "pass111"),
		VNPayTmnCode:      getenv("E2E_VNPAY_TMN_CODE", getenv("VNPAY_TMN_CODE", "HEBCFV23")),
		VNPayHashSecret:   getenv("E2E_VNPAY_HASH_SECRET", getenv("VNPAY_HASH_SECRET", "CL39KHK2AGWEWR3DEA2SSPRPBGVVVBHA")),
		EventID:           getenvInt("E2E_EVENT_ID", 0),
	}
	return cfg
}

func getenv(key, defaultValue string) string {
	v := os.Getenv(key)
	if strings.TrimSpace(v) == "" {
		return defaultValue
	}
	return strings.TrimSpace(v)
}

func getenvInt(key string, defaultValue int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return defaultValue
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return defaultValue
	}
	return i
}

func asInt(v any) (int, bool) {
	switch x := v.(type) {
	case int:
		return x, true
	case int32:
		return int(x), true
	case int64:
		return int(x), true
	case float64:
		return int(x), true
	case json.Number:
		i, err := x.Int64()
		if err != nil {
			return 0, false
		}
		return int(i), true
	case string:
		i, err := strconv.Atoi(strings.TrimSpace(x))
		if err != nil {
			return 0, false
		}
		return i, true
	default:
		return 0, false
	}
}

func asFloat64(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case json.Number:
		f, err := x.Float64()
		if err != nil {
			return 0, false
		}
		return f, true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		if err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

func shortBody(body []byte) string {
	trimmed := strings.TrimSpace(string(body))
	if len(trimmed) <= 300 {
		return trimmed
	}
	return trimmed[:300] + "..."
}

func escapePipe(s string) string {
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "|", "\\|")
	return s
}
