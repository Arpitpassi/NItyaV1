import fs from 'fs';
import { execSync } from 'child_process'; // Added for getCommitHash
import { loadProjectWallet } from './wallet.js';
import { zipFolder } from './zipper.js';
import { signZipBuffer } from './signer.js';
import { checkSponsorServer, uploadToSponsorServer, uploadManifest, getContentType } from './uploader.js';

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

// Retrieve current Git commit hash
function getCommitHash() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.warn(`${colors.fg.yellow}Warning: Could not retrieve commit hash. Using "unknown".${colors.reset}`);
    return 'unknown';
  }
}

export async function deployWithSponsor(deployFolder, serverUrl, manifest, filesToUpload, showProgress, walletKey, network = 'arweave', eventPoolId = '') {
  try {
    // Verify sponsor server availability
    const sponsorServerAvailable = await checkSponsorServer(serverUrl);
    if (!sponsorServerAvailable) {
      throw new Error('Sponsor server not available');
    }
    console.log(`${colors.fg.green}✓ Sponsor server available at ${serverUrl}${colors.reset}`);

    // Load project wallet for signing, using walletKey as path if it’s a file
    let walletPath = null;
    if (walletKey && fs.existsSync(walletKey)) {
      walletPath = walletKey;
      console.log(`Using wallet path from walletKey: ${walletPath}`);
    }
    const { walletData: projectWallet, walletPath: resolvedWalletPath } = await loadProjectWallet(walletPath);
    console.log(`${colors.fg.green}✓ Project wallet loaded for signing from ${resolvedWalletPath}${colors.reset}`);

    // Determine pool type based on eventPoolId
    const poolType = eventPoolId ? 'event' : 'community';
    console.log(`${colors.fg.cyan}● Using pool type: ${poolType}${colors.reset}`);

    // Check for changed or new files
    const filesToUploadFiltered = [];
    let skippedCount = 0;
    const normalizedManifestFiles = {};
    for (const [relativePath, data] of Object.entries(manifest.files)) {
      const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
      normalizedManifestFiles[normalizedPath] = data;
    }

    console.log(`${colors.fg.blue}Checking files for changes:${colors.reset}`);
    for (const file of filesToUpload) {
      const relativePath = file.path.replace(/\\/g, '/').replace(/^\.\//, '');
      const existingFile = normalizedManifestFiles[relativePath];
      if (existingFile && existingFile.hash === file.hash) {
        console.log(`${colors.fg.cyan}✓ Reusing existing file: ${relativePath} (txId: ${existingFile.txId}, hash: ${file.hash})${colors.reset}`);
        skippedCount++;
      } else {
        console.log(`${colors.fg.yellow}● Changed or new file: ${relativePath} (hash: ${file.hash})${colors.reset}`);
        filesToUploadFiltered.push({ ...file, relativePath });
      }
    }

    console.log(`${colors.fg.blue}Summary: ${skippedCount} files reused, ${filesToUploadFiltered.length} files to upload${colors.reset}`);

    if (filesToUploadFiltered.length === 0) {
      console.log(`${colors.fg.green}No new or changed files to upload. Using existing manifest.${colors.reset}`);
      return { manifestId: manifest.lastManifestId, manifest, poolType };
    }

    // Create ZIP file and sign it
    console.log(`${colors.fg.blue}Preparing deployment package...${colors.reset}`);
    showProgress("Zipping and signing files", 0);
    const zipBuffer = await zipFolder(deployFolder);
    const signatureData = await signZipBuffer(projectWallet, zipBuffer);
    showProgress("Zipping and signing files", 1);

    // Validate signatureData
    if (!signatureData || !signatureData.hash || !signatureData.signature || !signatureData.publicKey || !signatureData.walletAddress) {
      throw new Error('Invalid signature data: missing required fields (hash, signature, publicKey, or walletAddress)');
    }

    signatureData.zipBuffer = zipBuffer;

    // Upload to sponsor server with enhanced error handling
    const nonRetryableErrors = [
      'POOL_NOT_ACTIVE',
      'WALLET_NOT_WHITELISTED',
      'USAGE_CAP_EXCEEDED',
      'INVALID_POOL_ID',
      'MISSING_POOL_ID',
      'WALLET_ADDRESS_MISMATCH',
      'INVALID_SIGNATURE',
      'HASH_MISMATCH',
      'NO_ZIP_FILE',
      'TOTAL_SIZE_EXCEEDED',
      'INVALID_FILE_TYPE',
      'FILE_NOT_FOUND_IN_ZIP'
    ];

    const responseData = await uploadToSponsorServer(serverUrl, signatureData, filesToUploadFiltered, poolType, eventPoolId, showProgress, nonRetryableErrors);
    const { poolType: returnedPoolType, uploadedFiles, poolName } = responseData;
    console.log(`${colors.fg.green}✓ Files uploaded successfully${colors.reset}`);

    // Initialize manifest data
    const manifestData = {
      manifest: 'arweave/paths',
      version: '0.1.0',
      index: { path: 'index.html' },
      fallback: { id: normalizedManifestFiles['404.html']?.txId || '' },
      paths: {}
    };

    for (const [relativePath, data] of Object.entries(normalizedManifestFiles)) {
      manifestData.paths[relativePath] = { id: data.txId };
    }

    for (const file of uploadedFiles) {
      manifestData.paths[file.relativePath] = { id: file.txId };
      manifest.files[file.relativePath] = {
        txId: file.txId,
        hash: file.hash,
        lastModified: file.lastModified
      };
    }

    // Upload manifest with additional tags
    const manifestId = await uploadManifest(projectWallet, manifestData, poolType, network, showProgress);
    manifest.lastManifestId = manifestId;

    console.log(`${colors.fg.green}✓ Sponsored deployment completed with manifest ID: ${manifestId}${colors.reset}`);
    if (poolType === 'event' && poolName) {
      console.log(`${colors.fg.cyan}${poolName}${colors.reset}`);
        }

    return { manifestId, manifest, poolType };
  } catch (error) {
    if (error.response && error.response.data && error.response.data.code) {
      const { code, message } = error.response.data;
      switch (code) {
        case 'POOL_NOT_ACTIVE':
          console.error(`${colors.fg.red}✗ Deployment failed: The specified pool is not currently active. Please check the pool's active period or contact the pool administrator.${colors.reset}`);
          break;
        case 'WALLET_NOT_WHITELISTED':
          console.error(`${colors.fg.red}✗ Deployment failed: Your wallet is not authorized to use this pool. Ensure your wallet is whitelisted or select a different pool.${colors.reset}`);
          break;
        case 'USAGE_CAP_EXCEEDED':
          console.error(`${colors.fg.red}✗ Deployment failed: You have reached the usage limit for this pool. Consider using a different pool or contact the administrator.${colors.reset}`);
          break;
        case 'INVALID_POOL_ID':
          console.error(`${colors.fg.red}✗ Deployment failed: The specified pool ID is invalid. Please provide a valid pool ID.${colors.reset}`);
          break;
        case 'MISSING_POOL_ID':
          console.error(`${colors.fg.red}✗ Deployment failed: Event pool requires a valid pool ID. Please provide one.${colors.reset}`);
          break;
        case 'WALLET_ADDRESS_MISMATCH':
          console.error(`${colors.fg.red}✗ Deployment failed: The provided wallet address does not match the signature. Please verify your wallet details.${colors.reset}`);
          break;
        case 'INVALID_SIGNATURE':
          console.error(`${colors.fg.red}✗ Deployment failed: The provided signature is invalid. Please ensure the correct wallet and data are used.${colors.reset}`);
          break;
        case 'HASH_MISMATCH':
          console.error(`${colors.fg.red}✗ Deployment failed: The provided ZIP file hash does not match the uploaded file. Please verify the file integrity.${colors.reset}`);
          break;
        case 'NO_ZIP_FILE':
          console.error(`${colors.fg.red}✗ Deployment failed: No ZIP file was provided in the upload request.${colors.reset}`);
          break;
        case 'TOTAL_SIZE_EXCEEDED':
          console.error(`${colors.fg.red}✗ Deployment failed: The total file size exceeds the allowed limit of 50 MB.${colors.reset}`);
          break;
        case 'INVALID_FILE_TYPE':
          console.error(`${colors.fg.red}✗ Deployment failed: One or more files have an invalid file type. Only specific file extensions are allowed.${colors.reset}`);
          break;
        case 'FILE_NOT_FOUND_IN_ZIP':
          console.error(`${colors.fg.red}✗ Deployment failed: One or more files listed in metadata were not found in the ZIP file.${colors.reset}`);
          break;
        default:
          console.error(`${colors.fg.red}✗ Deployment failed: ${message} (Code: ${code})${colors.reset}`);
      }
    } else {
      console.error(`${colors.fg.red}✗ Deployment failed: ${error.message}${colors.reset}`);
    }
    const zipPath = 'deploy.zip';
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
      console.log(`${colors.fg.cyan}Cleaned up temporary ZIP file: ${zipPath}${colors.reset}`);
    }
    throw error;
  }
}