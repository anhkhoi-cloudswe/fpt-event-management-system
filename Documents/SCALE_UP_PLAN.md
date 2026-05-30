# Kế hoạch phát triển dài hạn (Scale Up) - FPT Event Management System

Tài liệu này đề xuất chi tiết 3 giai đoạn phát triển (Scale Up) của dự án **FPT Event Management System** trong tương lai. Kế hoạch được thiết kế bám sát theo kiến trúc microservices hiện tại (Go, React, AWS, QR check-in, luồng Wallet/VNPay) và nhu cầu tối ưu hóa vận hành nội bộ thực tế của nhà trường.

---

## 📊 Bảng tổng hợp lộ trình Scale Up (Dành cho Slide thuyết trình)

| **Phase 1: Market Validation** <br>*(Xác thực thị trường & Ổn định)* | **Phase 2: B2B Scale & Process Automation** <br>*(Mở rộng B2B & Tự động hóa)* | **Phase 3: Data Intelligence & Ecosystem** <br>*(Trí tuệ dữ liệu & Hệ sinh thái)* |
| :--- | :--- | :--- |
| **1. Beta Test diện rộng tại FPT**<br>Thử nghiệm thực tế với các sự kiện quy mô 500-1000 sinh viên để tối ưu hóa quy trình quét QR check-in và luồng thanh toán VNPay/ví nội bộ dưới tải thực tế. | **1. Cổng thông tin cho Nhà tài trợ (Sponsor Portal)**<br>Phát triển phân hệ B2B cho doanh nghiệp quản lý gian hàng, đo lường hiệu quả tiếp cận (ROI) sinh viên và phát hành voucher điện tử trên vé QR. | **1. Gợi ý sự kiện cá nhân hóa (AI Engine)**<br>Khai thác dữ liệu hành vi của sinh viên để tự động đề xuất sự kiện phù hợp qua Email/Notification và gợi ý chủ đề hot cho ban tổ chức. |
| **2. Kết nối thời gian thực & Đăng nhập nhanh**<br>Tích hợp đăng nhập SSO qua FPT Mail (SAML/Cognito) và dùng WebSockets cập nhật sơ đồ ghế ngồi theo thời gian thực để chống đặt trùng vé. | **2. Tự động hóa phê duyệt & Điều phối địa điểm**<br>Tối ưu hóa quy trình duyệt sự kiện tự động giữa ban giám hiệu và ban tổ chức. Tự động phát hiện xung đột lịch đặt sân bãi thông qua `venue-service`. | **2. Phân tích lưu lượng & Dự báo nhu cầu**<br>Áp dụng phân tích dữ liệu lớn để dự đoán tỷ lệ tham gia thực tế (show-up rate) và áp dụng chính sách giá vé linh hoạt (Dynamic Pricing). |
| **3. Chuẩn hóa Bảo mật & Hạ tầng AWS**<br>Khắc phục triệt để lỗ hổng từ báo cáo Pentest Phase 2, tối ưu hóa AWS WAF, thiết lập tự động xoay vòng khóa với AWS Secrets Manager. | **3. Đối soát Tài chính & Tự động hóa Hoàn tiền**<br>Xây dựng luồng tự động đối soát dòng tiền giữa Ví nội bộ, VNPay và ngân hàng. Tự động hóa việc duyệt và hoàn tiền vé dựa trên chính sách hủy vé cài đặt trước. | **3. Tích hợp Hệ sinh thái Đời sống Sinh viên**<br>Liên kết hệ thống điểm rèn luyện, điểm danh lớp học và tích lũy điểm thưởng (Loyalty Points) thành một ứng dụng tiện ích sinh viên toàn diện. |

---

## 🔍 Chi tiết nội dung từng cột phục vụ thuyết trình

### Cột 1: Phase 1 – Market Validation (Xác thực & Ổn định vận hành)
*Mục tiêu cốt lõi của giai đoạn này là đưa sản phẩm từ môi trường thử nghiệm sang vận hành thực tế tại các cơ sở campus để kiểm thử hiệu năng và độ ổn định.*

1. **Triển khai Beta Test thực tế tại FPT University:**
   * **Nội dung:** Chạy thử nghiệm thực tế với từ 3 đến 5 sự kiện quy mô vừa (500 - 1000 người tham gia) của các Câu lạc bộ.
   * **Giá trị:** Đo lường chính xác tốc độ xử lý của luồng QR check-in tại cổng soát vé, kiểm tra khả năng chịu tải của cơ chế khóa dòng (`SELECT FOR UPDATE`) khi hàng trăm sinh viên cùng thực hiện đặt vé và thanh toán qua VNPay cùng một thời điểm.

