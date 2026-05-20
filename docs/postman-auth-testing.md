# 📋 Hướng Dẫn Test Auth Endpoints với Postman

## 🎯 Tổng Quan

Backend đã hoàn thành các tính năng auth:
- ✅ Đăng ký / Đăng nhập với HttpOnly Cookie
- ✅ Access Token + Refresh Token rotation
- ✅ Theft Detection + Family Revoke
- ✅ Rate Limiting trên sensitive endpoints
- ✅ Google OAuth (full tokens)
- ✅ Trust Proxy config
- ✅ CORS với credentials: true

---

## 🔧 Setup Postman

### 1. Tạo Environment

**Postman → Environments → + (New)**

```json
{
  "baseUrl": "http://localhost:3000/api",
  "accessToken": "",
  "refreshToken": "",
  "googleCode": "",
  "testEmail": "test@example.com",
  "testPassword": "Test@1234",
  "userId": ""
}
```

### 2. Cấu Hình Global Headers

**Postman → Collection Settings → Authorization**

```
Headers:
- Content-Type: application/json
- Accept: application/json
```

### 3. Enable Cookies Tracking

⚠️ **Quan trọng**: Postman cần tracking cookies tự động

**Settings → General:**
- ☑️ "Send cookies with requests"
- ☑️ "Send no cookies"
- Use "Cookie Manager" (cấu hình tự động)

---

## 📋 Danh Sách Endpoints

| HTTP | Endpoint | Auth | Throttle | Purpose |
|------|----------|------|----------|---------|
| **POST** | `/auth/register` | ❌ | 10/min | Đăng ký tài khoản |
| **POST** | `/auth/login` | ❌ | 5/min | Đăng nhập (HttpOnly Cookie) |
| **POST** | `/auth/logout` | ✅ | ❌ | Đăng xuất, revoke token |
| **POST** | `/auth/refresh` | ❌ | 30/min | Refresh access token |
| **GET** | `/auth/me` | ✅ | ❌ | Lấy thông tin user |
| **GET** | `/auth/my-permissions` | ✅ | ❌ | Lấy permissions của user |
| **GET** | `/auth/check-permission` | ✅ | ❌ | Check permission cụ thể |
| **PUT** | `/auth/update` | ✅ | ❌ | Cập nhật thông tin user |
| **GET** | `/auth/check-email` | ❌ | ❌ | Kiểm tra email có tồn tại |
| **POST** | `/auth/request-password-reset` | ❌ | 3/15min | Yêu cầu reset password |
| **POST** | `/auth/verify-otp` | ❌ | 5/min | Xác thực OTP |
| **GET** | `/auth/google` | ❌ | ❌ | Redirect đến Google login |
| **GET** | `/auth/google/redirect` | ❌ | ❌ | Google OAuth callback |
| **GET** | `/auth/users` | ✅ | ❌ | List tất cả users |

---

## ✅ Test Scenarios

### Phase 1️⃣: Register & Email Check

#### 1.1️⃣ Check Email Before Register

**Request:**
```http
GET {{baseUrl}}/auth/check-email?email={{testEmail}}
```

**Expected Response (200):**
```json
{
  "isValid": true  // Email chưa dùng
}
```

**Check points:**
- ✅ Status 200
- ✅ `isValid` = true (email chưa dùng)

---

#### 1.2️⃣ Register User

**Request:**
```http
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "email": "{{testEmail}}",
  "password": "Test@1234"
}
```

**Expected Response (201/200):**
```json
{
  "message": "Đăng ký thành công",
  "user": {
    "id": "xxxxx",
    "email": "test@example.com",
    "role": "user",
    "createdAt": "2026-05-12T..."
  }
}
```

**Check points:**
- ✅ Status 201 hoặc 200
- ✅ Email trả về đúng
- ✅ Role = "user" (mặc định)
- ✅ ID được tạo

**Postman Test Script:**
```javascript
if (pm.response.code === 201 || pm.response.code === 200) {
  let data = pm.response.json();
  pm.environment.set("userId", data.user.id);
  pm.test("Register successful", function () {
    pm.expect(data.user.email).to.equal(pm.environment.get("testEmail"));
  });
}
```

---

#### 1.3️⃣ Register Duplicate Email (Should Fail)

**Request:**
```http
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "email": "{{testEmail}}",
  "password": "Test@1234"
}
```

