package usecase

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/fpt-event-services/common/jwt"
	"github.com/fpt-event-services/common/validator"
	"github.com/fpt-event-services/services/auth-service/models"
	"github.com/fpt-event-services/services/auth-service/repository"
)

// AuthUseCase handles authentication business logic
type AuthUseCase struct {
	userRepo *repository.UserRepository
}

// NewAuthUseCaseWithDB creates a new auth use case with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewAuthUseCaseWithDB(dbConn *sql.DB) *AuthUseCase {
	return &AuthUseCase{
		userRepo: repository.NewUserRepositoryWithDB(dbConn),
	}
}

// Login handles user login with automatic fast registration for new emails
func (uc *AuthUseCase) Login(ctx context.Context, req models.LoginRequest) (*models.AuthResponse, error) {
	// Validate input - only check email format, no password format validation for login
	if err := validator.GetEmailError(req.Email); err != "" {
		return nil, errors.New(err)
	}
	// Password validation removed - only check if password is not empty
	if req.Password == "" {
		return nil, errors.New("Mật khẩu không được để trống")
	}

	// Check if email already exists
	exists, err := uc.userRepo.ExistsByEmail(ctx, req.Email)
	if err != nil {
		return nil, fmt.Errorf("failed to check email: %w", err)
	}

	// If email does not exist in DB -> Return standard unauthorized error
	if !exists {
		return nil, errors.New("Tài khoản không tồn tại. Vui lòng đăng ký mới.")
	}

	// Else email exists -> Proceed with traditional login
	user, err := uc.userRepo.CheckLogin(ctx, req.Email, req.Password)
	if err != nil {
		return nil, err
	}

	// Generate JWT token
	token, err := jwt.GenerateToken(user.ID, user.Email, user.FullName, user.Role)
	if err != nil {
		return nil, errors.New("failed to generate token")
	}

	return &models.AuthResponse{
		Token: token,
		User:  *user,
	}, nil
}

// Register handles user registration
func (uc *AuthUseCase) Register(ctx context.Context, req models.RegisterRequest) (*models.AuthResponse, error) {
	// Validate input
	if err := validator.GetFullNameError(req.FullName); err != "" {
		return nil, errors.New(err)
	}
	if err := validator.GetPhoneError(req.Phone); err != "" {
		return nil, errors.New(err)
	}
	if err := validator.GetEmailError(req.Email); err != "" {
		return nil, errors.New(err)
	}
	if err := validator.GetPasswordError(req.Password); err != "" {
		return nil, errors.New(err)
	}

	// Check if email already exists
	exists, err := uc.userRepo.ExistsByEmail(ctx, req.Email)
	if err != nil {
		return nil, errors.New("failed to check email")
	}
	if exists {
		return nil, errors.New("email already exists")
	}

	// Create user
	user := models.User{
		FullName:     req.FullName,
		Phone:        req.Phone,
		Email:        req.Email,
		PasswordHash: req.Password, // Will be hashed in repository
		Role:         "STUDENT",
		Status:       "ACTIVE",
	}

	userID, err := uc.userRepo.CreateUser(ctx, &user)
	if err != nil {
		return nil, errors.New("failed to create user")
	}

	// Get created user
	createdUser, err := uc.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, errors.New("failed to get user")
	}

	// Generate JWT token
	token, err := jwt.GenerateToken(userID, createdUser.Email, createdUser.FullName, createdUser.Role)
	if err != nil {
		return nil, errors.New("failed to generate token")
	}

	return &models.AuthResponse{
		Token: token,
		User:  *createdUser,
	}, nil
}

