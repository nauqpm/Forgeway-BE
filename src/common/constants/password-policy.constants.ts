export const PASSWORD_POLICY = {
  noWhitespacePattern: /^\S+$/,
  noWhitespaceMessage: 'Passwords must not contain spaces.',
  pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/,
  message:
    'Passwords must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.',
} as const;
