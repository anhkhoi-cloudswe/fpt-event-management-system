package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func main() {
	// Token for ORGANIZER (huy.lqclub@fpt.edu.vn)
	token := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjMsImVtYWlsIjoiaHV5LmxxY2x1YkBmcHQuZWR1LnZuIiwicm9sZSI6Ik9SR0FOSVpFUiIsImV4cCI6MTc3MDQ1MjY2NiwiaWF0IjoxNzY5ODQ3ODY2fQ.gcZKSIr5qNHELwUUvQAdIHhnF6C0XNFksZJNdUBpQp0"

	// Update event 1030 (Testing) with speaker and tickets
	payload := map[string]interface{}{
		"eventId": 1030,
		"speaker": map[string]interface{}{
			"fullName":  "John Doe",
			"bio":       "Test speaker bio",
			"email":     "john@example.com",
			"phone":     "0123456789",
			"avatarUrl": "",
		},
		"bannerUrl": "",
		"tickets": []map[string]interface{}{
			{
				"name":        "VIP",
				"description": "VIP ticket",
				"price":       200000,
				"maxQuantity": 30,
				"status":      "ACTIVE",
			},
			{
				"name":        "STANDARD",
				"description": "Standard ticket",
				"price":       100000,
				"maxQuantity": 70,
				"status":      "ACTIVE",
			},
		},
	}

	jsonData, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "http://localhost:8080/api/events/update-details", bytes.NewBuffer(jsonData))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("Status: %d\n", resp.StatusCode)
	fmt.Printf("Response: %s\n", string(body))
}
