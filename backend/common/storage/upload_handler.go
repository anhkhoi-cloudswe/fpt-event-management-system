// Package storage cung cấp HTTP handler cho upload ảnh lên AWS S3.
//
// Handler này được gọi trực tiếp từ local-api/main.go (mode HTTP thuần).
// Zero-Waste: upload chỉ xảy ra sau khi Backend xác thực JWT hợp lệ,
// nghĩa là không có upload nào bị lãng phí từ người dùng chưa đăng nhập.
package storage

import (
	"context"
	"encoding/json"
	"net/http"
)

const (
	// MaxBannerSize giới hạn kích thước file banner (10 MB).
	MaxBannerSize = 10 << 20 // 10 MB

	// MaxReportImageSize giới hạn kích thước ảnh report (5 MB).
	MaxReportImageSize = 5 << 20 // 5 MB
)

// UploadResult là response trả về sau khi upload thành công.
type UploadResult struct {
	URL string `json:"url"`
}

// HandleImageUpload là HTTP handler cho POST /api/upload/image.
//
// Yêu cầu:
//   - Content-Type: multipart/form-data
//   - Field name: "file"
//   - Header X-User-Role phải được authMiddleware set trước (ORGANIZER/ADMIN/STUDENT/STAFF)
//
// Quy trình Zero-Waste:
//  1. Kiểm tra role (JWT đã được validate bởi authMiddleware)
//  2. Parse và validate file (loại, kích thước)
//  3. Chỉ khi pass hết validation mới upload lên S3
//  4. Trả về S3 URL để frontend đính kèm vào form submit
func HandleImageUpload(w http.ResponseWriter, r *http.Request) {
	setJSON(w)

	// ── 1. Kiểm tra role ─────────────────────────────────────────────
	userRole := r.Header.Get("X-User-Role")
	allowedRoles := map[string]bool{
		"ORGANIZER": true,
		"ADMIN":     true,
		"STUDENT":   true,
		"STAFF":     true,
	}
	if !allowedRoles[userRole] {
		log.Warn("[UPLOAD] Unauthorized role=%s", userRole)
		writeError(w, http.StatusForbidden, "Access denied: insufficient role")
		return
	}

	// ── 2. Parse multipart (giới hạn 10 MB) ──────────────────────────
	if err := r.ParseMultipartForm(MaxBannerSize); err != nil {
		log.Warn("[UPLOAD] ParseMultipartForm failed: %v", err)
		writeError(w, http.StatusBadRequest, "File too large (max 10 MB) or invalid multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		log.Warn("[UPLOAD] Missing 'file' field: %v", err)
		writeError(w, http.StatusBadRequest, "Missing 'file' field in form data")
		return
	}
	// Đảm bảo giải phóng bộ nhớ sau khi upload
	defer file.Close()

	// ── 3. Validate content-type ──────────────────────────────────────
	rawContentType := header.Header.Get("Content-Type")
	contentType, allowed := DetectContentType(rawContentType, header.Filename)
	if !allowed {
		log.Warn("[UPLOAD] Unsupported file type=%s filename=%s", rawContentType, header.Filename)
		writeError(w, http.StatusBadRequest, "Unsupported file type. Allowed: JPEG, PNG, GIF, WEBP")
		return
	}

	log.Info("[UPLOAD] Accepted file=%s size=%d contentType=%s role=%s",
		header.Filename, header.Size, contentType, userRole)

	// ── 4. Khởi tạo S3 client và upload ──────────────────────────────
	s3Client, err := NewS3Client(context.Background())
	if err != nil {
		log.Error("[UPLOAD] S3 client init failed (check AWS_REGION, AWS_S3_BUCKET, credentials): %v", err)
		writeError(w, http.StatusInternalServerError, "Storage service unavailable: "+err.Error())
		return
	}

	key := GenerateKey(header.Filename)
	publicURL, err := s3Client.UploadFile(context.Background(), key, file, contentType)
	if err != nil {
		// err.Error() đã chứa mã lỗi AWS SDK từ extractAWSErrorCode, ví dụ:
		// "AWS S3: AccessDenied: Access Denied"
		// "AWS S3: NoSuchBucket: The specified bucket does not exist"
		log.Error("[UPLOAD] Upload failed key=%s userRole=%s: %v", key, userRole, err)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// ── 5. Trả về URL ─────────────────────────────────────────────────
	log.Info("[UPLOAD] Success url=%s userRole=%s", publicURL, userRole)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(UploadResult{URL: publicURL})
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func setJSON(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
}

func writeError(w http.ResponseWriter, code int, message string) {
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"message": message})
}
