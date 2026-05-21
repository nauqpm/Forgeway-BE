# Postman Collections Summary

**Generated:** 2026-05-20  
**Workspace:** Quan Pham's Workspace (`df79120f-e110-461c-8f92-20d8f49fcb2a`)

---

## Collections Overview

| Collection | UID | Requests | Status |
|-----------|-----|----------|--------|
| **Workspace API** | `45567405-d48a6bd3-d8a1-40d7-a0b0-5dd49bfc0fd3` | 12 | ✅ Pushed |
| **AL-TASK Auth API** | `45567405-997b5ed8-5caa-4929-bba5-753be6f44e26` | 14 | ✅ Pushed |

---

## Environments

| Environment | UID | Variables | Status |
|-------------|-----|-----------|--------|
| **AL-TASK Workspace** | `45567405-6b04acdb-e12e-4e75-af9c-c4319fdf9870` | 16 | ✅ Pushed |
| **AL-TASK Auth** | `45567405-1cb5875f-b730-42ae-b4bc-425146205fd6` | 12 | ✅ Pushed |

---

## 1. Workspace API Collection

**Base URL:** `{{baseUrl}}/workspaces`  
**Auth Type:** Bearer Token (`{{accessToken}}`)  
**Description:** Complete Workspace CRUD & member management

### Requests

#### 1.1 Login - Save Tokens
- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/login`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "{{userAccount}}",
    "password": "{{userPassword}}"
  }
  ```
- **Test Script:** 
  - Validates status 200
  - Extracts accessToken from response or Set-Cookie headers
  - Sets environment variables: `accessToken`, `refreshToken`, `userId`
- **Auth:** None (initial login)

#### 1.2 Create Workspace
- **Method:** `POST`
- **URL:** `{{baseUrl}}/workspaces`
- **Auth:** Bearer `{{accessToken}}`
- **Body:**
  ```json
  {
    "name": "{{workspaceName}}",
    "description": "{{workspaceDescription}}",
    "type": "{{workspaceType}}"
  }
  ```
- **Expected Status:** 201
- **Test Script:**
  - Validates 201 response
  - Checks required fields: `_id`, `name`, `slug`, `key`, `members`
  - Sets: `workspaceId`, `workspaceSlug`, `workspaceKey`

#### 1.3 Get My Workspaces
- **Method:** `GET`
- **URL:** `{{baseUrl}}/workspaces`
- **Auth:** Bearer `{{accessToken}}`
- **Expected Status:** 200
- **Response:** Array of workspaces
- **Test Script:** Validates array response, checks created workspace appears

#### 1.4 Get For You Workspaces
- **Method:** `GET`
- **URL:** `{{baseUrl}}/for-you`
- **Auth:** Bearer `{{accessToken}}`
- **Expected Status:** 200
- **Response Shape:**
  ```json
  {
    "success": true,
    "workspaces": [...]
  }
  ```
- **Test Script:** Validates structure, checks workspace contains role/relationship/ownershipLabel

#### 1.5 Get Workspace By ID
- **Method:** `GET`
- **URL:** `{{baseUrl}}/workspaces/{{workspaceId}}`
- **Auth:** Bearer `{{accessToken}}`
- **Expected Status:** 200
- **Test Script:** Validates workspace ID matches environment variable

#### 1.6 Get Workspace Members
- **Method:** `GET`
- **URL:** `{{baseUrl}}/workspaces/{{workspaceId}}/members`
- **Auth:** Bearer `{{accessToken}}`
- **Expected Status:** 200
- **Response:** Array of members with at least 1 element
- **Test Script:** Validates members array and non-zero length

#### 1.7 Add Workspace Member
- **Method:** `POST`
- **URL:** `{{baseUrl}}/workspaces/{{workspaceId}}/members`
- **Auth:** Bearer `{{accessToken}}`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "{{workspaceMemberEmail}}",
    "role": "{{workspaceMemberRole}}"
  }
  ```
- **Expected Status:** 201
- **Test Script:**
  - Validates 201 response
  - Auto-captures `workspaceMemberUserId` from response if available
  - Validates members array still present

#### 1.8 Update Workspace Member Role
- **Method:** `PUT`
- **URL:** `{{baseUrl}}/workspaces/{{workspaceId}}/members/{{workspaceMemberUserId}}`
- **Auth:** Bearer `{{accessToken}}`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "role": "viewer"
  }
  ```
- **Expected Status:** 200
- **Test Script:** Validates member role updated to "viewer"