// AdminCreateAccount handles admin creating accounts
func (uc *AuthUseCase) AdminCreateAccount(ctx context.Context, req models.AdminCreateAccountRequest) (*models.User, error) {
	// Validate input
	if err := validator.GetFullNameError(req.FullName); err != "" {
		log.Printf("[CREATE-ACCOUNT] Validation failed: full name - %s", err)
		return nil, errors.New(err)
	}
	if err := validator.GetPhoneError(req.Phone); err != "" {
		log.Printf("[CREATE-ACCOUNT] Validation failed: phone - %s", err)
		return nil, errors.New(err)
	}
	if err := validator.GetEmailError(req.Email); err != "" {
		log.Printf("[CREATE-ACCOUNT] Validation failed: email - %s", err)
		return nil, errors.New(err)
	}
	if err := validator.GetPasswordError(req.Password); err != "" {
		log.Printf("[CREATE-ACCOUNT] Validation failed: password - %s", err)
		return nil, errors.New(err)
	}
	if !validator.IsValidRoleForCreation(req.Role) {
		log.Printf("[CREATE-ACCOUNT] Validation failed: invalid role - %s", req.Role)
		return nil, errors.New("invalid role. Only ADMIN, ORGANIZER, STAFF are allowed")
	}

	// Check if email already exists
	exists, err := uc.userRepo.ExistsByEmail(ctx, req.Email)
	if err != nil {
		log.Printf("[CREATE-ACCOUNT] Failed to check email existence: %v", err)
		return nil, errors.New("failed to check email")
	}
	if exists {
		// Security: Don't log email plaintext
		log.Printf("[CREATE-ACCOUNT] Email already exists (validation failed)")
		return nil, errors.New("email already exists")
	}

	// Create account
	// Security: Don't log email plaintext
	log.Printf("[CREATE-ACCOUNT] Creating account with Role: %s", req.Role)
	userID, err := uc.userRepo.AdminCreateAccount(ctx, req)
	if err != nil {
		log.Printf("[CREATE-ACCOUNT] Failed to create account in database: %v", err)
		return nil, fmt.Errorf("failed to create account: %w", err)
	}

	// Get created user
	user, err := uc.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, errors.New("failed to get user")
	}

	user.ID = userID
	return user, nil
}

// ForgotPassword - Gửi OTP qua email
// KHỚP VỚI Java ForgotPasswordJwtController
func (uc *AuthUseCase) ForgotPassword(ctx context.Context, email string) (string, error) {
	// Validate email format
	if err := validator.GetEmailError(email); err != "" {
		return "", errors.New(err)
	}

	// Kiểm tra email tồn tại
	user, err := uc.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return "", errors.New("lỗi khi kiểm tra email")
	}
	if user == nil {
		return "", errors.New("email không tồn tại trong hệ thống")
	}

	// Sinh OTP
	otpManager := GetOTPManager()
	otp := otpManager.GenerateOTP(email)

	// Return OTP (caller sẽ gửi email)
	return otp, nil
}

// ResetPassword - Xác thực OTP và đổi mật khẩu
// KHỚP VỚI Java ResetPasswordJwtController
func (uc *AuthUseCase) ResetPassword(ctx context.Context, req models.ResetPasswordRequest) error {
	// Validate email
	if err := validator.GetEmailError(req.Email); err != "" {
		return errors.New(err)
	}

	// Validate password (tối thiểu 6 ký tự)
	if len(req.NewPassword) < 6 {
		return errors.New("mật khẩu phải có ít nhất 6 ký tự")
	}

	// Kiểm tra email tồn tại
	user, err := uc.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return errors.New("lỗi khi kiểm tra email")
	}
	if user == nil {
		return errors.New("email không tồn tại trong hệ thống")
	}

	// Verify OTP
	otpManager := GetOTPManager()
	valid, message := otpManager.VerifyOTP(req.Email, req.OTP)
	if !valid {
		return errors.New(message)
	}

	// Cập nhật mật khẩu
	err = uc.userRepo.UpdatePasswordByEmail(ctx, req.Email, req.NewPassword)
	if err != nil {
		return errors.New("không thể cập nhật mật khẩu")
	}

	// Vô hiệu hóa OTP
	otpManager.Invalidate(req.Email)

	return nil
}

// ============================================================
// Register OTP Flow Methods (for 2-step registration)
// KHỚP VỚI Java RegisterJwtController
// ============================================================

// In-memory storage for pending registrations (should use Redis in production)
var pendingRegistrations = make(map[string]*models.PendingRegistration)

// CheckEmailExists checks if email already exists
func (uc *AuthUseCase) CheckEmailExists(ctx context.Context, email string) (bool, error) {
	return uc.userRepo.ExistsByEmail(ctx, email)
}

// GenerateRegisterOTP generates OTP for registration
func (uc *AuthUseCase) GenerateRegisterOTP(ctx context.Context, req models.RegisterRequest) (string, error) {
	// Automatically extract the prefix of the email string if FullName is empty
	fullName := req.FullName
	if strings.TrimSpace(fullName) == "" {
		parts := strings.Split(req.Email, "@")
		if len(parts) > 0 {
			fullName = parts[0]
		}
	}

	// Validate input
	if err := validator.GetFullNameError(fullName); err != "" {
		return "", errors.New(err)
	}
	if err := validator.GetPhoneError(req.Phone); err != "" {
		return "", errors.New(err)
	}
	if err := validator.GetEmailError(req.Email); err != "" {
		return "", errors.New(err)
	}
	if err := validator.GetPasswordError(req.Password); err != "" {
		return "", errors.New(err)
	}

	// Hash password for storage
	hashedPassword := hashPassword(req.Password)

	// Store pending registration
	otpManager := GetOTPManager()
	otp := otpManager.GenerateOTP(req.Email)

	pendingRegistrations[req.Email] = &models.PendingRegistration{
		Email:        req.Email,
		FullName:     fullName,
		Phone:        req.Phone,
		PasswordHash: hashedPassword,
		OTP:          otp,
	}

	return otp, nil
}

