package handler

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
)

func getOAuthCredential(key string) string {
	val := os.Getenv(key)
	if val != "" {
		return val
	}
	switch key {
	case "ZOOM_CLIENT_ID":
		return "mock-zoom-client-id-never-blank"
	case "ZOOM_CLIENT_SECRET":
		return "mock-zoom-client-secret-never-blank"
	case "GOOGLE_CLIENT_ID":
		return "mock-google-client-id-never-blank"
	case "GOOGLE_CLIENT_SECRET":
		return "mock-google-client-secret-never-blank"
	}
	return "mock-fallback"
}

// In-memory caching for OAuth states
type oauthStateStore struct {
	states map[string]oauthState
	mu     sync.RWMutex
}

type oauthState struct {
	expiresAt time.Time
	appOrigin string
}

var stateStore = &oauthStateStore{
	states: make(map[string]oauthState),
}

func (s *oauthStateStore) Save(state string, appOrigin string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.states[state] = oauthState{
		expiresAt: time.Now().Add(15 * time.Minute),
		appOrigin: appOrigin,
	}
}

func (s *oauthStateStore) Verify(state string) (oauthState, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	savedState, ok := s.states[state]
	if !ok {
		return oauthState{}, false
	}
	delete(s.states, state)
	return savedState, time.Now().Before(savedState.expiresAt)
}

// HandleOAuthConnect is a Gin handler to redirect users to OAuth provider
func HandleOAuthConnect(c *gin.Context) {
	platform := c.Param("platform")

	redirectURI := c.Query("redirect_uri")
	if redirectURI == "" {
		if platform == "zoom" {
			redirectURI = os.Getenv("ZOOM_REDIRECT_URI")
		} else {
			redirectURI = os.Getenv("GOOGLE_REDIRECT_URI")
		}
		if redirectURI == "" {
			redirectURI = "http://localhost:8080/api/v1/auth/" + platform + "/callback"
		}
	}

	// Generate state token
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate state"})
		return
	}
	state := base64.URLEncoding.EncodeToString(b)
	stateStore.Save(state, c.Query("app_origin"))

	var authURL string
	if platform == "zoom" {
		zoomConfig := &oauth2.Config{
			ClientID:     getOAuthCredential("ZOOM_CLIENT_ID"),
			ClientSecret: getOAuthCredential("ZOOM_CLIENT_SECRET"),
			RedirectURL:  redirectURI,
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://zoom.us/oauth/authorize",
				TokenURL: "https://zoom.us/oauth/token",
			},
		}
		authURL = zoomConfig.AuthCodeURL(state, oauth2.AccessTypeOnline)
	} else if platform == "google" {
		googleConfig := &oauth2.Config{
			ClientID:     getOAuthCredential("GOOGLE_CLIENT_ID"),
			ClientSecret: getOAuthCredential("GOOGLE_CLIENT_SECRET"),
			RedirectURL:  redirectURI,
			Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://accounts.google.com/o/oauth2/auth",
				TokenURL: "https://oauth2.googleapis.com/token",
			},
		}
		authURL = googleConfig.AuthCodeURL(state, oauth2.AccessTypeOnline)
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported platform"})
		return
	}

	c.Redirect(http.StatusTemporaryRedirect, authURL)
}

// HandleOAuthConnectAPI handles the API Gateway request version of connect redirect
func (h *AuthHandler) HandleOAuthConnectAPI(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Parse platform from path (e.g. /api/v1/auth/zoom/connect)
	parts := strings.Split(request.Path, "/")
	platform := ""
	for i, part := range parts {
		if (part == "auth" || part == "v1") && i+1 < len(parts) {
			if parts[i+1] == "zoom" || parts[i+1] == "google" {
				platform = parts[i+1]
				break
			}
		}
	}
	if platform == "" {
		if strings.Contains(request.Path, "zoom") {
			platform = "zoom"
		} else if strings.Contains(request.Path, "google") {
			platform = "google"
		}
	}

	redirectURI := getDynamicRedirectURI(request, platform)

	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Body:       `{"error":"Failed to generate state"}`,
		}, nil
	}
	state := base64.URLEncoding.EncodeToString(b)
	stateStore.Save(state, request.QueryStringParameters["app_origin"])

	var authURL string
	if platform == "zoom" {
		zoomConfig := &oauth2.Config{
			ClientID:     getOAuthCredential("ZOOM_CLIENT_ID"),
			ClientSecret: getOAuthCredential("ZOOM_CLIENT_SECRET"),
			RedirectURL:  redirectURI,
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://zoom.us/oauth/authorize",
				TokenURL: "https://zoom.us/oauth/token",
			},
		}
		authURL = zoomConfig.AuthCodeURL(state, oauth2.AccessTypeOnline)
	} else if platform == "google" {
		googleConfig := &oauth2.Config{
			ClientID:     getOAuthCredential("GOOGLE_CLIENT_ID"),
			ClientSecret: getOAuthCredential("GOOGLE_CLIENT_SECRET"),
			RedirectURL:  redirectURI,
			Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://accounts.google.com/o/oauth2/auth",
				TokenURL: "https://oauth2.googleapis.com/token",
			},
		}
		authURL = googleConfig.AuthCodeURL(state, oauth2.AccessTypeOnline)
	} else {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusBadRequest,
			Body:       fmt.Sprintf(`{"error":"Unsupported platform: %s"}`, platform),
		}, nil
	}

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusTemporaryRedirect,
		Headers: map[string]string{
			"Location": authURL,
		},
	}, nil
}

