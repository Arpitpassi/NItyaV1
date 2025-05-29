import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { uploadManifest as sharedUploadManifest } from './manifest-utils.js';

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  fg: {
    red: "\x1b[31m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    white: "\x1b[37m"
  },
  bg: {
    blue: "\x1b[44m"
  }
};

export function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export async function checkSponsorServer(url = 'http://localhost:8080') {
  const maxRetries = 3;
  let attempt = 1;

  while (attempt <= maxRetries) {
    try {
      console.log(`${colors.fg.blue}Checking sponsor server (Attempt ${attempt}) at ${url}/health${colors.reset}`);
      const headers = {
        'X-API-Key': 'deploy-api-key-123'
      };

      const response = await axios.get(`${url}/health`, {
        timeout: 5000,
        headers
      });
      console.log(`${colors.fg.green}✓ Sponsor server responded with status ${response.status}${colors.reset}`);
      return true;
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.error || error.message;
      console.error(`${colors.fg.red}✗ Attempt ${attempt} failed: ${status ? `Status ${status}: ${message}` : error.message}${colors.reset}`);
      if (attempt === maxRetries) {
        throw new Error(`Sponsor server check failed after ${maxRetries} attempts: ${status ? `Status ${status}: ${message}` : error.message}`);
      }
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
}

export async function uploadToSponsorServer(serverUrl, signatureData, filesToUploadFiltered, poolType, eventPoolId, showProgress) {
  try {
    console.log(`${colors.fg.blue}Uploading to sponsor server...${colors.reset}`);
    const zipPath = path.join(process.cwd(), 'deploy.zip');
    fs.writeFileSync(zipPath, signatureData.zipBuffer);

    const fileMetadata = filesToUploadFiltered.map(file => ({
      relativePath: file.relativePath,
      hash: file.hash,
      contentType: getContentType(file.relativePath)
    }));

    const form = new FormData();
    form.append('zip', fs.createReadStream(zipPath));
    form.append('poolType', poolType);
    form.append('fileMetadata', JSON.stringify(fileMetadata));
    form.append('zipHash', signatureData.hash);
    form.append('signature', signatureData.signature);
    form.append('publicKey', signatureData.publicKey);
    form.append('walletAddress', signatureData.walletAddress);
    if (poolType === 'event') {
      form.append('eventPoolId', eventPoolId);
    }

    const API_KEY = 'deploy-api-key-123';
    const headers = {
      ...form.getHeaders(),
      'X-API-Key': API_KEY
    };

    let uploadProgress = 0;
    const progressInterval = setInterval(() => {
      uploadProgress += 0.05;
      if (uploadProgress > 0.95) {
        uploadProgress = 0.95;
        clearInterval(progressInterval);
      }
      showProgress("Uploading to sponsor server", uploadProgress);
    }, 300);

    let response;
    const maxRetries = 3;
    let attempt = 1;

    while (attempt <= maxRetries) {
      try {
        response = await axios.post(`${serverUrl}/upload`, form, {
          headers,
          timeout: 60000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        });
        break;
      } catch (error) {
        const status = error.response?.status;
        const message = error.response?.data?.error || error.message;
        console.error(`${colors.fg.red}✗ Upload attempt ${attempt} failed: ${status ? `Status ${status}: ${message}` : error.message}${colors.reset}`);
        if (attempt === maxRetries) {
          throw new Error(`Upload failed after ${maxRetries} attempts: ${status ? `Status ${status}: ${message}` : error.message}`);
        }
        attempt++;
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }

    clearInterval(progressInterval);
    showProgress("Uploading to sponsor server", 1);

    fs.unlinkSync(zipPath);
    return response.data;
  } catch (error) {
    if (fs.existsSync(path.join(process.cwd(), 'deploy.zip'))) {
      fs.unlinkSync(path.join(process.cwd(), 'deploy.zip'));
    }
    throw error;
  }
}

// Updated uploadManifest function that delegates to the shared utility
export async function uploadManifest(walletKey, manifestData, poolType, network = 'arweave', showProgress = null) {
  return await sharedUploadManifest(walletKey, manifestData, poolType, network, showProgress);
}