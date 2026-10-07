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

	"github.com/fpt-event-services/common/hash"
	"github.com/fpt-event-services/common/jwt"
	"github.com/fpt-event-services/common/validator"
	"github.com/fpt-event-services/services/auth-service/models"
	"github.com/fpt-event-services/services/auth-service/repository"
	"golang.org/x/crypto/bcrypt"
)

// OTPCooldownError represents remaining cooldown seconds before a new OTP can be requested
type OTPCooldownError struct {
	Remaining int
}

func (e *OTPCooldownError) Error() string {
	return fmt.Sprintf("OTP active: cooldown remaining %d seconds", e.Remaining)
}

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

func newSessionTokenID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}

func (uc *AuthUseCase) issueFreshSessionTokenPair(ctx context.Context, user *models.User, isNewUser bool) (*models.AuthResponse, error) {
	sessionTokenID, err := newSessionTokenID()
	if err != nil {
		return nil, errors.New("failed to generate session token")
	}
	if err := uc.userRepo.UpdateActiveSessionTokenID(ctx, user.ID, sessionTokenID); err != nil {
		return nil, err
	}
	token, refreshToken, err := jwt.GenerateTokenPairWithSessionID(user.ID, user.Email, user.FullName, user.Role, sessionTokenID)
	if err != nil {
		return nil, errors.New("failed to generate token")
	}
	return &models.AuthResponse{
		Token:        token,
		RefreshToken: refreshToken,
		User:         *user,
		IsNewUser:    isNewUser,
	}, nil
}

func (uc *AuthUseCase) ValidateActiveSessionToken(ctx context.Context, userID int, sessionTokenID string) error {
	if strings.TrimSpace(sessionTokenID) == "" {
		return errors.New("missing session token")
	}
	activeSessionTokenID, err := uc.userRepo.GetActiveSessionTokenID(ctx, userID)
	if err != nil {
		return err
	}
	if activeSessionTokenID != sessionTokenID {
		return errors.New("session superseded")
	}
	return nil
}

// Login handles user login with automatic fast registration for new emails
func (uc *AuthUseCase) Login(ctx context.Context, req models.LoginRequest) (*models.AuthResponse, error) {
	normalizedEmail, err := validator.NormalizeAndValidateEmail(req.Email)
	if err != nil {
		return nil, err
	}
	req.Email = normalizedEmail

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

	return uc.issueFreshSessionTokenPair(ctx, user, false)
}

// Register handles user registration
func (uc *AuthUseCase) Register(ctx context.Context, req models.RegisterRequest) (*models.AuthResponse, error) {
	normalizedEmail, err := validator.NormalizeAndValidateEmail(req.Email)
	if err != nil {
		return nil, err
	}
	req.Email = normalizedEmail

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

	createdUser.ID = userID
	return uc.issueFreshSessionTokenPair(ctx, createdUser, false)
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
	if cooldown := otpManager.GetRemainingCooldown(email); cooldown > 0 {
		return "", &OTPCooldownError{Remaining: int(cooldown)}
	}
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
	normalizedEmail, err := validator.NormalizeAndValidateEmail(email)
	if err != nil {
		return false, err
	}
	email = normalizedEmail
	return uc.userRepo.ExistsByEmail(ctx, email)
}