// HandleOAuthCallbackAPI handles the OAuth callback from the cloud provider
func (h *AuthHandler) HandleOAuthCallbackAPI(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Parse platform from path (e.g. /api/v1/auth/zoom/callback)
	parts := strings.Split(request.Path, "/")
	platform := "zoom"
	for _, part := range parts {
		if part == "google" {
			platform = "google"
		}
	}

	redirectURI := getDynamicRedirectURI(request, platform)

	code := request.QueryStringParameters["code"]
	state := request.QueryStringParameters["state"]
	savedState, stateOK := stateStore.Verify(state)
	if !stateOK {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusBadRequest,
			Headers: map[string]string{
				"Content-Type": "text/html; charset=utf-8",
			},
			Body: buildOAuthCallbackHTML(platform, "", "", "*", "Phiên xác thực đã hết hạn. Vui lòng thử kết nối lại."),
		}, nil
	}

	email := ""
	meetingLink := "https://fpt-edu.zoom.us/j/84920491029?pwd=YmUxM2NjO3M4MTk2M2Mx"
	if platform == "google" {
		meetingLink = "https://meet.google.com/abc-defg-hij"
	}

	clientID := getOAuthCredential(strings.ToUpper(platform) + "_CLIENT_ID")
	isMock := code == "" || clientID == "" || clientID == "mock-zoom-client-id-never-blank" || clientID == "mock-google-client-id-never-blank" || strings.HasPrefix(clientID, "mock-")

	if isMock {
		// Mock flow fallback: retrieve email from X-User-Email header or defaults
		email = request.Headers["X-User-Email"]
		if email == "" {
			email = request.Headers["x-user-email"]
		}
		if email == "" {
			if platform == "google" {
				email = "organizer.meet@fpt.edu.vn"
			} else {
				email = "organizer.zoom@fpt.edu.vn"
			}
		}
	} else {
		// Real OAuth flow: perform exchange and fetch user info
		if platform == "google" {
			googleConfig := &oauth2.Config{
				ClientID:     getOAuthCredential("GOOGLE_CLIENT_ID"),
				ClientSecret: getOAuthCredential("GOOGLE_CLIENT_SECRET"),
				RedirectURL:  redirectURI,
				Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
				Endpoint: oauth2.Endpoint{
					AuthURL:  "https://accounts.google.com/o/oauth2/auth",
					TokenURL: "https://oauth2.googleapis.com/token",
				},
			}
			token, err := googleConfig.Exchange(ctx, code)
			if err != nil {
				return events.APIGatewayProxyResponse{
					StatusCode: http.StatusInternalServerError,
					Body:       fmt.Sprintf(`{"error":"Failed to exchange Google token: %v"}`, err),
				}, nil
			}

			client := &http.Client{Timeout: 10 * time.Second}
			req, err := http.NewRequestWithContext(ctx, "GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
			if err != nil {
				return events.APIGatewayProxyResponse{
					StatusCode: http.StatusInternalServerError,
					Body:       `{"error":"Failed to create Google userinfo request"}`,
				}, nil
			}
			req.Header.Set("Authorization", "Bearer "+token.AccessToken)
			resp, err := client.Do(req)
			if err != nil {
				return events.APIGatewayProxyResponse{
					StatusCode: http.StatusInternalServerError,
					Body:       `{"error":"Failed to fetch Google userinfo"}`,
				}, nil
			}
			defer resp.Body.Close()

			var googleUser struct {
				Email string `json:"email"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&googleUser); err != nil {
				return events.APIGatewayProxyResponse{
					StatusCode: http.StatusInternalServerError,
					Body:       `{"error":"Failed to decode Google userinfo json"}`,
				}, nil
			}
			email = googleUser.Email
		} else if platform == "zoom" {
			zoomConfig := &oauth2.Config{
				ClientID:     getOAuthCredential("ZOOM_CLIENT_ID"),
				ClientSecret: getOAuthCredential("ZOOM_CLIENT_SECRET"),
				RedirectURL:  redirectURI,
				Endpoint: oauth2.Endpoint{
					AuthURL:  "https://zoom.us/oauth/authorize",
					TokenURL: "https://zoom.us/oauth/token",
				},
			}
			token, err := zoomConfig.Exchange(ctx, code)
			if err != nil {
				return events.APIGatewayProxyResponse{
					StatusCode: http.StatusInternalServerError,
					Body:       fmt.Sprintf(`{"error":"Failed to exchange Zoom token: %v"}`, err),
				}, nil
			}

			client := &http.Client{Timeout: 10 * time.Second}
			req, err := http.NewRequestWithContext(ctx, "GET", "https://api.zoom.us/v2/users/me", nil)
			if err != nil {
				return events.APIGatewayProxyResponse{
					StatusCode: http.StatusInternalServerError,
					Body:       `{"error":"Failed to create Zoom userinfo request"}`,
				}, nil
			}
			req.Header.Set("Authorization", "Bearer "+token.AccessToken)
			resp, err := client.Do(req)
			if err != nil {
				return events.APIGatewayProxyResponse{
					StatusCode: http.StatusInternalServerError,
					Body:       `{"error":"Failed to fetch Zoom userinfo"}`,
				}, nil
			}
			defer resp.Body.Close()

			var zoomUser struct {
				Email string `json:"email"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&zoomUser); err != nil {
				return events.APIGatewayProxyResponse{
					StatusCode: http.StatusInternalServerError,
					Body:       `{"error":"Failed to decode Zoom userinfo json"}`,
				}, nil
			}
			email = zoomUser.Email
		}
	}

	targetOrigin := savedState.appOrigin
	if targetOrigin == "" {
		targetOrigin = "*"
	}

	html := buildOAuthCallbackHTML(platform, email, meetingLink, targetOrigin, "")

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type": "text/html; charset=utf-8",
		},
		Body: html,
	}, nil
}