**Expected Response (400/409):**
```json
{
  "message": "Email đã tồn tại",
  "statusCode": 409
}
```

**Check points:**
- ❌ Status 409 (Conflict)
- ✅ Message "Email đã tồn tại"

---

#### 1.4️⃣ Register Weak Password (Should Fail)

**Request:**
```http
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "email": "newuser@example.com",
  "password": "weak"
}
```

**Expected Response (400):**
```json
{
  "message": "Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số",
  "statusCode": 400
}
```

**Check points:**
- ❌ Status 400 (Bad Request)
- ✅ Validation message rõ ràng

---

### Phase 2️⃣: Login & Cookie-based Auth

#### 2.1️⃣ Login Successfully

**Request:**
```http
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "{{testEmail}}",
  "password": "{{testPassword}}"
}
```

**Expected Response (200):**
```json
{
  "message": "Đăng nhập thành công",
  "user": {
    "id": "xxxxx",
    "email": "test@example.com",
    "role": "user"
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

**Headers Response:**
```
Set-Cookie: access_token=eyJhbGc...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900
Set-Cookie: refresh_token=eyJhbGc...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800
```

**Check points:**
- ✅ Status 200
- ✅ accessToken + refreshToken có trả về
- ✅ Headers chứa Set-Cookie cho cả 2 tokens
- ✅ Cookies: HttpOnly=true, Secure=true (production), SameSite=Strict
- ✅ refresh_token maxAge = 604800 (7 days)
- ✅ access_token maxAge = 900 (15 minutes)

**Postman Test Script:**
```javascript
pm.test("Login successful", function () {
  pm.expect(pm.response.code).to.equal(200);
});

pm.test("Tokens returned", function () {
  let data = pm.response.json();
  pm.expect(data.accessToken).to.be.a('string');
  pm.expect(data.refreshToken).to.be.a('string');
  pm.environment.set("accessToken", data.accessToken);
  pm.environment.set("refreshToken", data.refreshToken);
});

