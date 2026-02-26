package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

func main() {
	fmt.Println("╔═══════════════════════════════════════════╗")
	fmt.Println("║  DEBUG CREATE ACCOUNT API ║")
	fmt.Println("╚═══════════════════════════════════════════╝")

	// Step 1: Login
	fmt.Println("\n[1] Logging in...")
	loginBody := map[string]string{
		"email":    "admin.event@fpt.edu.vn",
		"password": "123456",
	}
	loginJSON, _ := json.Marshal(loginBody)

	resp, err := http.Post("http://localhost:8080/api/login", "application/json", bytes.NewBuffer(loginJSON))
	if err != nil {
		fmt.Printf("❌ Login failed: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var loginResult map[string]interface{}
	json.Unmarshal(body, &loginResult)

	token := loginResult["token"].(string)
	fmt.Printf("✅ Logged in successfully\n")

	// Step 2: Create account with various test cases
	testCases := []struct {
		name  string
		email string
		pass  string
		fname string
		phone string
		role  string
	}{
		{"Valid @fpt.edu.vn", fmt.Sprintf("test.%d@fpt.edu.vn", time.Now().Unix()), "Test@123", "Test User", "0987654321", "STAFF"},
		{"Valid @gmail.com", fmt.Sprintf("test.%d@gmail.com", time.Now().Unix()), "Test@123", "Test User", "0987654321", "STAFF"},
		{"Short password", fmt.Sprintf("test2.%d@fpt.edu.vn", time.Now().Unix()), "Test", "Test User", "0987654321", "STAFF"},
		{"Invalid phone", fmt.Sprintf("test3.%d@fpt.edu.vn", time.Now().Unix()), "Test@123", "Test User", "123456", "STAFF"},
		{"Invalid role", fmt.Sprintf("test4.%d@fpt.edu.vn", time.Now().Unix()), "Test@123", "Test User", "0987654321", "STUDENT"},
	}

	for i, tc := range testCases {
		fmt.Printf("\n[%d] Testing: %s\n", i+2, tc.name)
		fmt.Printf("    Email: %s\n", tc.email)
		fmt.Printf("    Password: %s\n", tc.pass)
		fmt.Printf("    Phone: %s\n", tc.phone)
		fmt.Printf("    Role: %s\n", tc.role)

		createBody := map[string]string{
			"email":    tc.email,
			"password": tc.pass,
			"fullName": tc.fname,
			"phone":    tc.phone,
			"role":     tc.role,
		}
		createJSON, _ := json.Marshal(createBody)

		req, _ := http.NewRequest("POST", "http://localhost:8080/api/admin/create-account", bytes.NewBuffer(createJSON))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			fmt.Printf("    ❌ Request error: %v\n", err)
			continue
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		fmt.Printf("    Status: %d\n", resp.StatusCode)
		if len(body) > 0 {
			var result map[string]interface{}
			if err := json.Unmarshal(body, &result); err == nil {
				prettyJSON, _ := json.MarshalIndent(result, "    ", "  ")
				fmt.Printf("    Response:\n%s\n", string(prettyJSON))
			} else {
				fmt.Printf("    Raw Response: %s\n", string(body))
			}
		} else {
			fmt.Printf("    ⚠️  Response body is EMPTY\n")
		}

		if resp.StatusCode == 201 || resp.StatusCode == 200 {
			fmt.Printf("    ✅ SUCCESS\n")
		} else {
			fmt.Printf("    ❌ FAILED\n")
		}

		time.Sleep(500 * time.Millisecond)
	}

	fmt.Println("\n╔═══════════════════════════════════════════╗")
	fmt.Println("║          TEST COMPLETED                   ║")
	fmt.Println("╚═══════════════════════════════════════════╝")
}
