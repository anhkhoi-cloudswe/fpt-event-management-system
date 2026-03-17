package utils

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/config"
	lambdasvc "github.com/aws/aws-sdk-go-v2/service/lambda"
	"github.com/fpt-event-services/common/logger"
)

// ============================================================
// InternalClient - HTTP Client cho giao tiếp nội bộ giữa các Service
// Trên AWS: gọi Lambda trực tiếp qua SDK Invoke (tránh Internal API Gateway)
// Tại Local: HTTP như cũ — JWT Propagation, Retry Logic, Timeout
// ============================================================

// isAWSEnvironment trả về true khi chạy bên trong Lambda on AWS
func isAWSEnvironment() bool {
	return os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != ""
}

// pathToLambdaFunction ánh xạ URL path → tên Lambda function trong AWS
// Tên function theo quy tắc: fpt-events-{service}-{env}
func pathToLambdaFunction(path string) (string, bool) {
	env := os.Getenv("ENVIRONMENT")
	if env == "" {
		env = "prod"
	}

	type rule struct {
		prefix  string
		service string
	}

	rules := []rule{
		{"/internal/user", "auth"},
		{"/internal/events", "event"},
		{"/internal/scheduler/event-cleanup", "event"},
		{"/internal/scheduler/expired-requests", "event"},
		{"/internal/scheduler/venue-release", "venue"},
		{"/internal/scheduler/pending-ticket-cleanup", "ticket"},
		{"/internal/venue", "venue"},
		{"/internal/wallet", "ticket"},
		{"/internal/category-ticket", "ticket"},
		{"/internal/tickets", "ticket"},
		{"/internal/ticket", "ticket"},
		{"/internal/notify", "notification"},
	}

	for _, r := range rules {
		if strings.HasPrefix(path, r.prefix) {
			return fmt.Sprintf("fpt-events-%s-%s", r.service, env), true
		}
	}
	return "", false
}

const (
	defaultTimeout    = 5 * time.Second
	defaultMaxRetries = 3
	retryBaseDelay    = 500 * time.Millisecond
)

// contextKey là kiểu key riêng để tránh xung đột trong context
type contextKey string

const (
	// ContextKeyJWTToken - key để lưu JWT token trong context
	ContextKeyJWTToken contextKey = "jwt_token"
	// ContextKeyUserID - key để lưu User ID trong context
	ContextKeyUserID contextKey = "user_id"
	// ContextKeyUserRole - key để lưu User Role trong context
	ContextKeyUserRole contextKey = "user_role"
	// ContextKeyRequestID - key để lưu Request ID cho distributed tracing
	ContextKeyRequestID contextKey = "request_id"
	// ContextKeyTraceID - key để lưu X-Ray Trace ID cho AWS X-Ray service map
	ContextKeyTraceID contextKey = "trace_id"
)

// InternalClient là HTTP client dùng cho giao tiếp giữa các Lambda Service
type InternalClient struct {
	httpClient   *http.Client
	maxRetries   int
	logger       *logger.Logger
	lambdaClient *lambdasvc.Client // lazy-init khi chạy trên AWS
}

// NewInternalClient tạo InternalClient mới với cấu hình mặc định
// Timeout: 5s, MaxRetries: 3
func NewInternalClient() *InternalClient {
	return &InternalClient{
		httpClient: &http.Client{
			Timeout: defaultTimeout,
		},
		maxRetries: defaultMaxRetries,
		logger:     logger.Default(),
	}
}

// NewInternalClientWithConfig tạo InternalClient với cấu hình tùy chỉnh
func NewInternalClientWithConfig(timeout time.Duration, maxRetries int) *InternalClient {
	return &InternalClient{
		httpClient: &http.Client{
			Timeout: timeout,
		},
		maxRetries: maxRetries,
		logger:     logger.Default(),
	}
}