2. **Tối ưu trải nghiệm đặt vé thời gian thực và Đăng nhập nhanh:**
   * **Nội dung:** Nâng cấp cơ chế cập nhật trạng thái vé và sơ đồ ghế ngồi từ kéo-thả thủ công (polling) sang kết nối thời gian thực bằng WebSockets. Đồng thời tích hợp cơ chế đăng nhập một lần (SSO) bằng tài khoản FPT Student Mail qua AWS Cognito hoặc OAuth2.
   * **Giá trị:** Ngăn chặn tình trạng đặt trùng chỗ ngồi khi có lượng truy cập lớn và đơn giản hóa quy trình đăng ký tài khoản cho sinh viên.

3. **Củng cố an toàn thông tin theo tiêu chuẩn Pentest:**
   * **Nội dung:** Hoàn tất khắc phục các khuyến nghị bảo mật từ báo cáo Penetration Test Phase 2. Cấu hình tường lửa AWS WAF để chống tấn công từ chối dịch vụ (DDoS) và kích hoạt AWS Secrets Manager để quản lý bảo mật các khóa API/chữ ký số của VNPay.
   * **Giá trị:** Bảo vệ tuyệt đối thông tin giao dịch tài chính của sinh viên và nâng cao uy tín bảo mật cho hệ thống.

---

### Cột 2: Phase 2 – B2B Scale & Process Automation (Mở rộng B2B & Tự động hóa)
*Mục tiêu của giai đoạn này là biến hệ thống từ một công cụ quản lý nội bộ thành một nền tảng dịch vụ có khả năng liên kết với các doanh nghiệp bên ngoài và tự động hóa vận hành.*

1. **Phát triển phân hệ dành riêng cho Doanh nghiệp & Nhà tài trợ (Sponsor Portal):**
   * **Nội dung:** Xây dựng dashboard chuyên biệt cho doanh nghiệp liên kết với nhà trường. Doanh nghiệp có thể theo dõi số lượng sinh viên tiếp cận, đặt booth giới thiệu sản phẩm tại sự kiện, và đính kèm các voucher điện tử (e-coupon) trực tiếp vào mã QR trên vé của sinh viên.
   * **Giá trị:** Tạo ra nguồn thu thương mại bền vững cho nhà trường và ban tổ chức từ nguồn lực tài trợ của doanh nghiệp.

2. **Tự động hóa quy trình phê duyệt sự kiện và Quản lý tài nguyên:**
   * **Nội dung:** Xây dựng luồng công việc tự động (Workflow Automation) để điều phối yêu cầu phê duyệt từ ban tổ chức đến các phòng ban liên quan (Phòng Công tác sinh viên, Ban Giám hiệu). Hệ thống tự động đối chiếu lịch trống của hội trường/sân bãi từ `venue-service` để cảnh báo trùng lịch.
   * **Giá trị:** Giảm thiểu 80% thời gian xử lý thủ tục giấy tờ hành chính và tối ưu hiệu suất sử dụng cơ sở vật chất của nhà trường.

3. **Hệ thống Đối soát Tài chính & Tự động hóa Hoàn tiền (Hoặc Phân quyền Soát vé):**
   * **Nội dung:** Xây dựng module đối soát tự động cuối ngày (Reconciliation) giữa cơ sở dữ liệu hệ thống, lịch sử giao dịch ví nội bộ, cổng thanh toán VNPay và tài khoản ngân hàng của trường. Tự động hóa quy trình xử lý yêu cầu hoàn tiền (Refund Requests) dựa trên các bộ quy tắc thiết lập trước.
   * **Giá trị:** Tiết kiệm thời gian làm việc thủ công cho bộ phận kế toán nhà trường khi phải kiểm tra đối soát từng giao dịch, nâng cao trải nghiệm hoàn tiền vé nhanh chóng cho sinh viên.

---

### Cột 3: Phase 3 – Data Intelligence & Ecosystem (Trí tuệ dữ liệu & Hệ sinh thái số)
*Mục tiêu dài hạn là ứng dụng công nghệ phân tích dữ liệu lớn để tối ưu hóa quyết định và tích hợp sâu rộng hệ thống vào toàn bộ đời sống số của sinh viên.*

