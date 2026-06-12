// Package storage cung cấp tiện ích upload file lên AWS S3.
//
// Thiết kế hỗ trợ chuyển sang IAM Role mà không cần sửa logic:
//   - Dev: dùng AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY trong .env
//   - Prod (IAM Role): xóa biến tĩnh khỏi env, SDK tự dùng instance metadata
package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	smithy "github.com/aws/smithy-go"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/timeutil"
	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

var log = logger.Default()

// AllowedMimeTypes là danh sách content-type ảnh được phép upload.
var AllowedMimeTypes = map[string]bool{
	"image/jpeg": true,
	"image/jpg":  true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

// extToMime chuyển extension ảnh sang MIME type.
var extToMime = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
}

// S3Client bọc client AWS S3 cùng thông tin bucket/region.
type S3Client struct {
	client *s3.Client
	bucket string
	region string
}

// NewS3Client khởi tạo S3Client từ biến môi trường.
//
// Thứ tự ưu tiên credential (do AWS SDK tự xử lý):
//  1. Biến môi trường AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY  (dev / CI)
//  2. AWS credentials file (~/.aws/credentials)
//  3. IAM Role gắn với EC2 / ECS Task / Lambda  (prod – không cần sửa code)
func NewS3Client(ctx context.Context) (*S3Client, error) {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "ap-southeast-1"
	}

	bucket := os.Getenv("AWS_S3_BUCKET")
	if bucket == "" {
		return nil, fmt.Errorf("AWS_S3_BUCKET environment variable is required")
	}

	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	log.Info("[S3] Client initialized bucket=%s region=%s", bucket, region)

	return &S3Client{
		client: s3.NewFromConfig(cfg),
		bucket: bucket,
		region: region,
	}, nil
}

// UploadFile upload một file lên S3 và trả về URL công khai.
//
// Caller có trách nhiệm đóng reader sau khi hàm trả về.
// URL trả về có dạng: https://{bucket}.s3.{region}.amazonaws.com/{key}
func (c *S3Client) UploadFile(ctx context.Context, key string, body io.Reader, contentType string) (string, error) {
	log.Info("[S3] Uploading key=%s bucket=%s contentType=%s", key, c.bucket, contentType)

	_, err := c.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(c.bucket),
		Key:         aws.String(key),
		Body:        body,
		ContentType: aws.String(contentType),
	})
	if err != nil {
		// Trích xuất mã lỗi AWS SDK để dễ chẩn đoán (AccessDenied, NoSuchBucket, ...)
		awsErrCode := extractAWSErrorCode(err)
		log.Error("[S3] Upload failed key=%s bucket=%s region=%s awsCode=%s error=%v",
			key, c.bucket, c.region, awsErrCode, err)
		return "", fmt.Errorf("AWS S3: %s", awsErrCode)
	}

	publicURL := fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", c.bucket, c.region, key)
	log.Info("[S3] Upload successful url=%s", publicURL)
	return publicURL, nil
}

// extractAWSErrorCode trích xuất mã lỗi từ AWS SDK error.
// Nếu không phải smithy APIError thì trả về chuỗi lỗi gốc.
func extractAWSErrorCode(err error) string {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return fmt.Sprintf("%s: %s", apiErr.ErrorCode(), apiErr.ErrorMessage())
	}
	return err.Error()
}

// reMuliDash gộp nhiều dấu gạch ngang liên tiếp thành một.
var reMultiDash = regexp.MustCompile(`-{2,}`)

// reUnsafe xóa mọi ký tự không phải chữ-số-ASCII hoặc dấu chấm/gạch ngang.
var reUnsafe = regexp.MustCompile(`[^a-z0-9.\-]`)

// GenerateKey tạo S3 key duy nhất từ tên file gốc.
//
// Tên file được sanitize hoàn toàn:
//  1. Loại bỏ dấu tiếng Việt (NFD + strip combining marks)
//  2. Chuyển về chữ thường ASCII
//  3. Thay khoảng trắng và ký tự đặc biệt (#@$%...) bằng dấu gạch ngang
//
// Định dạng kết quả: uploads/{timestamp}-{random8hex}-{safe-stem}{ext}
// Ví dụ đầu vào:  "Diễn Giả ảnh #1.jpg"
// Ví dụ kết quả:  uploads/1741651200000000000-a3f7c2b1-dien-gia-anh-1.jpg
func GenerateKey(originalFilename string) string {
	ext := strings.ToLower(filepath.Ext(originalFilename))
	if ext == "" {
		ext = ".jpg"
	}

	stem := strings.TrimSuffix(originalFilename, filepath.Ext(originalFilename))
	safeStem := sanitizeFilename(stem)
	if safeStem == "" || safeStem == "-" {
		safeStem = "image"
	}

	b := make([]byte, 4)
	rand.Read(b) //nolint:errcheck – crypto/rand.Read never fails
	return fmt.Sprintf("uploads/%d-%s-%s%s", timeutil.GetNow().UnixNano(), hex.EncodeToString(b), safeStem, ext)
}

// sanitizeFilename loại bỏ dấu tiếng Việt và ký tự đặc biệt khỏi tên file.
func sanitizeFilename(name string) string {
	// Bước 1: NFD decompose → tách dấu khỏi ký tự gốc
	t := transform.Chain(
		norm.NFD,
		runes.Remove(runes.In(unicode.Mn)), // Mn = combining diacritical marks
		norm.NFC,
	)
	result, _, err := transform.String(t, name)
	if err != nil {
		result = name
	}

	// Bước 2: chữ thường
	result = strings.ToLower(result)

	// Bước 3: khoảng trắng và ký tự không an toàn → gạch ngang
	result = strings.Map(func(r rune) rune {
		if r == ' ' || r == '_' {
			return '-'
		}
		return r
	}, result)

	// Bước 4: xóa ký tự không phải [a-z0-9.-]
	result = reUnsafe.ReplaceAllString(result, "")

	// Bước 5: gộp gạch ngang liên tiếp
	result = reMultiDash.ReplaceAllString(result, "-")

	// Bước 6: trim leading/trailing dashes
	return strings.Trim(result, "-")
}

// DetectContentType trả về MIME type dựa trên content-type header hoặc extension file.
// Trả về ("", false) nếu không phải loại ảnh được phép.
func DetectContentType(headerContentType, filename string) (string, bool) {
	ct := strings.ToLower(strings.TrimSpace(headerContentType))
	// Loại bỏ tham số như "; boundary=..."
	if idx := strings.Index(ct, ";"); idx != -1 {
		ct = strings.TrimSpace(ct[:idx])
	}

	if AllowedMimeTypes[ct] {
		return ct, true
	}

	// Fallback: phát hiện từ extension
	ext := strings.ToLower(filepath.Ext(filename))
	if mime, ok := extToMime[ext]; ok {
		return mime, true
	}

	return "", false
}

// DeleteFile deletes an object from S3 using its public URL.
func (c *S3Client) DeleteFile(ctx context.Context, publicURL string) error {
	prefix := fmt.Sprintf("https://%s.s3.%s.amazonaws.com/", c.bucket, c.region)
	if !strings.HasPrefix(publicURL, prefix) {
		return fmt.Errorf("invalid S3 URL for this bucket: %s", publicURL)
	}
	key := strings.TrimPrefix(publicURL, prefix)
	log.Info("[S3] Deleting key=%s bucket=%s", key, c.bucket)

	_, err := c.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		log.Error("[S3] Delete failed key=%s error=%v", key, err)
		return fmt.Errorf("AWS S3 Delete: %w", err)
	}
	log.Info("[S3] Delete successful key=%s", key)
	return nil
}
