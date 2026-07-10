import { DocumentsService } from './documents.service';

describe('DocumentsService.deleteMine', () => {
  it('succeeds after soft-deleting when storage cleanup fails', async () => {
    const documentModel = { updateOne: jest.fn().mockResolvedValue({}) };
    const storageService = {
      deleteFile: jest.fn().mockRejectedValue(new Error('storage unavailable')),
    };
    const service = new DocumentsService(
      documentModel as any,
      {
        getMineById: jest.fn().mockResolvedValue({
          _id: 'document-id',
          cloudinaryPublicId: 'file-id',
          storagePath: 'path',
        }),
      } as any,
      storageService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.deleteMine('user-id', 'document-id')).resolves.toEqual(
      { success: true },
    );
    expect(documentModel.updateOne).toHaveBeenCalledWith(
      { _id: 'document-id' },
      { $set: { deletedAt: expect.any(Date) } },
    );
  });
});
