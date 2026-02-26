package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func main() {
	// Login with admin
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
		fmt.Println("❌ Failed to get token")
		fmt.Println("Response:", string(body))
		return
	}

	fmt.Println("✅ Login successful")

	// 1. Test GET /api/admin/config/system
	fmt.Println("\n========================================")
	fmt.Println("TEST 1: GET /api/admin/config/system")
	fmt.Println("========================================")

	req, _ := http.NewRequest("GET", "http://localhost:8080/api/admin/config/system", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	resp2, err := client.Do(req)
	if err != nil {
		fmt.Println("❌ GET error:", err)
		return
	}
	defer resp2.Body.Close()

	body2, _ := io.ReadAll(resp2.Body)
	fmt.Println("Status:", resp2.StatusCode)

	var getResult map[string]interface{}
	if err := json.Unmarshal(body2, &getResult); err == nil {
		prettyJSON, _ := json.MarshalIndent(getResult, "", "  ")
		fmt.Println(string(prettyJSON))
	} else {
		fmt.Println("Response:", string(body2))
	}

	// 2. Test POST /api/admin/config/system
	fmt.Println("\n========================================")
	fmt.Println("TEST 2: POST /api/admin/config/system")
	fmt.Println("========================================")

	updateData := map[string]int{
		"minMinutesAfterStart":             90,
		"checkinAllowedBeforeStartMinutes": 120,
	}
	updateJSON, _ := json.Marshal(updateData)

	req3, _ := http.NewRequest("POST", "http://localhost:8080/api/admin/config/system", bytes.NewBuffer(updateJSON))
	req3.Header.Set("Authorization", "Bearer "+token)
	req3.Header.Set("Content-Type", "application/json")

	resp3, err := client.Do(req3)
	if err != nil {
		fmt.Println("❌ POST error:", err)
		return
	}
	defer resp3.Body.Close()

	body3, _ := io.ReadAll(resp3.Body)
	fmt.Println("Status:", resp3.StatusCode)

	var postResult map[string]interface{}
	if err := json.Unmarshal(body3, &postResult); err == nil {
		prettyJSON, _ := json.MarshalIndent(postResult, "", "  ")
		fmt.Println(string(prettyJSON))
	} else {
		fmt.Println("Response:", string(body3))
	}

	// 3. Verify GET again
	fmt.Println("\n========================================")
	fmt.Println("TEST 3: Verify GET after update")
	fmt.Println("========================================")

	req4, _ := http.NewRequest("GET", "http://localhost:8080/api/admin/config/system", nil)
	req4.Header.Set("Authorization", "Bearer "+token)

	resp4, err := client.Do(req4)
	if err != nil {
		fmt.Println("❌ GET error:", err)
		return
	}
	defer resp4.Body.Close()

	body4, _ := io.ReadAll(resp4.Body)
	fmt.Println("Status:", resp4.StatusCode)

	var verifyResult map[string]interface{}
	if err := json.Unmarshal(body4, &verifyResult); err == nil {
		prettyJSON, _ := json.MarshalIndent(verifyResult, "", "  ")
		fmt.Println(string(prettyJSON))
	} else {
		fmt.Println("Response:", string(body4))
	}

	fmt.Println("\n✅ All tests completed!")
}
