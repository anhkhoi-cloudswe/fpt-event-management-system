package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/fpt-event-services/common/hash"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/services/auth-lambda/models"
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
		SELECT user_id, full_name, email, phone, password_hash, role, status, Wallet, created_at
		FROM Users
		WHERE email = ?
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
		&user.Wallet,
		&user.CreatedAt,
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
			updateQuery := `UPDATE Users SET password_hash = ? WHERE email = ?`
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
func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	query := `
		SELECT user_id, full_name, email, phone, password_hash, role, status, Wallet, created_at
		FROM Users
		WHERE email = ?
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
		&user.Wallet,
		&user.CreatedAt,
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
	query := `SELECT COUNT(*) FROM Users WHERE email = ?`

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

	query := `
		INSERT INTO Users (full_name, email, phone, password_hash, role, status, Wallet)
		VALUES (?, ?, ?, ?, ?, ?, 0)
	`

	result, err := r.db.ExecContext(
		ctx,
		query,
		user.FullName,
		user.Email,
		user.Phone,
		user.PasswordHash,
		user.Role,
		user.Status,
	)

	if err != nil {
		return 0, fmt.Errorf("failed to create user: %w", err)
	}

	userID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get last insert id: %w", err)
	}

	return int(userID), nil
}

// AdminCreateAccount creates an account with specific role (khớp UsersDAO.adminCreateAccount)
func (r *UserRepository) AdminCreateAccount(ctx context.Context, req models.AdminCreateAccountRequest) (int, error) {
	// Hash password
	passwordHash, hashErr := hash.HashPassword(req.Password)
	if hashErr != nil {
		return 0, fmt.Errorf("failed to hash password: %w", hashErr)
	}

	query := `
		INSERT INTO Users (full_name, email, phone, password_hash, role, status, Wallet)
		VALUES (?, ?, ?, ?, ?, ?, 0)
	`

	result, err := r.db.ExecContext(
		ctx,
		query,
		req.FullName,
		req.Email,
		req.Phone,
		passwordHash,
		req.Role,
		req.Status,
	)

	if err != nil {
		return 0, fmt.Errorf("failed to create account: %w", err)
	}

	userID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get last insert id: %w", err)
	}

	return int(userID), nil
}

// UpdatePasswordByEmail - Cập nhật mật khẩu theo email
// KHỚP VỚI Java UsersDAO.updatePasswordByEmail
func (r *UserRepository) UpdatePasswordByEmail(ctx context.Context, email, newPassword string) error {
	// Hash password
	passwordHash, hashErr := hash.HashPassword(newPassword)
	if hashErr != nil {
		return fmt.Errorf("failed to hash password: %w", hashErr)
	}

	query := `UPDATE Users SET password_hash = ? WHERE email = ?`

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

	query := `
		INSERT INTO Users (full_name, email, phone, password_hash, role, status, Wallet)
		VALUES (?, ?, ?, ?, ?, ?, 0)
	`

	result, err := r.db.ExecContext(
		ctx,
		query,
		user.FullName,
		user.Email,
		user.Phone,
		passwordHash,
		user.Role,
		user.Status,
	)

	if err != nil {
		return 0, fmt.Errorf("failed to create user: %w", err)
	}

	userID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get last insert id: %w", err)
	}

	return int(userID), nil
}

// UpdateUser updates user details (Admin)
func (r *UserRepository) UpdateUser(ctx context.Context, req models.AdminUpdateUserRequest) error {
	// Build dynamic update query
	query := "UPDATE Users SET "
	var args []interface{}
	var updates []string

	if req.FullName != "" {
		updates = append(updates, "full_name = ?")
		args = append(args, req.FullName)
	}
	if req.Phone != "" {
		updates = append(updates, "phone = ?")
		args = append(args, req.Phone)
	}
	if req.Role != "" {
		updates = append(updates, "role = ?")
		args = append(args, req.Role)
	}
	if req.Status != "" {
		updates = append(updates, "status = ?")
		args = append(args, req.Status)
	}
	if req.Password != "" {
		updates = append(updates, "password_hash = ?")
		hashedPwd, hashErr := hash.HashPassword(req.Password)
		if hashErr != nil {
			return fmt.Errorf("failed to hash password: %w", hashErr)
		}
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
	query += " WHERE user_id = ?"
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
	query := `UPDATE Users SET status = 'INACTIVE' WHERE user_id = ?`

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
		SELECT user_id, full_name, email, phone, role, status, Wallet, created_at
		FROM Users
		WHERE role = ? AND status IN ('ACTIVE', 'INACTIVE')
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
			&user.Wallet,
			&user.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, user)
	}

	return users, nil
}
