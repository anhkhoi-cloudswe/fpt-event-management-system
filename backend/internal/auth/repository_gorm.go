package auth

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// User is the auth table model used by the standalone auth module.
type User struct {
	ID           uint      `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Email        string    `gorm:"column:email;size:100;not null;uniqueIndex" json:"email"`
	PasswordHash string    `gorm:"column:password_hash;size:255;not null" json:"-"`
	FullName     string    `gorm:"column:full_name;size:255" json:"fullName"`
	Phone        string    `gorm:"column:phone;size:20" json:"phone"`
	Role         string    `gorm:"column:role;size:50;default:'user'" json:"role"`
	Status       string    `gorm:"column:status;size:50;default:'active'" json:"status"`
	Wallet       float64   `gorm:"column:wallet;type:decimal(15,4);default:0" json:"wallet"`
	CreatedAt    time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
}

func (User) TableName() string {
	return "auth_users"
}

type GormUserStore struct {
	db *gorm.DB
}

func NewMySQLGormDB(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect mysql with gorm: %w", err)
	}

	return db, nil
}

func NewGormUserStore(db *gorm.DB) (*GormUserStore, error) {
	if err := db.AutoMigrate(&User{}); err != nil {
		return nil, fmt.Errorf("failed to automigrate auth_users table: %w", err)
	}

	return &GormUserStore{db: db}, nil
}

func (s *GormUserStore) CreateUser(username, passwordHash string) (*User, error) {
	// Map username param to email for compatibility
	normalizedEmail := normalizeEmail(username)

	entity := &User{
		Email:        normalizedEmail,
		PasswordHash: passwordHash,
	}

	err := s.db.Create(entity).Error
	if err != nil {
		if isDuplicateKeyError(err) {
			return nil, errUserAlreadyExists
		}

		return nil, err
	}

	return entity, nil
}

func (s *GormUserStore) FindByUsername(username string) (*User, error) {
	// Map username param to email for compatibility
	normalizedEmail := normalizeEmail(username)

	var entity User
	err := s.db.Where("email = ?", normalizedEmail).First(&entity).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errUserNotFound
		}

		return nil, err
	}

	return &entity, nil
}

func (s *GormUserStore) UpdateUserPassword(username, passwordHash string) error {
	// Map username param to email for compatibility
	normalizedEmail := normalizeEmail(username)

	result := s.db.Model(&User{}).
		Where("email = ?", normalizedEmail).
		Update("password_hash", passwordHash)
	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected == 0 {
		return errUserNotFound
	}

	return nil
}

func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}

	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate") || strings.Contains(msg, "1062")
}
