import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Attachment, AttachmentDocument } from '../src/modules/attachments/schemas/attachment.schema';
import { DocumentEntity, DocumentDoc } from '../src/modules/documents/schemas/document.schema';
import { Image, ImageDocument } from '../src/modules/images/schemas/image.schema';
import { CloudinaryService } from '../src/modules/cloudinary/cloudinary.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`=== START MIGRATION ===`);
  console.log(`Dry Run Mode: ${dryRun ? 'ENABLED' : 'DISABLED'}`);

  const app = await NestFactory.createApplicationContext(AppModule);
  const cloudinaryService = app.get(CloudinaryService);

  const attachmentModel = app.get<Model<AttachmentDocument>>(getModelToken(Attachment.name));
  const documentModel = app.get<Model<DocumentDoc>>(getModelToken(DocumentEntity.name));
  const imageModel = app.get<Model<ImageDocument>>(getModelToken(Image.name));

  // -------------------------------------------------------------
  // 1. Migrate Attachments
  // -------------------------------------------------------------
  console.log(`\n--- Migrating Task/Page Attachments ---`);
  const localAttachments = await attachmentModel.find({
    url: { $regex: /^\/uploads\// },
    isDeleted: { $ne: true }
  }).exec();

  console.log(`Found ${localAttachments.length} local attachments to migrate.`);

  for (const att of localAttachments) {
    const relativePath = att.url?.replace(/^\//, ''); // e.g. "uploads/tasks/..."
    if (!relativePath) continue;

    const filePath = path.resolve(process.cwd(), relativePath);

    if (!fs.existsSync(filePath)) {
      console.warn(`[File Lost] Attachment ${att._id} (${att.originalName}) at path ${filePath} does not exist.`);
      if (!dryRun) {
        att.url = '';
        att.migrationStatus = 'file_lost';
        await att.save();
      }
      continue;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      const multerFile = {
        buffer,
        originalname: att.originalName,
        mimetype: att.mimeType,
        size: att.size || buffer.length,
      } as Express.Multer.File;

      const folder = `attachments/${att.targetType}/${att.workspaceId?.toString() || 'general'}`;
      console.log(`Uploading attachment ${att._id} (${att.originalName}) to Cloudinary folder: ${folder}...`);

      if (!dryRun) {
        const result = await cloudinaryService.uploadFile(multerFile, folder);
        att.url = result.url;
        att.storageKey = result.publicId;
        att.cloudinaryPublicId = result.publicId;
        att.migrationStatus = 'migrated';
        await att.save();
        console.log(`[Migrated] Attachment ${att._id} -> ${result.url}`);
      }
    } catch (err) {
      console.error(`[Error] Failed to migrate attachment ${att._id}:`, err);
    }
  }

  // -------------------------------------------------------------
  // 2. Migrate Documents
  // -------------------------------------------------------------
  console.log(`\n--- Migrating Documents ---`);
  const localDocs = await documentModel.find({
    $and: [
      { storagePath: { $not: /^https:\/\/res\.cloudinary\.com/ } },
      { storagePath: { $ne: 'db:inline' } },
      { deletedAt: null }
    ]
  }).exec();

  console.log(`Found ${localDocs.length} local documents to migrate.`);

  for (const doc of localDocs) {
    let filePath = doc.storagePath;
    if (!path.isAbsolute(filePath)) {
      filePath = path.resolve(process.cwd(), filePath);
    }

    if (!fs.existsSync(filePath)) {
      console.warn(`[File Lost] Document ${doc._id} (${doc.name}) at path ${filePath} does not exist.`);
      if (!dryRun) {
        doc.migrationStatus = 'file_lost';
        await doc.save();
      }
      continue;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      const multerFile = {
        buffer,
        originalname: doc.originalName || doc.name,
        mimetype: doc.mimeType,
        size: doc.size || buffer.length,
      } as Express.Multer.File;

      const isImage = ['.png', '.jpg', '.jpeg', '.webp'].includes(doc.extension);
      const isOnline = doc.documentType === 'online';

      console.log(`Uploading document ${doc._id} (${doc.name}, type: ${doc.documentType}) to Cloudinary...`);

      if (!dryRun) {
        const result = await cloudinaryService.uploadFile(multerFile, 'documents', {
          resourceType: isOnline ? 'raw' : (isImage ? 'image' : 'raw')
        });

        doc.storagePath = result.url;
        doc.cloudinaryPublicId = result.publicId;
        doc.migrationStatus = 'migrated';
        await doc.save();
        console.log(`[Migrated] Document ${doc._id} -> ${result.url}`);
      }
    } catch (err) {
      console.error(`[Error] Failed to migrate document ${doc._id}:`, err);
    }
  }

  // -------------------------------------------------------------
  // 3. Migrate Images
  // -------------------------------------------------------------
  console.log(`\n--- Migrating Images ---`);
  const localImages = await imageModel.find({
    url: { $regex: /^\/uploads\// }
  }).exec();

  console.log(`Found ${localImages.length} local images to migrate.`);

  for (const img of localImages) {
    const relativePath = img.url?.replace(/^\//, '');
    if (!relativePath) continue;

    const filePath = path.resolve(process.cwd(), relativePath);

    if (!fs.existsSync(filePath)) {
      console.warn(`[File Lost] Image ${img._id} (${img.originalName}) at path ${filePath} does not exist.`);
      if (!dryRun) {
        img.url = '';
        img.migrationStatus = 'file_lost';
        await img.save();
      }
      continue;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      const multerFile = {
        buffer,
        originalname: img.originalName,
        mimetype: img.mimeType,
        size: img.size || buffer.length,
      } as Express.Multer.File;

      const isAvatar = img.type === 'avatar';
      const folder = isAvatar ? 'avatars' : 'images';
      console.log(`Uploading image ${img._id} (${img.originalName}) to Cloudinary folder: ${folder}...`);

      if (!dryRun) {
        const result = await cloudinaryService.uploadFile(multerFile, folder);
        img.url = result.url;
        img.cloudinaryPublicId = result.publicId;
        img.migrationStatus = 'migrated';
        await img.save();
        console.log(`[Migrated] Image ${img._id} -> ${result.url}`);
      }
    } catch (err) {
      console.error(`[Error] Failed to migrate image ${img._id}:`, err);
    }
  }

  console.log(`\n=== MIGRATION COMPLETE ===`);
  await app.close();
}

bootstrap().catch(console.error);
