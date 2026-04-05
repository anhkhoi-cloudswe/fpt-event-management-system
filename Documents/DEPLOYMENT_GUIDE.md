# Hướng dẫn Cài đặt & Triển khai Hạ tầng (FPT Event Management)

Tài liệu này hướng dẫn các bước từ chuẩn bị môi trường, triển khai hạ tầng AWS bằng Terraform, khởi tạo Database, và cuối cùng là deploy các Microservices.

---

## Phần 1: Cài đặt công cụ (Prerequisites)

Để thao tác với dự án, máy tính của bạn cần cài đặt 2 công cụ bắt buộc:

### 1. Cài đặt AWS CLI
Dùng để xác thực và tương tác với tài khoản AWS.
- **Windows:** Tải và chạy [AWS CLI MSI installer](https://awscli.amazonaws.com/AWSCLIV2.msi)
- **macOS:** Chạy lệnh `brew install awscli`
- **Linux:**
  ```bash
  curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
  unzip awscliv2.zip
  sudo ./aws/install
  ```

### 2. Cài đặt Terraform
Dùng để chạy các mã nguồn Infrastructure as Code (IaC) tạo tài nguyên AWS.
- **Windows:** Tải file zip từ trang chủ Terraform, giải nén và thêm thư mục chứa file `.exe` vào biến môi trường `PATH`.
- **macOS:** Chạy lệnh `brew tap hashicorp/tap && brew install hashicorp/tap/terraform`
- **Linux (Ubuntu/Debian):**
  ```bash
  wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
  sudo apt update && sudo apt install terraform
  ```

---

## Phần 2: Quy trình Deploy Hạ tầng & Khởi tạo

### Bước 1: Đăng nhập AWS (AWS Login)
Mở terminal và chạy lệnh cấu hình AWS CLI. Bạn sẽ cần nhập `AWS Access Key ID`, `AWS Secret Access Key`, và vùng (ví dụ: `ap-southeast-1`):
```bash
aws configure
```

### Bước 2: Triển khai Hạ tầng với Terraform
Di chuyển vào thư mục chứa code hạ tầng (ví dụ `infrastructure`) và thực thi Terraform:
```bash
cd infrastructure

# 1. Khởi tạo project, tải các providers cần thiết
terraform init

# 2. Xem và áp dụng các thay đổi lên AWS
terraform apply
```
*(Gõ `yes` khi được hỏi để xác nhận tạo tài nguyên).*

### Bước 3: Forward Port mở liên kết tới Database (RDS)
Database RDS của hệ thống nằm trong Private Subnet, do đó không thể truy cập trực tiếp từ máy cá nhân. Cần tạo một đường hầm (SSH Tunnel) thông qua Bastion Host bằng lệnh dưới đây:
```bash
# Lưu ý: Lệnh này yêu cầu file key fpt-bastion-ssh phải có sẵn và thiết lập quyền đúng (chmod 400)
ssh -i fpt-bastion-ssh -L 3306:$(terraform output -raw rds_hostname):3306 ec2-user@$(terraform output -raw bastion_public_ip) -N
```
*Lệnh này sẽ treo Terminal tại đó và liên tục mở Port `3306` ở máy tính (localhost) của bạn, trỏ thẳng tới con RDS trên AWS.*

### Bước 4: Chạy file SQL khởi tạo Database
1. Giữ nguyên cái Terminal chạy Port Forwarding ở Bước 3. Mở một Terminal khác hoặc dùng các phần mềm quản lý DB như DBeaver, MySQL Workbench, DataGrip...
2. Kết nối tới Database:
   - **Host:** `127.0.0.1` (hoặc `localhost`)
   - **Port:** `3306`
   - **User: admin / Password:FptEvent2024** Lấy thông tin đã cấu hình trong cấu hình local.
3. Sau khi kết nối thành công, hãy mở các thư mục `Database` của dự án, mở file SQL bên trong và chạy trực tiếp để tạo Database Table.

### Bước 5: Deploy Containers (Microservices)
Cuối cùng, đẩy Code và cập nhật các ECS Containers thông qua Scripts Build Deployment đã được chuẩn bị sẵn trong thư mục `scripts`.
```bash
# Mở terminal ở ngoài gốc của Repo Source Code
# Di chuyển vào thư mục scripts
cd scripts/

# Chạy shell script để build image, push lên ECR và force deployment cho ECS
./deloy-ecr.sh
```
*(Lưu ý: Bạn có thể cần chạy lệnh `chmod +x deloy-ecr.sh` lần đầu tiên để cấp quyền cho phép chạy shell script này).*
