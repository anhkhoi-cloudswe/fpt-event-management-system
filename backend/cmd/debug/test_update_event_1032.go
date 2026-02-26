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
	time.Sleep(1 * time.Second)

	// Login as ORGANIZER
	loginBody := map[string]string{
		"email":    "huy.lqclub@fpt.edu.vn",
		"password": "123456",
	}

	loginJSON, _ := json.Marshal(loginBody)
	loginResp, _ := http.Post("http://localhost:8080/api/auth/login", "application/json", bytes.NewBuffer(loginJSON))
	defer loginResp.Body.Close()

	var loginResult map[string]interface{}
	json.NewDecoder(loginResp.Body).Decode(&loginResult)

	if loginResult["token"] == nil {
		fmt.Println("Login failed:", loginResult)
		return
	}

	token := loginResult["token"].(string)
	fmt.Println("Logged in. Token:", token[:20]+"...")

	// Update event details
	updateBody := map[string]interface{}{
		"eventId": 1032,
		"speaker": map[string]string{
			"fullName":  "Nguyễn Anh Dũng",
			"bio":       "Diễn giả của sự kiện CAREER MOVE",
			"avatarUrl": "",
		},
		"tickets": []map[string]interface{}{
			{
				"name":        "VIP",
				"description": "Giá vé VIP",
				"price":       150000,
				"maxQuantity": 30,
				"status":      "ACTIVE",
			},
			{
				"name":        "STANDARD",
				"description": "Giá vé STANDARD",
				"price":       50000,
				"maxQuantity": 70,
				"status":      "ACTIVE",
			},
		},
		"bannerUrl": "",
	}

	updateJSON, _ := json.Marshal(updateBody)

	req, _ := http.NewRequest("POST", "http://localhost:8080/api/events/update-details", bytes.NewBuffer(updateJSON))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	updateResp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer updateResp.Body.Close()

	body, _ := io.ReadAll(updateResp.Body)

	fmt.Println("\nUpdate response:")
	fmt.Println("Status:", updateResp.StatusCode)
	fmt.Println("Body:", string(body))
}
