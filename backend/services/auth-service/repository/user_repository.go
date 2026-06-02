package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/fpt-event-services/common/hash"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/services/auth-service/models"
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
// Supports Bcrypt, SHA256, MD5, and plaintext password migration to Bcrypt
func (r *UserRepository) CheckLogin(ctx context.Context, email, password string) (*models.User, error) {
	log.Info(">>>>>>>>>> ĐANG CHẠY LOGIC LOGIN MỚI (BCRYPT + SHA256 + MD5 + PLAINTEXT) <<<<<<<<<<")

	if r.db == nil {
		err := errors.New("database connection is not initialized")
		log.Error("CheckLogin - database init error: %v", err)
		return nil, err
	}

	query := `
		SELECT user_id, full_name, email, phone, password_hash, role, status, created_at, sso_provider, deleted_at, theme
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
		SELECT user_id, full_name, email, phone, password_hash, role, status, created_at, sso_provider, deleted_at, theme
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
	// Hash password
	passwordHash, hashErr := hash.HashPassword(newPassword)
	if hashErr != nil {
		return fmt.Errorf("failed to hash password: %w", hashErr)
	}

	query := `UPDATE Users SET password_hash = $1 WHERE email = $2`

	result, err := r.db.ExecContext(ctx, query, passwordHash, email)
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
		n++
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
		SELECT user_id, full_name, email, phone, role, status, created_at, sso_provider, deleted_at, theme
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
	passwordHash, hashErr := hash.HashPassword(newPassword)
	if hashErr != nil {
		return fmt.Errorf("failed to hash password: %w", hashErr)
	}

	query := `UPDATE Users SET password_hash = $1, sso_provider = NULL WHERE email = $2`

	result, err := r.db.ExecContext(ctx, query, passwordHash, email)
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

// DB returns the underlying database connection for custom queries
// Use this method when you need to execute queries outside the standard repository methods
func (r *UserRepository) DB() *sql.DB {
	return r.db
}


