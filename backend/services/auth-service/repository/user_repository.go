package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/fpt-event-services/common/hash"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/services/auth-service/models"
	"golang.org/x/crypto/bcrypt"
)

var log = logger.Default()

// UserRepository handles user data access
type UserRepository struct {
	db *sql.DB
}

// NewUserRepositoryWithDB creates a new user repository with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton db.GetDB() allowed
func NewUserRepositoryWithDB(dbConn *sql.DB) *UserRepository {
	return &UserRepository{
		db: dbConn,
	}
}

// CheckLogin verifies user credentials with Lazy Migration support (khớp UsersDAO.checkLogin)
// Supports bcrypt and legacy SHA-256 password migration to bcrypt.
func (r *UserRepository) CheckLogin(ctx context.Context, email, password string) (*models.User, error) {
	log.Info("CheckLogin - running bcrypt + legacy SHA256 verification")

	if r.db == nil {
		err := errors.New("database connection is not initialized")
		log.Error("CheckLogin - database init error: %v", err)
		return nil, err
	}

	query := `
		SELECT user_id, full_name, email, COALESCE(phone, ''), password_hash, role, status, created_at, sso_provider, deleted_at, theme, COALESCE(language, 'vi')
		FROM Users
		WHERE email = $1
	`

	var user models.User
	err := r.db.QueryRowContext(ctx, query, email).Scan(
		&user.ID,
		&user.FullName,
		&user.Email,
		&user.Phone,
		&user.PasswordHash,
		&user.Role,
		&user.Status,
		&user.CreatedAt,
		&user.SSOProvider,
		&user.DeletedAt,
		&user.Theme,
		&user.Language,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("CheckLogin - user not found email=%s", email)
			return nil, errors.New("Invalid email or password")
		}
		log.Error("CheckLogin - database error: %v", err)
		return nil, fmt.Errorf("failed to query user: %w", err)
	}

	// Verify password with Lazy Migration
	if !hash.VerifyPassword(password, user.PasswordHash) {
		log.Warn("CheckLogin - invalid password for email=%s", email)
		return nil, errors.New("Invalid email or password")
	}

	// Auto-Upgrade: If password is in legacy format (not Bcrypt), upgrade to Bcrypt
	if !hash.IsBcryptHash(user.PasswordHash) {
		log.Info("CheckLogin - Legacy password detected for email=%s, upgrading to Bcrypt...", email)

		newHash, hashErr := hash.HashPassword(password)
		if hashErr != nil {
			log.Error("CheckLogin - failed to hash password for upgrade: %v", hashErr)
			// Continue login anyway, but don't block the user
		} else {
			// Update password in database
			updateQuery := `UPDATE Users SET password_hash = $1 WHERE email = $2`
			result, updateErr := r.db.ExecContext(ctx, updateQuery, newHash, email)
			if updateErr != nil {
				log.Error("CheckLogin - failed to update password hash error: %v", updateErr)
				// Continue login anyway, don't block the user
			} else {
				rows, rowsErr := result.RowsAffected()
				if rowsErr != nil {
					log.Error("CheckLogin - failed to read update affected rows error: %v", rowsErr)
				} else if rows == 0 {
					log.Error("CheckLogin - password hash update affected 0 rows for email=%s", email)
				}

				log.Info("CheckLogin - password upgraded to Bcrypt for email=%s", email)
				user.PasswordHash = newHash
			}
		}
	}

	// Check if user is blocked
	if user.Status == "BLOCKED" {
		log.Warn("CheckLogin - user blocked email=%s", email)
		return nil, errors.New("user is blocked")
	}

	log.Info("CheckLogin - success email=%s userID=%d", user.Email, user.ID)
	return &user, nil
}

