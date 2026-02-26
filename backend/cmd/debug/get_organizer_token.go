package main
import ("bytes"; "encoding/json"; "fmt"; "io"; "net/http")
func main() {
payload := map[string]string{"email": "huy.lqclub@fpt.edu.vn", "password": "123456"}
jsonData, _ := json.Marshal(payload)
resp, _ := http.Post("http://localhost:8080/api/auth/login", "application/json", bytes.NewBuffer(jsonData))
defer resp.Body.Close()
body, _ := io.ReadAll(resp.Body)
fmt.Printf("Status: %d\n", resp.StatusCode)
fmt.Printf("Response: %s\n", string(body))
}
