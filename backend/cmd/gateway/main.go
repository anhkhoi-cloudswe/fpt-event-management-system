package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fpt-event-services/common/jwt"
	"github.com/fpt-event-services/common/registry"
	"github.com/fpt-event-services/common/storage"
	"github.com/joho/godotenv"
)

// ============================================================
// Local API Gateway — Reverse Proxy
// Điều hướng request từ http://localhost:8080 tới 6 Microservices
// ============================================================

// Route defines a path prefix → service name mapping
type Route struct {
	Prefix string
	Name   string // Must match registry.ServiceInfo.Name
}

// Routing table — xếp theo thứ tự cụ thể → tổng quát (longest prefix first)
// Để tránh xung đột giữa /api/staff/event-requests (Event) và /api/staff/* (Staff)
var routes = []Route{
	// ========== Auth Service (8081) ==========
	{"/api/login", "Auth"},
	{"/api/logout", "Auth"},
	{"/api/v1/auth/me", "Auth"},
	{"/api/auth/me", "Auth"},
	{"/api/register", "Auth"},
	{"/api/forgot-password", "Auth"},
	{"/api/reset-password", "Auth"},
	{"/api/admin/create-account", "Auth"},
	{"/api/users/", "Auth"},

	// ========== Event Service (8082) ==========
	{"/api/v1/events", "Event"},           // v1 events API (longest prefix first)
	{"/api/events", "Event"},
	{"/api/event/", "Event"}, // singular alias (e.g. /api/event/disable)
	{"/api/event-requests", "Event"},
	{"/api/staff/event-requests", "Event"}, // Specific: before /api/staff/*
	{"/api/organizer/", "Event"},

	// ========== Ticket Service (8083) ==========
	{"/api/registrations/", "Ticket"},
	{"/api/tickets/", "Ticket"},
	{"/api/category-tickets", "Ticket"},
	{"/api/bills/", "Ticket"},
	{"/api/payment", "Ticket"},
	{"/api/buyTicket", "Ticket"},
	{"/api/wallet/", "Ticket"},

	// ========== Venue Service (8084) ==========
	{"/api/venues", "Venue"},
	{"/api/areas/", "Venue"},
	{"/api/seats", "Venue"},

	// ========== Staff Service (8085) ==========
	{"/api/staff/", "Staff"},
	{"/api/admin/config/", "Staff"},
	{"/api/student/", "Staff"},

	// ========== Notification Service (8086) - Internal ==========
	{"/internal/notify/", "Notification"},
}

// Service name → backend URL mapping (populated from registry)
var backends map[string]string

func init() {
	// ── Load .env ──────────────────────────────────────────────
	exe, _ := os.Executable()
	exeDir := filepath.Dir(exe)

	candidates := []string{
		filepath.Join(exeDir, "..", "..", ".env"),
		filepath.Join("backend", ".env"),
		filepath.Join(exeDir, ".env"),
		filepath.Join("..", "..", ".env"),
		filepath.Join("..", ".env"),
		".env",
	}

	envLoaded := false
	for _, p := range candidates {
		abs, _ := filepath.Abs(p)
		if _, err := os.Stat(abs); err == nil {
			if err := godotenv.Overload(abs); err == nil {
				log.Printf("[GATEWAY] ✅ Loaded env from %s", abs)
				envLoaded = true
				break
			}
		}
	}
	if !envLoaded {
		log.Println("[GATEWAY] ⚠️  No .env file found — relying on process environment")
	}

	// ── Reload JWT secret ────────────────────────────────────
	jwt.ReloadSecret()
	log.Printf("[GATEWAY] 🔑 JWT_SECRET active: %s", jwt.GetSecretPreview())

	// ── Build backends from registry ─────────────────────────
	backends = registry.AllBackendURLs()
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func isAuthMePath(path string) bool {
	return path == "/api/v1/auth/me" || path == "/api/auth/me"
}

// resolveBackend finds the matching backend for a given path
func resolveBackend(path string) (backendURL string, serviceName string, found bool) {
	bestLen := 0
	for _, r := range routes {
		if strings.HasPrefix(path, r.Prefix) && len(r.Prefix) > bestLen {
			bestLen = len(r.Prefix)
			serviceName = r.Name
			found = true
		}
	}
	if found {
		backendURL = backends[serviceName]
	}
	return
}

// createProxy creates a reverse proxy for a backend URL
func createProxy(target string) (*httputil.ReverseProxy, error) {
	u, err := url.Parse(target)
	if err != nil {
		return nil, err
	}
	proxy := httputil.NewSingleHostReverseProxy(u)
	proxy.ModifyResponse = func(resp *http.Response) error {
		// Gateway owns CORS policy to keep cookie-based auth consistent.
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Credentials")
		resp.Header.Del("Access-Control-Allow-Methods")
		resp.Header.Del("Access-Control-Allow-Headers")
		resp.Header.Del("Access-Control-Expose-Headers")
		resp.Header.Del("Access-Control-Max-Age")
		return nil
	}

	// Custom error handler
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("[GATEWAY] [ERROR] %s %s -> %s: %v", r.Method, r.URL.Path, target, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Service unavailable",
			"service": target,
			"detail":  err.Error(),
		})
	}

	return proxy, nil
}

