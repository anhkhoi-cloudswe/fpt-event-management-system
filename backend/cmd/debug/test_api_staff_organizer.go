package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func main() {
	// Test login with admin account
	loginURL := "http://localhost:8080/api/login"
	loginBody := map[string]string{
		"email":    "admin@fpt.edu.vn",
		"password": "Admin@123",
	}
	loginJSON, _ := json.Marshal(loginBody)

	resp, err := http.Post(loginURL, "application/json", bytes.NewBuffer(loginJSON))
	if err != nil {
		fmt.Println("❌ Login error:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var loginResult map[string]interface{}
	json.Unmarshal(body, &loginResult)

	token, ok := loginResult["token"].(string)
	if !ok {
		fmt.Println("❌ Failed to get token from login response")
		fmt.Println("Response:", string(body))
		return
	}

	fmt.Println("✅ Login successful")

	// Check role
	if user, ok := loginResult["user"].(map[string]interface{}); ok {
		if role, ok := user["role"].(string); ok {
			fmt.Printf("   Role: %s\n", role)
		}
	}

	// Now test the staff-organizer endpoint
	staffOrgURL := "http://localhost:8080/api/users/staff-organizer"
	req, _ := http.NewRequest("GET", staffOrgURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	resp2, err := client.Do(req)
	if err != nil {
		fmt.Println("❌ Staff-Organizer API error:", err)
		return
	}
	defer resp2.Body.Close()

	body2, _ := io.ReadAll(resp2.Body)

	fmt.Println("\n========================================")
	fmt.Println("GET /api/users/staff-organizer")
	fmt.Println("Status:", resp2.StatusCode)
	fmt.Println("========================================")

	var result map[string]interface{}
	if err := json.Unmarshal(body2, &result); err == nil {
		prettyJSON, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(prettyJSON))

		// Check if we have data
		if staffList, ok := result["staffList"].([]interface{}); ok {
			fmt.Printf("\n✅ Found %d STAFF users\n", len(staffList))
		}
		if orgList, ok := result["organizerList"].([]interface{}); ok {
			fmt.Printf("✅ Found %d ORGANIZER users\n", len(orgList))
		}
	} else {
		fmt.Println("Raw response:", string(body2))
	}
}
