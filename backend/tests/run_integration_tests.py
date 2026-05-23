import subprocess
import time
import os
import sys

services = [
    ("auth-service", "./services/auth-service"),
    ("event-service", "./services/event-service"),
    ("ticket-service", "./services/ticket-service"),
    ("venue-service", "./services/venue-service"),
    ("staff-service", "./services/staff-service"),
    ("notification-service", "./services/notification-service"),
    ("gateway", "./cmd/gateway"),
]

backend_dir = r"c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\backend"
logs_dir = os.path.join(backend_dir, "tests", "logs")
os.makedirs(logs_dir, exist_ok=True)

processes = []
log_files = []

def load_env_file(filepath):
    if not os.path.exists(filepath):
        print(f"Warning: .env file not found at {filepath}")
        return
    print(f"Loading environment from {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, val = line.split('=', 1)
                key = key.strip()
                val = val.strip()
                # Remove quotes if present
                if val.startswith('"') and val.endswith('"'):
                    val = val[1:-1]
                elif val.startswith("'") and val.endswith("'"):
                    val = val[1:-1]
                os.environ[key] = val

def main():
    # Load .env file from root directory
    env_path = os.path.join(backend_dir, "..", ".env")
    load_env_file(env_path)

    # Force IPv4 loopback 127.0.0.1 for local service-to-service calls
    os.environ["BASE_URL"] = "http://127.0.0.1:8080"
    os.environ["AUTH_SERVICE_URL"] = "http://127.0.0.1:8081"
    os.environ["EVENT_SERVICE_URL"] = "http://127.0.0.1:8082"
    os.environ["TICKET_SERVICE_URL"] = "http://127.0.0.1:8083"
    os.environ["VENUE_SERVICE_URL"] = "http://127.0.0.1:8084"
    os.environ["STAFF_SERVICE_URL"] = "http://127.0.0.1:8085"
    os.environ["NOTIFICATION_SERVICE_URL"] = "http://127.0.0.1:8086"
    
    # Build all services
    print("--- [1/4] Building Go Microservices ---")
    for name, path in services:
        print(f"Building {name}...")
        try:
            subprocess.run(["go", "build", "-o", f"{name}.exe", path], check=True, cwd=backend_dir)
        except subprocess.CalledProcessError as e:
            print(f"FAILED to build {name}: {e}")
            sys.exit(1)
            
    print("All services built successfully.\n")

    # Start all services
    print("--- [2/4] Starting Microservices ---")
    for name, _ in services:
        binary_path = os.path.join(backend_dir, f"{name}.exe")
        log_path = os.path.join(logs_dir, f"{name}.log")
        print(f"Starting {name} (logging to tests/logs/{name}.log)...")
        try:
            log_file = open(log_path, "w", encoding="utf-8")
            log_files.append(log_file)
            
            p = subprocess.Popen(
                [binary_path], 
                cwd=backend_dir, 
                stdout=log_file, 
                stderr=log_file,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )
            processes.append(p)
        except Exception as e:
            print(f"FAILED to start {name}: {e}")
            cleanup()
            sys.exit(1)
            
    print("Waiting 12 seconds for services to initialize...")
    time.sleep(12)
    print("Microservices running.\n")

    # Run integration test
    print("--- [3/4] Running Integration Tests ---")
    test_script = os.path.join(backend_dir, "tests", "integration_test.py")
    test_failed = False
    try:
        subprocess.run(["python", test_script], check=True)
        print("SUCCESS: Integration tests passed!")
    except subprocess.CalledProcessError as e:
        print(f"FAILED: Integration tests failed: {e}")
        test_failed = True
    except Exception as e:
        print(f"FAILED: Error running integration tests: {e}")
        test_failed = True

    # Cleanup
    cleanup()
    
    if test_failed:
        sys.exit(1)
    else:
        sys.exit(0)

def cleanup():
    print("\n--- [4/4] Cleaning Up ---")
    # Terminate processes
    for p in processes:
        try:
            p.terminate()
            p.wait(timeout=2)
            print(f"Process {p.pid} terminated.")
        except Exception:
            try:
                p.kill()
                print(f"Process {p.pid} killed.")
            except Exception:
                pass
                
    # Close log files
    for f in log_files:
        try:
            f.close()
        except Exception:
            pass
            
    # Clean up binaries
    for name, _ in services:
        binary_path = os.path.join(backend_dir, f"{name}.exe")
        if os.path.exists(binary_path):
            try:
                os.remove(binary_path)
                print(f"Removed binary: {name}.exe")
            except Exception as e:
                print(f"Failed to remove {name}.exe: {e}")
                
    print("Cleanup complete.")

if __name__ == "__main__":
    main()
