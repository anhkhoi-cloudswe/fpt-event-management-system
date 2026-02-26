package logger

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Level represents log level
type Level int

const (
	DEBUG Level = iota
	INFO
	WARN
	ERROR
	FATAL
)

var levelNames = map[Level]string{
	DEBUG: "DEBUG",
	INFO:  "INFO",
	WARN:  "WARN",
	ERROR: "ERROR",
	FATAL: "FATAL",
}

var levelColors = map[Level]string{
	DEBUG: "\033[36m", // Cyan
	INFO:  "\033[32m", // Green
	WARN:  "\033[33m", // Yellow
	ERROR: "\033[31m", // Red
	FATAL: "\033[35m", // Magenta
}

const colorReset = "\033[0m"

// Config holds logger configuration
type Config struct {
	Level       Level
	Output      io.Writer
	JSONFormat  bool
	EnableColor bool
	ShowCaller  bool
	TimeFormat  string
	ServiceName string
}

// DefaultConfig returns default logger configuration
func DefaultConfig() *Config {
	level := INFO
	if lvl := os.Getenv("LOG_LEVEL"); lvl != "" {
		level = parseLevel(lvl)
	}

	return &Config{
		Level:       level,
		Output:      os.Stdout,
		JSONFormat:  os.Getenv("LOG_FORMAT") == "json",
		EnableColor: os.Getenv("LOG_COLOR") != "false",
		ShowCaller:  true,
		TimeFormat:  "2006-01-02T15:04:05.000Z07:00",
		ServiceName: os.Getenv("SERVICE_NAME"),
	}
}

// Logger represents a structured logger
type Logger struct {
	config *Config
	fields map[string]interface{}
	mu     sync.RWMutex
}

// LogEntry represents a structured log entry
type LogEntry struct {
	Timestamp  string                 `json:"timestamp"`
	Level      string                 `json:"level"`
	Message    string                 `json:"message"`
	Service    string                 `json:"service,omitempty"`
	Caller     string                 `json:"caller,omitempty"`
	Fields     map[string]interface{} `json:"fields,omitempty"`
	Error      string                 `json:"error,omitempty"`
	StackTrace string                 `json:"stack_trace,omitempty"`
	RequestID  string                 `json:"request_id,omitempty"`
	UserID     string                 `json:"user_id,omitempty"`
	TraceID    string                 `json:"trace_id,omitempty"`
	Duration   string                 `json:"duration,omitempty"`
}

var (
	defaultLogger *Logger
	once          sync.Once
)

// New creates a new logger with given config
func New(config *Config) *Logger {
	if config == nil {
		config = DefaultConfig()
	}
	return &Logger{
		config: config,
		fields: make(map[string]interface{}),
	}
}

// Default returns the default logger singleton
func Default() *Logger {
	once.Do(func() {
		defaultLogger = New(nil)
	})
	return defaultLogger
}

// With creates a child logger with additional fields
func (l *Logger) With(key string, value interface{}) *Logger {
	newLogger := &Logger{
		config: l.config,
		fields: make(map[string]interface{}),
	}
	l.mu.RLock()
	for k, v := range l.fields {
		newLogger.fields[k] = v
	}
	l.mu.RUnlock()
	newLogger.fields[key] = value
	return newLogger
}

// WithFields creates a child logger with multiple additional fields
func (l *Logger) WithFields(fields map[string]interface{}) *Logger {
	newLogger := &Logger{
		config: l.config,
		fields: make(map[string]interface{}),
	}
	l.mu.RLock()
	for k, v := range l.fields {
		newLogger.fields[k] = v
	}
	l.mu.RUnlock()
	for k, v := range fields {
		newLogger.fields[k] = v
	}
	return newLogger
}

// WithError adds error field to logger
func (l *Logger) WithError(err error) *Logger {
	return l.With("error", err.Error())
}

// WithContext extracts fields from context
func (l *Logger) WithContext(ctx context.Context) *Logger {
	newLogger := l.With("", nil) // Clone
	delete(newLogger.fields, "")

	// Extract common context values
	if requestID, ok := ctx.Value("requestID").(string); ok && requestID != "" {
		newLogger.fields["request_id"] = requestID
	}
	if userID, ok := ctx.Value("userID").(int); ok && userID > 0 {
		newLogger.fields["user_id"] = userID
	}
	if traceID, ok := ctx.Value("traceID").(string); ok && traceID != "" {
		newLogger.fields["trace_id"] = traceID
	}

	return newLogger
}

