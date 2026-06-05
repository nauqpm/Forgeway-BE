## 🚀 Quick Setup Postman (5 phút)

### Bước 1️⃣: Import Environment

**Postman → Environments → Import**

Dán nội dung sau:

```json
{
  "id": "auth-env",
  "name": "AL-TASK Auth",
  "values": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000/api",
      "enabled": true
    },
    {
      "key": "testEmail",
      "value": "testuser@example.com",
      "enabled": true
    },
    {
      "key": "testPassword",
      "value": "Test@1234",
      "enabled": true
    },
    {
      "key": "accessToken",
      "value": "",
      "enabled": true
    },
    {
      "key": "refreshToken",
      "value": "",
      "enabled": true
    },
    {
      "key": "userId",
      "value": "",
      "enabled": true
    }
  ],
  "_postman_variable_scope": "environment",
  "_postman_exported_at": "2026-05-12T00:00:00.000Z",
  "_postman_exported_using": "Postman/latest"
}
```

---

### Bước 2️⃣: Tạo Collection

**Postman → Collections → + New**

**Name:** `AL-TASK Auth API`

---

### Bước 3️⃣: Add Requests (Copy-Paste từ dưới)

---

## 📌 Requests Template

### 1️⃣ Check Email

```
Name: Check Email
Method: GET
URL: {{baseUrl}}/auth/check-email?email={{testEmail}}

Tests:
pm.test("Status 200", function () {
  pm.expect(pm.response.code).to.equal(200);
});

pm.test("Email valid or exists", function () {
  let data = pm.response.json();
  pm.expect(data).to.have.property('isValid');
});
```

---

### 2️⃣ Register

```
Name: Register
Method: POST
URL: {{baseUrl}}/auth/register

Headers:
Content-Type: application/json

Body (raw):
{
  "email": "{{testEmail}}",
  "password": "{{testPassword}}"
}

Tests:
pm.test("Register successful", function () {
  pm.expect(pm.response.code).to.be.oneOf([200, 201]);
});

let data = pm.response.json();
pm.test("User ID returned", function () {
  pm.expect(data.user).to.have.property('id');
  pm.environment.set("userId", data.user.id);
});

pm.test("Email saved correctly", function () {
  pm.expect(data.user.email).to.equal(pm.environment.get("testEmail"));
});
```

---

### 3️⃣ Login

```
Name: Login
Method: POST
URL: {{baseUrl}}/auth/login

Headers:
Content-Type: application/json

Body (raw):
{
  "email": "{{testEmail}}",
  "password": "{{testPassword}}"
}

Tests:
pm.test("Login successful", function () {
  pm.expect(pm.response.code).to.equal(200);
});

let data = pm.response.json();
pm.test("Tokens returned", function () {
  pm.expect(data).to.have.property('accessToken');
  pm.expect(data).to.have.property('refreshToken');
  pm.environment.set("accessToken", data.accessToken);
  pm.environment.set("refreshToken", data.refreshToken);
});

pm.test("HttpOnly Cookies set", function () {
  let setCookie = pm.response.headers.get("Set-Cookie");
  pm.expect(setCookie).to.include("access_token");
  pm.expect(setCookie).to.include("HttpOnly");
});

pm.test("SameSite=Strict header", function () {
  let setCookie = pm.response.headers.get("Set-Cookie");
  pm.expect(setCookie).to.include("SameSite");
});
```

---

### 4️⃣ Get Profile (Protected)

```
Name: Get Profile
Method: GET
URL: {{baseUrl}}/auth/me

Auth: Bearer Token
Token: {{accessToken}}

(Alternative: No Auth header, let cookie handle it)

Tests:
pm.test("Status 200", function () {
  pm.expect(pm.response.code).to.equal(200);
});

let data = pm.response.json();
pm.test("Profile returned", function () {
  pm.expect(data).to.have.property('email');
  pm.expect(data).to.have.property('id');
});
```

---

### 5️⃣ Get Permissions

```
Name: Get Permissions
Method: GET
URL: {{baseUrl}}/auth/my-permissions

Auth: Bearer Token
Token: {{accessToken}}

Tests:
pm.test("Status 200", function () {
  pm.expect(pm.response.code).to.equal(200);
});

let data = pm.response.json();
pm.test("Permissions returned", function () {
  pm.expect(data).to.have.property('permissions');
  pm.expect(data.permissions).to.be.instanceOf(Array);
});

pm.test("Admin check", function () {
  pm.expect(data).to.have.property('isAdmin');
});
```

---