// GenerateRegisterOTP generates OTP for registration
func (uc *AuthUseCase) GenerateRegisterOTP(ctx context.Context, req models.RegisterRequest) (string, error) {
	normalizedEmail, err := validator.NormalizeAndValidateEmail(req.Email)
	if err != nil {
		return "", err
	}
	req.Email = normalizedEmail

	// Automatically extract the prefix of the email string if FullName is empty
	fullName := req.FullName
	if strings.TrimSpace(fullName) == "" {
		parts := strings.Split(req.Email, "@")
		if len(parts) > 0 {
			fullName = validator.SanitizeFullNamePlaceholder(parts[0])
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
	hashedPassword, err := hash.HashPassword(req.Password)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}

	// Store pending registration
	otpManager := GetOTPManager()
	if cooldown := otpManager.GetRemainingCooldown(req.Email); cooldown > 0 {
		return "", &OTPCooldownError{Remaining: int(cooldown)}
	}
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
	normalizedEmail, err := validator.NormalizeAndValidateEmail(email)
	if err != nil {
		return nil, err
	}
	email = normalizedEmail

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

	user.ID = userID
	return uc.issueFreshSessionTokenPair(ctx, &user, false)
}

// ResendRegisterOTP resends OTP for pending registration
func (uc *AuthUseCase) ResendRegisterOTP(ctx context.Context, email string) (string, error) {
	normalizedEmail, err := validator.NormalizeAndValidateEmail(email)
	if err != nil {
		return "", err
	}
	email = normalizedEmail

	pending, exists := pendingRegistrations[email]
	if !exists {
		return "", errors.New("Không có đăng ký đang chờ cho email này")
	}

	pending.Attempts++
	if pending.Attempts > 5 {
		return "", errors.New("Quá nhiều lần gửi lại")
	}

	otpManager := GetOTPManager()
	if cooldown := otpManager.GetRemainingCooldown(email); cooldown > 0 {
		return "", &OTPCooldownError{Remaining: int(cooldown)}
	}
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

	adminList, err := uc.userRepo.FindByRole(ctx, "ADMIN")
	if err != nil {
		return nil, err
	}

	studentList, err := uc.userRepo.FindByRole(ctx, "STUDENT")
	if err != nil {
		return nil, err
	}

	return &models.StaffOrganizerResponse{
		StaffList:     staffList,
		OrganizerList: organizerList,
		AdminList:     adminList,
		StudentList:   studentList,
	}, nil
}

// LoginOrRegisterGoogle handles Google sign-in auth response
func (uc *AuthUseCase) LoginOrRegisterGoogle(ctx context.Context, email, name string) (*models.AuthResponse, error) {
	normalizedEmail, err := validator.NormalizeAndValidateEmail(email)
	if err != nil {
		return nil, err
	}
	email = normalizedEmail

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

	user.ID = userID
	return uc.issueFreshSessionTokenPair(ctx, user, isNewUser)
}

func (uc *AuthUseCase) ValidateSessionVersion(ctx context.Context, userID, tokenSessionVersion int) error {
	return nil
}

func (uc *AuthUseCase) IncrementSessionVersion(ctx context.Context, userID int) error {
	return nil
}

func (uc *AuthUseCase) IssueTokenPair(ctx context.Context, userID int) (*models.AuthResponse, error) {
	user, err := uc.userRepo.FindByID(ctx, userID)
	if err != nil || user == nil {
		return nil, errors.New("user not found")
	}
	if user.Status == "BLOCKED" || user.Status == "PENDING_DELETE" {
		return nil, errors.New("inactive user")
	}
	return uc.issueFreshSessionTokenPair(ctx, user, false)
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

	// Check if phone number is already registered by another account
	var count int
	err = uc.userRepo.DB().QueryRowContext(ctx, "SELECT COUNT(1) FROM Users WHERE phone = $1 AND email != $2", phone, email).Scan(&count)
	if err == nil && count > 0 {
		return errors.New("Số điện thoại này đã được đăng ký bởi tài khoản khác")
	}

	// Update phone in database
	err = uc.userRepo.UpdatePhoneByEmail(ctx, email, phone)
	if err != nil {
		return errors.New("không thể cập nhật số điện thoại")
	}

	return nil
}

// DirectUpdatePassword handles authenticated password updates after old-password verification.
func (uc *AuthUseCase) DirectUpdatePassword(ctx context.Context, email, oldPassword, newPassword string) error {
	if len(newPassword) < 6 {
		return errors.New("password must be at least 6 characters")
	}

	user, err := uc.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return errors.New("failed to verify account")
	}
	if user == nil {
		return errors.New("user not found")
	}

	isSSO := user.SSOProvider != nil && *user.SSOProvider != ""

	// If password hash exists in database and they are not SSO, verify the old password
	if user.PasswordHash != "" && !isSSO {
		if oldPassword == "" {
			return errors.New("old password is required")
		}
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(oldPassword)); err != nil {
			return errors.New("old password is incorrect")
		}
	}

	if isSSO {
		err = uc.userRepo.UpdatePasswordAndClearSSO(ctx, email, newPassword)
	} else {
		err = uc.userRepo.UpdatePasswordByEmail(ctx, email, newPassword)
	}
	if err != nil {
		return errors.New("failed to update password")
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

// UpdateLanguage updates user language preference in the database.
func (uc *AuthUseCase) UpdateLanguage(ctx context.Context, email, language string) error {
	language = strings.TrimSpace(strings.ToLower(language))
	if language != "vi" && language != "en" {
		return errors.New("language must be vi or en")
	}
	return uc.userRepo.UpdateLanguageByEmail(ctx, email, language)
}

// GetUserWalletBalance fetches the user's wallet balance from the dedicated wallets table
// This replaces the obsolete User.Wallet field - now uses wallets.balance for O(1) lookup
func (uc *AuthUseCase) GetUserWalletBalance(ctx context.Context, email string) (float64, error) {
	// First get user ID by email
	user, err := uc.userRepo.FindByEmail(ctx, email)
	if err != nil || user == nil {
		return 0, errors.New("user not found")
	}

	// Query dedicated wallets table for balance
	query := `SELECT COALESCE(balance, 0) FROM wallet WHERE user_id = $1`
	var balance float64
	err = uc.userRepo.DB().QueryRowContext(ctx, query, user.ID).Scan(&balance)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch wallet balance: %w", err)
	}

	return balance, nil
}