1. **Ứng dụng Trí tuệ nhân tạo (AI) trong gợi ý sự kiện cá nhân hóa:**
   * **Nội dung:** Xây dựng mô hình học máy (Machine Learning) phân tích lịch sử tham gia hoạt động, ngành học và mối quan tâm của sinh viên để tự động gửi thông báo đề xuất các sự kiện phù hợp nhất qua `notification-service`.
   * **Giá trị:** Tăng tỷ lệ đăng ký tham gia sự kiện và giúp ban tổ chức định hình chủ đề sự kiện đáp ứng đúng thị hiếu của sinh viên.

2. **Phân tích dữ liệu lớn và Dự báo nhu cầu người dùng:**
   * **Nội dung:** Tích hợp các công cụ phân tích dữ liệu lớn (như AWS Athena và QuickSight) để thống kê hành vi đặt vé, khung giờ cao điểm và tỷ lệ vắng mặt (show-up rate). Từ đó hỗ trợ thuật toán định giá vé linh hoạt (Dynamic Pricing) cho các đêm nhạc hoặc hội thảo lớn.
   * **Giá trị:** Giúp ban tổ chức tối ưu hóa doanh thu vé, quản lý rủi ro số lượng người tham gia vượt quá sức chứa và điều phối nhân sự vận hành hợp lý.

3. **Tạo dựng hệ sinh thái tiện ích sinh viên toàn diện:**
   * **Nội dung:** Liên kết hệ thống ví điện tử nội bộ với các tiện ích học đường khác như tích lũy điểm rèn luyện tự động khi quét QR check-in, đổi điểm thưởng lấy quà tặng từ nhà tài trợ (Loyalty Program), thanh toán phí gửi xe, hoặc mua sắm tại canteen trường.
   * **Giá trị:** Biến ứng dụng thành một phần không thể thiếu trong hoạt động sinh hoạt hàng ngày của mỗi sinh viên FPT.

---

## 🎙️ Kịch bản thuyết trình thuyết phục (Script dành cho Pitching)

### 📍 Giai đoạn 1 (Validation)
> *"Đầu tiên, chúng em đưa hệ thống vào chạy thử nghiệm tại các campus trường để xác thực độ khớp của sản phẩm với thị trường, đồng thời tối ưu hóa luồng thanh toán để tránh việc người dùng hủy bỏ giỏ hàng giữa chừng."*

### 📍 Giai đoạn 2 (B2B Scale)
> *"Khi hệ thống ổn định, chúng em mở rộng quy mô bằng cách tự động hóa thủ tục phê duyệt hành chính của các phòng ban. Đồng thời, chúng em tạo thêm nguồn thu thương mại từ việc cho phép các Doanh nghiệp/Nhà tài trợ mua quảng cáo hiển thị, hoặc đính kèm các mã giảm giá, voucher điện tử trực tiếp lên vé QR của sinh viên, đồng thời tích hợp hệ thống đối soát tài chính tự động hoàn toàn."*

### 📍 Giai đoạn 3 (Data Intelligence)
> *"Cuối cùng, chúng em ứng dụng dữ liệu lớn để dự đoán tỷ lệ tham gia thực tế, tự động linh hoạt giá vé theo nhu cầu thị trường để tối ưu doanh thu, và liên kết cổng check-in của app với hệ thống tích điểm thưởng, quà tặng để giữ chân người dùng trong hệ sinh thái."*

---

## 💸 Phân tích chi tiết Slide 06: Mô hình doanh thu (Revenue Model) - Tập trung Event Organizers

Dưới đây là cấu trúc nội dung chi tiết được tối ưu hóa cho **Slide 06 - Revenue** theo đúng sơ đồ phân bố dạng lưới mới trong bản thiết kế của bạn (Chỉ tập trung vào đối tượng **Event Organizers**). Nội dung này đã sửa lỗi copy-paste trùng lặp ở ô **Premium - Ticket Commission Fees** và điền đầy đủ các vị trí trống bằng tiếng Anh chuyên nghiệp.

---

### 📊 NỘI DUNG CHI TIẾT ĐỂ NHẬP VÀO SLIDE (TIẾNG ANH)

#### **1. FREE TIER (Event organizers)**

*   **Subscription Plans:**
    *   *Bullet 1:* **Standard Capacity:** Under 100 seats per event.
    *   *Bullet 2:* **Standard Features:** Includes default event registration forms and standard real-time web-based check-in tools.
