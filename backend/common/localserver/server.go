package localserver

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/jwt"
	"github.com/joho/godotenv"
)

// LambdaHandler is the function signature for AWS Lambda handlers
type LambdaHandler func(context.Context, events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error)

// IsLocal returns true if running outside AWS Lambda (local development)
func IsLocal() bool {
	return os.Getenv("AWS_LAMBDA_FUNCTION_NAME") == ""
}

// LoadEnvAndSyncJWT loads the project's .env file using multiple candidate paths
// (robust: works regardless of CWD) and then calls jwt.ReloadSecret() to ensure
// the JWT signing key matches across all services.
// serviceName is used for logging, e.g. "Auth", "Ticket".
func LoadEnvAndSyncJWT(serviceName string) {
	exe, _ := os.Executable()
	exeDir := filepath.Dir(exe)

	candidates := []string{
		// When binary is in services/<name>/ → ../../.env = backend/.env
		filepath.Join(exeDir, "..", "..", ".env"),
		// When CWD = project root
		filepath.Join("backend", ".env"),
		// Same directory as executable
		filepath.Join(exeDir, ".env"),
		// Relative fallbacks
		filepath.Join("..", "..", ".env"),
		filepath.Join("..", ".env"),
		".env",
	}

	envLoaded := false
	for _, p := range candidates {
		abs, _ := filepath.Abs(p)
		if _, err := os.Stat(abs); err == nil {
			if err := godotenv.Overload(abs); err == nil {
				log.Printf("[%s] ✅ Loaded env from %s", serviceName, abs)
				envLoaded = true
				break
			}
		}
	}
	if !envLoaded {
		log.Printf("[%s] ⚠️  No .env file found — relying on process environment", serviceName)
	}

	// Re-read JWT_SECRET from environment AFTER .env is loaded.
	// Package-level var in common/jwt is initialized before init() runs,
	// so it may hold the hardcoded fallback. This ensures consistency.
	jwt.ReloadSecret()
	log.Printf("[%s] 🔑 JWT_SECRET active: %s", serviceName, jwt.GetSecretPreview())
}

// Start runs the Lambda handler as a local HTTP server
// port: e.g. "8081" (reads from LOCAL_PORT env var if not empty)
func Start(defaultPort string, handler LambdaHandler) {
	port := os.Getenv("LOCAL_PORT")
	if port == "" {
		port = defaultPort
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Convert http.Request → APIGatewayProxyRequest
		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadRequest)
			return
		}

		// Call Lambda handler
		resp, err := handler(r.Context(), req)
		if err != nil {
			log.Printf("[ERROR] Handler error: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
			return
		}

		// Write response
		writeResponse(w, resp)
	}))

	addr := ":" + port
	log.Printf("[OK] Local HTTP server started on http://localhost:%s", port)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[FAIL] Server failed: %v", err)
	}
}

// adaptRequest converts http.Request to APIGatewayProxyRequest
func adaptRequest(r *http.Request) (events.APIGatewayProxyRequest, error) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return events.APIGatewayProxyRequest{}, err
	}
	defer r.Body.Close()

	headers := make(map[string]string)
	for key, values := range r.Header {
		if len(values) > 0 {
			headers[key] = values[0]
		}
	}

	queryParams := make(map[string]string)
	for key, values := range r.URL.Query() {
		if len(values) > 0 {
			queryParams[key] = values[0]
		}
	}

	return events.APIGatewayProxyRequest{
		HTTPMethod:            r.Method,
		Path:                  r.URL.Path,
		Headers:               headers,
		QueryStringParameters: queryParams,
		Body:                  string(body),
	}, nil
}

// writeResponse writes APIGatewayProxyResponse to http.ResponseWriter
func writeResponse(w http.ResponseWriter, resp events.APIGatewayProxyResponse) {

	for key, value := range resp.Headers {
		w.Header().Set(key, value)
	}

	// Ensure Content-Type is set
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "application/json")
	}

	w.WriteHeader(resp.StatusCode)
	w.Write([]byte(resp.Body))

	// Log request
	status := resp.StatusCode
	var bodyPreview string
	if len(resp.Body) > 100 {
		bodyPreview = resp.Body[:100] + "..."
	} else {
		bodyPreview = resp.Body
	}

	// Parse the body to get a cleaner log
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &parsed); err == nil {
		if errMsg, ok := parsed["error"]; ok {
			log.Printf("[%d] %v", status, errMsg)
			return
		}
	}
	_ = bodyPreview
}

// getAllowedOrigin returns the appropriate CORS origin based on CORS_ALLOWED_ORIGINS env var
func getAllowedOrigin(requestOrigin string) string {
	allowed := os.Getenv("CORS_ALLOWED_ORIGINS")
	if allowed == "" || allowed == "*" {
		return "*"
	}
	for _, o := range strings.Split(allowed, ",") {
		if strings.TrimSpace(o) == requestOrigin {
			return requestOrigin
		}
	}
	// If origin not in list, return first allowed origin (browser will block if mismatch)
	parts := strings.Split(allowed, ",")
	if len(parts) > 0 {
		return strings.TrimSpace(parts[0])
	}
	return "*"
}

// corsMiddleware handles CORS preflight using CORS_ALLOWED_ORIGINS from .env
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		w.Header().Set("Access-Control-Allow-Origin", getAllowedOrigin(origin))
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS,PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With,X-User-Id,X-User-Role,X-User-Email")
		w.Header().Set("Access-Control-Expose-Headers", "X-User-Id,X-User-Role,X-User-Email")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Log incoming request
		path := r.URL.Path
		method := r.Method
		if !strings.HasPrefix(path, "/favicon") {
			log.Printf("[%s] %s", method, path)
		}

		next(w, r)
	}
}