### 6️⃣ Refresh Token

```
Name: Refresh Token
Method: POST
URL: {{baseUrl}}/auth/refresh

Headers:
Content-Type: application/json

Body (raw):
{}

(Optional - send refreshToken in body:)
{
  "refreshToken": "{{refreshToken}}"
}

Tests:
pm.test("Refresh successful", function () {
  pm.expect(pm.response.code).to.equal(200);
});

pm.test("New tokens in cookies", function () {
  let setCookie = pm.response.headers.get("Set-Cookie");
  pm.expect(setCookie).to.include("access_token");
  pm.expect(setCookie).to.include("refresh_token");
});
```

---

### 7️⃣ Update Profile

```
Name: Update Profile
Method: PUT
URL: {{baseUrl}}/auth/update

Auth: Bearer Token
Token: {{accessToken}}

Headers:
Content-Type: application/json

Body (raw):
{
  "fullName": "New Name",
  "phoneNumber": "+84901234567",
  "avatarUrl": "https://example.com/avatar.jpg"
}

Tests:
pm.test("Update successful", function () {
  pm.expect(pm.response.code).to.equal(200);
});

let data = pm.response.json();
pm.test("Updated fields returned", function () {
  pm.expect(data.user.fullName).to.equal("New Name");
});
```

---

### 8️⃣ Request Password Reset

```
Name: Request Password Reset
Method: POST
URL: {{baseUrl}}/auth/request-password-reset

Headers:
Content-Type: application/json

Body (raw):
{
  "email": "{{testEmail}}",
  }


Tests:
pm.test("Status 200", function () {
  pm.expect(pm.response.code).to.equal(200);
});

pm.test("Email sent message", function () {
  let data = pm.response.json();
  pm.expect(data.message).to.include("gửi");
});
```

---

### 9️⃣ Verify OTP

```
Name: Verify OTP
Method: POST
URL: {{baseUrl}}/auth/verify-otp

Headers:
Content-Type: application/json

Body (raw):
{
  "email": "{{testEmail}}",
  "otp": "123456"
}

Pre-request Script:
// Nếu OTP được gửi qua email, copy vào đây

Tests:
pm.test("OTP verified", function () {
  pm.expect(pm.response.code).to.equal(200);
});

let data = pm.response.json();
pm.test("Token returned", function () {
  pm.expect(data).to.have.property('token');
  pm.environment.set("resetGrant", data.resetGrant);
});
```

---

### 🔟 Reset Password with OTP

```
Name: Reset Password with OTP
Method: POST
URL: {{baseUrl}}/auth/reset-password

Headers:
Content-Type: application/json

Body (raw):
{
  "email": "{{testEmail}}",
  "otp": "123456",
  "newPassword": "NewPassword@5678"
}

Tests:
pm.test("Status 200", function () {
  pm.expect(pm.response.code).to.equal(200);
});

pm.test("Password reset success", function () {
  let data = pm.response.json();
  pm.expect(data.success).to.be.true;
});
```

---

### 1️⃣1️⃣ Reset Password with Token

```
Name: Reset Password with Token
Method: POST
URL: {{baseUrl}}/auth/reset-password

Headers:
Content-Type: application/json

Body (raw):
{
  "resetGrant": "{{resetGrant}}",
  "newPassword": "AnotherPassword@9999"
}

Tests:
pm.test("Password reset successful", function () {
  pm.expect(pm.response.code).to.equal(200);
});
```

---

### 1️⃣2️⃣ Logout

```
Name: Logout
Method: POST
URL: {{baseUrl}}/auth/logout

Auth: Bearer Token
Token: {{accessToken}}

Tests:
pm.test("Logout successful", function () {
  pm.expect(pm.response.code).to.equal(200);
});

pm.test("Cookies cleared", function () {
  let setCookie = pm.response.headers.get("Set-Cookie");
  pm.expect(setCookie).to.include("Max-Age=0");
});
```

---

### 1️⃣3️⃣ Google Login (Manual)

```
Name: Google OAuth
Method: GET
URL: {{baseUrl}}/auth/google

Tests:
pm.test("Redirects to Google", function () {
  pm.expect(pm.response.code).to.be.oneOf([302, 301]);
});

pm.test("Google OAuth URL", function () {
  let location = pm.response.headers.get("Location");
  pm.expect(location).to.include("accounts.google.com");
});
```

---

### 1️⃣4️⃣ Check Email Exists

