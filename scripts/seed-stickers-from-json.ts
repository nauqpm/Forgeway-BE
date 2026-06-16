import 'dotenv/config';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { StickerPack, StickerPackSchema } from '../src/modules/chat/schemas/sticker-pack.schema';
import { Sticker, StickerSchema } from '../src/modules/chat/schemas/sticker.schema';

async function seedFromJson() {
  const dbUri = process.env.DB_CONNECTION_STRING;
  if (!dbUri) {
    throw new Error('Missing DB_CONNECTION_STRING in .env');
  }

  const metadataPath = path.join(__dirname, '../stickers/stickers-metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error(`\n❌ Error: File "stickers-metadata.json" not found at: ${metadataPath}`);
    console.log('Please run "npm run upload:stickers:cloud" first to generate the metadata file.');
    return;
  }

  const fileData = fs.readFileSync(metadataPath, 'utf-8');
  const stickerPacks = JSON.parse(fileData);

  if (!Array.isArray(stickerPacks) || stickerPacks.length === 0) {
    console.log('\n❌ No sticker packs found in metadata file.');
    return;
  }

  console.log('Connecting to database...');
  await mongoose.connect(dbUri);

  const StickerPackModel = mongoose.model(StickerPack.name, StickerPackSchema);
  const StickerModel = mongoose.model(Sticker.name, StickerSchema);

  let totalPacksSeeded = 0;
  let totalStickersSeeded = 0;

  for (const packData of stickerPacks) {
    const { key, name, bannerUrl, stickers } = packData;
    console.log(`\n📦 Seeding pack: ${name}...`);

    // Upsert the StickerPack
    const pack = await StickerPackModel.findOneAndUpdate(
      { key },
      {
        $set: {
          key,
          name,
          bannerUrl,
          isActive: true,
          displayOrder: totalPacksSeeded + 1,
        },
      },
      { upsert: true, new: true },
    );

    // Clean old stickers of this pack and import new ones
    await StickerModel.deleteMany({ packId: pack._id });

    const stickersToInsert = stickers.map((s: any) => ({
      ...s,
      packId: pack._id,
    }));

    if (stickersToInsert.length > 0) {
      await StickerModel.insertMany(stickersToInsert);
      totalStickersSeeded += stickersToInsert.length;
    }
    totalPacksSeeded++;
    console.log(`✅ Seeded ${stickersToInsert.length} stickers for pack: ${name}`);
  }

  console.log(`\n🎉 Database Seeding Completed! Synced ${totalPacksSeeded} packs and ${totalStickersSeeded} stickers to MongoDB.`);
}

seedFromJson()
  .catch((err) => {
    console.error('❌ Database Seeding Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
