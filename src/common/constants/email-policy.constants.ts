export const EMAIL_POLICY = {
  // Pattern cho email hợp lệ: chỉ cho phép alphanumeric, dots, hyphens, underscores trước @
  // Format: localpart@domain.extension
  pattern: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  message: 'Invalid email address.',

  noWhitespacePattern: /^\S+$/,
  noWhitespaceMessage: 'Email không được chứa khoảng trắng.',
} as const;
