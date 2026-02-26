package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func main() {
	// Test login với admin.event@fpt.edu.vn (ID: 5)
	loginURL := "http://localhost:8080/api/login"
	loginBody := map[string]string{
		"email":    "admin.event@fpt.edu.vn",
		"password": "123456",
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

	fmt.Println("\n========================================")
	fmt.Println("LOGIN TEST: admin.event@fpt.edu.vn")
	fmt.Println("========================================")

	prettyJSON, _ := json.MarshalIndent(loginResult, "", "  ")
	fmt.Println(string(prettyJSON))

	token, ok := loginResult["token"].(string)
	if !ok {
		fmt.Println("\n❌ Failed to get token from login response")
		return
	}

	fmt.Println("\n✅ Login successful!")
	fmt.Println("\n📋 Copy this command to test in browser console:")
	fmt.Printf("\nlocalStorage.setItem('token', '%s')\n", token)

	// Check role
	if user, ok := loginResult["user"].(map[string]interface{}); ok {
		if role, ok := user["role"].(string); ok {
			fmt.Printf("\nRole: %s\n", role)
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
		fmt.Println("Status:", resp2.StatusCode)
	}
}
