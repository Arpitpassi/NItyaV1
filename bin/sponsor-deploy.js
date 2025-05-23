import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import axios from 'axios';
import FormData from 'form-data';
import readline from 'readline';
import crypto from 'crypto';
import { Readable } from 'stream';

// ANSI colors for terminal output
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

// Zip the folder
async function zipFolder(source, out) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);
    archive
      .directory(source, false)
      .on('error', err => reject(err))
      .pipe(stream);
    stream.on('close', () => resolve());
    archive.finalize();
  });
}

// Prompt user
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

// Function to select pool type
async function selectPoolType() {
  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ POOL SELECTION ════╗${colors.reset}`);
  console.log(`${colors.fg.cyan}Please select your pool type:${colors.reset}`);
  console.log(`${colors.fg.white}1. Community pool deployment${colors.reset}`);
  console.log(`${colors.fg.white}2. Event pool deployment${colors.reset}`);
  const choice = await askQuestion('Enter your choice (1 or 2): ');
  
  if (choice === '1') {
    console.log(`${colors.fg.green}✓ Community pool selected${colors.reset}`);
    return { poolType: 'community' };
  } else if (choice === '2') {
    console.log(`${colors.fg.green}✓ Event pool selected${colors.reset}`);
    const eventPoolName = await askQuestion('Enter the name of your event pool: ');
    const eventPoolPassword = await askQuestion('Enter the password for your event pool: ');
    console.log(`${colors.fg.green}✓ Event pool '${eventPoolName}' configured${colors.reset}`);
    return { poolType: 'event', eventPoolName, eventPoolPassword };
  } else {
    console.error(`${colors.fg.red}Invalid choice. Defaulting to community pool.${colors.reset}`);
    return { poolType: 'community' };
  }
}

// Function to load sponsor server configuration
function loadSponsorConfig() {
  const SPONSOR_DIR = path.join(process.env.HOME, '.nitya', 'sponsor');
  const CONFIG_PATH = path.join(SPONSOR_DIR, 'config.json');
  
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`${colors.fg.red}Sponsor configuration not found at ${CONFIG_PATH}${colors.reset}`);
    console.error(`${colors.fg.yellow}Please run the setup script first: nitya-setup${colors.reset}`);
    throw new Error('Sponsor configuration not found');
  }
  
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (error) {
    console.error(`${colors.fg.red}Error reading sponsor config: ${error.message}${colors.reset}`);
    throw error;
  }
}

// Function to check sponsor server status
async function checkSponsorServer(url = 'http://localhost:8080') {
  try {
    const response = await axios.get(`${url}/health`, {
      timeout: 3000,
      headers: {
        'X-API-Key': 'deploy-api-key-123'
      }
    });
    return response.status === 200;
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401) {
        console.error(`${colors.fg.red}Sponsor server authentication failed: Invalid or missing API key${colors.reset}`);
      } else if (error.response.status === 404) {
        console.error(`${colors.fg.red}Sponsor server endpoint not found: /health${colors.reset}`);
      } else {
        console.error(`${colors.fg.red}Sponsor server check failed: HTTP ${error.response.status}${colors.reset}`);
      }
    } else {
      console.error(`${colors.fg.red}Sponsor server check failed: ${error.message}${colors.reset}`);
    }
    return false;
  }
}

// Calculate SHA256 hash of a file
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

// Get all files with their relative paths and hashes
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

// Function to determine Content-Type based on file extension
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

// Main sponsor deployment function
export async function deployWithSponsor(deployFolder, serverUrl, manifest, filesToUpload, showProgress) {
  try {
    // Check sponsor server availability
    const sponsorServerAvailable = await checkSponsorServer(serverUrl);
    if (!sponsorServerAvailable) {
      console.error(`${colors.fg.red}Sponsor server not available at ${serverUrl}${colors.reset}`);
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

    // Select pool type
    const poolConfig = await selectPoolType();

    // Prepare paths for manifest
    const filesToUploadFiltered = [];
    let skippedCount = 0;

    // Normalize paths in the existing manifest to ensure consistency
    const normalizedManifestFiles = {};
    for (const [relativePath, data] of Object.entries(manifest.files)) {
      const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
      normalizedManifestFiles[normalizedPath] = data;
    }

    // Check which files need to be uploaded
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

    // Prepare deployment package
    console.log(`${colors.fg.blue}Preparing deployment package...${colors.reset}`);
    const zipPath = path.join(process.cwd(), 'deploy.zip');
    
    showProgress("Zipping folder", 0);
    await zipFolder(deployFolder, zipPath);
    showProgress("Zipping folder", 1);

    // Prepare manifest data for the server
    const manifestData = {
      manifest: 'arweave/paths',
      version: '0.1.0',
      index: { path: 'index.html' },
      fallback: { id: normalizedManifestFiles['404.html']?.txId || '' },
      paths: {},
    };

    // Add existing unchanged files to manifestData.paths
    for (const [relativePath, data] of Object.entries(normalizedManifestFiles)) {
      manifestData.paths[relativePath] = { id: data.txId };
    }

    // Prepare file metadata for changed/new files
    const fileMetadata = filesToUploadFiltered.map(file => ({
      relativePath: file.relativePath,
      hash: file.hash,
      contentType: getContentType(file.relativePath)
    }));

    // Upload to sponsor server
    console.log(`${colors.fg.blue}Uploading to sponsor server...${colors.reset}`);
    const form = new FormData();
    form.append('zip', fs.createReadStream(zipPath));
    form.append('poolType', poolConfig.poolType);
    form.append('manifestData', JSON.stringify(manifestData));
    form.append('fileMetadata', JSON.stringify(fileMetadata));
    if (poolConfig.poolType === 'event') {
      form.append('eventPoolName', poolConfig.eventPoolName);
      form.append('eventPoolPassword', poolConfig.eventPoolPassword);
    }

    const API_KEY = 'deploy-api-key-123';

    try {
      let uploadProgress = 0;
      const progressInterval = setInterval(() => {
        uploadProgress += 0.05;
        if (uploadProgress > 0.95) {
          uploadProgress = 0.95;
          clearInterval(progressInterval);
        }
        showProgress("Uploading to sponsor server", uploadProgress);
      }, 300);

      const response = await axios.post(`${serverUrl}/upload`, form, {
        headers: {
          ...form.getHeaders(),
          'X-API-Key': API_KEY
        },
      });

      clearInterval(progressInterval);
      showProgress("Uploading to sponsor server", 1);

      const { manifestId, poolType, uploadedFiles } = response.data;
      console.log(`${colors.fg.green}✓ Sponsored deployment completed with manifest ID: ${manifestId}${colors.reset}`);

      // Update local manifest with new or updated files
      for (const file of uploadedFiles) {
        manifest.files[file.relativePath] = {
          txId: file.txId,
          hash: file.hash,
          lastModified: file.lastModified || new Date().toISOString()
        };
      }

      manifest.lastManifestId = manifestId;
      return { manifestId, manifest, poolType };
    } catch (error) {
      console.error(`${colors.fg.red}Sponsor server error: ${error.response?.data?.error || error.message}${colors.reset}`);
      throw error;
    } finally {
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }
  } catch (error) {
    throw new Error(`Sponsor deployment failed: ${error.message}`);
  }
}