// UpdateFullName updates user fullName in the database
func (uc *AuthUseCase) UpdateFullName(ctx context.Context, email, fullName string) error {
	fullName = strings.TrimSpace(fullName)
	if fullName == "" {
		return errors.New("họ và tên không được để trống")
	}
	if len(fullName) < 2 {
		return errors.New("họ và tên phải có ít nhất 2 ký tự")
	}
	if len(fullName) > 100 {
		return errors.New("họ và tên không được vượt quá 100 ký tự")
	}
	return uc.userRepo.UpdateFullNameByEmail(ctx, email, fullName)
}

// BecomeOrganizer handles self-service role upgrade from STUDENT to ORGANIZER
func (uc *AuthUseCase) BecomeOrganizer(ctx context.Context, email string, req models.BecomeOrganizerRequest) (*models.AuthResponse, error) {
	if !req.AgreePolicy {
		return nil, errors.New("bạn cần đọc và đồng ý với Chính sách & Quy chế Ban tổ chức trước khi nâng cấp")
	}

	phone := strings.TrimSpace(req.Phone)
	if phone != "" {
		if err := validator.GetPhoneError(phone); err != "" {
			return nil, errors.New(err)
		}
	}

	user, err := uc.userRepo.FindByEmail(ctx, email)
	if err != nil || user == nil {
		return nil, errors.New("người dùng không tồn tại")
	}

	if user.Role == "ORGANIZER" {
		return nil, errors.New("tài khoản của bạn đã là Ban tổ chức (ORGANIZER)")
	}

	if user.Role != "STUDENT" {
		return nil, errors.New("chỉ tài khoản Sinh viên mới có thể tự nâng cấp lên Ban tổ chức")
	}

	// Check phone duplicate
	if phone != "" {
		phoneExists, err := uc.userRepo.ExistsByPhone(ctx, phone, user.ID)
		if err != nil {
			return nil, err
		}
		if phoneExists {
			return nil, errors.New("Số điện thoại này đã được sử dụng bởi một tài khoản khác")
		}
	}

	// Update in DB
	err = uc.userRepo.UpgradeToOrganizerWithOrg(ctx, user.ID, phone, req.OrgID)
	if err != nil {
		return nil, err
	}

	// Refresh user object with new role
	user.Role = "ORGANIZER"
	if phone != "" {
		user.Phone = phone
	}

	return uc.issueFreshSessionTokenPair(ctx, user, false)
}

// GetAllOrganizations returns organization list
func (uc *AuthUseCase) GetAllOrganizations(ctx context.Context, onlyActive bool) ([]models.Organization, error) {
	return uc.userRepo.GetAllOrganizations(ctx, onlyActive)
}

// CreateOrganization creates a new organization
func (uc *AuthUseCase) CreateOrganization(ctx context.Context, req models.OrganizationRequest) (*models.Organization, error) {
	if strings.TrimSpace(req.OrgName) == "" {
		return nil, errors.New("Tên tổ chức/CLB không được để trống")
	}
	if strings.TrimSpace(req.OrgCode) == "" {
		return nil, errors.New("Mã tổ chức/CLB không được để trống")
	}
	return uc.userRepo.CreateOrganization(ctx, req)
}

// UpdateOrganization updates an existing organization
func (uc *AuthUseCase) UpdateOrganization(ctx context.Context, orgID int, req models.OrganizationRequest) error {
	if orgID <= 0 {
		return errors.New("ID tổ chức không hợp lệ")
	}
	return uc.userRepo.UpdateOrganization(ctx, orgID, req)
}

// DeleteOrganization deletes an organization
func (uc *AuthUseCase) DeleteOrganization(ctx context.Context, orgID int) error {
	if orgID <= 0 {
		return errors.New("ID tổ chức không hợp lệ")
	}
	return uc.userRepo.DeleteOrganization(ctx, orgID)
}