// VerifyRegisterOTP verifies OTP and creates user account
func (uc *AuthUseCase) VerifyRegisterOTP(ctx context.Context, email, otp string) (*models.AuthResponse, error) {
	// Check pending registration exists
	pending, exists := pendingRegistrations[email]
	if !exists {
		return nil, errors.New("Không có đăng ký đang chờ cho email này")
	}

	// Verify OTP
	otpManager := GetOTPManager()
	valid, message := otpManager.VerifyOTP(email, otp)
	if !valid {
		return nil, errors.New(message)
	}

	// Double-check email doesn't exist (race condition protection)
	emailExists, err := uc.userRepo.ExistsByEmail(ctx, email)
	if err != nil {
		return nil, errors.New("Lỗi khi kiểm tra email")
	}
	if emailExists {
		delete(pendingRegistrations, email)
		return nil, errors.New("Email đã tồn tại")
	}

	// Create user
	user := models.User{
		FullName: pending.FullName,
		Phone:    pending.Phone,
		Email:    pending.Email,
		Role:     "STUDENT",
		Status:   "ACTIVE",
	}

	userID, err := uc.userRepo.CreateUserWithHash(ctx, &user, pending.PasswordHash)
	if err != nil {
		return nil, errors.New("Không thể tạo tài khoản")
	}

	// Cleanup
	delete(pendingRegistrations, email)
	otpManager.Invalidate(email)

	// Generate JWT
	token, err := jwt.GenerateToken(userID, user.Email, user.FullName, user.Role)
	if err != nil {
		return nil, errors.New("Không thể tạo token")
	}

	user.ID = userID

	return &models.AuthResponse{
		Token: token,
		User:  user,
	}, nil
}

// ResendRegisterOTP resends OTP for pending registration
func (uc *AuthUseCase) ResendRegisterOTP(ctx context.Context, email string) (string, error) {
	pending, exists := pendingRegistrations[email]
	if !exists {
		return "", errors.New("Không có đăng ký đang chờ cho email này")
	}

	pending.Attempts++
	if pending.Attempts > 5 {
		return "", errors.New("Quá nhiều lần gửi lại")
	}

	otpManager := GetOTPManager()
	otp := otpManager.GenerateOTP(email)

	return otp, nil
}

// ============================================================
// Admin User Management Methods
// KHỚP VỚI Java AdminController
// ============================================================

// AdminUpdateUser updates user by admin
func (uc *AuthUseCase) AdminUpdateUser(ctx context.Context, req models.AdminUpdateUserRequest) error {
	// Validate role if provided
	if req.Role != "" && !validator.IsValidRoleForCreation(req.Role) {
		return errors.New("Role không hợp lệ")
	}

	// Validate status if provided
	if req.Status != "" && req.Status != "ACTIVE" && req.Status != "INACTIVE" {
		return errors.New("Status không hợp lệ")
	}

	return uc.userRepo.UpdateUser(ctx, req)
}

// AdminDeleteUser soft deletes user (sets status to INACTIVE)
func (uc *AuthUseCase) AdminDeleteUser(ctx context.Context, userID string) error {
	return uc.userRepo.SoftDeleteUser(ctx, userID)
}

// GetStaffAndOrganizers returns lists of STAFF and ORGANIZER users
func (uc *AuthUseCase) GetStaffAndOrganizers(ctx context.Context) (*models.StaffOrganizerResponse, error) {
	staffList, err := uc.userRepo.FindByRole(ctx, "STAFF")
	if err != nil {
		return nil, err
	}

	organizerList, err := uc.userRepo.FindByRole(ctx, "ORGANIZER")
	if err != nil {
		return nil, err
	}

	return &models.StaffOrganizerResponse{
		StaffList:     staffList,
		OrganizerList: organizerList,
	}, nil
}

// hashPassword hashes password using SHA-256 (same as Java)
func hashPassword(password string) string {
	// Import from common/hash package
	return password // Will be hashed in repository
}