// getLambdaClient lazy-init AWS Lambda SDK client (chỉ dùng khi chạy trên AWS)
func (c *InternalClient) getLambdaClient(ctx context.Context) (*lambdasvc.Client, error) {
	if c.lambdaClient != nil {
		return c.lambdaClient, nil
	}
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}
	c.lambdaClient = lambdasvc.NewFromConfig(cfg)
	return c.lambdaClient, nil
}

// invokeLambda gọi trực tiếp một Lambda function thay vì qua HTTP
// Chỉ dùng khi isAWSEnvironment() == true
func (c *InternalClient) invokeLambda(ctx context.Context, functionName string, apiReq events.APIGatewayProxyRequest) ([]byte, int, error) {
	client, err := c.getLambdaClient(ctx)
	if err != nil {
		return nil, 0, err
	}

	payload, err := json.Marshal(apiReq)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to marshal Lambda payload: %w", err)
	}

	result, err := client.Invoke(ctx, &lambdasvc.InvokeInput{
		FunctionName: &functionName,
		Payload:      payload,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("Lambda Invoke failed for %s: %w", functionName, err)
	}

	var apiResp events.APIGatewayProxyResponse
	if err := json.Unmarshal(result.Payload, &apiResp); err != nil {
		return nil, 0, fmt.Errorf("failed to parse Lambda response from %s: %w", functionName, err)
	}

	return []byte(apiResp.Body), apiResp.StatusCode, nil
}

// ============================================================
// PUBLIC METHODS - GET / POST
// ============================================================

// Get thực hiện GET request đến service nội bộ.
// Trên AWS: gọi Lambda trực tiếp qua SDK Invoke.
// Tại Local: HTTP với JWT propagation và retry.
func (c *InternalClient) Get(ctx context.Context, baseURL string, queryParams map[string]string) ([]byte, int, error) {
	// Parse path from URL (dùng cho cả hai chế độ)
	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, 0, fmt.Errorf("invalid URL %s: %w", baseURL, err)
	}

	// --- AWS: Lambda Invoke trực tiếp ---
	if isAWSEnvironment() {
		if fnName, ok := pathToLambdaFunction(u.Path); ok {
			qsp := make(map[string]string)
			for k, v := range queryParams {
				qsp[k] = v
			}
			apiReq := events.APIGatewayProxyRequest{
				HTTPMethod:            "GET",
				Path:                  u.Path,
				QueryStringParameters: qsp,
				Headers:               c.buildInternalHeaders(ctx),
			}
			return c.invokeLambda(ctx, fnName, apiReq)
		}
		c.logger.Warn("No Lambda mapping for path %s, falling back to HTTP", u.Path)
	}

	// --- Local: HTTP như cũ ---
	if len(queryParams) > 0 {
		q := u.Query()
		for key, value := range queryParams {
			q.Set(key, value)
		}
		u.RawQuery = q.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create GET request: %w", err)
	}

	c.injectHeaders(ctx, req)

	return c.doWithRetry(ctx, req)
}

// Post thực hiện POST request đến service nội bộ.
// Trên AWS: gọi Lambda trực tiếp qua SDK Invoke.
// Tại Local: HTTP với JWT propagation và retry.
func (c *InternalClient) Post(ctx context.Context, targetURL string, body interface{}) ([]byte, int, error) {
	u, err := url.Parse(targetURL)
	if err != nil {
		return nil, 0, fmt.Errorf("invalid URL %s: %w", targetURL, err)
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to marshal request body: %w", err)
	}

	// --- AWS: Lambda Invoke trực tiếp ---
	if isAWSEnvironment() {
		if fnName, ok := pathToLambdaFunction(u.Path); ok {
			apiReq := events.APIGatewayProxyRequest{
				HTTPMethod: "POST",
				Path:       u.Path,
				Headers:    c.buildInternalHeaders(ctx),
				Body:       string(jsonBody),
			}
			return c.invokeLambda(ctx, fnName, apiReq)
		}
		c.logger.Warn("No Lambda mapping for path %s, falling back to HTTP", u.Path)
	}

	// --- Local: HTTP như cũ ---
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create POST request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	c.injectHeaders(ctx, req)

	return c.doWithRetry(ctx, req)
}

