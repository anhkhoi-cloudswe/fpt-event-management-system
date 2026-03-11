// Package xray provides AWS X-Ray integration helpers for Lambda services.
// It wraps handler invocations with named segments so that the AWS X-Ray
// console can automatically build the service map between Lambdas.
//
// Usage in each Lambda main.go init():
//
//	tracer.Configure("auth-service")
//
// Usage to add a custom sub-segment inside any function:
//
//	ctx, seg := tracer.BeginSubsegment(ctx, "CheckLogin")
//	defer seg.Close(nil)
package xray

import (
	"context"
	"os"

	"github.com/aws/aws-xray-sdk-go/xray"
)

// Configure sets up the X-Ray SDK for the given service.
// When running locally (no AWS_LAMBDA_FUNCTION_NAME env var), tracing
// is configured in a no-op mode so the app never blocks on a missing daemon.
func Configure(serviceName string) {
	daemonAddr := os.Getenv("AWS_XRAY_DAEMON_ADDRESS")
	if daemonAddr == "" {
		daemonAddr = "127.0.0.1:2000"
	}

	cfg := xray.Config{
		DaemonAddr:     daemonAddr,
		ServiceVersion: "1.0.0",
	}

	// Log level quiet by default — structured logger handles app-level logs
	if os.Getenv("XRAY_LOG_LEVEL") != "" {
		cfg.LogLevel = os.Getenv("XRAY_LOG_LEVEL")
	} else {
		cfg.LogLevel = "warn"
	}

	_ = xray.Configure(cfg)
}

// BeginSubsegment creates a child X-Ray sub-segment for granular tracing.
// Always call seg.Close(err) with defer to ensure the segment is flushed.
//
//	ctx, seg := tracer.BeginSubsegment(ctx, "db-query")
//	defer seg.Close(err)
func BeginSubsegment(ctx context.Context, name string) (context.Context, *xray.Segment) {
	return xray.BeginSubsegment(ctx, name)
}

// TraceID extracts the current X-Ray Trace ID string from the context.
// Returns empty string when tracing is not active (e.g., local development).
// Use this value as "X-Amzn-Trace-Id" header when invoking other services
// so that the X-Ray console can stitch cross-Lambda call graphs together.
func TraceID(ctx context.Context) string {
	if seg := xray.GetSegment(ctx); seg != nil {
		return seg.TraceID
	}
	return ""
}

// AddAnnotation adds a key/value annotation to the current X-Ray segment.
// Annotations are indexed and can be used in X-Ray search/filter expressions.
func AddAnnotation(ctx context.Context, key string, value interface{}) {
	if seg := xray.GetSegment(ctx); seg != nil {
		_ = seg.AddAnnotation(key, value)
	}
}

// AddMetadata adds a key/value pair to the current segment's metadata.
// Metadata is not indexed but is visible in the X-Ray console trace details.
func AddMetadata(ctx context.Context, namespace, key string, value interface{}) {
	if seg := xray.GetSegment(ctx); seg != nil {
		_ = seg.AddMetadataToNamespace(namespace, key, value)
	}
}
