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

// ANSI colors and styling for terminal output
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

// Function to show a progress bar in the terminal
function showProgress(message, percent) {
  const width = 30;
  const filled = Math.floor(width * percent);
  const empty = width - filled;
  
  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);
  
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(`${message} [${colors.fg.green}${filledBar}${colors.fg.white}${emptyBar}${colors.reset}] ${Math.floor(percent * 100)}%`);
  
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

async function main() {
  // First, load config from file if it exists
  let config = {};
  const permaDeployDir = path.join(process.cwd(), '.perma-deploy');
  const useConfigFile = fs.existsSync(permaDeployDir);
  
  if (useConfigFile) {
    try {
      config = JSON.parse(fs.readFileSync(path.join(permaDeployDir, 'config.json'), 'utf-8'));
      console.log(`${colors.fg.blue}Using configuration from .perma-deploy/config.json${colors.reset}`);
    } catch (error) {
      console.error(`${colors.fg.red}Error reading config file: ${error.message}${colors.reset}`);
      process.exit(1);
    }
  }

  // Then parse command line arguments
  const argv = yargs(hideBin(process.argv))
    .option('deploy-folder', {
      alias: 'd',
      type: 'string',
      description: 'Folder to deploy.',
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      description: 'Simulate deployment without uploading'
    })
    .option('ant-process', {
      alias: 'a',
      type: 'string',
      description: 'The ANT process ID.'
    })
    .option('undername', {
      alias: 'u',
      type: 'string',
      description: 'ANT undername to update.',
      default: '@'
    })
    .option('network', {
      alias: 'n',
      type: 'string',
      description: 'Network for Ethereum-based signers.',
      choices: ['ethereum', 'polygon'],

    })

      .option('pool-type', {
        type: 'string',
        description: 'Type of pool to use for deployment',
        choices: ['community', 'event'],
        default: 'community'
      })
      .option('event-pool-name', {
        type: 'string',
        description: 'Name of the event pool (required for event pool deployment)'
      })
    .option('event-pool-password', {
      type: 'string',
      description: 'Password for the event pool (required for event pool deployment)'
    })
    .option('user-identifier', {
      type: 'string',
      description: 'Unique identifier for the user (required for event pool deployment)'
    }).argv;
   
  // Priority: config first, then command line args as override
  const deployFolder = path.resolve(process.cwd(), 
    config.deployFolder || argv['deploy-folder'] || 'dist');
  const dryRun = config.dryRun !== undefined ? config.dryRun : argv['dry-run'] || false;
  const antProcess = config.antProcess || argv['ant-process'];
  const undername = config.undername || argv['undername'] || '@';
  const network = config.network || argv['network'] || 'arweave';
  const buildCommand = config.buildCommand || 'npm run build';
  const deployBranch = config.deployBranch || 'main';

  // Display configuration
  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ DEPLOYMENT CONFIGURATION ════╗${colors.reset}`);
  console.log(`${colors.fg.cyan}● Deploy Folder:${colors.reset} ${deployFolder}`);
  console.log(`${colors.fg.cyan}● Dry Run:${colors.reset} ${dryRun ? 'Yes' : 'No'}`);
  
  if (antProcess) console.log(`${colors.fg.cyan}● ANT Process:${colors.reset} ${antProcess}`);
  if (undername) console.log(`${colors.fg.cyan}● Undername:${colors.reset} ${undername}`);
  if (network) console.log(`${colors.fg.cyan}● Network:${colors.reset} ${network}`);

  // Get the DEPLOY_KEY from environment variable or config file
  let DEPLOY_KEY = process.env.DEPLOY_KEY;
  let walletSource = 'environment variable DEPLOY_KEY';
  if (!DEPLOY_KEY && useConfigFile && config.walletPath) {
    try {
      DEPLOY_KEY = fs.readFileSync(config.walletPath, 'utf-8');
      walletSource = `config file at ${config.walletPath}`;
      console.log(`${colors.fg.green}✓ Wallet loaded from ${config.walletPath}${colors.reset}`);
    } catch (error) {
      console.error(`${colors.fg.red}Error reading wallet from ${config.walletPath}: ${error.message}${colors.reset}`);
      process.exit(1);
    }
  }
  if (!DEPLOY_KEY) {
    console.error(`${colors.fg.red}DEPLOY_KEY environment variable or walletPath not configured${colors.reset}`);
    process.exit(1);
  }

  // Branch check
  let currentBranch = null;
  try {
    execSync('git rev-parse HEAD', { stdio: 'ignore' });
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    console.log(`${colors.fg.blue}Current branch:${colors.reset} ${currentBranch}`);
  } catch (error) {
    console.warn(`${colors.fg.yellow}Warning: No commits found. Skipping branch check.${colors.reset}`);
  }

  if (currentBranch && currentBranch !== deployBranch) {
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

  if (dryRun) {
    console.log(`\n${colors.bright}${colors.fg.yellow}╔════ DRY RUN SIMULATION ════╗${colors.reset}`);
    console.log(`${colors.fg.blue}Would deploy folder:${colors.reset} ${deployFolder}`);
    
    // Show simulated progress
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
    let signer;
    let token;

    // Infer signer type based on DEPLOY_KEY
    try {
      // Try to parse as JSON for Arweave
      const parsedKey = JSON.parse(DEPLOY_KEY);
      
      // Check if it has typical Arweave JWK fields
      if (parsedKey.n && parsedKey.d) {
        signer = new ArweaveSigner(parsedKey);
        token = 'arweave';
        console.log(`${colors.fg.green}✓ Using Arweave JWK wallet${colors.reset}`);
      } else {
        throw new Error('Parsed JSON does not appear to be a valid Arweave key');
      }
    } catch (e) {
      // Not JSON, assume it's an Ethereum/Polygon private key
      if (/^(0x)?[0-9a-fA-F]{64}$/.test(DEPLOY_KEY)) {
        signer = new EthereumSigner(DEPLOY_KEY);
        token = network === 'polygon' ? 'pol' : 'ethereum';
        console.log(`${colors.fg.green}✓ Using ${network} wallet${colors.reset}`);
      } else {
        throw new Error('DEPLOY_KEY is not a valid Ethereum private key or Arweave wallet JSON');
      }
    }

    console.log(`${colors.fg.blue}Deploying folder:${colors.reset} ${deployFolder}`);

    // Initialize TurboFactory with signer and token
    const turbo = TurboFactory.authenticated({
      signer: signer,
      token: token,
    });

    // Check folder size
    const folderSizeKB = getFolderSizeInKB(deployFolder);
    console.log(`${colors.fg.blue}Folder size:${colors.reset} ${folderSizeKB.toFixed(2)} KB`);
    
    // Decision based on folder size
    let useDirectUpload = folderSizeKB < 100;
    let useSponsorPool = false;
    
    if (!useDirectUpload) {
      // Prompt user to choose sponsor pool or direct upload
      const answer = await askQuestion('Folder size exceeds 100KB. Do you want to use the sponsor pool for deployment? (y/n): ');
      useSponsorPool = answer.toLowerCase() === 'y';
      useDirectUpload = !useSponsorPool;
    } else {
      console.log(`${colors.fg.green}✓ Folder size is less than 100KB. Using direct upload without balance check.${colors.reset}`);
    }

    let manifestId;
    if (useSponsorPool) {
      console.log(`\n${colors.bright}${colors.fg.yellow}╔════ SPONSOR POOL CONFIGURATION ════╗${colors.reset}`);
      
      // Check for Nitya configuration
      const nityaConfigDir = path.join(process.env.HOME, '.nitya', 'sponsor');
      const nityaConfigPath = path.join(nityaConfigDir, 'config.json');
      let nityaConfig = null;
      
      if (fs.existsSync(nityaConfigPath)) {
        try {
          nityaConfig = JSON.parse(fs.readFileSync(nityaConfigPath, 'utf-8'));
          console.log(`${colors.fg.green}✓ Found Nitya wallet configuration${colors.reset}`);
        } catch (error) {
          console.warn(`${colors.fg.yellow}Warning: Could not parse Nitya configuration: ${error.message}${colors.reset}`);
        }
      }
    
      // Handle pool type selection
      let poolType = argv['pool-type'];
      let eventPoolName = argv['event-pool-name'];
      let eventPoolPassword = argv['event-pool-password'];
      let userIdentifier = argv['user-identifier'];
      
      // If pool type not provided and we have a Nitya config, use that
      if (!poolType && nityaConfig && nityaConfig.poolType) {
        poolType = nityaConfig.poolType;
        console.log(`${colors.fg.blue}Using pool type from Nitya config: ${colors.reset}${poolType}`);
        
        // If it's an event pool, use the config values
        if (poolType === 'event' && nityaConfig.eventPoolName) {
          eventPoolName = nityaConfig.eventPoolName;
          eventPoolPassword = nityaConfig.eventPoolPassword;
          console.log(`${colors.fg.blue}Using event pool: ${colors.reset}${eventPoolName}`);
        }
      }
      // If still no pool type, prompt the user
      else if (!poolType) {
        console.log(`${colors.fg.cyan}Please select your pool type:${colors.reset}`);
        console.log(`${colors.fg.white}1. Community pool deployment${colors.reset}`);
        console.log(`${colors.fg.white}2. Event pool deployment${colors.reset}`);
        
        const poolChoice = await askQuestion("Enter your choice (1 or 2): ");
        
        if (poolChoice === '1') {
          poolType = 'community';
          console.log(`${colors.fg.green}✓ Community pool selected${colors.reset}`);
        } else if (poolChoice === '2') {
          poolType = 'event';
          console.log(`${colors.fg.green}✓ Event pool selected${colors.reset}`);
        } else {
          console.log(`${colors.fg.yellow}Invalid choice. Defaulting to community pool...${colors.reset}`);
          poolType = 'community';
        }
      }
      
      // For event pools, gather required information
      if (poolType === 'event') {
        if (!eventPoolName) {
          eventPoolName = await askQuestion("Enter a name for your event pool: ");
        }
        
        if (!eventPoolPassword) {
          // Using a simple approach for password input without masking for compatibility
          eventPoolPassword = await askQuestion("Enter a password for your event pool: ");
        }
        
        if (!userIdentifier) {
          userIdentifier = await askQuestion("Enter your unique identifier (email/username): ");
        }
        
        console.log(`${colors.fg.green}✓ Using event pool: ${colors.reset}${eventPoolName}`);
      } else {
        console.log(`${colors.fg.green}✓ Using community pool${colors.reset}`);
      }
      
      // Now proceed with the upload process
      const zipPath = path.join(process.cwd(), 'deploy.zip');
      console.log(`\n${colors.fg.blue}Zipping folder...${colors.reset}`);
      await zipFolder(deployFolder, zipPath);
    
      console.log(`${colors.fg.blue}Sending to sponsor server...${colors.reset}`);
      const form = new FormData();
      form.append('zip', fs.createReadStream(zipPath));
      form.append('poolType', poolType);
      
      // Add event pool details if applicable
      if (poolType === 'event') {
        form.append('eventPoolName', eventPoolName);
        form.append('eventPoolPassword', eventPoolPassword);
        form.append('userIdentifier', userIdentifier);
      }
      
      // Show upload progress animation
      let uploadProgress = 0;
      const progressInterval = setInterval(() => {
        uploadProgress += Math.random() * 5;
        if (uploadProgress > 95) uploadProgress = 95;
        showProgress("Uploading to sponsor server", uploadProgress/100);
      }, 200);
      
      const API_KEY = 'deploy-api-key-123'; // API key for deployer
      try {
        const response = await axios.post('http://localhost:3000/upload', form, {
          headers: {
            ...form.getHeaders(),
            'X-API-Key': API_KEY
          },
        });
        
        // Clear progress and show 100%
        clearInterval(progressInterval);
        showProgress("Uploading to sponsor server", 1.0);
        
        manifestId = response.data.manifestId;
        
        // Show deployment pool information
        if (response.data.deployedBy) {
          console.log(`${colors.fg.green}✓ Deployed by: ${colors.reset}${response.data.deployedBy}`);
        }
      } catch (error) {
        clearInterval(progressInterval);
        console.error(`${colors.fg.red}Sponsor server error: ${error.response?.data?.error || error.message}${colors.reset}`);
        throw error;
      } finally {
        fs.unlinkSync(zipPath);
      }
      console.log(`${colors.fg.green}✓ Sponsored deployment completed${colors.reset}`);
    } else {
      console.log(`${colors.fg.blue}Using project wallet for direct upload from ${walletSource}${colors.reset}`);
      console.log(`\n${colors.bright}${colors.fg.yellow}╔════ UPLOADING TO ARWEAVE ════╗${colors.reset}`);
      
      // Simulate upload progress
      let lastProgress = 0;
      const updateInterval = setInterval(() => {
        lastProgress += Math.random() * 0.05;
        if (lastProgress > 0.95) {
          clearInterval(updateInterval);
          lastProgress = 0.95;
        }
        showProgress("Uploading to Arweave", lastProgress);
      }, 300);

      const uploadResult = await turbo.uploadFolder({
        folderPath: deployFolder,
        dataItemOpts: {
          tags: [
            {
              name: 'App-Name',
              value: 'PermaDeploy',
            },
            // prevents identical transaction Ids from eth wallets
            {
              name: 'anchor',
              value: new Date().toISOString(),
            },
          ],
        },
      });

      clearInterval(updateInterval);
      showProgress("Uploading to Arweave", 1.0);

      manifestId = uploadResult.manifestResponse.id;
      console.log(`${colors.fg.green}✓ Manifest uploaded with ID:${colors.reset}`);
    }
    
    // Update ANT record if applicable
    if (antProcess && (config.arnsName || undername !== '@')) {
      console.log(`\n${colors.bright}${colors.fg.yellow}╔════ UPDATING ANT RECORD ════╗${colors.reset}`);
      console.log(`${colors.fg.blue}Updating ANT process:${colors.reset} ${antProcess}`);
      console.log(`${colors.fg.blue}Undername:${colors.reset} ${undername}`);
      
      const ant = ANT.init({ processId: antProcess, signer });
      const commitHash = getCommitHash();
      
      // Show simulated progress
      for (let i = 0; i <= 100; i += 20) {
        showProgress("Updating ANT record", i/100);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Update the ANT record (assumes the signer is a controller or owner)
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
    }
    
    console.log(`\n${colors.bright}${colors.fg.green}╔════ DEPLOYMENT SUCCESSFUL! ════╗${colors.reset}`);
    console.log(`${colors.fg.white}View your deployment at:${colors.reset}`);
    console.log(`${colors.bg.blue}${colors.fg.white} https://arweave.ar.io/${manifestId} ${colors.reset}`);
    console.log(`${colors.bg.blue}${colors.fg.white} https://arweave.net/${manifestId} ${colors.reset}`);

    // If ANT process is used, display the ANT URL
    if (antProcess && config.arnsName) {
      if (undername === '@' || !undername) {
        console.log(`\n${colors.fg.white}Or via ARNS at:${colors.reset}`);
        console.log(`${colors.bg.blue}${colors.fg.white} https://${config.arnsName}.ar.io${colors.reset}`);
      } else {
        console.log(`\n${colors.fg.white}Or via ARNS at:${colors.reset}`);
        console.log(`${colors.bg.blue}${colors.fg.white} https://${undername}_${config.arnsName}.ar.io ${colors.reset}`);
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