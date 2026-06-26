import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentsController } from './controllers/documents.controller';
import { DocumentsService } from './services/documents.service';
import { DocumentAccessService } from './services/document-access.service';
import { DocumentStorageService } from './services/document-storage.service';
import { DocumentSanitizerService } from './services/document-sanitizer.service';
import { DocumentVersionService } from './services/document-version.service';
import { DocumentConversionService } from './services/document-conversion.service';
import { DocumentEntity, DocumentSchema } from './schemas/document.schema';
import {
  DocumentVersionEntity,
  DocumentVersionSchema,
} from './schemas/document-version.schema';
import {
  Workspace,
  WorkspaceSchema,
} from '../workspaces/schemas/workspace.schema';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentEntity.name, schema: DocumentSchema },
      { name: DocumentVersionEntity.name, schema: DocumentVersionSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
    forwardRef(() => AuthModule),
    CloudinaryModule,
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentAccessService,
    DocumentStorageService,
    DocumentSanitizerService,
    DocumentVersionService,
    DocumentConversionService,
    JwtAuthGuard,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
