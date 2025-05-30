import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { uploadManifest as sharedUploadManifest } from './manifest-utils.js';

async function checkSponsorServer(serverUrl) {
  try {
    const response = await axios.get(`${serverUrl}/health`, { timeout: 5000 });
    return response.status === 200 && response.data.status === 'ok';
  } catch (error) {
    console.error(`Failed to connect to sponsor server: ${error.message}`);
    return false;
  }
}

function getContentType(filePath) {
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

async function uploadToSponsorServer(serverUrl, signatureData, filesToUploadFiltered, poolType, eventPoolId, showProgress, nonRetryableErrors) {
  try {
    console.log('Uploading to sponsor server...');
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

    const maxRetries = 3;
    let attempt = 1;
    let response;

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
        if (error.response && error.response.data && error.response.data.code) {
          const { code, message } = error.response.data;
          console.error(`✗ Upload attempt ${attempt} failed: ${message} (Code: ${code})`);
          if (nonRetryableErrors.includes(code)) {
            throw new Error(`${message} (Code: ${code})`);
          }
        } else {
          const status = error.response?.status;
          const message = error.response?.data?.error || error.message;
          console.error(`✗ Upload attempt ${attempt} failed: ${status ? `Status ${status}: ${message}` : error.message}`);
        }
        if (attempt === maxRetries) {
          throw new Error(`Upload failed after ${maxRetries} attempts: ${error.response?.data?.error || error.message}`);
        }
        attempt++;
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }

    clearInterval(progressInterval);
    showProgress("Uploading to sponsor server", 1);

    fs.unlinkSync(zipPath);
    console.log(`Cleaned up temporary ZIP file: ${zipPath}`);
    return response.data;
  } catch (error) {
    const zipPath = path.join(process.cwd(), 'deploy.zip');
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
      console.log(`Cleaned up temporary ZIP file: ${zipPath}`);
    }
    throw error;
  }
}

async function uploadManifest(wallet, manifestData, poolType, network, showProgress = []) {
  showProgress("Uploading manifest", 0);
  try {
    const manifestId = await sharedUploadManifest(
      wallet,
      manifestData,
      poolType,
      network,
      (message, progress) => showProgress(message, progress),
    );
    showProgress("Uploading manifest", 1);
    return manifestId;
  } catch (error) {
    console.error(`Failed to upload manifest: ${error.message}`);
    throw error;
  }
}

export { checkSponsorServer, getContentType, uploadToSponsorServer, uploadManifest };