import fs from 'fs';
import archiver from 'archiver';

export async function zipFolder(folderPath) {
  try {
    console.log(`Zipping folder: ${folderPath}`);
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Folder not found at: ${folderPath}`);
    }

    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks = [];

      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => {
        const buffer = Buffer.concat(chunks);
        console.log(`✓ Folder zipped (${buffer.length} bytes)`);
        resolve(buffer);
      });
      archive.on('error', (err) => reject(new Error(`Failed to zip folder: ${err.message}`)));

      archive.directory(folderPath, false);
      archive.finalize();
    });
  } catch (error) {
    console.error(`Failed to zip folder: ${error.message}`);
    throw error;
  }
}