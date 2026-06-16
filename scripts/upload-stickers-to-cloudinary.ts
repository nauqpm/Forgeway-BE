import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import * as path from 'path';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function isAnimatedWebp(buffer: Buffer): boolean {
  const data = buffer.toString('binary');
  return data.includes('ANIM') || data.includes('ANMF');
}

function isAnimatedImage(filePath: string, buffer: Buffer): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.gif') return true;
  if (ext === '.webp') {
    return isAnimatedWebp(buffer);
  }
  return false;
}

function formatPackName(folderName: string): string {
  return folderName
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function uploadToCloudinary() {
  const stickersDir = path.join(__dirname, '../stickers');
  if (!fs.existsSync(stickersDir)) {
    fs.mkdirSync(stickersDir, { recursive: true });
    console.log(`\n📂 Created folder "stickers" at: ${stickersDir}`);
    console.log('👉 Please put your sticker pack subfolders there (e.g. stickers/quby_pack/).');
    return;
  }

  const packFolders = fs
    .readdirSync(stickersDir)
    .filter((file) => fs.statSync(path.join(stickersDir, file)).isDirectory());

  if (packFolders.length === 0) {
    console.log(`\n📂 Folder "stickers" is empty.`);
    console.log('👉 Please place a subdirectory for your pack (e.g. stickers/quby_pack/) containing images.');
    return;
  }

  console.log(`Scanning local folder... Found ${packFolders.length} packs to upload.`);
  const metadataList: any[] = [];

  for (const folder of packFolders) {
    const packKey = folder.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const packName = formatPackName(folder);
    const folderPath = path.join(stickersDir, folder);

    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const files = fs
      .readdirSync(folderPath)
      .filter((file) => allowedExtensions.includes(path.extname(file).toLowerCase()) && fs.statSync(path.join(folderPath, file)).isFile());

    if (files.length === 0) {
      console.log(`⚠️ Folder "${folder}" contains no valid images. Skipping.`);
      continue;
    }

    console.log(`\n📦 Uploading pack: ${packName} (${files.length} files)...`);

    // Determine banner: look for banner.png/webp/etc, otherwise use the first file
    let bannerFile = files.find((f) => path.basename(f, path.extname(f)).toLowerCase() === 'banner');
    if (!bannerFile) {
      bannerFile = files[0];
    }

    const stickerFiles = files.filter((f) => f !== bannerFile);

    // Upload banner
    const bannerPath = path.join(folderPath, bannerFile);
    console.log(`Uploading banner (${bannerFile})...`);
    const bannerUploadResult = await cloudinary.uploader.upload(bannerPath, {
      folder: `sdlc-platform/stickers/${packKey}`,
      public_id: 'banner',
      overwrite: true,
      resource_type: 'image',
    });

    const bannerUrl = bannerUploadResult.secure_url;
    const stickersMetadata: any[] = [];

    // Upload sticker files
    let index = 1;
    for (const file of stickerFiles) {
      const filePath = path.join(folderPath, file);
      const fileBuffer = fs.readFileSync(filePath);
      const isAnimated = isAnimatedImage(filePath, fileBuffer);
      const fileNameOnly = path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const stickerCode = `${packKey}_${fileNameOnly}`;

      console.log(`[${index}/${stickerFiles.length}] Uploading sticker: ${file} (Animated: ${isAnimated})...`);

      const uploadResult = await cloudinary.uploader.upload(filePath, {
        folder: `sdlc-platform/stickers/${packKey}`,
        public_id: fileNameOnly,
        overwrite: true,
        resource_type: 'image',
      });

      stickersMetadata.push({
        code: stickerCode,
        url: uploadResult.secure_url,
        isAnimated,
        width: uploadResult.width || 120,
        height: uploadResult.height || 120,
      });

      index++;
    }

    metadataList.push({
      key: packKey,
      name: packName,
      bannerUrl,
      stickers: stickersMetadata,
    });
  }

  // Save generated metadata list to JSON file
  const metadataPath = path.join(__dirname, '../stickers/stickers-metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadataList, null, 2), 'utf-8');
  console.log(`\n🎉 Cloudinary Upload Completed! Metadata saved to: ${metadataPath}`);
}

uploadToCloudinary().catch((err) => {
  console.error('❌ Cloudinary Upload Failed:', err);
  process.exitCode = 1;
});