pm.test("Cookies set correctly", function () {
  let cookies = pm.response.headers.get("Set-Cookie");
  pm.expect(cookies).to.include("access_token");
  pm.expect(cookies).to.include("refresh_token");
  pm.expect(cookies).to.include("HttpOnly");
  pm.expect(cookies).to.include("SameSite");
});
```

---

#### 2.2️⃣ Login Fail - Wrong Password

**Request:**
```http
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "{{testEmail}}",
  "password": "WrongPassword@1234"
}
```

**Expected Response (401):**
```json
{
  "message": "Email hoặc mật khẩu sai",
  "statusCode": 401
}
```

**Check points:**
- ❌ Status 401 (Unauthorized)
- ✅ Message rõ ràng
- ❌ Không có cookies được set

---

#### 2.3️⃣ Test Rate Limiting on Login

**Action:** Gửi 6 request login liên tiếp (vượt limit 5/min)

**Requests 1-5:** Status 200 ✅

**Request 6+:** Status 429 ❌
```json
{
  "message": "Too many login attempts, please try again later",
  "statusCode": 429
}
```

**Check points:**
- ✅ 5 request đầu thành công
- ❌ Request 6 nhận 429 (Too Many Requests)
- ✅ Retry-After header có?

```javascript
pm.test("Rate limiting active", function () {
  if (pm.response.code === 429) {
    pm.expect(pm.response.headers.has("Retry-After")).to.be.true;
  }
});
```

---

### Phase 3️⃣: Authenticated Endpoints (JWT Guard)

#### 3.1️⃣ Get Current User Profile

**Request:**
```http
GET {{baseUrl}}/auth/me
Authorization: Bearer {{accessToken}}
```

**Alternative (Automatic Cookie):**
```http
GET {{baseUrl}}/auth/me
```
Postman sẽ tự động gửi cookies nếu cấu hình đúng.

**Expected Response (200):**
```json
{
  "id": "xxxxx",
  "email": "test@example.com",
  "fullName": "Test User",
  "role": "user",
  "avatarUrl": null,
  "phoneNumber": null,
  "createdAt": "2026-05-12T..."
}
```

**Check points:**
- ✅ Status 200
- ✅ Thông tin user trả về đầy đủ
- ✅ Email khớp với login

---

#### 3.2️⃣ Get User Permissions

**Request:**
```http
GET {{baseUrl}}/auth/my-permissions
Authorization: Bearer {{accessToken}}
```

**Expected Response (200 - User):**
```json
{
  "role": "user",
  "permissions": [
    {
      "id": "xxxxx",
      "resource": "posts",
      "action": "create",
      "source": "role"
    }
  ],
  "isAdmin": false
}
```

**Expected Response (200 - Admin):**
```json
{
  "role": "admin",
  "permissions": [
    {
      "id": "xxxxx",
      "resource": "*",
      "action": "*"
    }
  ],
  "isAdmin": true
}
```

**Check points:**
- ✅ Status 200
- ✅ Permissions array có dữ liệu
- ✅ isAdmin flag chính xác
- ✅ Có resource + action

---

#### 3.3️⃣ Update User Profile

**Request:**
```http
PUT {{baseUrl}}/auth/update
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "fullName": "Updated Name",
  "phoneNumber": "+84901234567",
  "avatarUrl": "https://example.com/avatar.jpg"
}
```

**Expected Response (200):**
```json
{
  "message": "Cập nhật thông tin thành công",
  "user": {
    "id": "xxxxx",
    "email": "test@example.com",
    "fullName": "Updated Name",
    "phoneNumber": "+84901234567",
    "avatarUrl": "https://example.com/avatar.jpg"
  }
}
```

**Check points:**
- ✅ Status 200
- ✅ Các field được cập nhật
- ✅ Email không thay đổi (nếu không gửi)

---

#### 3.4️⃣ Endpoint Without Auth (Should Fail)

**Request (Missing Authorization):**
```http
GET {{baseUrl}}/auth/me
```

**Expected Response (401):**
```json
{
  "message": "Unauthorized",
  "statusCode": 401
}
```

**Check points:**
- ❌ Status 401 (Unauthorized)
- ✅ Message rõ ràng

---

### Phase 4️⃣: Token Refresh & Rotation

#### 4.1️⃣ Refresh Access Token (Using Refresh Token Cookie)

**Request:**
```http
POST {{baseUrl}}/auth/refresh
Content-Type: application/json
```

**Body:** (Optional - Postman sẽ tự động gửi refresh_token cookie)
```json
{}
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Làm mới token thành công"
}
```

**Headers Response:**
```
Set-Cookie: access_token=NEW_TOKEN...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900
Set-Cookie: refresh_token=NEW_REFRESH...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800
```

**Check points:**
- ✅ Status 200
- ✅ Cả 2 cookies được set lại (rotation)
- ✅ access_token = token mới
- ✅ refresh_token = token mới (rotation)

**Postman Test Script:**
```javascript
pm.test("Refresh token rotated", function () {
  let cookies = pm.response.headers.get("Set-Cookie");
  pm.expect(cookies).to.include("access_token");
  pm.expect(cookies).to.include("refresh_token");
  // 2 cookies = 2 lines trong Set-Cookie
  pm.expect(cookies.split("\n").length).to.be.at.least(2);
});
```

---

#### 4.2️⃣ Refresh with Body (Alternative)

**Request:**
```http
POST {{baseUrl}}/auth/refresh
Content-Type: application/json

{
  "refreshToken": "{{refreshToken}}"
}
```

**Expected Response:** Như 4.1️⃣ (refresh token có thể từ cookie hoặc body)

---

#### 4.3️⃣ Refresh with Invalid Token (Should Fail)

**Request:**
```http
POST {{baseUrl}}/auth/refresh
Content-Type: application/json

{
  "refreshToken": "invalid.token.here"
}
```

**Expected Response (401):**
```json
{
  "message": "Invalid or expired refresh token",
  "statusCode": 401
}
```

**Check points:**
- ❌ Status 401
- ✅ No new cookies set

---

### Phase 5️⃣: Logout & Token Revocation

#### 5.1️⃣ Logout User

**Request:**
```http
POST {{baseUrl}}/auth/logout
Authorization: Bearer {{accessToken}}
Content-Type: application/json
```

**Expected Response (200):**
```json
{
  "message": "Đăng xuất thành công",
  "revoked": true
}
```

**Headers Response:**
```
Set-Cookie: access_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0
Set-Cookie: refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0
```

**Check points:**
- ✅ Status 200
- ✅ Set-Cookie với MaxAge=0 (xóa cookies)
- ✅ Token bị revoke (không thể dùng lại)

**Postman Test Script:**
```javascript
pm.test("Logout successful", function () {
  pm.expect(pm.response.code).to.equal(200);
});