// GetJSON thực hiện GET request và tự động decode JSON response vào target struct
func (c *InternalClient) GetJSON(ctx context.Context, baseURL string, queryParams map[string]string, target interface{}) (int, error) {
	body, statusCode, err := c.Get(ctx, baseURL, queryParams)
	if err != nil {
		return statusCode, err
	}

	if err := json.Unmarshal(body, target); err != nil {
		return statusCode, fmt.Errorf("failed to decode response from %s: %w", baseURL, err)
	}

	return statusCode, nil
}

// PostJSON thực hiện POST request và tự động decode JSON response vào target struct
func (c *InternalClient) PostJSON(ctx context.Context, url string, requestBody interface{}, target interface{}) (int, error) {
	body, statusCode, err := c.Post(ctx, url, requestBody)
	if err != nil {
		return statusCode, err
	}

	if err := json.Unmarshal(body, target); err != nil {
		return statusCode, fmt.Errorf("failed to decode response from %s: %w", url, err)
	}

	return statusCode, nil
}

// ============================================================
// PRIVATE METHODS
// ============================================================

// buildInternalHeaders trả về map header cho Lambda Invoke (chế độ AWS)
// Truyền đầy đủ: JWT, UserID, Role, RequestID, X-Ray TraceID để SA có thể trace
func (c *InternalClient) buildInternalHeaders(ctx context.Context) map[string]string {
	h := map[string]string{
		"Content-Type": "application/json",
	}
	if token := GetInternalAuthToken(); token != "" {
		h["X-Internal-Token"] = token
	}
	if token, ok := ctx.Value(ContextKeyJWTToken).(string); ok && token != "" {
		h["Authorization"] = "Bearer " + token
	}
	if userID, ok := ctx.Value(ContextKeyUserID).(string); ok && userID != "" {
		h["X-User-Id"] = userID
	}
	if role, ok := ctx.Value(ContextKeyUserRole).(string); ok && role != "" {
		h["X-User-Role"] = role
	}
	// Propagate RequestID: enables end-to-end request tracing across Lambda hops
	if requestID, ok := ctx.Value(ContextKeyRequestID).(string); ok && requestID != "" {
		h["X-Request-Id"] = requestID
	}
	// Propagate X-Ray Trace ID: stitches service map in AWS X-Ray console
	if traceID, ok := ctx.Value(ContextKeyTraceID).(string); ok && traceID != "" {
		h["X-Amzn-Trace-Id"] = traceID
	}
	return h
}

// injectHeaders gắn JWT Token và header nhận dạng user vào request
// JWT Propagation: Lấy token từ context hiện tại → gắn vào Authorization header
func (c *InternalClient) injectHeaders(ctx context.Context, req *http.Request) {
	// Propagate JWT Token
	if token, ok := ctx.Value(ContextKeyJWTToken).(string); ok && token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	// Propagate User ID
	if userID, ok := ctx.Value(ContextKeyUserID).(string); ok && userID != "" {
		req.Header.Set("X-User-Id", userID)
	}

	// Propagate User Role
	if role, ok := ctx.Value(ContextKeyUserRole).(string); ok && role != "" {
		req.Header.Set("X-User-Role", role)
	}

	// Propagate RequestID: enables end-to-end request tracing across Lambda hops
	if requestID, ok := ctx.Value(ContextKeyRequestID).(string); ok && requestID != "" {
		req.Header.Set("X-Request-Id", requestID)
	}

	// Propagate X-Ray Trace ID: stitches service map in AWS X-Ray console
	if traceID, ok := ctx.Value(ContextKeyTraceID).(string); ok && traceID != "" {
		req.Header.Set("X-Amzn-Trace-Id", traceID)
	}

	if token := GetInternalAuthToken(); token != "" {
		req.Header.Set("X-Internal-Token", token)
	}
}

