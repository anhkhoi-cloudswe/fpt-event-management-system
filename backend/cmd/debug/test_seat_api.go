package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

func main() {
	// Wait for backend to start
	time.Sleep(2 * time.Second)

	// Test API với eventId
	fmt.Println("Testing: GET /api/seats?areaId=8&eventId=1032")
	resp, err := http.Get("http://localhost:8080/api/seats?areaId=8&eventId=1032")
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	fmt.Println("Status:", resp.StatusCode)

	// Pretty print
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	prettyJSON, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(prettyJSON))

	// Test với seatType filter
	fmt.Println("\n\nTesting: GET /api/seats?areaId=8&eventId=1032&seatType=VIP")
	resp2, err := http.Get("http://localhost:8080/api/seats?areaId=8&eventId=1032&seatType=VIP")
	if err != nil {
		log.Fatal(err)
	}
	defer resp2.Body.Close()

	body2, _ := io.ReadAll(resp2.Body)
	fmt.Println("Status:", resp2.StatusCode)

	var result2 map[string]interface{}
	json.Unmarshal(body2, &result2)
	prettyJSON2, _ := json.MarshalIndent(result2, "", "  ")
	fmt.Println(string(prettyJSON2))
}
