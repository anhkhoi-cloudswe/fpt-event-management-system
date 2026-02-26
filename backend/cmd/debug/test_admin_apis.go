package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

var token string
var testUserID int

func main() {
	fmt.Println("╔═══════════════════════════════════════════════════════════╗")
	fmt.Println("║         TEST TOÀN BỘ API ADMIN - FPT EVENT SYSTEM         ║")
	fmt.Println("╚═══════════════════════════════════════════════════════════╝")

	// Step 1: Login as ADMIN
	if !testLogin() {
		return
	}

	// Step 2: Test GET staff-organizer list
	testGetStaffOrganizer()

	// Step 3: Test CREATE account (STAFF)
	testCreateAccount()

	// Step 4: Test UPDATE account
	testUpdateAccount()

	// Step 5: Test System Config - GET
	testGetSystemConfig()

	// Step 6: Test System Config - POST (Update)
	testUpdateSystemConfig()

	// Step 7: Test DELETE account (cleanup)
	testDeleteAccount()

	// Step 8: Test Venues API
	testVenuesAPI()

	// Step 9: Test Reports API
	testReportsAPI()

	fmt.Println("\n╔═══════════════════════════════════════════════════════════╗")
	fmt.Println("║                    TEST COMPLETED                         ║")
	fmt.Println("╚═══════════════════════════════════════════════════════════╝")
}

// ============ TEST LOGIN ============
func testLogin() bool {
	fmt.Println("\n[1] 🔐 TEST LOGIN ADMIN")
	fmt.Println("─────────────────────────────────────────────────────")

	loginBody := map[string]string{
		"email":    "admin.event@fpt.edu.vn",
		"password": "123456",
	}
	loginJSON, _ := json.Marshal(loginBody)

	resp, err := http.Post("http://localhost:8080/api/login", "application/json", bytes.NewBuffer(loginJSON))
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return false
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if resp.StatusCode == 200 || resp.StatusCode == 201 {
		token = result["token"].(string)
		if user, ok := result["user"].(map[string]interface{}); ok {
			fmt.Printf("✅ SUCCESS\n")
			fmt.Printf("   Email: %v\n", user["email"])
			fmt.Printf("   Role:  %v\n", user["role"])
			fmt.Printf("   Token: %s...\n", token[:50])
		}
		return true
	} else {
		fmt.Printf("❌ FAILED: Status %d\n", resp.StatusCode)
		fmt.Println(string(body))
		return false
	}
}