// FindByEmail finds a user by email
// OPTIMIZED: Removed Wallet column reference - balance now queried from dedicated wallets table
func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	query := `
		SELECT user_id, full_name, email, COALESCE(phone, ''), password_hash, role, status, created_at, sso_provider, deleted_at, theme, COALESCE(language, 'vi')
		FROM Users
		WHERE email = $1
	`

	var user models.User
	err := r.db.QueryRowContext(ctx, query, email).Scan(
		&user.ID,
		&user.FullName,
		&user.Email,
		&user.Phone,
		&user.PasswordHash,
		&user.Role,
		&user.Status,
		&user.CreatedAt,
		&user.SSOProvider,
		&user.DeletedAt,
		&user.Theme,
		&user.Language,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query user: %w", err)
	}

	return &user, nil
}

func (r *UserRepository) FindByID(ctx context.Context, userID int) (*models.User, error) {
	query := `
		SELECT user_id, full_name, email, COALESCE(phone, ''), password_hash, role, status, created_at, sso_provider, deleted_at, theme, COALESCE(language, 'vi')
		FROM Users
		WHERE user_id = $1
	`

	var user models.User
	err := r.db.QueryRowContext(ctx, query, userID).Scan(
		&user.ID,
		&user.FullName,
		&user.Email,
		&user.Phone,
		&user.PasswordHash,
		&user.Role,
		&user.Status,
		&user.CreatedAt,
		&user.SSOProvider,
		&user.DeletedAt,
		&user.Theme,
		&user.Language,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query user: %w", err)
	}
	return &user, nil
}

// ExistsByEmail checks if email already exists
func (r *UserRepository) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	query := `SELECT COUNT(*) FROM Users WHERE email = $1`

	var count int
	err := r.db.QueryRowContext(ctx, query, email).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check email: %w", err)
	}

	return count > 0, nil
}

// ExistsByPhone checks if phone number is already used by another user (excluding current user if provided)
func (r *UserRepository) ExistsByPhone(ctx context.Context, phone string, excludeUserID int) (bool, error) {
	if phone == "" {
		return false, nil
	}
	var query string
	var args []interface{}
	if excludeUserID > 0 {
		query = `SELECT COUNT(*) FROM Users WHERE phone = $1 AND user_id != $2 AND deleted_at IS NULL`
		args = []interface{}{phone, excludeUserID}
	} else {
		query = `SELECT COUNT(*) FROM Users WHERE phone = $1 AND deleted_at IS NULL`
		args = []interface{}{phone}
	}

	var count int
	err := r.db.QueryRowContext(ctx, query, args...).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check phone: %w", err)
	}

	return count > 0, nil
}

func (r *UserRepository) UpdateActiveSessionTokenID(ctx context.Context, userID int, sessionTokenID string) error {
	query := `UPDATE Users SET active_session_token_id = $1 WHERE user_id = $2`
	result, err := r.db.ExecContext(ctx, query, sessionTokenID, userID)
	if err != nil {
		return fmt.Errorf("failed to update active session token: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return errors.New("user not found")
	}
	return nil
}

func (r *UserRepository) GetActiveSessionTokenID(ctx context.Context, userID int) (string, error) {
	query := `SELECT COALESCE(active_session_token_id, '') FROM Users WHERE user_id = $1`
	var sessionTokenID string
	err := r.db.QueryRowContext(ctx, query, userID).Scan(&sessionTokenID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errors.New("user not found")
		}
		return "", fmt.Errorf("failed to query active session token: %w", err)
	}
	return sessionTokenID, nil
}

// CreateUser creates a new user (khớp UsersDAO.insertUser)
func (r *UserRepository) CreateUser(ctx context.Context, user *models.User) (int, error) {
	// Default values
	if user.Role == "" {
		user.Role = "STUDENT"
	}
	if user.Status == "" {
		user.Status = "ACTIVE"
	}

	// Hash password
	hashedPwd, err := hash.HashPassword(user.PasswordHash)
	if err != nil {
		return 0, fmt.Errorf("failed to hash password: %w", err)
	}
	user.PasswordHash = hashedPwd

	if user.Theme == "" {
		user.Theme = "light"
	}
	query := `
		INSERT INTO Users (full_name, email, phone, password_hash, role, status, sso_provider, deleted_at, theme)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING user_id
	`

	var userID int
	err = r.db.QueryRowContext(
		ctx,
		query,
		user.FullName,
		user.Email,
		user.Phone,
		user.PasswordHash,
		user.Role,
		user.Status,
		user.SSOProvider,
		user.DeletedAt,
		user.Theme,
	).Scan(&userID)

	if err != nil {
		return 0, fmt.Errorf("failed to create user: %w", err)
	}

	return userID, nil
}