pm.test("Cookies cleared", function () {
  let cookies = pm.response.headers.get("Set-Cookie");
  pm.expect(cookies).to.include("Max-Age=0");
});
```

---

#### 5.2️⃣ Try Using Old Token After Logout (Should Fail)

**Action:** Sau 5.1️⃣, gửi request với access_token cũ

**Request:**
```http
GET {{baseUrl}}/auth/me
Authorization: Bearer {{accessToken}}
```

**Expected Response (401):**
```json
{
  "message": "Token đã được revoke",
  "statusCode": 401
}
```

**Check points:**
- ❌ Status 401
- ✅ Token bị từ chối

---

### Phase 6️⃣: Theft Detection & Family Revoke

#### 6.1️⃣ Simulating Token Theft

**Scenario:** 
1. Login từ Device A → nhận access_token + refresh_token (Family ID = X)
2. Attacker lấy được refresh_token, dùng nó từ Device B → cấp new tokens (Family ID = X)
3. Backend detect: 2 devices dùng same family revoke all tokens

**Step 1 - Login từ Device A:**
```http
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "{{testEmail}}",
  "password": "{{testPassword}}"
}
```

Save: `tokenA` + `refreshTokenA`

**Step 2 - Simulate Attacker Refresh từ Device B:**
```http
POST {{baseUrl}}/auth/refresh
Content-Type: application/json