// Log methods

func (l *Logger) Debug(msg string, args ...interface{}) {
	l.log(DEBUG, msg, args...)
}

func (l *Logger) Info(msg string, args ...interface{}) {
	l.log(INFO, msg, args...)
}

func (l *Logger) Warn(msg string, args ...interface{}) {
	l.log(WARN, msg, args...)
}

func (l *Logger) Error(msg string, args ...interface{}) {
	l.log(ERROR, msg, args...)
}

func (l *Logger) Fatal(msg string, args ...interface{}) {
	l.log(FATAL, msg, args...)
	os.Exit(1)
}

func (l *Logger) log(level Level, msg string, args ...interface{}) {
	if level < l.config.Level {
		return
	}

	// Format message if args provided
	if len(args) > 0 {
		msg = fmt.Sprintf(msg, args...)
	}

	entry := LogEntry{
		Timestamp: time.Now().Format(l.config.TimeFormat),
		Level:     levelNames[level],
		Message:   msg,
		Service:   l.config.ServiceName,
	}

	// Add caller info
	if l.config.ShowCaller {
		if _, file, line, ok := runtime.Caller(2); ok {
			entry.Caller = fmt.Sprintf("%s:%d", shortenPath(file), line)
		}
	}

	// Add fields
	l.mu.RLock()
	if len(l.fields) > 0 {
		entry.Fields = make(map[string]interface{})
		for k, v := range l.fields {
			entry.Fields[k] = v
		}
	}
	l.mu.RUnlock()

	// Output
	if l.config.JSONFormat {
		l.outputJSON(entry)
	} else {
		l.outputText(level, entry)
	}
}

func (l *Logger) outputJSON(entry LogEntry) {
	data, _ := json.Marshal(entry)
	fmt.Fprintln(l.config.Output, string(data))
}

func (l *Logger) outputText(level Level, entry LogEntry) {
	var sb strings.Builder

	// Color
	if l.config.EnableColor {
		sb.WriteString(levelColors[level])
	}

	// Timestamp
	sb.WriteString(entry.Timestamp)
	sb.WriteString(" ")

	// Level
	sb.WriteString(fmt.Sprintf("[%-5s]", entry.Level))
	sb.WriteString(" ")

	// Reset color after level
	if l.config.EnableColor {
		sb.WriteString(colorReset)
	}

	// Caller
	if entry.Caller != "" {
		sb.WriteString(fmt.Sprintf("[%s] ", entry.Caller))
	}

	// Message
	sb.WriteString(entry.Message)

	// Fields
	if len(entry.Fields) > 0 {
		sb.WriteString(" | ")
		first := true
		for k, v := range entry.Fields {
			if !first {
				sb.WriteString(", ")
			}
			sb.WriteString(fmt.Sprintf("%s=%v", k, v))
			first = false
		}
	}

	fmt.Fprintln(l.config.Output, sb.String())
}

// ============================================================
// Request Logger - HTTP request/response logging
// ============================================================

// RequestLog represents an HTTP request log
type RequestLog struct {
	Method       string        `json:"method"`
	Path         string        `json:"path"`
	Status       int           `json:"status"`
	Duration     time.Duration `json:"duration_ms"`
	ClientIP     string        `json:"client_ip"`
	UserAgent    string        `json:"user_agent,omitempty"`
	RequestID    string        `json:"request_id,omitempty"`
	UserID       int           `json:"user_id,omitempty"`
	RequestSize  int64         `json:"request_size,omitempty"`
	ResponseSize int64         `json:"response_size,omitempty"`
	Error        string        `json:"error,omitempty"`
}