// doWithRetry thực hiện HTTP request với retry logic
// Retry tối đa maxRetries lần khi gặp lỗi kết nối (Cold Start)
// Sử dụng exponential backoff: 500ms → 1s → 2s
func (c *InternalClient) doWithRetry(ctx context.Context, req *http.Request) ([]byte, int, error) {
	var lastErr error

	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			// Exponential backoff: 500ms, 1s, 2s
			delay := retryBaseDelay * time.Duration(1<<(attempt-1))
			c.logger.Info("Retry attempt %d/%d after %v for %s %s",
				attempt, c.maxRetries, delay, req.Method, req.URL.String())

			select {
			case <-ctx.Done():
				return nil, 0, fmt.Errorf("context cancelled during retry: %w", ctx.Err())
			case <-time.After(delay):
			}

			// Cần reset body cho POST request khi retry
			if req.Body != nil && req.GetBody != nil {
				body, err := req.GetBody()
				if err != nil {
					return nil, 0, fmt.Errorf("failed to reset request body for retry: %w", err)
				}
				req.Body = body
			}
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("request failed (attempt %d/%d): %w", attempt+1, c.maxRetries+1, err)
			c.logger.Warn("HTTP request error: %v", err)
			continue // retry on connection errors (cold start)
		}

		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			lastErr = fmt.Errorf("failed to read response body: %w", err)
			continue
		}

		// 5xx → server error, có thể retry (cold start)
		if resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("server error %d from %s %s: %s",
				resp.StatusCode, req.Method, req.URL.String(), string(body))
			c.logger.Warn("Server error %d, will retry: %s", resp.StatusCode, req.URL.String())
			continue
		}

		// 2xx, 3xx, 4xx → trả về ngay, không retry
		return body, resp.StatusCode, nil
	}

	return nil, 0, fmt.Errorf("all %d retries exhausted: %w", c.maxRetries+1, lastErr)
}

// ============================================================
// CONTEXT HELPERS - Dùng để inject thông tin vào context
// ============================================================

// WithJWTToken thêm JWT token vào context để propagate cho internal calls
func WithJWTToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, ContextKeyJWTToken, token)
}

// WithUserID thêm User ID vào context
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, ContextKeyUserID, userID)
}

// WithUserRole thêm User Role vào context
func WithUserRole(ctx context.Context, role string) context.Context {
	return context.WithValue(ctx, ContextKeyUserRole, role)
}

// WithRequestID adds a Request ID to the context for distributed tracing.
func WithRequestID(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, ContextKeyRequestID, requestID)
}

// WithTraceID adds an X-Ray Trace ID to the context for service map stitching.
func WithTraceID(ctx context.Context, traceID string) context.Context {
	return context.WithValue(ctx, ContextKeyTraceID, traceID)
}

// WithRequestHeaders tiện ích: inject tất cả header nhận dạng từ API Gateway request vào context.
// Trích xuất JWT, UserID, Role, RequestID, X-Ray Trace ID để propagate qua internal calls.
func WithRequestHeaders(ctx context.Context, headers map[string]string) context.Context {
	if token := headers["Authorization"]; token != "" {
		// Loại bỏ prefix "Bearer " nếu có
		if len(token) > 7 && token[:7] == "Bearer " {
			token = token[7:]
		}
		ctx = WithJWTToken(ctx, token)
	}
	if userID := headers["X-User-Id"]; userID != "" {
		ctx = WithUserID(ctx, userID)
	}
	if role := headers["X-User-Role"]; role != "" {
		ctx = WithUserRole(ctx, role)
	}
	// Propagate RequestID across Lambda hops for end-to-end log correlation
	if reqID := headers["X-Request-Id"]; reqID != "" {
		ctx = WithRequestID(ctx, reqID)
	}
	// Propagate X-Ray Trace ID so the X-Ray service map stays connected
	if traceID := headers["X-Amzn-Trace-Id"]; traceID != "" {
		ctx = WithTraceID(ctx, traceID)
	}
	return ctx
}