#### 1.9 Remove Workspace Member
- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/workspaces/{{workspaceId}}/members/{{workspaceMemberUserId}}`
- **Auth:** Bearer `{{accessToken}}`
- **Expected Status:** 204
- **Test Script:** Validates 204 (no content) response

#### 1.10 Update Workspace
- **Method:** `PUT`
- **URL:** `{{baseUrl}}/workspaces/{{workspaceId}}`
- **Auth:** Bearer `{{accessToken}}`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "name": "{{workspaceUpdatedName}}",
    "description": "{{workspaceUpdatedDescription}}",
    "type": "{{workspaceType}}"
  }
  ```
- **Expected Status:** 200
- **Test Script:** Validates updated values returned in response

#### 1.11 Archive Workspace
- **Method:** `PUT`
- **URL:** `{{baseUrl}}/workspaces/{{workspaceId}}`
- **Auth:** Bearer `{{accessToken}}`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "status": "archived"
  }
  ```
- **Expected Status:** 200
- **Test Script:** Validates workspace status equals "archived"

#### 1.12 Delete Workspace
- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/workspaces/{{workspaceId}}`
- **Auth:** Bearer `{{accessToken}}`
- **Expected Status:** 204
- **Test Script:**
  - Validates 204 response
  - Clears environment variables: `workspaceId`, `workspaceSlug`, `workspaceKey`

### Environment Variables (AL-TASK Workspace)

| Key | Default Value | Type | Purpose |
|-----|----------------|------|---------|
| `baseUrl` | `http://localhost:5512` | URL | API base URL |
| `userAccount` | `` | string | Login email (user-provided) |
| `userPassword` | `` | string | Login password (user-provided) |
| `accessToken` | `` | string | JWT token (auto-captured) |
| `refreshToken` | `` | string | Refresh token (auto-captured) |
| `userId` | `` | string | User ID (auto-captured) |
| `workspaceId` | `` | string | Current workspace ID (auto-captured) |
| `workspaceName` | `Workspace API Test` | string | Name for create request |
| `workspaceDescription` | `Created from Postman workspace API collection` | string | Description |
| `workspaceSlug` | `` | string | URL slug (auto-captured) |
| `workspaceKey` | `` | string | Workspace key (auto-captured) |
| `workspaceType` | `kanban` | string | Workspace type |
| `workspaceUpdatedName` | `Workspace API Test Updated` | string | Updated name |
| `workspaceUpdatedDescription` | `Updated from Postman workspace API collection` | string | Updated description |
| `workspaceMemberEmail` | `` | string | Email for add member (user-provided) |
| `workspaceMemberUserId` | `` | string | Member user ID (auto-captured) |
| `workspaceMemberRole` | `member` | string | Member role |

---

## 2. AL-TASK Auth API Collection

