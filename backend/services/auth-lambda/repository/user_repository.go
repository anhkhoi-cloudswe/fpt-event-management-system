package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/hash"
	"github.com/fpt-event-services/services/auth-lambda/models"
)

// UserRepository handles user data access
type UserRepository struct {
	db *sql.DB
}

// NewUserRepository creates a new user repository
func NewUserRepository() *UserRepository {
	return &UserRepository{
		db: db.GetDB(),
	}
}

// CheckLogin verifies user credentials (khớp UsersDAO.checkLogin)
func (r *UserRepository) CheckLogin(ctx context.Context, email, password string) (*models.User, error) {
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
			fmt.Printf("❌ Login failed: User not found - Email: %s\n", email)
			return nil, errors.New("user not found")
		}
		fmt.Printf("❌ Login failed: Database error - %v\n", err)
		return nil, fmt.Errorf("failed to query user: %w", err)
	}

	fmt.Printf("🔍 Login attempt - Email: %s, Role: %s, Status: %s\n", user.Email, user.Role, user.Status)

	// Verify password
	if !hash.VerifyPassword(password, user.PasswordHash) {
		fmt.Printf("❌ Login failed: Invalid password for %s\n", email)
		fmt.Printf("   Password hash in DB: %s\n", user.PasswordHash)
		return nil, errors.New("invalid password")
	}

	// Check if user is blocked
	if user.Status == "BLOCKED" {
		fmt.Printf("❌ Login failed: User blocked - %s\n", email)
		return nil, errors.New("user is blocked")
	}

	fmt.Printf("✅ Login successful - Email: %s, UserID: %d\n", user.Email, user.ID)
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
	user.PasswordHash = hash.HashPassword(user.PasswordHash)

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
	passwordHash := hash.HashPassword(req.Password)

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
	passwordHash := hash.HashPassword(newPassword)

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
		args = append(args, hash.HashPassword(req.Password))
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
