import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Page, PageDocument } from '../src/modules/pages/schemas/page.schema';
import * as Y from 'yjs';

async function run() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isRollback = args.includes('--rollback');

  console.log(`Starting migration script...`);
  console.log(`Dry-run: ${isDryRun}, Rollback: ${isRollback}`);

  const app = await NestFactory.createApplicationContext(AppModule);
  const pageModel = app.get<Model<PageDocument>>(getModelToken(Page.name));

  try {
    const pages = await pageModel.find().exec();
    console.log(`Found ${pages.length} pages to process.`);

    let successCount = 0;
    let failCount = 0;

    for (const page of pages) {
      try {
        console.log(`Processing page: ${page.title} (ID: ${page._id}, Slug: ${page.slug})`);

        if (isRollback) {
          if (!isDryRun) {
            await pageModel.updateOne(
              { _id: page._id },
              {
                $unset: {
                  yjsState: "",
                  contentJson: "",
                  plainTextSnapshot: "",
                },
              }
            );
          }
          console.log(`Rollback completed for page: ${page.title}`);
          successCount++;
          continue;
        }

        // Skip if already migrated
        if (page.yjsState && page.yjsState.length > 0) {
          console.log(`Page already has Yjs state. Skipping.`);
          successCount++;
          continue;
        }

        // Strip HTML tags for plain text
        const plainText = page.content ? page.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';

        // Create Yjs Doc and initialize title
        const ydoc = new Y.Doc();
        const yTitle = ydoc.getText('title');
        yTitle.insert(0, page.title || '');
        
        // Encode Yjs state as binary update
        const binaryState = Y.encodeStateAsUpdate(ydoc);
        const bufferState = Buffer.from(binaryState);

        if (!isDryRun) {
          await pageModel.updateOne(
            { _id: page._id },
            {
              $set: {
                yjsState: bufferState,
                plainTextSnapshot: plainText,
                contentJson: JSON.stringify({ type: 'doc', content: [] }), // Placeholder, client will populate on first load
              },
            }
          );
        }

        console.log(`Successfully migrated page: ${page.title}`);
        successCount++;
      } catch (err) {
        console.error(`Failed to process page ${page.title || page._id}:`, err);
        failCount++;
      }
    }

    console.log(`\nMigration Summary:`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failCount}`);
  } catch (error) {
    console.error(`Migration script crashed:`, error);
  } finally {
    await app.close();
    process.exit(0);
  }
}

run();
