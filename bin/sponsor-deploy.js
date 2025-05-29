import fs from 'fs';
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

    // Upload to sponsor server
    const responseData = await uploadToSponsorServer(serverUrl, signatureData, filesToUploadFiltered, poolType, eventPoolId, showProgress);
    const { poolType: returnedPoolType, uploadedFiles, poolName, remainingBalance, equivalentFileSize } = responseData;
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

    // Validate projectWallet before uploading manifest
    //console.log('projectWallet:', JSON.stringify(projectWallet, null, 2));
    //if (!projectWallet || (typeof projectWallet === 'object' && (!projectWallet.n || !projectWallet.d))) {
     // throw new Error('Invalid projectWallet: missing required Arweave JWK fields (n, d)');
    //}

    // Upload manifest to Arweave using projectWallet
    const manifestId = await uploadManifest(projectWallet, manifestData, poolType, network, showProgress);
    manifest.lastManifestId = manifestId;

    console.log(`${colors.fg.green}✓ Sponsored deployment completed with manifest ID: ${manifestId}${colors.reset}`);
    if (poolType === 'event' && poolName) {
      console.log(`${colors.fg.cyan}${poolName}${colors.reset}`);
      console.log(`${colors.fg.cyan}Remaining Pool Balance: ${remainingBalance} Turbo Credits${colors.reset}`);
      console.log(`${colors.fg.cyan}Equivalent File Size: ${Math.round(equivalentFileSize / (1024 * 1024))} MB${colors.reset}`);
    }

    return { manifestId, manifest, poolType };
  } catch (error) {
    console.error(`${colors.fg.red}Sponsor deployment failed: ${error.message}${colors.reset}`);
    throw error;
  }
}