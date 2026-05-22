# 🔴 Fix reCAPTCHA Error: "Invalid domain for site key"

## ❌ Vấn đề

Khi deploy lên **https://fpt-event.vercel.app**, gặp lỗi:
```
ERROR for site owner: Invalid domain for site key
```

---

## 🔍 Nguyên nhân

Biến môi trường `VITE_RECAPTCHA_SITE_KEY` **không được set** trên Vercel:
- Khi build trên Vercel, Vite không nhận được giá trị sitekey
- Component render `<ReCAPTCHA sitekey={undefined} />`
- Google reCAPTCHA không thể xác nhận domain và báo lỗi

---

## ✅ Giải pháp

### **Bước 1: Tạo reCAPTCHA Key cho Production (1 lần duy nhất)**

1. Truy cập: https://www.google.com/recaptcha/admin
2. Click **"+" (Create)** → New Site
3. Điền thông tin:
   - **Label:** `FPT Event - Production`
   - **reCAPTCHA type:** v2 (Checkbox)
   - **Domains:** 
     ```
     fpt-event.vercel.app
     localhost
     127.0.0.1
     ```
4. Click **Create**
5. Bạn sẽ thấy:
   - **Site Key** ← Copy cái này
   - **Secret Key** ← Dùng cho backend

### **Bước 2: Set Environment Variable trên Vercel**

**Option A: Dashboard Web** (Dễ nhất)
1. Vào: https://vercel.com/dashboard
2. Chọn project: `fpt-event-management-system`
3. Tab: **Settings** → **Environment Variables**
4. Click **Add new**
5. Điền:
   - **Name:** `VITE_RECAPTCHA_SITE_KEY`
   - **Value:** `your_production_site_key` (paste site key từ bước 1)
   - **Environments:** Chọn `Production` hoặc `All`
6. Click **Add**
7. **IMPORTANT:** Vercel sẽ yêu cầu rebuild. Click **"Redeploy"**

**Option B: CLI (Nếu dùng command line)**
```bash
vercel env add VITE_RECAPTCHA_SITE_KEY
# Nhập production site key khi prompt yêu cầu
vercel redeploy  # Rebuild with new env var
```

### **Bước 3: Test Local Development (Optional)**

Tạo file `.env.local` trong `frontend/` folder:
```bash
VITE_RECAPTCHA_SITE_KEY=your_development_site_key
```

Rồi chạy:
```bash
cd frontend
npm run dev
```

---

## 📋 Các file đã được sửa

| File | Thay đổi |
|------|---------|
| [frontend/.env.example](../frontend/.env.example) | ✅ Tạo mới - Hướng dẫn biến env cần set |
| [frontend/.env.production](../frontend/.env.production) | ✅ Tạo mới - Template cho Vercel |
| [frontend/src/pages/Login.tsx](../frontend/src/pages/Login.tsx) | ✅ Thêm validation + warning UI |
| [frontend/src/pages/Register.tsx](../frontend/src/pages/Register.tsx) | ✅ Thêm validation + warning UI |
| [frontend/src/pages/ResetPassword.tsx](../frontend/src/pages/ResetPassword.tsx) | ✅ Thêm validation + warning UI |

---

## 🛠️ Debug Checklist

- [ ] Tạo reCAPTCHA v2 key cho production domain
- [ ] Set `VITE_RECAPTCHA_SITE_KEY` trên Vercel Dashboard
- [ ] Trigger redeploy trên Vercel (hoặc git push)
- [ ] Chờ build hoàn tất (~3-5 phút)
- [ ] Test lại trang login: https://fpt-event.vercel.app/login
- [ ] Kiểm tra console browser (dev tools) xem có error không

---

## 🔎 Kiểm tra Console

**Khi sitekey chưa được set:**
```
❌ reCAPTCHA Site Key is missing or invalid!
This will cause "Invalid domain for site key" error.
```

**Khi sitekey được set đúng:**
```
✓ reCAPTCHA widget renders successfully
✓ No console errors
```

---

## 📚 Tham khảo

- reCAPTCHA Admin Console: https://www.google.com/recaptcha/admin
- Vercel Environment Variables: https://vercel.com/docs/projects/environment-variables
- reCAPTCHA v2 Docs: https://developers.google.com/recaptcha/docs/display

---

## 🚨 Common Issues

### "Still getting 'Invalid domain for site key'"
**Giải pháp:**
1. Kiểm tra site key được copy đúng (không có space thừa)
2. Verify rằng `fpt-event.vercel.app` được add trong reCAPTCHA domains
3. Chờ Vercel redeploy xong (check deployment logs)
4. Clear browser cache (Ctrl+Shift+Del) rồi reload

### "reCAPTCHA checkbox không hiển thị"
**Giải pháp:**
1. Check console browser xem có error không
2. Verify `VITE_RECAPTCHA_SITE_KEY` environment variable được set
3. Ensure `<script src="https://www.google.com/recaptcha/api.js"></script>` trong [index.html](../frontend/index.html)

### "Local dev sitekey khác production"
**Giải pháp:**
- Tạo **2 keys riêng biệt** trên reCAPTCHA admin:
  - Key 1: cho localhost (dev)
  - Key 2: cho fpt-event.vercel.app (production)
- Set `.env.local` dùng key 1
- Set Vercel env var dùng key 2

---

**Last Updated:** 2026-05-22  
**Status:** ✅ Ready for Vercel Deployment