// ============ TEST GET STAFF-ORGANIZER ============
func testGetStaffOrganizer() {
	fmt.Println("\n[2] 👥 TEST GET STAFF & ORGANIZER LIST")
	fmt.Println("─────────────────────────────────────────────────────")

	req, _ := http.NewRequest("GET", "http://localhost:8080/api/users/staff-organizer", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == 200 {
		var result map[string]interface{}
		json.Unmarshal(body, &result)

		staffList := result["staffList"].([]interface{})
		organizerList := result["organizerList"].([]interface{})

		fmt.Printf("✅ SUCCESS\n")
		fmt.Printf("   STAFF count:     %d\n", len(staffList))
		fmt.Printf("   ORGANIZER count: %d\n", len(organizerList))

		if len(staffList) > 0 {
			fmt.Println("\n   📋 STAFF:")
			for _, s := range staffList {
				staff := s.(map[string]interface{})
				fmt.Printf("      - %v (%v)\n", staff["fullName"], staff["email"])
			}
		}

		if len(organizerList) > 0 {
			fmt.Println("\n   📋 ORGANIZER:")
			for _, o := range organizerList {
				org := o.(map[string]interface{})
				fmt.Printf("      - %v (%v)\n", org["fullName"], org["email"])
			}
		}
	} else {
		fmt.Printf("❌ FAILED: Status %d\n", resp.StatusCode)
		fmt.Println(string(body))
	}
}

// ============ TEST CREATE ACCOUNT ============
func testCreateAccount() {
	fmt.Println("\n[3] ➕ TEST CREATE ACCOUNT (STAFF)")
	fmt.Println("─────────────────────────────────────────────────────")

	timestamp := time.Now().Unix()
	createBody := map[string]interface{}{
		"email":    fmt.Sprintf("test.staff.%d@fpt.edu.vn", timestamp),
		"password": "Test@123",
		"fullName": "Test Staff User",
		"phone":    "0901234567",
		"role":     "STAFF",
	}
	createJSON, _ := json.Marshal(createBody)

	req, _ := http.NewRequest("POST", "http://localhost:8080/api/admin/create-account", bytes.NewBuffer(createJSON))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == 200 || resp.StatusCode == 201 {
		var result map[string]interface{}
		json.Unmarshal(body, &result)

		fmt.Printf("✅ SUCCESS\n")
		fmt.Printf("   Response: %s\n", string(body))

		// Lưu user ID để test UPDATE và DELETE
		if data, ok := result["data"].(map[string]interface{}); ok {
			if id, ok := data["id"].(float64); ok {
				testUserID = int(id)
				fmt.Printf("   Created User ID: %d\n", testUserID)
			}
		} else if user, ok := result["user"].(map[string]interface{}); ok {
			if id, ok := user["id"].(float64); ok {
				testUserID = int(id)
				fmt.Printf("   Created User ID: %d\n", testUserID)
			}
		}
	} else {
		fmt.Printf("❌ FAILED: Status %d\n", resp.StatusCode)
		fmt.Println(string(body))
	}
}

// ============ TEST UPDATE ACCOUNT ============
func testUpdateAccount() {
	if testUserID == 0 {
		fmt.Println("\n[4] ⚠️  SKIP UPDATE ACCOUNT (No user ID from create)")
		return
	}

	fmt.Println("\n[4] ✏️  TEST UPDATE ACCOUNT")
	fmt.Println("─────────────────────────────────────────────────────")

	updateBody := map[string]interface{}{
		"id":       testUserID,
		"fullName": "Updated Test Staff",
		"phone":    "0909999999",
		"role":     "STAFF",
		"status":   "ACTIVE",
	}
	updateJSON, _ := json.Marshal(updateBody)

	req, _ := http.NewRequest("PUT", "http://localhost:8080/api/admin/create-account", bytes.NewBuffer(updateJSON))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == 200 {
		fmt.Printf("✅ SUCCESS\n")
		fmt.Printf("   Response: %s\n", string(body))
	} else {
		fmt.Printf("❌ FAILED: Status %d\n", resp.StatusCode)
		fmt.Println(string(body))
	}
}

// ============ TEST GET SYSTEM CONFIG ============
func testGetSystemConfig() {
	fmt.Println("\n[5] ⚙️  TEST GET SYSTEM CONFIG")
	fmt.Println("─────────────────────────────────────────────────────")

	req, _ := http.NewRequest("GET", "http://localhost:8080/api/admin/config/system", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == 200 {
		fmt.Printf("✅ SUCCESS\n")
		var result map[string]interface{}
		json.Unmarshal(body, &result)
		prettyJSON, _ := json.MarshalIndent(result, "   ", "  ")
		fmt.Printf("   %s\n", string(prettyJSON))
	} else {
		fmt.Printf("❌ FAILED: Status %d\n", resp.StatusCode)
		fmt.Println(string(body))
	}
}

// ============ TEST UPDATE SYSTEM CONFIG ============
func testUpdateSystemConfig() {
	fmt.Println("\n[6] ⚙️  TEST UPDATE SYSTEM CONFIG")
	fmt.Println("─────────────────────────────────────────────────────")

	configBody := map[string]interface{}{
		"minMinutesAfterStart":             30,
		"checkinAllowedBeforeStartMinutes": 60,
	}
	configJSON, _ := json.Marshal(configBody)

	req, _ := http.NewRequest("POST", "http://localhost:8080/api/admin/config/system", bytes.NewBuffer(configJSON))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == 200 {
		fmt.Printf("✅ SUCCESS\n")
		fmt.Printf("   Response: %s\n", string(body))
	} else {
		fmt.Printf("❌ FAILED: Status %d\n", resp.StatusCode)
		fmt.Println(string(body))
	}
}

// ============ TEST DELETE ACCOUNT ============
func testDeleteAccount() {
	if testUserID == 0 {
		fmt.Println("\n[7] ⚠️  SKIP DELETE ACCOUNT (No user ID)")
		return
	}

	fmt.Println("\n[7] 🗑️  TEST DELETE ACCOUNT (Soft Delete)")
	fmt.Println("─────────────────────────────────────────────────────")

	url := fmt.Sprintf("http://localhost:8080/api/admin/create-account?id=%d", testUserID)
	req, _ := http.NewRequest("DELETE", url, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == 200 {
		fmt.Printf("✅ SUCCESS\n")
		fmt.Printf("   Response: %s\n", string(body))
	} else {
		fmt.Printf("❌ FAILED: Status %d\n", resp.StatusCode)
		fmt.Println(string(body))
	}
}

// ============ TEST VENUES API ============
func testVenuesAPI() {
	fmt.Println("\n[8] 🏢 TEST VENUES API")
	fmt.Println("─────────────────────────────────────────────────────")

	req, _ := http.NewRequest("GET", "http://localhost:8080/api/venues", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == 200 {
		var result interface{}
		json.Unmarshal(body, &result)

		fmt.Printf("✅ SUCCESS\n")

		// Check if it's array or wrapped in data
		if venues, ok := result.([]interface{}); ok {
			fmt.Printf("   Venues count: %d\n", len(venues))
		} else if dataMap, ok := result.(map[string]interface{}); ok {
			if venues, ok := dataMap["data"].([]interface{}); ok {
				fmt.Printf("   Venues count: %d\n", len(venues))
			} else if venues, ok := dataMap["venues"].([]interface{}); ok {
				fmt.Printf("   Venues count: %d\n", len(venues))
			}
		}
	} else {
		fmt.Printf("❌ FAILED: Status %d\n", resp.StatusCode)
		fmt.Println(string(body))
	}
}

// ============ TEST REPORTS API ============
func testReportsAPI() {
	fmt.Println("\n[9] 📊 TEST REPORTS API")
	fmt.Println("─────────────────────────────────────────────────────")

	req, _ := http.NewRequest("GET", "http://localhost:8080/api/events/stats", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == 200 {
		fmt.Printf("✅ SUCCESS\n")
		var result map[string]interface{}
		json.Unmarshal(body, &result)
		prettyJSON, _ := json.MarshalIndent(result, "   ", "  ")
		fmt.Printf("   %s\n", string(prettyJSON))
	} else {
		fmt.Printf("❌ FAILED: Status %d\n", resp.StatusCode)
		fmt.Println(string(body))
	}
}
