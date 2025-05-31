#!/usr/bin/env node
import { uploadManifest as sharedUploadManifest } from './manifest-utils.js';
import { ANT, ArweaveSigner } from '@ar.io/sdk';
import { EthereumSigner, TurboFactory } from '@ardrive/turbo-sdk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import readline from 'readline';
import crypto from 'crypto';
import { Readable } from 'stream';
import { deployWithSponsor } from './sponsor-deploy.js';

// Define ANSI colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
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
// Show a progress bar in the terminal
function showProgress(message, percent) {
  const width = 30;
  const filled = Math.floor(width * percent);
  const empty = width - filled;
  
  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);
   
  // Move cursor up to overwrite previous progress
  if (message) {
    process.stdout.write('\x1b[1A');
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
// Retrieve current Git commit hash
function getCommitHash() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.warn(`${colors.fg.yellow}Warning: Could not retrieve commit hash. Using "unknown".${colors.reset}`);
    return 'unknown';
  }
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
// Calculate SHA256 hash of a file
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}
// Load or create manifest file
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
  return totalSize / 1024;
}
// Save manifest to file
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
// Load configuration from config files
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
        console.log(`${colors.fg.blue}Loaded config:${colors.reset}`, JSON.stringify(config, null, 2));
        break;
      } catch (error) {
        console.error(`${colors.fg.red}Error reading config file ${configPath}: ${error.message}${colors.reset}`);
      }
    }
  }
  
  return config;
}
// Main deployment function
async function main() {
  // Load configuration
  const config = loadConfig();
  // Parse command-line arguments
  const argv = yargs(hideBin(process.argv))
    .option('event-pool-id', {
      type: 'string',
      description: 'Event pool ID for sponsored deployment'
    })
    .option('event-pool-password', {
      type: 'string',
      description: 'Wallet address (password) for event pool'
    })
    .argv;
  
  const deployFolder = path.resolve(process.cwd(), config.deployFolder || 'dist');
  const antProcess = config.antProcess;
  const undername = config.undername || '@';
  const network = config.sigType || 'arweave';
  const buildCommand = config.buildCommand || '';
  const deployBranch = config.deployBranch || 'main';
  const sponsorServerUrl = config.sponsorServerUrl || 'http://localhost:8080';
  const arnsName = config.arnsName || '';
  const walletPath = config.walletPath || '';
  const eventPoolId = argv['event-pool-id'] || config.eventPoolId || '';
  const eventPoolPassword = argv['event-pool-password'] || config.eventPoolPassword || '';
  // Define manifest path
  const permawebDir = path.join(process.cwd(), '.perma-deploy');
  const manifestPath = path.join(permawebDir, 'manifest.json');
  // Display configuration
  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ DEPLOYMENT CONFIGURATION ════╗${colors.reset}`);
  console.log(`${colors.fg.cyan}● Deploy Folder:${colors.reset} ${deployFolder}`);
  console.log(`${colors.fg.cyan}● Manifest Path:${colors.reset} ${manifestPath}`);
  
  if (antProcess) console.log(`${colors.fg.cyan}● ANT Process:${colors.reset} ${antProcess}`);
  if (undername) console.log(`${colors.fg.cyan}● Undername:${colors.reset} ${undername}`);
  if (network) console.log(`${colors.fg.cyan}● Network:${colors.reset} ${network}`);
  if (arnsName) console.log(`${colors.fg.cyan}● ARNS Name:${colors.reset} ${arnsName}`);
  if (walletPath) console.log(`${colors.fg.cyan}● Wallet Path:${colors.reset} ${walletPath}`);
  if (sponsorServerUrl) console.log(`${colors.fg.cyan}● Sponsor Server URL:${colors.reset} ${sponsorServerUrl}`);
  if (eventPoolId) console.log(`${colors.fg.cyan}● Event Pool ID:${colors.reset} ${eventPoolId}`);
  if (eventPoolPassword) console.log(`${colors.fg.cyan}● Event Pool Password:${colors.reset} ${eventPoolPassword}`);
 // Load wallet key
  let DEPLOY_KEY = process.env.DEPLOY_KEY;
  let walletSource = 'environment variable DEPLOY_KEY';
  let walletPathToUse = walletPath;

  if (!DEPLOY_KEY && walletPath) {
    try {
      const resolvedWalletPath = path.resolve(walletPath);
      if (!fs.existsSync(resolvedWalletPath)) {
        throw new Error(`Wallet file does not exist at ${resolvedWalletPath}`);
      }
      walletSource = `config file at ${resolvedWalletPath}`;
      console.log(`${colors.fg.green}✓ Wallet path loaded from ${resolvedWalletPath}${colors.reset}`);
    } catch (error) {
      console.error(`${colors.fg.red}Error accessing wallet from ${walletPath}: ${error.message}${colors.reset}`);
      console.error(`${colors.fg.yellow}Resolved path: ${path.resolve(walletPath)}${colors.reset}`);
      process.exit(1);
    }
  } else if (!DEPLOY_KEY && !eventPoolId) {
    console.error(`${colors.fg.red}DEPLOY_KEY environment variable or walletPath not configured${colors.reset}`);
    process.exit(1);
  }
 // Check current Git branch
  let currentBranch = null;
  try {
    execSync('git rev-parse HEAD', { stdio: 'ignore' });
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    console.log(`${colors.fg.blue}Current branch:${colors.reset} ${currentBranch}`);
  } catch (error) {
    console.warn(`${colors.fg.yellow}Warning: Not a git repository or no commits found. Skipping branch check.${colors.reset}`);
  }
  // Ensure deployment is on the correct branch
  if (currentBranch && deployBranch && currentBranch !== deployBranch) {
    console.log(`${colors.fg.yellow}Not on deployment branch (${deployBranch}), skipping deployment.${colors.reset}`);
    process.exit(0);
  }
  // Build the project
  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ BUILDING PROJECT ════╗${colors.reset}`);
  console.log(`${colors.fg.blue}Running:${colors.reset} ${buildCommand}`);
  try {
    execSync(buildCommand, { stdio: 'inherit' });
    console.log(`${colors.fg.green}✓ Build completed successfully${colors.reset}`);
  } catch (error) {
    console.error(`${colors.fg.red}✗ Error: Build command failed.${colors.reset}`);
    process.exit(1);
  }
  // Verify deploy folder exists and is not empty
  if (!fs.existsSync(deployFolder) || fs.readdirSync(deployFolder).length === 0) {
    console.error(`${colors.fg.red}✗ Error: Deploy folder '${deployFolder}' is empty or does not exist.${colors.reset}`);
    process.exit(1);
  }
  // Load manifest
  const manifest = loadOrCreateManifest(manifestPath);
  console.log(`${colors.fg.blue}Loaded manifest from ${manifestPath}${colors.reset}`);
  // Get files to upload
  const filesToUpload = getAllFilesWithHashes(deployFolder);
  console.log(`${colors.fg.blue}Found ${filesToUpload.length} files to process${colors.reset}`);

  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ PREPARING DEPLOYMENT ════╗${colors.reset}`);
  
  try {
    let signer = null;
    let token = null;
    let manifestId = manifest.lastManifestId || null;
    // Initialize signer for direct uploads
    try {
      const parsedKey = JSON.parse(DEPLOY_KEY || fs.readFileSync(walletPathToUse, 'utf-8'));
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
    console.log(`${colors.fg.blue}Deploying folder:${colors.reset} ${deployFolder}`);
    console.log(`${colors.fg.blue}Wallet source:${colors.reset} ${walletSource}`);
    console.log(`\n${colors.bright}${colors.fg.yellow}╔════ CHECKING FILES FOR CHANGES ════╗${colors.reset}`);
    
    const filesToUploadFiltered = [];
    let skippedCount = 0;
    const normalizedManifestFiles = {};
    // Normalize manifest file paths
    for (const [relativePath, data] of Object.entries(manifest.files)) {
      const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
      normalizedManifestFiles[normalizedPath] = data;
    }
    // Identify changed or new files
    console.log(`${colors.fg.blue}Checking files for changes:${colors.reset}`);
    for (const file of filesToUpload) {
      const relativePath = path.relative(deployFolder, file.fullPath).replace(/\\/g, '/').replace(/^\.\//, '');
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
    // Initialize manifest data
    const manifestData = {
      manifest: 'arweave/paths',
      version: '0.1.0',
      index: { path: 'index.html' },
      fallback: { id: normalizedManifestFiles['404.html']?.txId || '' },
      paths: {},
    };
    for (const [relativePath, data] of Object.entries(normalizedManifestFiles)) {
      manifestData.paths[relativePath] = { id: data.txId };
    }
    // Handle case where no files need uploading
    if (filesToUploadFiltered.length === 0 && manifestId) {
      console.log(`${colors.fg.green}✓ All files are unchanged. Using existing manifest.${colors.reset}`);
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
    // Check folder size to determine deployment method
    const folderSizeKB = getFolderSizeInKB(deployFolder);
    console.log(`${colors.fg.blue}Folder size: ${folderSizeKB.toFixed(2)} KB${colors.reset}`);
    let useSponsorPool = eventPoolId && folderSizeKB >= 100; // Use sponsor pool only if eventPoolId is set and folder size is 100KB or more
    if (!useSponsorPool) {
      console.log(`${colors.fg.blue}Attempting direct upload to Arweave${colors.reset}`);
      const turbo = TurboFactory.authenticated({
        signer: signer,
        token: token,
      });
      try {
        const uploadedFiles = {};
        let uploadProgress = 0;
        const totalItems = filesToUploadFiltered.length + 1;
        const progressIncrement = totalItems > 0 ? 1.0 / totalItems : 1.0;
        console.log('');
        // Upload changed/new files
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
            manifestData.paths[file.relativePath] = { id: uploadResult.id };
            uploadProgress += progressIncrement;
            showProgress('', uploadProgress);
          } catch (error) {
            console.error(`\n${colors.fg.red}✗ Failed to upload ${file.relativePath}: ${error.message}${colors.reset}`);
            throw error;
          }
        }
        // Update manifest with uploaded files
        for (const [relativePath, data] of Object.entries(uploadedFiles)) {
          manifest.files[relativePath] = {
            txId: data.id,
            hash: data.hash,
            lastModified: data.lastModified,
          };
        }
        // Upload manifest
        const manifestBuffer = Buffer.from(JSON.stringify(manifestData, null, 2));
        const manifestStreamFactory = () => Readable.from(manifestBuffer);
        const manifestSizeFactory = () => manifestBuffer.length;
        try {
          showProgress(`Uploading manifest`, uploadProgress);
          const additionalTags = [
            { name: 'GIT-HASH', value: getCommitHash() || '' }
          ];
          manifestId = await sharedUploadManifest(
            DEPLOY_KEY || fs.readFileSync(walletPathToUse, 'utf-8'),
            manifestData,
            'public',
            network,
            (message, progress) => showProgress(message, uploadProgress + (progress * progressIncrement)),
            additionalTags
          );
          manifest.lastManifestId = manifestId;
          saveManifest(manifestPath, manifest);
          showProgress('', 1.0);
        } catch (error) {
          console.error(`${colors.fg.red}✗ Failed to upload manifest: ${error.message}${colors.reset}`);
          throw error;
        }
      } catch (error) {
        // Fallback to sponsor pool on insufficient balance
        if (error.message.toLowerCase().includes('insufficient balance')) {
          console.log(`${colors.fg.yellow}Insufficient balance detected. Falling back to sponsor server deployment.${colors.reset}`);
          useSponsorPool = true;
        } else {
          throw error;
        }
      }
    }
    // Use sponsor pool for deployment
    if (useSponsorPool) {
      console.log(`${colors.fg.blue}Using sponsor server for deployment${colors.reset}`);
      const sponsorResult = await deployWithSponsor(
        deployFolder,
        sponsorServerUrl,
        manifest,
        filesToUpload,
        showProgress,
        walletPathToUse || DEPLOY_KEY,
        network,
        eventPoolId
      );
      manifestId = sponsorResult.manifestId;
      manifest.lastManifestId = manifestId;
      Object.assign(manifest.files, sponsorResult.manifest.files);
      saveManifest(manifestPath, manifest);
      console.log(`${colors.fg.yellow}${sponsorResult.poolName}${colors.reset}`);
      if (sponsorResult.poolType === 'event') {
        console.log(`${colors.fg.cyan}● Total Credits Spent: ${Number(sponsorResult.totalCreditsSpent) / 1e12} Turbo Credits${colors.reset}`);
        console.log(`${colors.fg.cyan}● Usage for this Wallet: ${sponsorResult.usage} Turbo Credits${colors.reset}`);
        console.log(`${colors.fg.cyan}● Remaining Allowance: ${sponsorResult.remainingAllowance} Turbo Credits${colors.reset}`);
      }
    }
    // Update ANT record if configured
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
      // Simulate ANT update progress
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
    }
    // Display deployment results
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
// Run main function and handle errors
main().catch(err => {
  console.error(`\n${colors.fg.red}╔════ FATAL ERROR ════╗${colors.reset}`);
  console.error(`${colors.fg.red}Deployment failed: ${err.message}${colors.reset}`);
  process.exit(1);
});