*   **Ticket Commission Fees:**
    *   *Bullet 1:* **Pay-As-You-Grow:** 2.0% transaction fee per paid ticket sold.
    *   *Bullet 2:* **Academic Waiver:** 100% free hosting and zero commission on free internal campus events.
    *   *Bullet 3:* **Wallet Integration:** Access to local student digital wallet with default saga protection.

---

#### **2. PREMIUM (Event organizers)**

*   **Subscription Plans:**
    *   *Bullet 1:* **Improved Capacity:** Scalable to large-scale events (1,000+ seats).
    *   *Bullet 2:* **Custom Interactive Seating:** Full authority to custom SVG venue layouts (`venue-service`).
    *   *Bullet 3:* **AI Insights:** Real-time dashboards with attendance forecasting and demand forecasting.
*   **Ticket Commission Fees:** *(Sửa lỗi copy-paste trùng lặp của slide cũ)*
    *   *Bullet 1:* **Discounted Commission:** Transaction fee reduced to 1.0% per paid ticket (or flat platform fee).
    *   *Bullet 2:* **Automated Reconciliation:** Daily financial settlement & automated accounting statements.
    *   *Bullet 3:* **Flexible Payments:** Dual-channel integrations (Direct VNPay gateway & student wallets).

---

### 💡 GIẢI THÍCH CHI TIẾT NỘI DUNG TỪNG PHẦN (Dành cho việc trả lời câu hỏi phản biện)

1.  **Sự khác biệt về Phí hoa hồng (Ticket Commission Fees) giữa Free và Premium là gì?**
    *   *Giải thích:* 
        *   Ở **Free Tier**, ban tổ chức được sử dụng nền tảng miễn phí không cần trả gói tháng/năm, nhưng khi bán vé có phí thì hệ thống sẽ thu phí hoa hồng là **2.0%** trên mỗi vé bán được để bù đắp chi phí vận hành.
        *   Ở **Premium Tier**, khi ban tổ chức đã trả một khoản phí đăng ký hàng tháng (Subscription Plan), hệ thống sẽ ưu đãi giảm phí hoa hồng bán vé xuống chỉ còn **1.0%** (Discounted Commission). Đây là đòn bẩy kinh tế khuyến khích các ban tổ chức lớn nâng cấp lên gói Premium.
2.  **Tính năng "Automated Reconciliation" (Đối soát tự động) trong Premium hoạt động ra sao?**
    *   *Giải thích:* Đối với các sự kiện lớn Premium có lượng giao dịch khổng lồ, việc đối soát doanh thu thủ công là cực kỳ phức tạp. Tính năng Premium này tự động đối soát dòng tiền giữa VNPay, ví nội bộ và tài khoản ngân hàng của ban tổ chức vào cuối ngày, xuất báo cáo tài chính tự động giúp loại bỏ hoàn toàn các tác vụ kế toán thủ công.
3.  **Tại sao lại có "Academic Waiver" trong Free Tier?**
    *   *Giải thích:* Để nhanh chóng thu hút các CLB sinh viên trong trường FPT sử dụng hệ thống, toàn bộ các sự kiện phi lợi nhuận (học thuật, sinh hoạt CLB miễn phí) sẽ được miễn hoàn toàn mọi loại phí. Điều này giúp hệ thống đạt mục tiêu mở rộng độ phủ thương hiệu (Market Validation) ở Phase 1.

---

## 🚀 Kế hoạch khởi nghiệp & Thuyết trình phản biện (Pitching & Business Defense)

Phần này tổng hợp chi tiết các luận điểm cốt lõi phục vụ cho việc thuyết phục Hội đồng và Giảng viên hướng dẫn về tính khả thi, yếu tố đổi mới sáng tạo, và tiềm năng thương mại của dự án dưới dạng một mô hình khởi nghiệp thực tế.

### 2a. Ý tưởng & Yếu tố Đổi mới Sáng tạo (Innovation)

#### 1. Sản phẩm là gì?
**FPT Event Management System (FEMS)** là một nền tảng quản trị và vận hành sự kiện thông minh dạng **SaaS (Software-as-a-Service)**, tối ưu hóa quy trình khép kín từ khâu đề xuất, phê duyệt địa điểm/hội trường (Venue Management), bán vé (Ticketing), thanh toán (Wallet/VNPay) cho đến khâu check-in bằng QR code thời gian thực và báo cáo số liệu sau sự kiện định hướng tối ưu hóa nguồn lực học đường và kết nối doanh nghiệp.

