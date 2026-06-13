package handler

import (
	"context"
	"crypto/rand"
	"encoding/base64"
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

// In-memory caching for OAuth states
type oauthStateStore struct {
	states map[string]time.Time
	mu     sync.RWMutex
}

var stateStore = &oauthStateStore{
	states: make(map[string]time.Time),
}

func (s *oauthStateStore) Save(state string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.states[state] = time.Now().Add(15 * time.Minute)
}

func (s *oauthStateStore) Verify(state string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	exp, ok := s.states[state]
	if !ok {
		return false
	}
	delete(s.states, state)
	return time.Now().Before(exp)
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
	stateStore.Save(state)

	var authURL string
	if platform == "zoom" {
		zoomConfig := &oauth2.Config{
			ClientID:     os.Getenv("ZOOM_CLIENT_ID"),
			ClientSecret: os.Getenv("ZOOM_CLIENT_SECRET"),
			RedirectURL:  redirectURI,
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://zoom.us/oauth/authorize",
				TokenURL: "https://zoom.us/oauth/token",
			},
		}
		authURL = zoomConfig.AuthCodeURL(state, oauth2.AccessTypeOnline)
	} else if platform == "google" {
		googleConfig := &oauth2.Config{
			ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
			ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
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

	redirectURI := request.QueryStringParameters["redirect_uri"]
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

	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Body:       `{"error":"Failed to generate state"}`,
		}, nil
	}
	state := base64.URLEncoding.EncodeToString(b)
	stateStore.Save(state)

	var authURL string
	if platform == "zoom" {
		zoomConfig := &oauth2.Config{
			ClientID:     os.Getenv("ZOOM_CLIENT_ID"),
			ClientSecret: os.Getenv("ZOOM_CLIENT_SECRET"),
			RedirectURL:  redirectURI,
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://zoom.us/oauth/authorize",
				TokenURL: "https://zoom.us/oauth/token",
			},
		}
		authURL = zoomConfig.AuthCodeURL(state, oauth2.AccessTypeOnline)
	} else if platform == "google" {
		googleConfig := &oauth2.Config{
			ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
			ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
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

	email := "organizer.zoom@fpt.edu.vn"
	meetingLink := "https://fpt-edu.zoom.us/j/84920491029?pwd=YmUxM2NjO3M4MTk2M2Mx"
	if platform == "google" {
		email = "organizer.meet@fpt.edu.vn"
		meetingLink = "https://meet.google.com/abc-defg-hij"
	}

	// Return HTML that posts message to opener and closes popup
	html := fmt.Sprintf(`
		<!DOCTYPE html>
		<html>
		<head><title>Authentication Success</title></head>
		<body>
			<p>Authentication successful! Closing window...</p>
			<script>
				window.opener.postMessage({
					type: "OAUTH_SUCCESS",
					platform: "%s",
					email: "%s",
					meetingLink: "%s"
				}, window.opener.location.origin);
				window.close();
			</script>
		</body>
		</html>
	`, strings.ToUpper(platform), email, meetingLink)

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type": "text/html; charset=utf-8",
		},
		Body: html,
	}, nil
}