// OnboardResult contains outcome of unified organizer onboarding
type OnboardResult struct {
	Action      string               `json:"action"` // "DIRECT_UPGRADE", "OTP_SENT", "PASSWORD_REQUIRED", "ROLE_BLOCKED"
	Message     string               `json:"message"`
	Role        string               `json:"role,omitempty"`
	AuthResp    *models.AuthResponse `json:"authResp,omitempty"`
	OTPCooldown int                  `json:"otpCooldown,omitempty"`
}

// ProcessOrganizerOnboard handles unified onboarding for guest or existing user
func (uc *AuthUseCase) ProcessOrganizerOnboard(ctx context.Context, req models.OrganizerOnboardRequest) (*OnboardResult, string, error) {
	normalizedEmail, err := validator.NormalizeAndValidateEmail(req.Email)
	if err != nil {
		return nil, "", err
	}
	req.Email = normalizedEmail

	existingUser, err := uc.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, "", err
	}

	// Validate phone duplicate if phone is provided and not checkOnly
	if !req.CheckOnly && strings.TrimSpace(req.Phone) != "" {
		phone := strings.TrimSpace(req.Phone)
		excludeID := 0
		if existingUser != nil {
			excludeID = existingUser.ID
		}
		phoneExists, err := uc.userRepo.ExistsByPhone(ctx, phone, excludeID)
		if err != nil {
			return nil, "", err
		}
		if phoneExists {
			return nil, "", errors.New("Số điện thoại này đã được sử dụng bởi một tài khoản khác")
		}
	}

	// CASE 1: Email does NOT exist -> Guest Registration Flow
	if existingUser == nil {
		if req.CheckOnly {
			if req.Password != "" {
				if pwdErr := validator.GetPasswordError(req.Password); pwdErr != "" {
					return nil, "", errors.New(pwdErr)
				}
			}
			return &OnboardResult{
				Action:  "GUEST_ELIGIBLE",
				Message: "Email hợp lệ. Hãy tiếp tục điền thông tin tổ chức.",
			}, "", nil
		}
		if req.Password == "" {
			return nil, "", errors.New("Vui lòng nhập mật khẩu để tạo tài khoản mới")
		}
		regReq := models.RegisterRequest{
			Email:    req.Email,
			Password: req.Password,
			FullName: req.FullName,
			Phone:    req.Phone,
		}
		otp, err := uc.GenerateRegisterOTP(ctx, regReq)
		if err != nil {
			return nil, "", err
		}
		return &OnboardResult{
			Action:  "OTP_SENT",
			Message: "Mã OTP xác thực đã được gửi đến email của bạn để hoàn tất tạo tài khoản Ban tổ chức.",
		}, otp, nil
	}

	// CASE 2: User exists, check Role
	if existingUser.Role == "ORGANIZER" {
		return &OnboardResult{
			Action:  "ROLE_BLOCKED",
			Role:    "ORGANIZER",
			Message: "Tài khoản của bạn đã là Ban tổ chức (ORGANIZER). Vui lòng đăng nhập để vào bảng điều khiển sự kiện.",
		}, "", nil
	}

	if existingUser.Role != "STUDENT" {
		return &OnboardResult{
			Action:  "ROLE_BLOCKED",
			Role:    "OTHER",
			Message: "Tài khoản này không hợp lệ để đăng ký trở thành Ban tổ chức.",
		}, "", nil
	}

	if req.CheckOnly {
		return &OnboardResult{
			Action:  "STUDENT_ELIGIBLE",
			Role:    "STUDENT",
			Message: "Đã tìm thấy tài khoản Sinh viên. Tiếp tục cập nhật thông tin CLB & Số điện thoại.",
		}, "", nil
	}

	// CASE 3: User exists and is STUDENT
	// 3a. If user supplied correct password and not forcing OTP -> Direct Upgrade!
	if !req.ForceSendOTP && req.Password != "" {
		authenticatedUser, checkErr := uc.userRepo.CheckLogin(ctx, req.Email, req.Password)
		if checkErr == nil && authenticatedUser != nil {
			// Password correct! Update phone and upgrade directly
			var effectiveOrgID *int = req.OrgID
			phoneToUse := req.Phone
			if phoneToUse == "" {
				phoneToUse = authenticatedUser.Phone
			}
			err = uc.userRepo.UpgradeToOrganizerWithOrg(ctx, authenticatedUser.ID, phoneToUse, effectiveOrgID)
			if err != nil {
				return nil, "", err
			}
			authenticatedUser.Role = "ORGANIZER"
			if phoneToUse != "" {
				authenticatedUser.Phone = phoneToUse
			}
			authResp, err := uc.issueFreshSessionTokenPair(ctx, authenticatedUser, false)
			if err != nil {
				return nil, "", err
			}
			return &OnboardResult{
				Action:   "DIRECT_UPGRADE",
				Message:  "Xác thực thành công! Tài khoản của bạn đã được nâng cấp lên Ban tổ chức.",
				Role:     "ORGANIZER",
				AuthResp: authResp,
			}, "", nil
		}
	}

	// 3b. If password wrong or forceSendOtp requested -> Send OTP to verify email ownership!
	otpManager := GetOTPManager()
	if cooldown := otpManager.GetRemainingCooldown(req.Email); cooldown > 0 {
		return nil, "", &OTPCooldownError{Remaining: int(cooldown)}
	}
	otp := otpManager.GenerateOTP(req.Email)

	// Save pending upgrade session in pendingRegistrations
	pendingRegistrations[req.Email] = &models.PendingRegistration{
		Email:    req.Email,
		FullName: req.FullName,
		Phone:    req.Phone,
		OTP:      otp,
	}

	return &OnboardResult{
		Action:  "OTP_SENT",
		Message: "Mã OTP xác nhận đã được gửi đến email chính chủ của bạn để nâng cấp.",
	}, otp, nil
}