#### 2. Yếu tố Đổi mới Sáng tạo (Innovation Elements)
*   **Giải quyết xung đột tài nguyên vật lý thời gian thực (Resource-Aware Automation):** Tích hợp sâu phân hệ `venue-service` quản lý sơ đồ ghế ngồi trực quan (tự tạo bằng SVG) và lập lịch địa điểm tự động. Hệ thống tự động phát hiện trùng lịch đặt sân bãi/hội trường và kích hoạt luồng phê duyệt hành chính đa cấp giữa Ban tổ chức, Staff và Ban giám hiệu.
*   **Kiến trúc xử lý giao dịch tài chính phân tán độ tin cậy cao (High-Reliability Transaction Flow):** Áp dụng mô hình **Saga Pattern** cho luồng thanh toán kép (`reserve -> confirm -> release` qua ví nội bộ và cổng VNPay) kết hợp cơ chế khóa dòng ở cấp cơ sở dữ liệu (`SELECT FOR UPDATE`). Thiết kế này đảm bảo tính toàn vẹn dữ liệu tài chính tuyệt đối, loại bỏ lỗi đặt trùng ghế (overbooking) ngay cả khi hàng nghìn sinh viên cùng truy cập đặt vé tại một thời điểm (đạt p95 API Latency < 500ms dưới tải thực tế).
*   **Mô hình kết nối 3 bên cùng có lợi (Win-Win-Win Ecosystem):** Biến chiếc vé QR của sinh viên thành một điểm chạm thương mại. Doanh nghiệp tài trợ có thể đính kèm trực tiếp mã giảm giá điện tử (e-coupon) cá nhân hóa vào mã QR vé của sinh viên và đo lường hiệu quả tiếp cận thực tế (ROI) thông qua cổng thông tin dành riêng cho Nhà tài trợ (**Sponsor Portal**).

#### 3. Đối tượng khách hàng mục tiêu (Target Customers)
*   **Giai đoạn ban đầu (Validation tại các Campus FPT):**
    *   *Bên tổ chức sự kiện:* Các Câu lạc bộ sinh viên, các Phòng ban trong trường (Phòng Công tác sinh viên - CTSV, Viện Đào tạo Quốc tế).
    *   *Người tham gia:* Sinh viên, giảng viên và cựu sinh viên của FPT University.
*   **Giai đoạn mở rộng (Scale-up ra thị trường B2B & các trường đại học khác):**
    *   *Nhà trường & Ban tổ chức chuyên nghiệp:* Các trường Đại học, Cao đẳng trên toàn quốc muốn số hóa quy trình quản lý sự kiện và tài nguyên trường học.
    *   *Doanh nghiệp & Nhà tài trợ:* Các thương hiệu tiêu dùng nhanh (FMCG), công nghệ, giáo dục, tài chính muốn tiếp cận trực tiếp tệp khách hàng trẻ (Gen Z).

---

### 2b. USP (Unique Selling Proposition) & Bức tranh Scale-up

#### 1. Điểm khác biệt độc nhất (USP)
*   **Quy trình khép kín từ Quản trị hành chính đến Soát vé thực tế (End-to-End Governance):** FEMS là nền tảng duy nhất xử lý trọn vẹn vòng đời của một sự kiện học đường: từ khâu làm tờ trình duyệt sự kiện, đặt phòng họp/hội trường của trường, duyệt kinh phí, phân phối vé, đối soát tài chính tự động cho đến quét QR điểm danh rèn luyện tại cổng. Các nền tảng ngoài thị trường chỉ giải quyết được một phần của chuỗi giá trị này.
*   **Độ tin cậy kỹ thuật cấp doanh nghiệp (Enterprise-Grade Tech Stack):** Xây dựng trên cấu trúc **6 microservices bằng ngôn ngữ Go**, vận hành trên container Docker và được quản lý hạ tầng bằng mã nguồn **Terraform** để triển khai tự động lên **AWS ECS Fargate**. Dự án đã vượt qua các bài kiểm thử bảo mật chuyên sâu (**Penetration Test**) chống lại các lỗ hổng OWASP Top 10, đảm bảo tính sẵn sàng thương mại hóa cao.
*   **Sponsor-Driven Value (Đo lường ROI nhà tài trợ):** Hệ thống cung cấp dashboard phân tích dữ liệu tương tác thực tế cho nhà tài trợ, cho phép các doanh nghiệp tối ưu hóa chi phí quảng cáo và thu thập tệp khách hàng tiềm năng một cách hợp pháp thông qua các chương trình tặng quà/voucher được cá nhân hóa sâu.

