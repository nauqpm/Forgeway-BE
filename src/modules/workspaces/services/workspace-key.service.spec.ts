import { WorkspaceKeyService } from './workspace-key.service';

describe('WorkspaceKeyService', () => {
  const createRepository = (existingKeys: string[] = []) => ({
    findAnyBySlug: jest.fn(),
    findAnyByKey: jest.fn((key: string) =>
      existingKeys.includes(key)
        ? { _id: { toString: () => `workspace-${key}` } }
        : null,
    ),
  });

  it('should prefix numeric workspace names with a letter', async () => {
    const service = new WorkspaceKeyService(createRepository() as any);

    await expect(service.generateUniqueKey('123123123')).resolves.toBe(
      'W123123123',
    );
  });

  it('should fallback when workspace name has no key-safe characters', async () => {
    const service = new WorkspaceKeyService(createRepository() as any);

    await expect(service.generateUniqueKey('!!!')).resolves.toBe('WORKSPACE');
  });

  it('should keep generated duplicate keys within max length', async () => {
    const service = new WorkspaceKeyService(
      createRepository(['W123123123']) as any,
    );

    await expect(service.generateUniqueKey('123123123')).resolves.toBe(
      'W123123121',
    );
  });
});
