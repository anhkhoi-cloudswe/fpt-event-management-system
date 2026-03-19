package auth

import (
	"crypto/md5"
	"crypto/sha256"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/fpt-event-services/pkg/utils"
	"github.com/gin-gonic/gin"
)

var (
	errUserAlreadyExists = errors.New("user already exists")
	errUserNotFound      = errors.New("user not found")
)

// Credentials is the request payload for register/login.
type Credentials struct {
	Email    string `json:"email" binding:"required,email,max=100"`
	Password string `json:"password" binding:"required,min=8,max=128"`
}

// UserStore abstracts persistence for users and password hashes.
type UserStore interface {
	CreateUser(username, passwordHash string) (*User, error)
	FindByUsername(username string) (*User, error)
	UpdateUserPassword(username, passwordHash string) error
}

// Handler exposes auth endpoints.
type Handler struct {
	store      UserStore
	jwtManager *JWTManager
}

func NewHandler(store UserStore, jwtManager *JWTManager) *Handler {
	return &Handler{store: store, jwtManager: jwtManager}
}

// RegisterRoutes wires up auth endpoints to a Gin engine/router group.
func (h *Handler) RegisterRoutes(router gin.IRoutes) {
	router.POST("/register", h.Register)
	router.POST("/login", h.Login)
}

// Register handles POST /register.
func (h *Handler) Register(c *gin.Context) {
	var req Credentials
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
		return
	}

	passwordHash, err := utils.HashPassword(req.Password)
	if err != nil {
		log.Printf("auth register: failed to hash password for user=%q: %v", normalizeEmail(req.Email), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to register user"})
		return
	}

	_, err = h.store.CreateUser(req.Email, passwordHash)
	if err != nil {
		if errors.Is(err, errUserAlreadyExists) {
			// Generic response to avoid account enumeration.
			c.JSON(http.StatusBadRequest, gin.H{"error": "Unable to register user"})
			return
		}

		log.Printf("auth register: failed to save user=%q: %v", normalizeEmail(req.Email), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to register user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "User registered successfully"})
}

// Login handles POST /login.
func (h *Handler) Login(c *gin.Context) {
	log.Println(">>>>>>>>>> ĐANG CHẠY LOGIC LOGIN MỚI (BCRYPT + SHA256) <<<<<<<<<<")

	var req Credentials
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
		return
	}

	user, err := h.store.FindByUsername(req.Email)
	if err != nil {
		if !errors.Is(err, errUserNotFound) {
			log.Printf("auth login: failed to fetch user=%q: %v", normalizeEmail(req.Email), err)
		}

		// Generic auth error prevents email enumeration.
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	if !utils.CheckPasswordHash(req.Password, user.PasswordHash) {
		if isBcryptHash(user.PasswordHash) {
			// Generic auth error prevents email enumeration.
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
			return
		}

		legacyMatched := checkLegacyPassword(req.Password, user.PasswordHash)
		if !legacyMatched {
			// Generic auth error prevents email enumeration.
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
			return
		}

		// Lazy migration: old password format is valid, upgrade immediately to bcrypt.
		newHash, hashErr := utils.HashPassword(req.Password)
		if hashErr != nil {
			log.Printf("auth login: failed to hash migrated password for user=%q: %v", user.Email, hashErr)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to complete login"})
			return
		}

		if updateErr := h.store.UpdateUserPassword(user.Email, newHash); updateErr != nil {
			log.Printf("auth login: failed to update migrated password for user=%q: %v", user.Email, updateErr)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to complete login"})
			return
		}

		user.PasswordHash = newHash
	}

	token, err := h.jwtManager.GenerateToken(user.ID, user.Email)
	if err != nil {
		log.Printf("auth login: failed to generate JWT for user=%q: %v", user.Email, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to complete login"})
		return
	}

	// Return user object + token (matching frontend expectations)
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":        user.ID,
			"email":     user.Email,
			"fullName":  user.FullName,
			"phone":     user.Phone,
			"role":      user.Role,
			"status":    user.Status,
			"wallet":    user.Wallet,
			"createdAt": user.CreatedAt,
		},
	})
}

func isBcryptHash(passwordHash string) bool {
	return strings.HasPrefix(passwordHash, "$2a$")
}

func normalizeEmail(email string) string {
	return strings.TrimSpace(strings.ToLower(email))
}

func checkLegacyPassword(plainPassword, storedHash string) bool {
	trimmedStoredHash := strings.TrimSpace(storedHash)

	// Check 1: Plain text match (legacy plaintext storage)
	if plainPassword == trimmedStoredHash {
		return true
	}

	// Check 2: MD5 hash match (legacy MD5 storage)
	legacyMD5 := md5.Sum([]byte(plainPassword))
	legacyMD5Hex := fmt.Sprintf("%x", legacyMD5)
	if strings.EqualFold(legacyMD5Hex, trimmedStoredHash) {
		return true
	}

	// Check 3: SHA256 hash match (legacy SHA256 storage)
	legacySHA256 := sha256.Sum256([]byte(plainPassword))
	legacySHA256Hex := fmt.Sprintf("%x", legacySHA256)
	if strings.EqualFold(legacySHA256Hex, trimmedStoredHash) {
		return true
	}

	return false
}
