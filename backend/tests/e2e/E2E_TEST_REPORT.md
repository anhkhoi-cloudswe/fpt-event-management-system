# E2E Test Report

| Tinh nang | Trang thai (PASS/FAIL) | Thoi gian phan hoi | Ghi chu loi |
|---|---|---:|---|
| Luong 1 - Quan ly su kien | FAIL | 16 ms | Step 1 login organizer that bai: Post "http://localhost:8080/api/login": dial tcp [::1]:8080: connectex: No connection could be made because the target machine actively refused it. |
| Luong 2 - Mua ve va thanh toan | FAIL | 1 ms | Step 1 login student that bai: Post "http://localhost:8080/api/login": dial tcp [::1]:8080: connectex: No connection could be made because the target machine actively refused it. |
| Luong 3 - Van hanh va bao cao | FAIL | 1 ms | Step 1 login organizer that bai: Post "http://localhost:8080/api/login": dial tcp [::1]:8080: connectex: No connection could be made because the target machine actively refused it. |
| Cleanup - Xoa Ticket/Event E2E | FAIL | 0 ms | khong ket noi duoc DB de cleanup: Error 1045 (28000): Access denied for user 'fpt_app'@'localhost' (using password: YES) |

Generated at: 2026-03-27T20:08:17+07:00
