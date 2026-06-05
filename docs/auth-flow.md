# Auth Flow

Tai lieu nay tom tat luong Authentication hien tai cua backend va cac phan chinh da duoc cap nhat de frontend co the tich hop dung.

## Cac phan chinh da on dinh

- `POST /auth/register`: chi nhan `email` va `password`, role mac dinh la `user`.
- Admin tao qua seed script, khong tao qua register public.
- Password rule da chuan hoa manh hon.
- Global `ValidationPipe` da bat `whitelist`, `forbidNonWhitelisted`, `transform`.
- `POST /auth/login`: tra JWT token.
- `JwtAuthGuard`: verify JWT va check token con active trong database.
- `POST /auth/logout`: revoke dung token hien tai, khong logout tat ca thiet bi.
- `PUT /auth/update` va `PUT /users/me`: dung DTO profile, khong cho user tu update `role`.
- `GET /users/:id`: da khoa bang guard/role/permission.
- Password reset DTO da co validation.

## 1. Register

Endpoint:

```http
POST /auth/register
```

Body hop le:

```json
{
  "email": "user@example.com",
  "password": "StrongPass123"
}
```

Duong di:

```txt
auth.controller.ts -> RegisterDto -> auth.service.ts -> users.service.ts -> users.schema.ts
```

Chi tiet:

- `RegisterDto` chi cho phep `email` va `password`.
- `AuthService.register()` tu gan `role: 'user'` va `status: 'active'`.
- `UsersService.createUser()` hash password bang `bcrypt` truoc khi luu database.
- Neu client gui them field thua nhu `role`, global `ValidationPipe` se tra `400`.

## 2. Tao admin

Admin khong duoc tao qua public register.

Dung seed script:

```powershell
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_PASSWORD="StrongPassword123!"
$env:ADMIN_FULL_NAME="System Admin"
npm run seed:admin
```

Script doc `DB_CONNECTION_STRING` tu `.env`, tao hoac update account admin theo email duoc cau hinh.

## 3. Login

Endpoint:

```http
POST /auth/login
```

Body:

```json
{
  "email": "user@example.com",
  "password": "StrongPass123"
}
```

Duong di:

```txt
auth.controller.ts -> LoginDto -> auth.service.ts -> users.service.ts -> bcrypt -> JwtService -> token.schema.ts
```

Chi tiet:

- Tim user bang email.
- So sanh password bang `bcrypt.compare`.
- Tao JWT payload gom `userId`, `email`, `role`, `fullName`, `avatar`.
- Luu JWT vao collection `Token` voi `status: true`.
- Response tra token cho frontend.

Frontend gui token trong cac request protected:

```http
Authorization: Bearer <token>
```

## 4. Protected Request

Vi du:

```http
GET /auth/me
Authorization: Bearer <token>
```

Duong di:

```txt
Controller @UseGuards(JwtAuthGuard) -> jwt-auth.guard.ts -> JwtService.verify -> token.service.ts -> token.schema.ts -> controller handler
```

`JwtAuthGuard` kiem tra 2 lop:

1. JWT hop le va chua het han.
2. Token ton tai trong DB voi `status: true`.

Neu token da logout/revoked, guard se reject `401` du JWT van chua het han.

## 5. Logout

Endpoint:

```http
POST /auth/logout
Authorization: Bearer <token>
```

Duong di:

```txt
auth.controller.ts -> JwtAuthGuard -> auth.service.logout(token) -> token.schema.ts
```

Chi tiet:

- Route logout bat buoc qua `JwtAuthGuard`.
- Controller lay Bearer token hien tai tu header `Authorization`.
- `AuthService.logout(token)` update dung token hien tai:

```ts
await this.tokenModel.updateOne({ token }, { status: false });
```

Ket qua:

- Token vua logout khong dung lai duoc.
- Token khac cua cung user tren browser/thiet bi khac van con active.

## 6. Update Profile

Endpoint:

```http
PUT /auth/update
PUT /users/me
```

Hai endpoint nay dung DTO profile khong co field `role`.

Neu client gui:

```json
{
  "role": "admin"
}
```

backend se tra `400` vi `forbidNonWhitelisted` dang bat.

Route admin update user rieng van co DTO khac de phuc vu quan tri.

## 7. User Detail

Endpoint:

```http
GET /users/:id
```

Endpoint nay da duoc khoa bang:

```ts
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@RequirePermission('users', 'read')
@Roles('admin', 'manager', 'staff')
```

Nguoi dung public hoac user khong co quyen se khong xem duoc thong tin user theo id.

## 8. Password Reset

Endpoints:

```http
POST /auth/request-password-reset
POST /auth/verify-otp
```

DTO password reset da co validation:

- Email phai dung format.
- Reset method chi nhan `link` hoac `otp`.
- OTP phai dung 6 chu so.
- Password moi phai theo rule manh: it nhat 8 ky tu, co chu hoa, chu thuong va so.

## 9. ValidationPipe

Global validation trong `src/main.ts`:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

Tac dung:

- `whitelist`: chi chap nhan field co khai bao trong DTO.
- `forbidNonWhitelisted`: gui field thua thi tra `400`.
- `transform`: transform input theo DTO/type metadata khi co the.

## 10. Trang thai hien tai

Authentication hien tai da san sang de frontend tich hop cac flow chinh:

```txt
register -> login -> luu token -> goi API protected -> logout -> reset password
```

Phan tiep theo nen lam la Permission/RBAC audit:

- Kiem tra endpoint nao public co chu dich.
- Kiem tra endpoint nao can `JwtAuthGuard`, `RolesGuard`, `PermissionGuard`.
- Chuan hoa permission resource/action.
- Kiem tra route nao dang chi co auth nhung thieu authorization chi tiet.
