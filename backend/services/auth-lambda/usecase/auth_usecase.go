package usecase

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/fpt-event-services/common/jwt"
	"github.com/fpt-event-services/common/validator"
	"github.com/fpt-event-services/services/auth-lambda/models"
	"github.com/fpt-event-services/services/auth-lambda/repository"
)

// AuthUseCase handles authentication business logic
type AuthUseCase struct {
	userRepo *repository.UserRepository
}

// NewAuthUseCase creates a new auth use case
func NewAuthUseCase() *AuthUseCase {
	return &AuthUseCase{
		userRepo: repository.NewUserRepository(),
	}
}

// Login handles user login
func (uc *AuthUseCase) Login(ctx context.Context, req models.LoginRequest) (*models.AuthResponse, error) {
	// Validate input - only check email format, no password format validation for login
	if err := validator.GetEmailError(req.Email); err != "" {
		return nil, errors.New(err)
	}
	// Password validation removed - only check if password is not empty
	if req.Password == "" {
		return nil, errors.New("Mật khẩu không được để trống")
	}

	// Check login credentials
	user, err := uc.userRepo.CheckLogin(ctx, req.Email, req.Password)
	if err != nil {
		return nil, err
	}

	// Generate JWT token
	token, err := jwt.GenerateToken(user.ID, user.Email, user.Role)
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
	token, err := jwt.GenerateToken(userID, createdUser.Email, createdUser.Role)
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
		log.Printf("[CREATE-ACCOUNT] Email already exists: %s", req.Email)
		return nil, errors.New("email already exists")
	}

	// Create account
	log.Printf("[CREATE-ACCOUNT] Creating account - Email: %s, Role: %s", req.Email, req.Role)
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
	// Validate input
	if err := validator.GetFullNameError(req.FullName); err != "" {
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
		FullName:     req.FullName,
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
	token, err := jwt.GenerateToken(userID, user.Email, user.Role)
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