// LoginOrRegisterGoogle handles Google sign-in auth response
func (uc *AuthUseCase) LoginOrRegisterGoogle(ctx context.Context, email, name string) (*models.AuthResponse, error) {
	// Find user by email
	user, err := uc.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("failed to query database: %w", err)
	}

	isNewUser := false
	var userID int

	if user == nil {
		// Create new user (password is secure cryptographically generated to satisfy database constraints)
		b := make([]byte, 16)
		_, _ = rand.Read(b)
		randomPass := "GOOGLE_OAUTH_" + hex.EncodeToString(b)
		
		googleProvider := "GOOGLE"
		newUser := &models.User{
			FullName:     name,
			Email:        email,
			Phone:        "",
			PasswordHash: randomPass, // Repository will hash it properly
			Role:         "STUDENT",
			Status:       "ACTIVE",
			SSOProvider:  &googleProvider,
		}

		userID, err = uc.userRepo.CreateUser(ctx, newUser)
		if err != nil {
			return nil, fmt.Errorf("failed to create Google user: %w", err)
		}

		// Retrieve created user to fill user fields properly
		user, err = uc.userRepo.FindByEmail(ctx, email)
		if err != nil {
			return nil, fmt.Errorf("failed to retrieve created user: %w", err)
		}
		isNewUser = true
	} else {
		// Check blocked
		if user.Status == "BLOCKED" {
			return nil, errors.New("user is blocked")
		}
		userID = user.ID
	}

	// Generate JWT
	token, err := jwt.GenerateToken(userID, user.Email, user.FullName, user.Role)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	return &models.AuthResponse{
		Token:     token,
		User:      *user,
		IsNewUser: isNewUser,
	}, nil
}

// DirectUpdatePhone updates the user's phone number directly
func (uc *AuthUseCase) DirectUpdatePhone(ctx context.Context, email, phone string) error {
	// Verify user exists
	user, err := uc.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return errors.New("lỗi khi kiểm tra email")
	}
	if user == nil {
		return errors.New("email không tồn tại trong hệ thống")
	}

	// Update phone in database
	err = uc.userRepo.UpdatePhoneByEmail(ctx, email, phone)
	if err != nil {
		return errors.New("không thể cập nhật số điện thoại")
	}

	return nil
}

// DirectUpdatePassword handles direct password update for authenticated users without OTP verification
func (uc *AuthUseCase) DirectUpdatePassword(ctx context.Context, email, newPassword string) error {
	if len(newPassword) < 6 {
		return errors.New("mật khẩu phải có ít nhất 6 ký tự")
	}

	// Verify user exists
	user, err := uc.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return errors.New("lỗi khi kiểm tra email")
	}
	if user == nil {
		return errors.New("email không tồn tại trong hệ thống")
	}

	// Update password in database
	err = uc.userRepo.UpdatePasswordByEmail(ctx, email, newPassword)
	if err != nil {
		return errors.New("không thể cập nhật mật khẩu")
	}

	return nil
}

// GetUserByEmail gets full user details by email
func (uc *AuthUseCase) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	return uc.userRepo.FindByEmail(ctx, email)
}

// CloseAccount soft deletes user account (sets status to PENDING_DELETE and sets deleted_at)
func (uc *AuthUseCase) CloseAccount(ctx context.Context, userID int) error {
	return uc.userRepo.SoftDeleteUserWithTimestamp(ctx, userID)
}

// RestoreAccount restores pending deleted account
func (uc *AuthUseCase) RestoreAccount(ctx context.Context, userID int) error {
	return uc.userRepo.RestoreUserAccount(ctx, userID)
}

// SetSSOUserPassword sets password for Google authenticated users and removes SSO status
func (uc *AuthUseCase) SetSSOUserPassword(ctx context.Context, email, password string) error {
	if len(password) < 6 {
		return errors.New("mật khẩu phải có ít nhất 6 ký tự")
	}

	// Verify user exists
	user, err := uc.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return errors.New("lỗi khi kiểm tra email")
	}
	if user == nil {
		return errors.New("email không tồn tại trong hệ thống")
	}

	// Update password and clear SSO provider in database
	err = uc.userRepo.UpdatePasswordAndClearSSO(ctx, email, password)
	if err != nil {
		return errors.New("không thể cập nhật mật khẩu và sso")
	}

	return nil
}

// HardDeleteExpiredAccounts sweeps PENDING_DELETE users older than 30 days
func (uc *AuthUseCase) HardDeleteExpiredAccounts(ctx context.Context) (int64, error) {
	return uc.userRepo.HardDeleteExpiredUsers(ctx)
}

// UpdateTheme updates user theme preference in the database
func (uc *AuthUseCase) UpdateTheme(ctx context.Context, email, theme string) error {
	if theme != "light" && theme != "dark" {
		return errors.New("giao diện không hợp lệ")
	}
	return uc.userRepo.UpdateThemeByEmail(ctx, email, theme)
}
