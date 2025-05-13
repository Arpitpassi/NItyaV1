#!/usr/bin/env node

import { ANT, ArweaveSigner } from '@ar.io/sdk';
import { EthereumSigner, TurboFactory } from '@ardrive/turbo-sdk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import readline from 'readline';
import archiver from 'archiver';
import axios from 'axios';
import FormData from 'form-data';
import crypto from 'crypto';
import { Readable } from 'stream';

// ANSI colors and styling for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m  ",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  fg: {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m"
  },
  bg: {
    black: "\x1b[40m",
    red: "\x1b[41m",
    green: "\x1b[42m",
    yellow: "\x1b[43m",
    blue: "\x1b[44m",
    magenta: "\x1b[45m",
    cyan: "\x1b[46m",
    white: "\x1b[47m"
  }
};

// Function to show a progress bar in the terminal with dynamic message
function showProgress(message, percent) {
  const width = 30;
  const filled = Math.floor(width * percent);
  const empty = width - filled;
  
  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);
  
  // Move cursor up one line if message exists (to overwrite previous message)
  if (message) {
    process.stdout.write('\x1b[1A'); // Move cursor up one line
  }
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  if (message) {
    process.stdout.write(`${colors.fg.blue}${message}${colors.reset}\n`);
  }
  process.stdout.write(`Uploading to Arweave [${colors.fg.green}${filledBar}${colors.fg.white}${emptyBar}${colors.reset}] ${Math.floor(percent * 100)}%`);
  
  if (percent >= 1) {
    process.stdout.write('\n');
  }
}

// Function to retrieve commit hash
function getCommitHash() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.warn(`${colors.fg.yellow}Warning: Could not retrieve commit hash. Using "unknown".${colors.reset}`);
    return 'unknown';
  }
}

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

// Calculate folder size in KB
function getFolderSizeInKB(directoryPath) {
  let totalSize = 0;
  
  function getAllFilesSync(dirPath) {
    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        getAllFilesSync(filePath);
      } else {
        totalSize += stats.size;
      }
    });
  }
  
  getAllFilesSync(directoryPath);
  return totalSize / 1024; // Convert bytes to KB
}

// Calculate SHA256 hash of a file
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