// AdminCreateAccount creates an account with specific role (khớp UsersDAO.adminCreateAccount)
// OPTIMIZED: Removed Wallet column - wallets table handles balance separately
func (r *UserRepository) AdminCreateAccount(ctx context.Context, req models.AdminCreateAccountRequest) (int, error) {
	// Hash password
	passwordHash, hashErr := hash.HashPassword(req.Password)
	if hashErr != nil {
		return 0, fmt.Errorf("failed to hash password: %w", hashErr)
	}

	query := `
		INSERT INTO Users (full_name, email, phone, password_hash, role, status)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING user_id
	`

	var userID int
	err := r.db.QueryRowContext(
		ctx,
		query,
		req.FullName,
		req.Email,
		req.Phone,
		passwordHash,
		req.Role,
		req.Status,
	).Scan(&userID)

	if err != nil {
		return 0, fmt.Errorf("failed to create account: %w", err)
	}

	return userID, nil
}

// UpdatePhoneByEmail - Cập nhật số điện thoại theo email
func (r *UserRepository) UpdatePhoneByEmail(ctx context.Context, email, phone string) error {
	query := `UPDATE Users SET phone = $1 WHERE email = $2`

	result, err := r.db.ExecContext(ctx, query, phone, email)
	if err != nil {
		return fmt.Errorf("failed to update phone: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}

	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}

// UpdatePasswordByEmail - Cập nhật mật khẩu theo email
// KHỚP VỚI Java UsersDAO.updatePasswordByEmail
func (r *UserRepository) UpdatePasswordByEmail(ctx context.Context, email, newPassword string) error {
	passwordHash, hashErr := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if hashErr != nil {
		return fmt.Errorf("failed to hash password: %w", hashErr)
	}

	query := `UPDATE Users SET password_hash = $1 WHERE email = $2`

	result, err := r.db.ExecContext(ctx, query, string(passwordHash), email)
	if err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}

	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}

// CreateUserWithHash creates a new user with pre-hashed password
func (r *UserRepository) CreateUserWithHash(ctx context.Context, user *models.User, passwordHash string) (int, error) {
	if user.Role == "" {
		user.Role = "STUDENT"
	}
	if user.Status == "" {
		user.Status = "ACTIVE"
	}

	if user.Theme == "" {
		user.Theme = "light"
	}
	query := `
		INSERT INTO Users (full_name, email, phone, password_hash, role, status, sso_provider, deleted_at, theme)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING user_id
	`

	var userID int
	err := r.db.QueryRowContext(
		ctx,
		query,
		user.FullName,
		user.Email,
		user.Phone,
		passwordHash,
		user.Role,
		user.Status,
		user.SSOProvider,
		user.DeletedAt,
		user.Theme,
	).Scan(&userID)

	if err != nil {
		return 0, fmt.Errorf("failed to create user: %w", err)
	}

	return userID, nil
}

// UpdateUser updates user details (Admin)
func (r *UserRepository) UpdateUser(ctx context.Context, req models.AdminUpdateUserRequest) error {
	// Build dynamic update query
	query := "UPDATE Users SET "
	var args []interface{}
	var updates []string
	n := 1

	if req.FullName != "" {
		updates = append(updates, fmt.Sprintf("full_name = $%d", n))
		args = append(args, req.FullName)
		n++
	}
	if req.Phone != "" {
		updates = append(updates, fmt.Sprintf("phone = $%d", n))
		args = append(args, req.Phone)
		n++
	}
	if req.Role != "" {
		updates = append(updates, fmt.Sprintf("role = $%d", n))
		args = append(args, req.Role)
		n++
	}
	if req.Status != "" {
		updates = append(updates, fmt.Sprintf("status = $%d", n))
		args = append(args, req.Status)
		n++
	}
	if req.Password != "" {
		hashedPwd, hashErr := hash.HashPassword(req.Password)
		if hashErr != nil {
			return fmt.Errorf("failed to hash password: %w", hashErr)
		}
		updates = append(updates, fmt.Sprintf("password_hash = $%d", n))
		args = append(args, hashedPwd)
	}

	if len(updates) == 0 {
		return errors.New("nothing to update")
	}

	for i, u := range updates {
		if i > 0 {
			query += ", "
		}
		query += u
	}
	query += fmt.Sprintf(" WHERE user_id = $%d", n)
	args = append(args, req.ID)

	result, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}

// SoftDeleteUser sets user status to INACTIVE
func (r *UserRepository) SoftDeleteUser(ctx context.Context, userID string) error {
	query := `UPDATE Users SET status = 'INACTIVE' WHERE user_id = $1`

	result, err := r.db.ExecContext(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("failed to soft delete user: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}

// FindByRole returns users with a specific role
// KHỚP VỚI Java UsersDAO.getStaffAndOrganizer() - filter by ACTIVE and INACTIVE status
func (r *UserRepository) FindByRole(ctx context.Context, role string) ([]models.User, error) {
	query := `
		SELECT user_id, full_name, email, COALESCE(phone, ''), role, status, created_at, sso_provider, deleted_at, theme
		FROM Users
		WHERE role = $1 AND status IN ('ACTIVE', 'INACTIVE')
		ORDER BY full_name
	`

	rows, err := r.db.QueryContext(ctx, query, role)
	if err != nil {
		return nil, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var user models.User
		err := rows.Scan(
			&user.ID,
			&user.FullName,
			&user.Email,
			&user.Phone,
			&user.Role,
			&user.Status,
			&user.CreatedAt,
			&user.SSOProvider,
			&user.DeletedAt,
			&user.Theme,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, user)
	}

	return users, nil
}

// SoftDeleteUserWithTimestamp soft deletes user (sets status to PENDING_DELETE and sets deleted_at)
func (r *UserRepository) SoftDeleteUserWithTimestamp(ctx context.Context, userID int) error {
	query := `UPDATE Users SET status = 'PENDING_DELETE', deleted_at = CURRENT_TIMESTAMP WHERE user_id = $1`

	result, err := r.db.ExecContext(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("failed to soft delete user with timestamp: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}

// RestoreUserAccount restores user status to ACTIVE and clears deleted_at
func (r *UserRepository) RestoreUserAccount(ctx context.Context, userID int) error {
	query := `UPDATE Users SET status = 'ACTIVE', deleted_at = NULL WHERE user_id = $1`

	result, err := r.db.ExecContext(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("failed to restore user account: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}

// UpdatePasswordAndClearSSO updates password and sets sso_provider to NULL
func (r *UserRepository) UpdatePasswordAndClearSSO(ctx context.Context, email, newPassword string) error {
	passwordHash, hashErr := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if hashErr != nil {
		return fmt.Errorf("failed to hash password: %w", hashErr)
	}

	query := `UPDATE Users SET password_hash = $1, sso_provider = NULL WHERE email = $2`

	result, err := r.db.ExecContext(ctx, query, string(passwordHash), email)
	if err != nil {
		return fmt.Errorf("failed to update password and sso: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}

	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}

// HardDeleteExpiredUsers permanently deletes user accounts in PENDING_DELETE state older than 30 days
func (r *UserRepository) HardDeleteExpiredUsers(ctx context.Context) (int64, error) {
	query := `DELETE FROM Users WHERE status = 'PENDING_DELETE' AND deleted_at < CURRENT_TIMESTAMP - INTERVAL '30 days'`

	result, err := r.db.ExecContext(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("failed to hard delete expired users: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}

	return rows, nil
}

// UpdateThemeByEmail updates theme preference by email
// OPTIMIZED: Uses preventive guard constraint to avoid redundant I/O
func (r *UserRepository) UpdateThemeByEmail(ctx context.Context, email, theme string) error {
	// Preventive guard: only update if theme has actually changed
	query := `UPDATE Users SET theme = $1 WHERE email = $2 AND theme != $1`

	result, err := r.db.ExecContext(ctx, query, theme, email)
	if err != nil {
		return fmt.Errorf("failed to update theme: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}

	if rows == 0 {
		// No rows updated - either user not found OR theme already matches (no-op)
		// Check if user exists
		var exists bool
		err = r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM Users WHERE email = $1)`, email).Scan(&exists)
		if err != nil {
			return fmt.Errorf("failed to check user existence: %w", err)
		}
		if !exists {
			return errors.New("user not found")
		}
		// Theme already matches - this is actually a success (no-op write)
	}

	return nil
}

// UpdateLanguageByEmail updates language preference by email.
func (r *UserRepository) UpdateLanguageByEmail(ctx context.Context, email, language string) error {
	query := `UPDATE Users SET language = $1 WHERE email = $2 AND COALESCE(language, 'vi') != $1`

	result, err := r.db.ExecContext(ctx, query, language, email)
	if err != nil {
		return fmt.Errorf("failed to update language: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}

	if rows == 0 {
		var exists bool
		err = r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM Users WHERE email = $1)`, email).Scan(&exists)
		if err != nil {
			return fmt.Errorf("failed to check user existence: %w", err)
		}
		if !exists {
			return errors.New("user not found")
		}
	}

	return nil
}

// UpdateFullNameByEmail updates fullName by email
func (r *UserRepository) UpdateFullNameByEmail(ctx context.Context, email, fullName string) error {
	query := `UPDATE Users SET full_name = $1 WHERE email = $2`

	result, err := r.db.ExecContext(ctx, query, fullName, email)
	if err != nil {
		return fmt.Errorf("failed to update fullName: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}

	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}

// UpgradeToOrganizer upgrades a STUDENT user to ORGANIZER and creates default FREE subscription if not exists
func (r *UserRepository) UpgradeToOrganizer(ctx context.Context, userID int, phone string) error {
	return r.UpgradeToOrganizerWithOrg(ctx, userID, phone, nil)
}

// UpgradeToOrganizerWithOrg upgrades a STUDENT user to ORGANIZER with optional org_id
func (r *UserRepository) UpgradeToOrganizerWithOrg(ctx context.Context, userID int, phone string, orgID *int) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// 1. Update role to ORGANIZER, phone, and org_id if provided
	var updateQuery string
	var args []interface{}

	if orgID != nil && *orgID > 0 {
		if phone != "" {
			updateQuery = `UPDATE Users SET role = 'ORGANIZER', phone = $1, org_id = $2, previous_role = 'STUDENT' WHERE user_id = $3 AND role = 'STUDENT'`
			args = []interface{}{phone, *orgID, userID}
		} else {
			updateQuery = `UPDATE Users SET role = 'ORGANIZER', org_id = $1, previous_role = 'STUDENT' WHERE user_id = $2 AND role = 'STUDENT'`
			args = []interface{}{*orgID, userID}
		}
	} else {
		if phone != "" {
			updateQuery = `UPDATE Users SET role = 'ORGANIZER', phone = $1, previous_role = 'STUDENT' WHERE user_id = $2 AND role = 'STUDENT'`
			args = []interface{}{phone, userID}
		} else {
			updateQuery = `UPDATE Users SET role = 'ORGANIZER', previous_role = 'STUDENT' WHERE user_id = $1 AND role = 'STUDENT'`
			args = []interface{}{userID}
		}
	}

	result, err := tx.ExecContext(ctx, updateQuery, args...)
	if err != nil {
		return fmt.Errorf("failed to update user role: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check affected rows: %w", err)
	}
	if rows == 0 {
		return errors.New("chỉ tài khoản Sinh viên (STUDENT) mới có thể nâng cấp lên Ban tổ chức")
	}

	// 2. Ensure default FREE subscription exists for this organizer
	var freeTierID int
	err = tx.QueryRowContext(ctx, `SELECT tier_id FROM subscription_tier WHERE tier_code = 'FREE' LIMIT 1`).Scan(&freeTierID)
	if err == nil && freeTierID > 0 {
		var hasActiveSub bool
		_ = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM user_subscription WHERE user_id = $1 AND status = 'ACTIVE')`, userID).Scan(&hasActiveSub)
		if !hasActiveSub {
			insertSubQuery := `
				INSERT INTO user_subscription (user_id, tier_id, status, start_date, end_date, auto_renew, amount_paid_vnd)
				VALUES ($1, $2, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '10 years', false, 0)
			`
			_, _ = tx.ExecContext(ctx, insertSubQuery, userID, freeTierID)
		}
	}

	return tx.Commit()
}

// GetAllOrganizations fetches active or all organizations
func (r *UserRepository) GetAllOrganizations(ctx context.Context, onlyActive bool) ([]models.Organization, error) {
	query := `SELECT org_id, org_name, org_code, category, campus_code, logo_url, description, status, created_at FROM organizations`
	if onlyActive {
		query += ` WHERE status = 'ACTIVE'`
	}
	query += ` ORDER BY org_name ASC`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.Organization
	for rows.Next() {
		var o models.Organization
		if err := rows.Scan(&o.OrgID, &o.OrgName, &o.OrgCode, &o.OrgType, &o.CampusCode, &o.LogoURL, &o.Description, &o.Status, &o.CreatedAt); err != nil {
			continue
		}
		list = append(list, o)
	}
	return list, nil
}

// CreateOrganization creates a new organization entity
func (r *UserRepository) CreateOrganization(ctx context.Context, req models.OrganizationRequest) (*models.Organization, error) {
	query := `
		INSERT INTO organizations (org_name, org_code, category, campus_code, logo_url, description, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING org_id, created_at
	`
	if req.OrgType == "" {
		req.OrgType = "CLUB"
	}
	if req.CampusCode == "" {
		req.CampusCode = "HCM"
	}
	if req.Status == "" {
		req.Status = "ACTIVE"
	}

	var orgID int
	var createdAt time.Time
	err := r.db.QueryRowContext(ctx, query, req.OrgName, req.OrgCode, req.OrgType, req.CampusCode, req.LogoURL, req.Description, req.Status).Scan(&orgID, &createdAt)
	if err != nil {
		return nil, err
	}

	return &models.Organization{
		OrgID:       orgID,
		OrgName:     req.OrgName,
		OrgCode:     req.OrgCode,
		OrgType:     req.OrgType,
		CampusCode:  req.CampusCode,
		LogoURL:     req.LogoURL,
		Description: req.Description,
		Status:      req.Status,
		CreatedAt:   createdAt,
	}, nil
}

// UpdateOrganization updates an existing organization
func (r *UserRepository) UpdateOrganization(ctx context.Context, orgID int, req models.OrganizationRequest) error {
	query := `
		UPDATE organizations
		SET org_name = $1, org_code = $2, category = $3, campus_code = $4, logo_url = $5, description = $6, status = $7
		WHERE org_id = $8
	`
	_, err := r.db.ExecContext(ctx, query, req.OrgName, req.OrgCode, req.OrgType, req.CampusCode, req.LogoURL, req.Description, req.Status, orgID)
	return err
}

// DeleteOrganization soft-deletes or deactivates an organization
func (r *UserRepository) DeleteOrganization(ctx context.Context, orgID int) error {
	_, err := r.db.ExecContext(ctx, `UPDATE organizations SET status = 'INACTIVE' WHERE org_id = $1`, orgID)
	return err
}

// DB returns the underlying database connection for custom queries
func (r *UserRepository) DB() *sql.DB {
	return r.db
}