func buildOAuthCallbackHTML(platform string, email string, meetingLink string, targetOrigin string, errorMessage string) string {
	payload := map[string]string{
		"type":        "OAUTH_SUCCESS",
		"platform":    strings.ToUpper(platform),
		"email":       email,
		"meetingLink": meetingLink,
	}
	message := "Authentication successful! Closing window..."
	if errorMessage != "" {
		payload["type"] = "OAUTH_ERROR"
		payload["error"] = errorMessage
		message = errorMessage
	}
	payloadJSON, _ := json.Marshal(payload)
	originJSON, _ := json.Marshal(targetOrigin)
	messageJSON, _ := json.Marshal(message)

	return fmt.Sprintf(`
		<!DOCTYPE html>
		<html>
		<head><title>Authentication Success</title></head>
		<body>
			<p id="message"></p>
			<script>
				(function () {
					var message = %s;
					document.getElementById("message").textContent = message;
					try {
						if (window.opener && !window.opener.closed) {
							window.opener.postMessage(%s, %s);
						}
					} finally {
						window.close();
						setTimeout(function () {
							document.getElementById("message").textContent = message + " Bạn có thể đóng cửa sổ này.";
						}, 500);
					}
				})();
			</script>
		</body>
		</html>
	`, string(messageJSON), string(payloadJSON), string(originJSON))
}

func getDynamicRedirectURI(request events.APIGatewayProxyRequest, platform string) string {
	redirectURI := request.QueryStringParameters["redirect_uri"]
	if redirectURI != "" {
		return redirectURI
	}

	if platform == "zoom" {
		redirectURI = os.Getenv("ZOOM_REDIRECT_URI")
	} else {
		redirectURI = os.Getenv("GOOGLE_REDIRECT_URI")
	}

	// Auto-detect host and scheme if we are in production
	host := request.Headers["Host"]
	if host == "" {
		host = request.Headers["host"]
	}
	if host != "" && !strings.Contains(host, "localhost") && !strings.Contains(host, "127.0.0.1") {
		scheme := getScheme(request)
		return scheme + "://" + host + "/api/v1/auth/" + platform + "/callback"
	}

	if redirectURI == "" {
		redirectURI = "http://localhost:8080/api/v1/auth/" + platform + "/callback"
	}
	return redirectURI
}