// jwtMiddleware extracts user claims from JWT token and injects X-User-* headers
// into the request before forwarding to backend services (Trusted Gateway pattern).
// If no token is present, the request passes through without identity headers (public APIs).
func jwtMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Let /auth/me pass through untouched so Auth service can decode cookie directly.
		if isAuthMePath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		token := ""
		if cookie, err := r.Cookie("token"); err == nil && strings.TrimSpace(cookie.Value) != "" {
			token = cookie.Value
		}

		if token == "" {
			authHeader := r.Header.Get("Authorization")
			if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
				token = authHeader[7:]
			}
		}

		if token != "" {
			claims, err := jwt.ValidateToken(token)
			if err != nil {
				log.Printf("[GATEWAY] [JWT] ❌ Token validation failed: %v", err)
				log.Printf("[GATEWAY] [JWT] 🔑 Gateway secret: %s", jwt.GetSecretPreview())
				// Security: Don't log token content/prefix - only size info
				if len(token) > 20 {
					log.Printf("[GATEWAY] [JWT] 📝 Token size: %d bytes (valid JWT structure: header.payload.sig)", len(token))
				}
				// Decode token parts for diagnosis (header.payload.sig) - size only, no content
				parts := strings.SplitN(token, ".", 3)
				if len(parts) == 3 {
					log.Printf("[GATEWAY] [JWT] 📐 Token structure: header=%d, payload=%d, sig=%d bytes",
						len(parts[0]), len(parts[1]), len(parts[2]))
				}
				if strings.Contains(err.Error(), "signature is invalid") {
					log.Printf("[GATEWAY] [JWT] ⚠️  HINT: Auth Service may be signing with a different secret!")
					log.Printf("[GATEWAY] [JWT] ⚠️  Verify all terminals show the same 🔑 preview.")
				}
				// Don't block — let backend decide if auth is required
			} else if claims != nil {
				r.Header.Set("X-User-Id", fmt.Sprintf("%d", claims.UserID))
				r.Header.Set("X-User-Role", claims.Role)
				r.Header.Set("X-User-Email", claims.Email)
				log.Printf("[GATEWAY] [JWT] ✅ Token validated for UserID: %d, Role: %s",
					claims.UserID, claims.Role)
			}
		}
		next.ServeHTTP(w, r)
	})
}

// corsMiddleware adds CORS headers and handles preflight
func corsMiddleware(next http.Handler) http.Handler {
	allowedOrigins := getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Determine allowed origin
		if allowedOrigins == "*" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else {
			origins := strings.Split(allowedOrigins, ",")
			for _, o := range origins {
				if strings.TrimSpace(o) == origin {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					break
				}
			}
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS,PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With,X-User-Id,X-User-Role,X-User-Email")
		w.Header().Set("Access-Control-Expose-Headers", "X-User-Id,X-User-Role,X-User-Email")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	port := getEnv("GATEWAY_PORT", "8080")

	// Pre-create proxies for each backend
	proxies := make(map[string]*httputil.ReverseProxy)
	for name, backendURL := range backends {
		proxy, err := createProxy(backendURL)
		if err != nil {
			log.Fatalf("[GATEWAY] Failed to create proxy for %s (%s): %v", name, backendURL, err)
		}
		proxies[name] = proxy
	}

	mux := http.NewServeMux()

	// Health check — aggregate all backends
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		results := make(map[string]string)
		allOK := true

		client := &http.Client{Timeout: 3 * time.Second}
		for name, backendURL := range backends {
			resp, err := client.Get(backendURL + "/health")
			if err != nil {
				results[name] = fmt.Sprintf("DOWN: %v", err)
				allOK = false
			} else {
				resp.Body.Close()
				if resp.StatusCode == 200 {
					results[name] = "UP"
				} else {
					results[name] = fmt.Sprintf("HTTP %d", resp.StatusCode)
					allOK = false
				}
			}
		}

		status := http.StatusOK
		if !allOK {
			status = http.StatusServiceUnavailable
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"gateway":  "UP",
			"services": results,
		})
	})

	// ── Upload handler — handled natively at gateway level ──────────
	// Multipart/form-data cannot be cleanly forwarded through the Lambda
	// adapter used by each microservice (adaptRequest reads body as string).
	// The gateway is a native Go HTTP server, so it handles multipart directly.
	// jwtMiddleware (applied below) already validates JWT and sets X-User-Role.
	mux.HandleFunc("/api/upload/image", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[GATEWAY] ↑ UPLOAD %s %s (handled natively)", r.Method, r.URL.Path)
		storage.HandleImageUpload(w, r)
	})

	// Main routing handler
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		backendURL, serviceName, found := resolveBackend(path)
		if !found {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "No service registered for path: " + path,
			})
			return
		}

		// Log routing decision with full URL
		log.Printf("[GATEWAY] %s %s?%s -> %s (%s)", r.Method, path, r.URL.RawQuery, serviceName, backendURL)

		// Use pre-created proxy
		proxy := proxies[serviceName]
		proxy.ServeHTTP(w, r)
	})

	handler := corsMiddleware(jwtMiddleware(mux))

	log.Println("============================================================")
	log.Println("  FPT Event Management — Local API Gateway")
	log.Println("============================================================")
	log.Printf("  Gateway:      http://localhost:%s", port)
	for name, url := range backends {
		log.Printf("  %-14s %s", name+":", url)
	}
	log.Println("============================================================")
	log.Printf("[OK] Gateway listening on http://localhost:%s", port)

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("[FAIL] Gateway failed: %v", err)
	}
}
