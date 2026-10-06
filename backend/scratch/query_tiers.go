package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"

	_ "github.com/lib/pq"
)

func main() {
	connStr := "postgres://postgres:postgres@localhost:5432/fpt_event_test?sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		fmt.Printf("Error opening db: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	rows, err := db.QueryContext(context.Background(), "SELECT tier_code, price_vnd, commission_bps, max_capacity_limit, has_advanced_reports FROM subscription_tier ORDER BY tier_id;")
	if err != nil {
		fmt.Printf("Error querying: %v\n", err)
		os.Exit(1)
	}
	defer rows.Close()

	fmt.Printf("%-15s | %-12s | %-15s | %-18s | %-20s\n", "tier_code", "price_vnd", "commission_bps", "max_capacity_limit", "has_advanced_reports")
	fmt.Println("---------------------------------------------------------------------------------------------------------")
	for rows.Next() {
		var code string
		var price int64
		var comm int
		var cap int
		var adv bool
		if err := rows.Scan(&code, &price, &comm, &cap, &adv); err != nil {
			fmt.Printf("Scan error: %v\n", err)
			return
		}
		fmt.Printf("%-15s | %-12d | %-15d | %-18d | %-20t\n", code, price, comm, cap, adv)
	}
}
