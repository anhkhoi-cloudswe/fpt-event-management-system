package main

import (
	"context"
	"fmt"
	"log"

	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/services/auth-lambda/repository"
	_ "github.com/go-sql-driver/mysql"
)

func main() {
	// Init DB
	if err := db.InitDB(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.CloseDB()

	repo := repository.NewUserRepository()

	// Test login với email từ hình
	email := "ahkhoinguyen169@gmail.com"
	password := "Pass123" // Thử mật khẩu mặc định

	fmt.Printf("🔍 Testing login for: %s\n", email)
	fmt.Printf("🔑 Testing password: %s\n", password)
	fmt.Println("=====================================")

	user, err := repo.CheckLogin(context.Background(), email, password)
	if err != nil {
		fmt.Printf("❌ Login FAILED: %v\n", err)
	} else {
		fmt.Printf("✅ Login SUCCESS!\n")
		fmt.Printf("   User ID: %d\n", user.ID)
		fmt.Printf("   Full Name: %s\n", user.FullName)
		fmt.Printf("   Role: %s\n", user.Role)
		fmt.Printf("   Status: %s\n", user.Status)
	}
}
