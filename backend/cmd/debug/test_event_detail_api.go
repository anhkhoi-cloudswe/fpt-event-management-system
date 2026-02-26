package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

func main() {
	// Test API event detail
	resp, err := http.Get("http://localhost:8080/api/events/detail?id=1032")
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Response Status:", resp.StatusCode)
	fmt.Println("Response Body:")

	// Pretty print JSON
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	prettyJSON, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(prettyJSON))

	// Check areaId specifically
	if areaId, ok := result["areaId"]; ok {
		fmt.Printf("\n✅ areaId = %v\n", areaId)
	} else {
		fmt.Println("\n❌ areaId NOT FOUND in response")
	}
}