{
  "refreshToken": "{{refreshTokenA}}"
}
```

Response nhận `tokenB` + `refreshTokenB`

**Step 3 - Try Using tokenA từ Device A:**
```http
GET {{baseUrl}}/auth/me
Authorization: Bearer {{tokenA}}
```

**Expected Response (401):**
```json
{
  "message": "Theft detected! All tokens revoked.",
  "statusCode": 401,
  "details": {
    "familyId": "xxxxx",
    "reason": "unusual_usage_pattern",
    "revokedAt": "2026-05-12T..."
  }
}
```

**Check points:**
- ❌ Status 401
- ✅ Message "Theft detected"
- ✅ Tất cả tokens bị revoke (cả tokenA, tokenB, refreshTokenA, refreshTokenB)

---

#### 6.2️⃣ Must Re-Login After Theft

**Request:**
```http
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "{{testEmail}}",
  "password": "{{testPassword}}"
}
```

**Expected Response (200):**
```json
{
  "message": "Đăng nhập thành công",
  "user": {...},
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

**New Family ID:** Sẽ khác với family X cũ

**Check points:**
- ✅ Status 200
- ✅ Tokens mới với family ID khác
- ✅ User có thể hoạt động bình thường

---

### Phase 7️⃣: Password Reset

#### 7.1️⃣ Request Password Reset (Email Method)

**Request:**
```http
POST {{baseUrl}}/auth/request-password-reset
Content-Type: application/json

{
  "email": "{{testEmail}}",
  }
```

**Expected Response (200):**
```json
{
  "message": "Email reset password đã được gửi",
  }
```

**Check points:**
- ✅ Status 200
- ✅ Message xác nhận
- ✅ Email có chứa link reset (check mail inbox)
- ✅ Link format: `/reset-password?token=xxxxx`

**Test Rate Limiting:**
```
Request 1-3: Status 200 ✅
Request 4+: Status 429 ❌ (3/15min limit)
```

---

#### 7.2️⃣ Request Password Reset (OTP Method)

**Request:**
```http
POST {{baseUrl}}/auth/request-password-reset
Content-Type: application/json

{
  "email": "{{testEmail}}",
  }
```

**Expected Response (200):**
```json
{
  "message": "OTP đã được gửi qua email",
  }
```

**Check points:**
- ✅ Status 200
- ✅ Email chứa 6-digit OTP (e.g., 123456)
- ✅ OTP có thời hạn (e.g., 10 minutes)

---

#### 7.3️⃣ Verify OTP

**Request:**
```http
POST {{baseUrl}}/auth/verify-otp
Content-Type: application/json

{
  "email": "{{testEmail}}",
  "otp": "123456"
}
```

**Expected Response (200):**
```json
{
  "message": "OTP verified successfully",
  "token": "eyJhbGc..."
}
```

**Check points:**
- ✅ Status 200
- ✅ Token trả về (dùng để reset password)
- ✅ Save token để step tiếp theo

**Test Rate Limiting:**
```
Request 1-5: Status 200/400 ✅
Request 6+: Status 429 ❌ (5/min limit)
```

---

#### 7.4️⃣ Reset Password with OTP Token

**Request:**
```http
POST {{baseUrl}}/auth/reset-password
Content-Type: application/json

{
  "email": "{{testEmail}}",
  "otp": "123456",
  "newPassword": "NewPassword@5678"
}
```

**Expected Response (200):**
```json
{
  "message": "Mật khẩu đã được thay đổi thành công",
  "success": true
}
```

**Check points:**
- ✅ Status 200
- ✅ Password changed
- ✅ User phải login lại với mật khẩu mới

---

#### 7.5️⃣ Reset Password with Token Link

**Request:**
```http
POST {{baseUrl}}/auth/reset-password
Content-Type: application/json

{
  "token": "eyJhbGc...",
  "newPassword": "AnotherPassword@9999"
}
```

**Expected Response (200):**
```json
{
  "message": "Mật khẩu đã được thay đổi thành công",
  "success": true
}
```

**Check points:**
- ✅ Status 200
- ✅ Token không thể dùng lại (1-time only)
- ✅ User login với password mới

**Test with Invalid Token:**
```http
POST {{baseUrl}}/auth/reset-password
Content-Type: application/json

{
  "token": "invalid.token",
  "newPassword": "Test@1234"
}
```

**Expected Response (401):**
```json
{
  "message": "Invalid or expired token",
  "statusCode": 401
}
```

---

### Phase 8️⃣: Google OAuth Flow

#### 8.1️⃣ Initiate Google Login

**Request:**
```http
GET {{baseUrl}}/auth/google
```

**Expected Response:** Redirect (302) đến Google OAuth authorization endpoint
```
Location: https://accounts.google.com/o/oauth2/v2/auth?client_id=xxxxx&...
```

**Check points:**
- ✅ Status 302 (Redirect)
- ✅ Location header chứa Google OAuth URL
- ✅ client_id, redirect_uri, scope có mặt

---

#### 8.2️⃣ Simulate Google OAuth Callback

**⚠️ Thực tế:** Bạn cần browser để login Google → callback trả về authorization code

**Manual Test:**
1. Copy URL từ step 8.1️⃣ vào browser
2. Login bằng tài khoản Google
3. Google redirect về: `http://localhost:3000/api/auth/google/redirect?code=xxxxx`
4. Backend xử lý → redirect tới frontend

**Expected Flow:**
```
User clicks "Login with Google"
    ↓
GET {{baseUrl}}/auth/google
    ↓
Browser redirects to Google login
    ↓
User enters Google credentials
    ↓
Google redirects: {{baseUrl}}/auth/google/redirect?code=auth_code
    ↓
Backend: exchange code → access_token + refresh_token
    ↓
Set-Cookie: access_token + refresh_token
    ↓
Redirect to Frontend Dashboard
```

**Expected Response (302):**
```
Location: http://localhost:3000/dashboard (or /)
Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Strict
Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict
```

**Check points:**
- ✅ Status 302 (Redirect)
- ✅ Cookies set với tokens
- ✅ Location = frontend dashboard
- ✅ User info saved trong database

---

### Phase 9️⃣: Permission Checking

#### 9.1️⃣ Check Permission (User)

**Request:**
```http
GET {{baseUrl}}/auth/check-permission
Authorization: Bearer {{accessToken}}
```

**Expected Response (200 - User with Permissions):**
```json
{
  "success": true,
  "permissions": [
    {
      "resource": "posts",
      "action": "create",
      "source": "role"
    },
    {
      "resource": "posts",
      "action": "read",
      "source": "role"
    },
    {
      "resource": "comments",
      "action": "create",
      "source": "role"
    }
  ]
}
```

**Check points:**
- ✅ Status 200
- ✅ permissions array có dữ liệu
- ✅ Mỗi permission có resource + action + source

---

#### 9.2️⃣ Check Permission (Admin)

**Expected Response (200 - Admin):**
```json
{
  "success": true,
  "permissions": [
    {
      "resource": "*",
      "action": "*",
      "source": "role"
    }
  ]
}
```

**Check points:**
- ✅ Status 200
- ✅ Admin có wildcard permissions ("*", "*")

---

### Phase 🔟: CORS & Cookie Security

#### 10.1️⃣ CORS with Credentials

**From Frontend (http://localhost:3000):**

```javascript
fetch('http://localhost:3000/api/auth/me', {
  method: 'GET',
  credentials: 'include',  // ⚠️ Important!
  headers: {
    'Content-Type': 'application/json'
  }
})
```

**Backend Response Headers:**
```
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

**Check points:**
- ✅ `Access-Control-Allow-Credentials: true`
- ✅ Origin specific (NOT "*")
- ✅ Cookies sent & accepted

---

#### 10.2️⃣ Test CORS Preflight (OPTIONS)

**Request:**
```http
OPTIONS {{baseUrl}}/auth/me
```

**Expected Response (204 or 200):**
```
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
```

**Check points:**
- ✅ Status 204 (No Content) hoặc 200
- ✅ CORS headers có mặt

---

## 🧪 Postman Collection Export (JSON)

Bạn có thể import collection này vào Postman:

```json
{
  "info": {
    "name": "AL-TASK Auth API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Auth",
      "item": [
        {
          "name": "Check Email",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/auth/check-email?email={{testEmail}}"
          }
        },
        {
          "name": "Register",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/auth/register",
            "body": {
              "mode": "raw",
              "raw": "{\"email\": \"{{testEmail}}\", \"password\": \"{{testPassword}}\"}"
            }
          }
        },
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/auth/login",
            "body": {
              "mode": "raw",
              "raw": "{\"email\": \"{{testEmail}}\", \"password\": \"{{testPassword}}\"}"
            }
          }
        },
        {
          "name": "Get Profile",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/auth/me",
            "auth": {
              "type": "bearer",
              "bearer": "{{accessToken}}"
            }
          }
        },
        {
          "name": "Refresh Token",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/auth/refresh"
          }
        },
        {
          "name": "Logout",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/auth/logout",
            "auth": {
              "type": "bearer",
              "bearer": "{{accessToken}}"
            }
          }
        }
      ]
    }
  ]
}
```

---

## 📝 Checklist Trước Khi Call Frontend

- [ ] Register endpoint ✅ (email validation, password strength)
- [ ] Login endpoint ✅ (HttpOnly cookies, rate limiting)
- [ ] Logout endpoint ✅ (revoke tokens, clear cookies)
- [ ] Refresh token ✅ (rotation, theft detection)
- [ ] Get profile ✅ (JWT guard)
- [ ] Permissions ✅ (user vs admin)
- [ ] Password reset ✅ (email + OTP methods)
- [ ] Google OAuth ✅ (full flow, access+refresh token)
- [ ] CORS ✅ (credentials: true)
- [ ] Rate limiting ✅ (5/min login, 30/min refresh)
- [ ] Theft detection ✅ (family revoke all tokens)
- [ ] Trust proxy ✅ (IP detection correct)
- [ ] Cookie security ✅ (HttpOnly, Secure, SameSite=Strict)

---

## 🔍 Debug Mode

**Frontend dev:**
```javascript
// Check cookies
console.log(document.cookie);

// Check localStorage
console.log(localStorage.getItem('tokenKey'));

// Check if Authorization header sent
fetch('http://localhost:3000/api/auth/me', {
  credentials: 'include'
})
```

**Check cookies in Postman:**
- Postman → Cookies (bottom right)
- Xem danh sách cookies được lưu
- Kiểm tra `access_token` + `refresh_token` có mặt

---

## ⚠️ Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| **Cookies not being sent** | ✅ Enable "Send cookies with requests" in Postman Settings |
| **CORS error** | ✅ Check `credentials: 'include'` in fetch, ensure CORS headers correct |
| **401 on protected endpoint** | ✅ Ensure Authorization header or cookie present |
| **Rate limit exceeded** | ✅ Wait 1 minute or use different email |
| **Google OAuth fails** | ✅ Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirect URI |
| **Password reset token expired** | ✅ Token hết hạn sau 15 minutes, request cái mới |

---

## 📞 Next Steps

Sau khi test toàn bộ các endpoints:
1. ✅ Confirm tất cả test cases pass
2. ✅ Share Postman collection link với team
3. ✅ Call frontend để tích hợp
4. ✅ Deploy prod config (secure cookies, HTTPS)