**Base URL:** `{{baseUrl}}/auth`  
**Auth Type:** Bearer Token (`{{accessToken}})` — collection-level default  
**Description:** User authentication, registration, password reset, permissions

### Requests

#### 2.1 Register
- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/register`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "{{testEmail}}",
    "password": "{{testPassword}}"
  }
  ```
- **Expected Status:** 200 or 201
- **Test Script:**
  - Validates 200/201 response
  - Extracts user ID and sets `userId`
  - Validates email matches environment

#### 2.2 Check Email
- **Method:** `GET`
- **URL:** `{{baseUrl}}/auth/check-email?email={{testEmail}}`
- **Query Param:** `email={{testEmail}}`
- **Expected Status:** 200
- **Response:** `{ "isValid": boolean }`
- **Test Script:** Validates `isValid` property exists

#### 2.3 Login - User
- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/login`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "{{userAccount}}",
    "password": "{{userPassword}}"
  }
  ```
- **Expected Status:** 200
- **Test Script:**
  - Validates 200 response
  - Checks accessToken and refreshToken in response
  - Sets environment variables
  - Validates HttpOnly and SameSite=Strict cookies set

#### 2.4 Login - Admin
- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/login`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "{{testEmail}}",
    "password": "{{testPassword}}"
  }
  ```
- **Expected Status:** 200
- **Test Script:** Same as Login - User
- **Note:** Uses default testEmail/testPassword instead of userAccount/userPassword

#### 2.5 Get Profile
- **Method:** `GET`
- **URL:** `{{baseUrl}}/auth/me`
- **Auth:** Bearer `{{accessToken}}`
- **Expected Status:** 200
- **Response Fields:** `email`, `id`
- **Test Script:** Validates profile structure

#### 2.6 Get Permissions
- **Method:** `GET`
- **URL:** `{{baseUrl}}/auth/my-permissions`
- **Auth:** Bearer `{{accessToken}}`
- **Expected Status:** 200
- **Response Fields:** `permissions` (array), `isAdmin` (boolean)
- **Test Script:** Validates both fields present

#### 2.7 Refresh Token
- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/refresh`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "refreshToken": "{{refreshToken}}"
  }
  ```
- **Expected Status:** 200
- **Test Script:**
  - Validates 200 response
  - Validates Set-Cookie contains access_token and refresh_token

#### 2.8 Update Profile
- **Method:** `PUT`
- **URL:** `{{baseUrl}}/auth/update`
- **Auth:** Bearer `{{accessToken}}`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "fullName": "New Name",
    "phoneNumber": "+84901234567",
    "avatarUrl": "https://example.com/avatar.jpg"
  }
  ```
- **Expected Status:** 200
- **Test Script:** Validates fullName updated to "New Name"

#### 2.9 Request Password Reset
- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/request-password-reset`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "{{testEmail}}",
    "resetMethod": "link"
  }
  ```
- **Expected Status:** 200
- **Response:** Contains message with "gửi" (Vietnamese for "sent")
- **Test Script:** Validates email sent message

#### 2.10 Verify OTP
- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/verify-otp`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "{{testEmail}}",
    "otp": "123456"
  }
  ```
- **Expected Status:** 200
- **Response:** Contains `token` (sets `resetToken`), optional `resetGrant`
- **Test Script:**
  - Validates token property
  - Auto-captures resetToken and resetGrant

#### 2.11 Reset Password with OTP
- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/reset-password/otp`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "{{testEmail}}",
    "otp": "123456",
    "newPassword": "NewPassword@5678"
  }
  ```
- **Expected Status:** 200
- **Response:** `{ "success": true }`
- **Test Script:** Validates success flag

#### 2.12 Reset Password with Token
- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/reset-password/token`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "token": "{{resetToken}}",
    "newPassword": "AnotherPassword@9999"
  }
  ```
- **Expected Status:** 200
- **Test Script:** Validates 200 response

#### 2.13 Logout
- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/logout`
- **Auth:** Bearer `{{accessToken}}`
- **Expected Status:** 200
- **Test Script:**
  - Validates 200 response
  - Checks Set-Cookie contains Max-Age=0 (clears cookies)

#### 2.14 Google OAuth
- **Method:** `GET`
- **URL:** `{{baseUrl}}/auth/google`
- **Expected Status:** 301 or 302 (redirect)
- **Redirect Target:** Contains `accounts.google.com`
- **Test Script:** Validates redirect to Google OAuth

#### 2.15 Get All Users
- **Method:** `GET`
- **URL:** `{{baseUrl}}/auth/users`
- **Auth:** Bearer `{{accessToken}}`
- **Expected Status:** 200
- **Response:** Array of users
- **Test Script:** Validates array response

### Environment Variables (AL-TASK Auth)

| Key | Default Value | Type | Purpose |
|-----|----------------|------|---------|
| `baseUrl` | `http://localhost:5512` | URL | API base URL |
| `testEmail` | `testuser@example.com` | string | Test user email |
| `testPassword` | `Test@1234` | string | Test user password |
| `userAccount` | `` | string | Login email (user-provided) |
| `userPassword` | `` | string | Login password (user-provided) |
| `accessToken` | `` | string | JWT access token (auto-captured) |
| `refreshToken` | `` | string | JWT refresh token (auto-captured) |
| `userId` | `` | string | User ID (auto-captured) |
| `resetToken` | `` | string | Reset token from OTP verification (auto-captured) |
| `resetGrant` | `` | string | Reset grant from OTP (auto-captured) |
| `testemailverification` | `` | string | Reserved for email verification |
| `passEmailVerification` | `` | string | Reserved for email verification |

---

## Authentication Flow

### Bearer Token (Collection-Level)
Both collections use Bearer token authentication at the request level:
```
Authorization: Bearer {{accessToken}}
```

**Token Capture Flow:**
1. Execute **Login - User** (or Login - Admin) request
2. Script automatically captures `accessToken` from response JSON or Set-Cookie header
3. Subsequent requests use `{{accessToken}}` in Bearer auth

### HttpOnly Cookies
API returns HttpOnly Set-Cookie headers:
- `access_token` — HttpOnly, SameSite=Strict
- `refresh_token` — HttpOnly, SameSite=Strict

Tests validate these are present.

### Token Refresh
- Use **Refresh Token** request with `refreshToken`
- Returns new access_token and refresh_token in Set-Cookie headers
- Tests validate both tokens present in cookies

---

## Test Execution Flow (Recommended)