// VerifyOrganizerOnboardOTP verifies OTP for existing student or guest and completes upgrade
func (uc *AuthUseCase) VerifyOrganizerOnboardOTP(ctx context.Context, req models.OrganizerOnboardVerifyRequest) (*models.AuthResponse, error) {
	normalizedEmail, err := validator.NormalizeAndValidateEmail(req.Email)
	if err != nil {
		return nil, err
	}
	req.Email = normalizedEmail

	otpManager := GetOTPManager()
	valid, message := otpManager.VerifyOTP(req.Email, req.OTP)
	if !valid {
		return nil, errors.New(message)
	}

	existingUser, err := uc.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, err
	}

	// Check phone duplicate before final update/creation
	if strings.TrimSpace(req.Phone) != "" {
		phone := strings.TrimSpace(req.Phone)
		excludeID := 0
		if existingUser != nil {
			excludeID = existingUser.ID
		}
		phoneExists, err := uc.userRepo.ExistsByPhone(ctx, phone, excludeID)
		if err != nil {
			return nil, err
		}
		if phoneExists {
			return nil, errors.New("Số điện thoại này đã được sử dụng bởi một tài khoản khác")
		}
	}

	if existingUser != nil {
		// Existing student verified by OTP!
		if existingUser.Role == "ORGANIZER" {
			return nil, errors.New("tài khoản của bạn đã là Ban tổ chức (ORGANIZER)")
		}
		if existingUser.Role != "STUDENT" {
			return nil, errors.New("chỉ tài khoản Sinh viên mới có thể tự nâng cấp lên Ban tổ chức")
		}

		phoneToUse := req.Phone
		if phoneToUse == "" {
			phoneToUse = existingUser.Phone
		}
		err = uc.userRepo.UpgradeToOrganizerWithOrg(ctx, existingUser.ID, phoneToUse, req.OrgID)
		if err != nil {
			return nil, err
		}

		delete(pendingRegistrations, req.Email)
		otpManager.Invalidate(req.Email)

		existingUser.Role = "ORGANIZER"
		if phoneToUse != "" {
			existingUser.Phone = phoneToUse
		}
		return uc.issueFreshSessionTokenPair(ctx, existingUser, false)
	}

	// Guest user: finalize creation
	pending, exists := pendingRegistrations[req.Email]
	if !exists {
		return nil, errors.New("Không có yêu cầu đăng ký đang chờ")
	}

	newUser := models.User{
		FullName: pending.FullName,
		Phone:    pending.Phone,
		Email:    pending.Email,
		Role:     "ORGANIZER",
		Status:   "ACTIVE",
	}

	userID, err := uc.userRepo.CreateUserWithHash(ctx, &newUser, pending.PasswordHash)
	if err != nil {
		return nil, errors.New("Không thể tạo tài khoản")
	}

	if req.OrgID != nil && *req.OrgID > 0 {
		_ = uc.userRepo.UpgradeToOrganizerWithOrg(ctx, userID, pending.Phone, req.OrgID)
	}

	delete(pendingRegistrations, req.Email)
	otpManager.Invalidate(req.Email)

	newUser.ID = userID
	return uc.issueFreshSessionTokenPair(ctx, &newUser, false)
}