// LogRequest logs an HTTP request
func (l *Logger) LogRequest(req RequestLog) {
	level := INFO
	if req.Status >= 500 {
		level = ERROR
	} else if req.Status >= 400 {
		level = WARN
	}

	msg := fmt.Sprintf("%s %s -> %d (%s)",
		req.Method, req.Path, req.Status, req.Duration)

	l.WithFields(map[string]interface{}{
		"method":        req.Method,
		"path":          req.Path,
		"status":        req.Status,
		"duration_ms":   req.Duration.Milliseconds(),
		"client_ip":     req.ClientIP,
		"user_agent":    req.UserAgent,
		"request_id":    req.RequestID,
		"request_size":  req.RequestSize,
		"response_size": req.ResponseSize,
	}).log(level, msg)
}

// ============================================================
// Database Logger - SQL query logging
// ============================================================

// QueryLog represents a database query log
type QueryLog struct {
	Query    string        `json:"query"`
	Args     []interface{} `json:"args,omitempty"`
	Duration time.Duration `json:"duration_ms"`
	Rows     int64         `json:"rows,omitempty"`
	Error    string        `json:"error,omitempty"`
}

// LogQuery logs a database query
func (l *Logger) LogQuery(query QueryLog) {
	level := DEBUG
	if query.Error != "" {
		level = ERROR
	} else if query.Duration > 1*time.Second {
		level = WARN
	}

	msg := fmt.Sprintf("SQL (%s): %s", query.Duration, truncate(query.Query, 200))

	fields := map[string]interface{}{
		"query":       truncate(query.Query, 500),
		"duration_ms": query.Duration.Milliseconds(),
	}
	if query.Rows > 0 {
		fields["rows"] = query.Rows
	}
	if query.Error != "" {
		fields["error"] = query.Error
	}

	l.WithFields(fields).log(level, msg)
}

// ============================================================
// Business Event Logger
// ============================================================

// EventLog represents a business event log
type EventLog struct {
	Event    string                 `json:"event"`
	UserID   int                    `json:"user_id,omitempty"`
	EntityID int                    `json:"entity_id,omitempty"`
	Entity   string                 `json:"entity,omitempty"`
	Action   string                 `json:"action"`
	Success  bool                   `json:"success"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
	Error    string                 `json:"error,omitempty"`
}

// LogEvent logs a business event
func (l *Logger) LogEvent(evt EventLog) {
	level := INFO
	if !evt.Success {
		level = ERROR
	}

	msg := fmt.Sprintf("[%s] %s %s (ID: %d)", evt.Event, evt.Action, evt.Entity, evt.EntityID)

	fields := map[string]interface{}{
		"event":     evt.Event,
		"action":    evt.Action,
		"entity":    evt.Entity,
		"entity_id": evt.EntityID,
		"success":   evt.Success,
	}
	if evt.UserID > 0 {
		fields["user_id"] = evt.UserID
	}
	for k, v := range evt.Metadata {
		fields[k] = v
	}
	if evt.Error != "" {
		fields["error"] = evt.Error
	}

	l.WithFields(fields).log(level, msg)
}

// ============================================================
// Helper functions
// ============================================================

func parseLevel(s string) Level {
	switch strings.ToUpper(s) {
	case "DEBUG":
		return DEBUG
	case "INFO":
		return INFO
	case "WARN", "WARNING":
		return WARN
	case "ERROR":
		return ERROR
	case "FATAL":
		return FATAL
	default:
		return INFO
	}
}

func shortenPath(path string) string {
	parts := strings.Split(path, "/")
	if len(parts) > 2 {
		return strings.Join(parts[len(parts)-2:], "/")
	}
	return path
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

// ============================================================
// Package-level convenience functions
// ============================================================

func Debug(msg string, args ...interface{}) { Default().Debug(msg, args...) }
func Info(msg string, args ...interface{})  { Default().Info(msg, args...) }
func Warn(msg string, args ...interface{})  { Default().Warn(msg, args...) }
func Error(msg string, args ...interface{}) { Default().Error(msg, args...) }
func Fatal(msg string, args ...interface{}) { Default().Fatal(msg, args...) }

func With(key string, value interface{}) *Logger       { return Default().With(key, value) }
func WithFields(fields map[string]interface{}) *Logger { return Default().WithFields(fields) }
func WithError(err error) *Logger                      { return Default().WithError(err) }
func WithContext(ctx context.Context) *Logger          { return Default().WithContext(ctx) }