```
Name: Check Email (Exists)
Method: GET
URL: {{baseUrl}}/auth/check-email?email={{testEmail}}

Tests:
pm.test("Email exists", function () {
  let data = pm.response.json();
  if (data.isValid === false) {
    pm.test("Email is already registered", true);
  }
});
```

---

### 1️⃣5️⃣ List All Users

```
Name: Get All Users
Method: GET
URL: {{baseUrl}}/auth/users

Auth: Bearer Token
Token: {{accessToken}}

Tests:
pm.test("Status 200", function () {
  pm.expect(pm.response.code).to.equal(200);
});

let data = pm.response.json();
pm.test("Users array returned", function () {
  pm.expect(Array.isArray(data)).to.be.true;
});
```

---

## 🎬 Test Scenarios (Chạy tuần tự)

### Scenario 1: Happy Path (Register → Login → Get Profile → Logout)

1. **Check Email**
2. **Register** (with new email)
3. **Login** (save tokens)
4. **Get Profile** (verify data)
5. **Logout** (revoke tokens)
6. **Try Get Profile** (should fail 401)

### Scenario 2: Token Refresh

1. **Login**
2. Wait 16 minutes (access token expires in 15 min)
3. **Get Profile** (should fail)
4. **Refresh Token** (get new access token)
5. **Get Profile** (should work)

### Scenario 3: Rate Limiting

1. Send **Login** request 6 times rapidly
2. Request 1-5: Status 200 ✅
3. Request 6: Status 429 ❌
4. Wait 60 seconds
5. Request 7: Status 200 ✅ (limit reset)

### Scenario 4: Theft Detection

1. **Login from Device A** (save tokens)
2. **Refresh Token on Device B** (use refreshToken from A)
3. **Try Get Profile on Device A** (should fail with theft detection)
4. **Must Re-login** (force new family)

### Scenario 5: Password Reset

1. **Request Password Reset** (method: otp)
2. Check email for OTP
3. **Verify OTP**
4. **Reset Password with OTP**
5. **Login with New Password**

---

## 📊 Test Results Template

Save kết quả test:

| Endpoint | Method | Status | ✅/❌ | Notes |
|----------|--------|--------|-------|-------|
| Register | POST | 201 | ✅ | Email validation works |
| Login | POST | 200 | ✅ | HttpOnly cookies set |
| Get Profile | GET | 200 | ✅ | JWT guard working |
| Refresh | POST | 200 | ✅ | Token rotation works |
| Logout | POST | 200 | ✅ | Cookies cleared |
| Google OAuth | GET | 302 | ✅ | Redirects to Google |
| Password Reset | POST | 200 | ✅ | Email sent |
| Rate Limiting | POST | 429 | ✅ | After 5 logins |
| Theft Detection | GET | 401 | ✅ | Family revoke triggered |

---

## 🔐 Security Checklist

- [ ] Cookies: `HttpOnly=true`
- [ ] Cookies: `Secure=true` (production only, localhost=false)
- [ ] Cookies: `SameSite=Strict` (production)
- [ ] CORS: `Access-Control-Allow-Credentials: true`
- [ ] CORS: Origin specific (NOT "*")
- [ ] Rate Limiting: 5/min on login
- [ ] Rate Limiting: 30/min on refresh
- [ ] Rate Limiting: 3/15min on password reset
- [ ] Passwords: Min 8 chars, 1 uppercase, 1 lowercase, 1 digit
- [ ] Refresh Token: Rotation on every use
- [ ] Theft Detection: Family ID tracking
- [ ] OTP: 6 digits, 10 min expiry
- [ ] Password Reset Token: 15 min expiry, 1-time use
- [ ] JWT: 15 min expiry for access token

---

## 🚀 Ready to Integrate Frontend!

Sau khi all tests pass, gọi cho team frontend và chia sẻ:

1. **API Base URL**: `http://localhost:3000/api`
2. **Cookie Names**:
   - `access_token` (HttpOnly, 15 min)
   - `refresh_token` (HttpOnly, 7 days)
3. **Auth Header**: `Authorization: Bearer {accessToken}`
4. **CORS**: `credentials: 'include'` needed
5. **Error Codes**:
   - 401: Unauthorized (token expired/invalid)
   - 403: Forbidden (no permission)
   - 429: Too Many Requests (rate limited)

---

## 📝 Notes

- Mọi request có thể dùng cookies HOẶC Authorization header
- Refresh token tự động được set trong cookies sau khi login
- Token expires được đặt ở backend, frontend không cần refresh manually
- Google OAuth callback sẽ redirect tới frontend (cấu hình trong `.env`)
