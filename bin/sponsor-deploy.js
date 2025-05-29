import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import readline from 'readline';
import crypto from 'crypto';
import archiver from 'archiver';
import { Readable } from 'stream';
import { TurboFactory, ArweaveSigner, EthereumSigner } from '@ardrive/turbo-sdk';

// Define ANSI colors for terminal output
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

// Create a ZIP file containing specified files
async function zipFiles(files, outPath) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(outPath);
    archive
      .on('error', err => reject(err))
      .pipe(stream);
    
    for (const file of files) {
      archive.file(file.fullPath, { name: file.relativePath });
    }
    
    stream.on('close', () => resolve());
    archive.finalize();
  });
}

// Prompt user for input
async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

// Prompt user to select pool type (community or event)
async function selectPoolType() {
  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ POOL SELECTION ════╗${colors.reset}`);
  console.log(`${colors.fg.cyan}Using community pool to deploy:${colors.reset}`);
  return { poolType: 'community' };
}

// Load sponsor configuration from .nitya/sponsor/config.json
function loadSponsorConfig() {
  const SPONSOR_DIR = path.join(process.env.HOME, '.nitya', 'sponsor');
  const CONFIG_PATH = path.join(SPONSOR_DIR, 'config.json');
  
  if (!fs.existsSync(CONFIG_PATH)) {
    console.warn(`${colors.fg.yellow}Sponsor configuration not found at ${CONFIG_PATH}. Proceeding with defaults.${colors.reset}`);
    return {};
  }
  
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (error) {
    console.error(`${colors.fg.red}Error reading sponsor config: ${error.message}${colors.reset}`);
    throw error;
  }
}

// Check if the sponsor server is available
async function checkSponsorServer(url = 'http://localhost:8080', eventPoolId = '') {
  const maxRetries = 3;
  let attempt = 1;

  while (attempt <= maxRetries) {
    try {
      console.log(`${colors.fg.blue}Checking sponsor server (Attempt ${attempt}) at ${url}/health${colors.reset}`);
      const headers = {
        'X-API-Key': 'deploy-api-key-123'
      };
      if (eventPoolId) {
        headers['X-Event-Pool-Id'] = eventPoolId;
      }

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

// Calculate SHA256 hash of a file
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

// Get all files in a directory with their hashes
function getAllFilesWithHashes(directoryPath) {
  const files = [];
  
  function walkDir(dir, relativePath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        walkDir(fullPath, relPath);
      } else {
        const hash = calculateFileHash(fullPath);
        files.push({
          path: relPath,
          fullPath,
          hash
        });
      }
    }
  }
  
  walkDir(directoryPath);
  return files;
}

// Determine Content-Type based on file extension
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

// Deploy files using a sponsor server
export async function deployWithSponsor(deployFolder, serverUrl, manifest, filesToUpload, showProgress, walletKey, network = 'arweave', eventPoolId = '') {
  try {
    // Verify sponsor server availability
    const sponsorServerAvailable = await checkSponsorServer(serverUrl, eventPoolId);
    if (!sponsorServerAvailable) {
      throw new Error('Sponsor server not available');
    }
    console.log(`${colors.fg.green}✓ Sponsor server available at ${serverUrl}${colors.reset}`);

    // Load sponsor configuration
    try {
      const sponsorConfig = loadSponsorConfig();
      console.log(`${colors.fg.green}✓ Sponsor configuration loaded${colors.reset}`);
    } catch (configError) {
      console.warn(`${colors.fg.yellow}Sponsor configuration not found, proceeding with defaults${colors.reset}`);
    }

    // Select pool type (community or event)
    let poolConfig;
    if (eventPoolId) {
      console.log(`${colors.fg.green}✓ Using provided event pool configuration${colors.reset}`);
      poolConfig = { poolType: 'event', eventPoolId };
    } else {
      poolConfig = await selectPoolType();
    }

    const filesToUploadFiltered = [];
    let skippedCount = 0;
    const normalizedManifestFiles = {};
    for (const [relativePath, data] of Object.entries(manifest.files)) {
      const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
      normalizedManifestFiles[normalizedPath] = data;
    }

    // Check for changed or new files
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
      return { manifestId: manifest.lastManifestId, manifest, poolType: poolConfig.poolType };
    }

    // Create ZIP file with changed/new files
    console.log(`${colors.fg.blue}Preparing deployment package...${colors.reset}`);
    const zipPath = path.join(process.cwd(), 'deploy.zip');
    showProgress("Zipping changed files", 0);
    await zipFiles(filesToUploadFiltered, zipPath);
    showProgress("Zipping changed files", 1);

    // Calculate SHA256 hash of the ZIP file
    const zipBuffer = fs.readFileSync(zipPath);
    const hashBuffer = crypto.createHash('sha256').update(zipBuffer).digest();
    const hashHex = hashBuffer.toString('hex');

    // Sign the hash using the project wallet
    let wallet;
    try {
      wallet = JSON.parse(walletKey);
      if (!wallet.n || !wallet.d) {
        throw new Error('Wallet key is not a valid Arweave JWK');
      }
    } catch (e) {
      throw new Error('Wallet key must be a valid Arweave JWK for signing');
    }
    const signer = new ArweaveSigner(wallet);
    const signature = await signer.sign(hashBuffer);
    const signatureBase64 = Buffer.from(signature).toString('base64');
    const publicKeyJwk = { kty: wallet.kty, e: wallet.e, n: wallet.n };

    // Prepare file metadata for server
    const fileMetadata = filesToUploadFiltered.map(file => ({
      relativePath: file.relativePath,
      hash: file.hash,
      contentType: getContentType(file.relativePath)
    }));

    // Upload ZIP and metadata to sponsor server
    console.log(`${colors.fg.blue}Uploading to sponsor server...${colors.reset}`);
    const form = new FormData();
    form.append('zip', fs.createReadStream(zipPath));
    form.append('poolType', poolConfig.poolType);
    form.append('fileMetadata', JSON.stringify(fileMetadata));
    form.append('hash', hashHex);
    form.append('signature', signatureBase64);
    form.append('publicKey', JSON.stringify(publicKeyJwk));
    if (poolConfig.poolType === 'event') {
      form.append('eventPoolId', poolConfig.eventPoolId);
    }

    const API_KEY = 'deploy-api-key-123';
    const headers = {
      ...form.getHeaders(),
      'X-API-Key': API_KEY
    };
    if (eventPoolId) {
      headers['X-Event-Pool-Id'] = eventPoolId;
    }

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

    const { poolType, uploadedFiles, poolName, remainingBalance, equivalentFileSize } = response.data;
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

    // Upload manifest to Arweave using provided wallet
    console.log(`${colors.fg.blue}Uploading manifest to Arweave...${colors.reset}`);
    let signerForManifest;
    let token;
    try {
      const parsedKey = JSON.parse(walletKey);
      if (parsedKey.n && parsedKey.d) {
        signerForManifest = new ArweaveSigner(parsedKey);
        token = 'arweave';
      } else {
        throw new Error('Parsed JSON does not appear to be a valid Arweave key');
      }
    } catch (e) {
      if (/^(0x)?[0-9a-fA-F]{64}$/.test(walletKey)) {
        signerForManifest = new EthereumSigner(walletKey);
        token = network === 'polygon' ? 'pol' : 'ethereum';
      } else {
        throw new Error('Wallet key is not a valid Ethereum private key or Arweave wallet JSON');
      }
    }

    const turbo = TurboFactory.authenticated({ signer: signerForManifest, token });

    const manifestBuffer = Buffer.from(JSON.stringify(manifestData, null, 2));
    const manifestStreamFactory = () => Readable.from(manifestBuffer);
    const manifestSizeFactory = () => manifestBuffer.length;

    const manifestUploadResult = await turbo.uploadFile({
      fileStreamFactory: manifestStreamFactory,
      fileSizeFactory: manifestSizeFactory,
      dataItemOpts: {
        tags: [
          { name: 'App-Name', value: 'PermaDeploy' },
          { name: 'anchor', value: new Date().toISOString() },
          { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
          { name: 'Pool-Type', value: poolType },
          ...(poolType === 'event' ? [{ name: 'Event-Name', value: poolConfig.eventPoolId }] : [])
        ],
      },
    });

    const manifestId = manifestUploadResult.id;
    manifest.lastManifestId = manifestId;

    console.log(`${colors.fg.green}✓ Sponsored deployment completed with manifest ID: ${manifestId}${colors.reset}`);
    if (poolType === 'event') {
      console.log(`${colors.fg.cyan}${poolName}${colors.reset}`);
      console.log(`${colors.fg.cyan}Remaining Pool Balance: ${remainingBalance} Turbo Credits${colors.reset}`);
      console.log(`${colors.fg.cyan}Equivalent File Size: ${Math.round(equivalentFileSize / (1024 * 1024))} MB${colors.reset}`);
    }

    fs.unlinkSync(zipPath);

    return { manifestId, manifest, poolType };
  } catch (error) {
    console.error(`${colors.fg.red}Sponsor deployment failed: ${error.message}${colors.reset}`);
    if (fs.existsSync(path.join(process.cwd(), 'deploy.zip'))) {
      fs.unlinkSync(path.join(process.cwd(), 'deploy.zip'));
    }
    throw error;
  }
}