// Load or create manifest
function loadOrCreateManifest(manifestPath) {
  if (fs.existsSync(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (error) {
      console.warn(`${colors.fg.yellow}Warning: Could not read manifest file. Creating new one.${colors.reset}`);
    }
  }
  return { files: {}, lastManifestId: null };
}

// Save manifest
function saveManifest(manifestPath, manifestData) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));
  console.log(`${colors.fg.green}✓ Manifest saved to ${manifestPath}${colors.reset}`);
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
    process.exit(1);
  }
  
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (error) {
    console.error(`${colors.fg.red}Error reading sponsor config: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Function to check sponsor server status
async function checkSponsorServer(url = 'http://localhost:3000') {
  try {
    const response = await axios.get(url, { timeout: 3000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

// Function to load configuration from config files
function loadConfig() {
  let config = {};
  
  const configLocations = [
    path.join(process.cwd(), '.perma-deploy', 'config.json'),
    path.join(process.cwd(), 'config.json'),
    path.join(process.cwd(), '.permaweb', 'config.json')
  ];
  
  for (const configPath of configLocations) {
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        console.log(`${colors.fg.blue}Using configuration from ${configPath}${colors.reset}`);
        break;
      } catch (error) {
        console.error(`${colors.fg.red}Error reading config file ${configPath}: ${error.message}${colors.reset}`);
      }
    }
  }
  
  return config;
}

async function main() {
  // Load config from file
  const config = loadConfig();
  
  // Get CLI arguments
  const argv = yargs(hideBin(process.argv))
    .option('dry-run', {
      type: 'boolean',
      default: false,
      description: 'Simulate deployment without uploading'
    }).argv;
  
  const dryRun = argv['dry-run'] || config.dryRun || false;
  const deployFolder = path.resolve(process.cwd(), config.deployFolder || 'dist');
  const antProcess = config.antProcess;
  const undername = config.undername || '@';
  const network = config.sigType || 'arweave';
  const buildCommand = config.buildCommand || 'npm run build';
  const deployBranch = config.deployBranch || 'main';
  const serverUrl = config.serverUrl || 'http://localhost:3000';
  const forceSponsor = config.forceSponsor || false;
  const arnsName = config.arnsName || '';
  const walletPath = config.walletPath || '';

  // Define manifest path in .permaweb folder
  const permawebDir = path.join(process.cwd(), '.perma-deploy');
  const manifestPath = path.join(permawebDir, 'manifest.json');

  // Display configuration
  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ DEPLOYMENT CONFIGURATION ════╗${colors.reset}`);
  console.log(`${colors.fg.cyan}● Deploy Folder:${colors.reset} ${deployFolder}`);
  console.log(`${colors.fg.cyan}● Dry Run:${colors.reset} ${dryRun ? 'Yes' : 'No'}`);
  console.log(`${colors.fg.cyan}● Server URL:${colors.reset} ${serverUrl}`);
  console.log(`${colors.fg.cyan}● Manifest Path:${colors.reset} ${manifestPath}`);
  
  if (antProcess) console.log(`${colors.fg.cyan}● ANT Process:${colors.reset} ${antProcess}`);
  if (undername) console.log(`${colors.fg.cyan}● Undername:${colors.reset} ${undername}`);
  if (network) console.log(`${colors.fg.cyan}● Network:${colors.reset} ${network}`);
  if (arnsName) console.log(`${colors.fg.cyan}● ARNS Name:${colors.reset} ${arnsName}`);
  if (walletPath) console.log(`${colors.fg.cyan}● Wallet Path:${colors.reset} ${walletPath}`);

  // Sponsor server availability check
  const sponsorServerAvailable = await checkSponsorServer(serverUrl);
  if (!sponsorServerAvailable) {
    console.warn(`${colors.fg.yellow}Warning: Sponsor server not available at ${serverUrl}${colors.reset}`);
    if (forceSponsor) {
      console.error(`${colors.fg.red}Cannot continue with force-sponsor when server is not available${colors.reset}`);
      process.exit(1);
    }
  } else {
    console.log(`${colors.fg.green}✓ Sponsor server available at ${serverUrl}${colors.reset}`);
  }

  // Get the DEPLOY_KEY
  let DEPLOY_KEY = process.env.DEPLOY_KEY;
  let walletSource = 'environment variable DEPLOY_KEY';
  
  if (!DEPLOY_KEY && walletPath) {
    try {
      const resolvedWalletPath = path.resolve(walletPath);
      DEPLOY_KEY = fs.readFileSync(resolvedWalletPath, 'utf-8');
      walletSource = `config file at ${resolvedWalletPath}`;
      console.log(`${colors.fg.green}✓ Wallet loaded from ${resolvedWalletPath}${colors.reset}`);
    } catch (error) {
      console.error(`${colors.fg.red}Error reading wallet from ${walletPath}: ${error.message}${colors.reset}`);
      console.error(`${colors.fg.yellow}Resolved path: ${path.resolve(walletPath)}${colors.reset}`);
      process.exit(1);
    }
  }
  
  if (!DEPLOY_KEY && !sponsorServerAvailable && !forceSponsor) {
    console.error(`${colors.fg.red}DEPLOY_KEY environment variable or walletPath not configured${colors.reset}`);
    console.error(`${colors.fg.yellow}To use sponsor server, make sure it's running or set up with nitya-setup${colors.reset}`);
    process.exit(1);
  }

  // Branch check
  let currentBranch = null;
  try {
    execSync('git rev-parse HEAD', { stdio: 'ignore' });
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    console.log(`${colors.fg.blue}Current branch:${colors.reset} ${currentBranch}`);
  } catch (error) {
    console.warn(`${colors.fg.yellow}Warning: Not a git repository or no commits found. Skipping branch check.${colors.reset}`);
  }

  if (currentBranch && deployBranch && currentBranch !== deployBranch) {
    console.log(`${colors.fg.yellow}Not on deployment branch (${deployBranch}), skipping deployment.${colors.reset}`);
    process.exit(0);
  }

  // Build project
  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ BUILDING PROJECT ════╗${colors.reset}`);
  console.log(`${colors.fg.blue}Running:${colors.reset} ${buildCommand}`);
  try {
    execSync(buildCommand, { stdio: 'inherit' });
    console.log(`${colors.fg.green}✓ Build completed successfully${colors.reset}`);
  } catch (error) {
    console.error(`${colors.fg.red}✗ Error: Build command failed.${colors.reset}`);
    process.exit(1);
  }

  if (!fs.existsSync(deployFolder) || fs.readdirSync(deployFolder).length === 0) {
    console.error(`${colors.fg.red}✗ Error: Deploy folder '${deployFolder}' is empty or does not exist.${colors.reset}`);
    process.exit(1);
  }

  // Load existing manifest
  const manifest = loadOrCreateManifest(manifestPath);
  console.log(`${colors.fg.blue}Loaded manifest from ${manifestPath}${colors.reset}`);

  // Get all files with their hashes
  const filesToUpload = getAllFilesWithHashes(deployFolder);
  console.log(`${colors.fg.blue}Found ${filesToUpload.length} files to process${colors.reset}`);

  if (dryRun) {
    console.log(`\n${colors.bright}${colors.fg.yellow}╔════ DRY RUN SIMULATION ════╗${colors.reset}`);
    console.log(`${colors.fg.blue}Would deploy folder:${colors.reset} ${deployFolder}`);
    
    for (let i = 0; i <= 100; i += 10) {
      showProgress("Simulating upload", i/100);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`${colors.fg.green}✓ Deployment simulation completed successfully.${colors.reset}`);
    process.exit(0);
  }

  // Deployment logic
  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ PREPARING DEPLOYMENT ════╗${colors.reset}`);
  
  try {
    let signer = null;
    let token = null;
    let useSponsorPool = forceSponsor;
    let manifestId = manifest.lastManifestId || null;

    // Check folder size for deployment method decision
    if (!useSponsorPool && sponsorServerAvailable) {
      const folderSizeKB = getFolderSizeInKB(deployFolder);
      console.log(`${colors.fg.blue}Folder size:${colors.reset} ${folderSizeKB.toFixed(2)} KB`);
      
      if (folderSizeKB >= 100) {
        const answer = await askQuestion('Folder size exceeds 100KB. Do you want to use the sponsor pool? (y/n): ');
        useSponsorPool = answer.toLowerCase() === 'y';
      } else {
        console.log(`${colors.fg.green}✓ Folder size is less than 100KB. Direct upload without sponsor is recommended.${colors.reset}`);
        if (!forceSponsor) {
          const answer = await askQuestion('Would you still like to use the sponsor pool? (y/n): ');
          useSponsorPool = answer.toLowerCase() === 'y';
        }
      }
    } else if (forceSponsor) {
      console.log(`${colors.fg.blue}Force sponsor option selected. Using sponsor pool.${colors.reset}`);
    }

    // Process based on deployment method
    if (useSponsorPool && sponsorServerAvailable) {
      console.log(`${colors.fg.blue}Using sponsor server for deployment${colors.reset}`);
      
      const poolConfig = await selectPoolType();
      
      try {
        const sponsorConfig = loadSponsorConfig();
        console.log(`${colors.fg.green}✓ Sponsor configuration loaded${colors.reset}`);
      } catch (configError) {
        console.warn(`${colors.fg.yellow}Sponsor configuration not found, proceeding with defaults${colors.reset}`);
      }
      
      console.log(`${colors.fg.blue}Preparing deployment package...${colors.reset}`);
      const zipPath = path.join(process.cwd(), 'deploy.zip');
      
      showProgress("Zipping folder", 0);
      await zipFolder(deployFolder, zipPath);
      showProgress("Zipping folder", 1);
      
      console.log(`${colors.fg.blue}Uploading to sponsor server...${colors.reset}`);
      const form = new FormData();
      form.append('zip', fs.createReadStream(zipPath));
      form.append('poolType', poolConfig.poolType);
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
        
        manifestId = response.data.manifestId;
        console.log(`${colors.fg.green}✓ Sponsored deployment completed with manifest ID: ${manifestId}${colors.reset}`);
        
        // Update manifest with new files (for sponsor pool, we assume all files are new)
        for (const file of filesToUpload) {
          manifest.files[file.path] = {
            txId: manifestId, // Sponsor pool returns single manifest ID
            hash: file.hash,
            lastModified: fs.statSync(file.fullPath).mtime.toISOString()
          };
        }
        manifest.lastManifestId = manifestId;
        saveManifest(manifestPath, manifest);
      } catch (error) {
        console.error(`${colors.fg.red}Sponsor server error: ${error.response?.data?.error || error.message}${colors.reset}`);
        throw error;
      } finally {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
      }
    } else {
      if (!DEPLOY_KEY) {
        console.error(`${colors.fg.red}No DEPLOY_KEY available for direct upload. Please set DEPLOY_KEY environment variable.${colors.reset}`);
        process.exit(1);
      }
      
      try {
        const parsedKey = JSON.parse(DEPLOY_KEY);
        if (parsedKey.n && parsedKey.d) {
          signer = new ArweaveSigner(parsedKey);
          token = 'arweave';
          console.log(`${colors.fg.green}✓ Using Arweave JWK wallet${colors.reset}`);
        } else {
          throw new Error('Parsed JSON does not appear to be a valid Arweave key');
        }
      } catch (e) {
        if (/^(0x)?[0-9a-fA-F]{64}$/.test(DEPLOY_KEY)) {
          signer = new EthereumSigner(DEPLOY_KEY);
          token = network === 'polygon' ? 'pol' : 'ethereum';
          console.log(`${colors.fg.green}✓ Using ${network} wallet${colors.reset}`);
        } else {
          throw new Error('DEPLOY_KEY is not a valid Ethereum private key or Arweave wallet JSON');
        }
      }

      console.log(`${colors.fg.blue}Deploying folder directly from wallet:${colors.reset} ${deployFolder}`);
      console.log(`${colors.fg.blue}Wallet source:${colors.reset} ${walletSource}`);
      console.log(`\n${colors.bright}${colors.fg.yellow}╔════ CHECKING FILES FOR CHANGES ════╗${colors.reset}`);
      
      // Prepare paths for manifest
      const paths = {};
      const filesToUploadFiltered = [];
      let skippedCount = 0;

      // Check which files need to be uploaded
      console.log(`${colors.fg.blue}Checking files for changes:${colors.reset}`);
      for (const file of filesToUpload) {
        const relativePath = path.relative(deployFolder, file.fullPath).replace(/\\/g, '/').replace(/^\.\//, '');
        const existingFile = manifest.files[relativePath];
        if (existingFile && existingFile.hash === file.hash) {
          console.log(`${colors.fg.cyan}✓ Skipped unchanged file: ${relativePath} (txId: ${existingFile.txId}, hash: ${file.hash})${colors.reset}`);
          paths[relativePath] = { id: existingFile.txId };
          skippedCount++;
        } else {
          console.log(`${colors.fg.yellow}● Changed or new file: ${relativePath} (hash: ${file.hash})${colors.reset}`);
          filesToUploadFiltered.push({ ...file, relativePath });
        }
      }

      console.log(`${colors.fg.blue}Summary: ${skippedCount} files unchanged, ${filesToUploadFiltered.length} files to upload${colors.reset}`);

      if (filesToUploadFiltered.length === 0) {
        console.log(`${colors.fg.green}✓ All files are unchanged. No upload required.${colors.reset}`);
        if (!manifestId) {
          console.error(`${colors.fg.red}✗ No previous manifest ID found in manifest. Cannot display deployment links.${colors.reset}`);
          process.exit(1);
        }

        console.log(`\n${colors.bright}${colors.fg.green}╔════ DEPLOYMENT UNCHANGED ════╗${colors.reset}`);
        console.log(`${colors.fg.white}View existing deployment at:${colors.reset}`);
        console.log(`${colors.bg.blue}${colors.fg.white} https://arweave.ar.io/${manifestId} ${colors.reset}`);
        console.log(`${colors.bg.blue}${colors.fg.white} https://arweave.net/${manifestId} ${colors.reset}`);

        if (antProcess && arnsName) {
          if (undername === '@' || !undername) {
            console.log(`\n${colors.fg.white}Or via ARNS at:${colors.reset}`);
            console.log(`${colors.bg.blue}${colors.fg.white} https://${arnsName}.ar.io${colors.reset}`);
          } else {
            console.log(`\n${colors.fg.white}Or via ARNS at:${colors.reset}`);
            console.log(`${colors.bg.blue}${colors.fg.white} https://${undername}_${arnsName}.ar.io ${colors.reset}`);
          }
        }
        
        console.log(`${colors.fg.green}╚══════════════════════════════╝${colors.reset}`);
        process.exit(0);
      }

      console.log(`\n${colors.bright}${colors.fg.yellow}╔════ UPLOADING TO ARWEAVE ════╗${colors.reset}`);
      const turbo = TurboFactory.authenticated({
        signer: signer,
        token: token,
      });

      // Upload each file individually with a single progress bar
      const uploadedFiles = {};
      let uploadProgress = 0;
      const totalItems = filesToUploadFiltered.length + 1; // +1 for manifest
      const progressIncrement = totalItems > 0 ? 1.0 / totalItems : 1.0;

      // Print an initial empty line for the progress bar to overwrite
      console.log('');

      for (const file of filesToUploadFiltered) {
        const fileStreamFactory = () => fs.createReadStream(file.fullPath);
        const fileSizeFactory = () => fs.statSync(file.fullPath).size;

        try {
          showProgress(`Uploading file: ${file.relativePath}`, uploadProgress);
          const uploadResult = await turbo.uploadFile({
            fileStreamFactory,
            fileSizeFactory,
            dataItemOpts: {
              tags: [
                { name: 'App-Name', value: 'PermaDeploy' },
                { name: 'anchor', value: new Date().toISOString() },
                { name: 'Content-Type', value: getContentType(file.relativePath) },
              ],
            },
          });

          uploadedFiles[file.relativePath] = {
            id: uploadResult.id,
            hash: file.hash,
            lastModified: fs.statSync(file.fullPath).mtime.toISOString(),
          };

          uploadProgress += progressIncrement;
          showProgress('', uploadProgress); // Update progress bar without file name
        } catch (error) {
          console.error(`${colors.fg.red}✗ Failed to upload ${file.relativePath}: ${error.message}${colors.reset}`);
          throw error;
        }
      }

      // Merge unchanged files into the paths for the manifest
      for (const [path, data] of Object.entries(manifest.files)) {
        if (data.txId && !uploadedFiles[path]) {
          uploadedFiles[path] = data;
        }
      }

      // Generate manifest
      const manifestData = {
        manifest: 'arweave/paths',
        version: '0.1.0',
        index: { path: 'index.html' },
        fallback: { id: uploadedFiles['404.html']?.id || '' },
        paths: {},
      };

      for (const [path, data] of Object.entries(uploadedFiles)) {
        manifestData.paths[path] = { id: data.id };
      }

      // Convert manifest to JSON
      const manifestBuffer = Buffer.from(JSON.stringify(manifestData, null, 2));
      const manifestStreamFactory = () => Readable.from(manifestBuffer);
      const manifestSizeFactory = () => manifestBuffer.length;

      // Upload manifest
      try {
        showProgress(`Uploading manifest`, uploadProgress);
        const manifestUploadResult = await turbo.uploadFile({
          fileStreamFactory: manifestStreamFactory,
          fileSizeFactory: manifestSizeFactory,
          dataItemOpts: {
            tags: [
              { name: 'App-Name', value: 'PermaDeploy' },
              { name: 'anchor', value: new Date().toISOString() },
              { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
            ],
          },
        });

        manifestId = manifestUploadResult.id;
        showProgress('', 1.0);
      } catch (error) {
        console.error(`${colors.fg.red}✗ Failed to upload manifest: ${error.message}${colors.reset}`);
        throw error;
      }

      // Update local manifest file
      for (const [relativePath, data] of Object.entries(uploadedFiles)) {
        manifest.files[relativePath] = {
          txId: data.id,
          hash: data.hash,
          lastModified: data.lastModified,
        };
      }
      manifest.lastManifestId = manifestId;
      saveManifest(manifestPath, manifest);
    }
    
    if (antProcess && (arnsName || undername !== '@') && signer) {
      console.log(`\n${colors.bright}${colors.fg.yellow}╔════ UPDATING ANT RECORD ════╗${colors.reset}`);
      console.log(`${colors.fg.blue}Updating ANT process:${colors.reset} ${antProcess}`);
      console.log(`${colors.fg.blue}Undername:${colors.reset} ${undername}`);
      
      if (!manifestId || typeof manifestId !== 'string' || manifestId.length !== 43) {
        console.error(`${colors.fg.red}✗ Invalid manifest ID: ${manifestId}. Cannot update ANT record.${colors.reset}`);
        throw new Error('Invalid manifest ID');
      }

      const ant = ANT.init({ processId: antProcess, signer });
      const commitHash = getCommitHash();
      
      for (let i = 0; i <= 100; i += 20) {
        showProgress("Updating ANT record", i/100);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      try {
        await ant.setUndernameRecord(
          {
            undername: undername,
            transactionId: manifestId,
            ttlSeconds: 3600,
          },
          {
            tags: [
              {
                name: 'GIT-HASH',
                value: commitHash || '',
              },
              {
                name: 'App-Name',
                value: 'PermaDeploy',
              },
              {
                name: 'anchor',
                value: new Date().toISOString(),
              },
            ],
          }
        );
        console.log(`${colors.fg.green}✓ Updated ANT record for process ${antProcess} with undername ${undername}${colors.reset}`);
      } catch (antError) {
        console.error(`${colors.fg.red}✗ Failed to update ANT record: ${antError.message}${colors.reset}`);
        throw antError;
      }
    } else if (antProcess && !signer) {
      console.warn(`${colors.fg.yellow}Warning: Cannot update ANT record without a wallet signer.${colors.reset}`);
    }
    
    console.log(`\n${colors.bright}${colors.fg.green}╔════ DEPLOYMENT SUCCESSFUL! ════╗${colors.reset}`);
    console.log(`${colors.fg.white}View your deployment at:${colors.reset}`);
    console.log(`${colors.bg.blue}${colors.fg.white} https://arweave.ar.io/${manifestId} ${colors.reset}`);
    console.log(`${colors.bg.blue}${colors.fg.white} https://arweave.net/${manifestId} ${colors.reset}`);

    if (antProcess && arnsName) {
      if (undername === '@' || !undername) {
        console.log(`\n${colors.fg.white}Or via ARNS at:${colors.reset}`);
        console.log(`${colors.bg.blue}${colors.fg.white} https://${arnsName}.ar.io${colors.reset}`);
      } else {
        console.log(`\n${colors.fg.white}Or via ARNS at:${colors.reset}`);
        console.log(`${colors.bg.blue}${colors.fg.white} https://${undername}_${arnsName}.ar.io ${colors.reset}`);
      }
    }
    
    console.log(`${colors.fg.green}╚════════════════════════════════╝${colors.reset}`);
  } catch (error) {
    console.error(`\n${colors.fg.red}╔════ DEPLOYMENT FAILED ════╗${colors.reset}`);
    console.error(`${colors.fg.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n${colors.fg.red}╔════ FATAL ERROR ════╗${colors.reset}`);
  console.error(`${colors.fg.red}Deployment failed: ${err.message}${colors.reset}`);
  process.exit(1);
});