### Workspace API Sequence
```
1. Login - Save Tokens
   ↓
2. Create Workspace (captures workspaceId)
   ↓
3. Get My Workspaces (verify created)
   ↓
4. Get For You Workspaces
   ↓
5. Get Workspace By ID
   ↓
6. Get Workspace Members
   ↓
7. Add Workspace Member (captures workspaceMemberUserId)
   ↓
8. Update Workspace Member Role
   ↓
9. Remove Workspace Member
   ↓
10. Update Workspace
   ↓
11. Archive Workspace
   ↓
12. Delete Workspace
```

### Auth API Sequence (Isolated)
```
1. Register (or Login - User)
   ↓
2. Check Email
   ↓
3. Get Profile
   ↓
4. Get Permissions
   ↓
5. Refresh Token
   ↓
6. Update Profile
   ↓
7. Request Password Reset
   ↓
8. Verify OTP
   ↓
9. Reset Password with OTP (or Token)
   ↓
10. Logout
```

---

## Error Handling & Status Codes

| Endpoint | 200 | 201 | 204 | 400 | 401 | 403 | 404 | 500 |
|----------|-----|-----|-----|-----|-----|-----|-----|-----|
| Login | ✓ |     |     | Invalid credentials | | | | |
| Register |     | ✓ |     | Invalid email/pass | | | | |
| Create Workspace |     | ✓ |     | Invalid data | Unauthorized | Forbidden | | |
| Get Workspace | ✓ |     |     | | Unauthorized | No access | Not found | |
| Update Workspace | ✓ |     |     | Invalid data | Unauthorized | No access | Not found | |
| Delete Workspace |     |     | ✓ | | Unauthorized | No access | Not found | |
| Logout | ✓ |     |     | | Unauthorized | | | |

---

## Notes & Tips

1. **Set Credentials Before Run:**
   - Update `userAccount` and `userPassword` in **AL-TASK Workspace** environment
   - Or use `testEmail`/`testPassword` from **AL-TASK Auth**

2. **Token Expiry:**
   - Access tokens auto-captured from login responses
   - Use **Refresh Token** request to get new tokens before expiry

3. **Reset Password Flow:**
   - **Request Password Reset** → Email sent
   - **Verify OTP** → Get resetToken
   - **Reset Password with Token** → New password set

4. **Workspace Member Management:**
   - Add member with email → captures userId automatically
   - Update role by userId
   - Remove by userId

5. **Run Collections:**
   - Postman app: Collections → Select → Run Collection
   - Use environment dropdown to switch between Auth/Workspace
   - Tests auto-validate each response

6. **API Base URL:**
   - Default: `http://localhost:5512`
   - Update in environment if backend runs elsewhere

---

## File Locations

```
postman/
├── collections/
│   ├── Workspace API/
│   │   ├── 01_Login - Save Tokens.request.yaml
│   │   ├── 02_Create Workspace.request.yaml
│   │   ├── 03_Get My Workspaces.request.yaml
│   │   ├── 04_Get For You Workspaces.request.yaml
│   │   ├── 05_Get Workspace By ID.request.yaml
│   │   ├── 06_Get Workspace Members.request.yaml
│   │   ├── 07_Add Workspace Member.request.yaml
│   │   ├── 08_Update Workspace Member Role.request.yaml
│   │   ├── 09_Remove Workspace Member.request.yaml
│   │   ├── 10_Update Workspace.request.yaml
│   │   ├── 11_Archive Workspace.request.yaml
│   │   └── 12_Delete Workspace.request.yaml
│   └── AL-TASK Auth API/
│       ├── 01_Check Email.request.yaml
│       ├── 02_Register.request.yaml
│       ├── Login - User.request.yaml
│       ├── Login - Admin.request.yaml
│       ├── 04_Get Profile.request.yaml
│       ├── 05_Get Permissions.request.yaml
│       ├── 06_Get All Users.request.yaml
│       ├── 07_Update Profile.request.yaml
│       ├── 08_Refresh Token.request.yaml
│       ├── 09_Request Password Reset.request.yaml
│       ├── 10_Verify OTP.request.yaml
│       ├── 11_Reset Password with OTP.request.yaml
│       ├── 12_Reset Password with Token.request.yaml
│       ├── 14_Google OAuth.request.yaml
│       └── 15_Logout.request.yaml
├── environments/
│   ├── AL-TASK Auth.environment.yaml
│   └── AL-TASK Workspace.environment.yaml
├── push_to_postman.js
└── POSTMAN_COLLECTION_SUMMARY.md (this file)
```

---

## References

- **Postman Workspace:** Quan Pham's Workspace
- **Backend API Base:** `http://localhost:5512`
- **Frontend Base:** `http://localhost:3000`