#### 2. Bức tranh tổng quát phát triển rộng rãi (Scale-up Plan)
*   **Phase 1: Market Validation (Xác thực & Ổn định tại FPT):** Chạy thử nghiệm thực tế với các sự kiện lớn (500-1000 người), nâng cấp sơ đồ ghế ngồi thời gian thực qua WebSockets, đồng bộ đăng nhập một lần FPT Student SSO qua AWS Cognito.
*   **Phase 2: B2B Scale & Process Automation (Mở rộng thương mại & Tự động hóa):** Ra mắt **Sponsor Portal** cho nhà tài trợ quảng cáo và phát voucher. Tự động hóa quy trình phê duyệt lịch đặt sân bãi của nhà trường. Xây dựng hệ thống đối soát tài chính tự động (Automated Reconciliation) giữa Ví, VNPay và ngân hàng trường.
*   **Phase 3: Data Intelligence & Ecosystem (Trí tuệ dữ liệu & Hệ sinh thái):** Ứng dụng AI/ML để gợi ý sự kiện cá nhân hóa và dự đoán show-up rate/Dynamic Pricing. Tích hợp sâu vào đời sống sinh viên (tự động quy đổi điểm rèn luyện sau check-in QR, đổi điểm thưởng Loyalty lấy quà/voucher, liên kết tiện ích căng tin/gửi xe).

---

### 2c. Mô hình doanh thu (Revenue Model)

Mô hình doanh thu của FEMS được thiết kế đa luồng để đảm bảo dòng tiền phát triển bền vững:

1.  **Phí thuê bao và Phí hoa hồng từ Ban tổ chức (Event Organizers Subscription & Commission Model):**
    *   *Free Tier (Gói Miễn phí có điều kiện):* Miễn phí hoàn toàn phí khởi tạo và hoa hồng cho các sự kiện học thuật, sinh hoạt CLB phi lợi nhuận của sinh viên trong trường để tạo độ phủ thương hiệu. Với các sự kiện có bán vé thu phí ở gói này, trích thu phí **2.0% trên mỗi giao dịch vé thành công** để bù đắp chi phí vận hành hạ tầng.
    *   *Premium Tier (Gói Thuê bao dành cho Ban tổ chức chuyên nghiệp):* Thu phí thuê bao định kỳ (Subscription) hàng tháng hoặc hàng năm. Người dùng được mở khóa các tính năng thiết kế sơ đồ SVG tùy chỉnh, đối soát tài chính tự động, dashboard báo cáo AI dự báo lượng tham gia thực tế, đồng thời được hưởng mức phí giao dịch trên mỗi vé giảm xuống còn **1.0%** (hoặc phí cố định).
2.  **Dịch vụ Quảng cáo và Kết nối Doanh nghiệp (Sponsor & Corporate Partnerships):**
    *   *Phí hiển thị quảng cáo thương hiệu (Sponsorship Fees):* Thu phí đặt banner, video quảng cáo hiển thị nổi bật trên ứng dụng.
    *   *Phí phân phối voucher điện tử (Lead/Conversion Fees):* Thu phí trên mỗi mã voucher điện tử doanh nghiệp phân phối thành công thông qua vé QR của sinh viên hoặc trích phần trăm hoa hồng khi sinh viên quy đổi/sử dụng voucher đó tại cửa hàng liên kết.
3.  **Phí thiết lập hệ thống ban đầu (System Integration & Setup Fees):**
    *   Khi triển khai mô hình SaaS cho các trường Đại học/Cao đẳng khác, thu phí thiết lập một lần (Setup Fee) để tích hợp cổng SSO, kết nối tài khoản ngân hàng và cấu hình hạ tầng theo nhu cầu đặc thù của trường đó.
4.  **Dịch vụ Phân tích Dữ liệu Thị trường (Market Insights & Analytics Reports):**
    *   Cung cấp các báo cáo phân tích tổng hợp (đã ẩn danh hóa) về thị hiếu, mối quan tâm và xu hướng hành vi của giới trẻ cho các đối tác hoặc nhãn hàng muốn nghiên cứu thị trường học đường.
