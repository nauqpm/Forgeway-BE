import { PasswordService } from './password.service';

describe('PasswordService native bcrypt compatibility', () => {
  const service = new PasswordService();

  it('accepts an existing bcrypt 2a password hash after the native dependency upgrade', async () => {
    const legacyHash =
      '$2a$10$XOPbrlUPQdwdJUpSrIF6X.LbE14qsMmKGhM1A8W9iqaG3vv1BD7WC';

    await expect(
      service.verifyPassword('envy1362987212538', legacyHash),
    ).resolves.toBe(true);
    await expect(
      service.verifyPassword('wrong-password', legacyHash),
    ).resolves.toBe(false);
  });

  it('creates a native hash that accepts only the correct password', async () => {
    const password = 'Compatibility-test-only';
    const hash = await service.hashPassword(password);

    expect(hash).not.toBe(password);
    await expect(service.verifyPassword(password, hash)).resolves.toBe(true);
    await expect(service.verifyPassword('wrong-password', hash)).resolves.toBe(
      false,
    );
  });
});
