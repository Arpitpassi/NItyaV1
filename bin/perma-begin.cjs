#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { hideBin } = require('yargs/helpers');
const yargs = require('yargs');
const Arweave = require('arweave');
const { execSync } = require('child_process');
const readline = require('readline');
const { EthereumSigner, TurboFactory } = require('@ardrive/turbo-sdk');
const { ANT, ArweaveSigner } = require('@ar.io/sdk');

// ANSI colors for terminal styling
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  
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

// Simple title display
function printTitle() {
  console.log(`${colors.fg.magenta}
    ███╗   ██╗██╗████████╗██╗   ██╗ █████╗ 
    ████╗  ██║██║╚══██╔══╝╚██╗ ██╔╝██╔══██╗
    ██╔██╗ ██║██║   ██║    ╚████╔╝ ███████║
    ██║╚██╗██║██║   ██║     ╚██╔╝  ██╔══██║
    ██║ ╚████║██║   ██║      ██║   ██║  ██║
    ╚═╝  ╚═══╝╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝
                                                                      
    ${colors.fg.white}> Permanently deploy your web apps to the decentralized Arweave network${colors.reset}
    ${colors.fg.cyan}    
    ┌────┐        ┌────┐
    │${colors.fg.blue}████${colors.fg.cyan}│━━━━━━━━│${colors.fg.blue}████${colors.fg.cyan}│     ${colors.fg.white}PERMANENT DEPLOYMENT${colors.fg.cyan}
    └────┘╲      ╱└────┘     ${colors.fg.white}DECENTRALIZED${colors.fg.cyan}
           ╲    ╱
            ╲  ╱
           ┌────┐
           │${colors.fg.blue}████${colors.fg.cyan}│
           └────┘
         
`);
}

// Copy wallet address to clipboard
function makeWalletCopyable(text) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log(`\n${colors.bg.black}${colors.fg.white} ${text} ${colors.reset}`);
  console.log(`${colors.fg.yellow}Press 'c' to copy wallet address to clipboard, any other key to continue...${colors.reset}`);
  
  return new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdin.once('data', (data) => {
      const key = data.toString().toLowerCase();
      process.stdin.setRawMode(false);
      rl.close();
      
      if (key === 'c') {
        try {
          // Different copy commands based on OS
          if (process.platform === 'darwin') { // macOS
            execSync(`echo "${text}" | pbcopy`);
          } else if (process.platform === 'win32') { // Windows
            execSync(`echo ${text} | clip`);
          } else { // Linux and others
            // Check for available clipboard utilities
            let clipboardCommand = '';
            
            try {
              // Try xsel first
              execSync('which xsel', { stdio: 'ignore' });
              clipboardCommand = `echo "${text}" | xsel -ib`;
            } catch {
              try {
                // Try xclip if xsel is not available
                execSync('which xclip', { stdio: 'ignore' });
                clipboardCommand = `echo "${text}" | xclip -selection clipboard`;
              } catch {
                try {
                  // Try wl-copy (for Wayland)
                  execSync('which wl-copy', { stdio: 'ignore' });
                  clipboardCommand = `echo "${text}" | wl-copy`;
                } catch {
                  // No clipboard utility found
                  throw new Error('No clipboard utility found');
                }
              }
            }
            
            // Execute the selected clipboard command
            execSync(clipboardCommand);
          }
          console.log(`${colors.fg.green}\nWallet address copied to clipboard!${colors.reset}`);
        } catch (err) {
          console.log(`${colors.fg.red}Couldn't copy automatically. Please copy manually:${colors.reset}`);
          console.log(`${colors.fg.yellow}${text}${colors.reset}`);
        }
      }
      
      resolve();
    });
  });
}

// Visual progress bar
function progressBar(percent, width = 30) {
  const filled = Math.round(width * (percent / 100));
  const empty = width - filled;
  const bar = `${colors.fg.green}[${'█'.repeat(filled)}${colors.fg.red}${' '.repeat(empty)}] ${percent.toFixed(0)}%${colors.reset}`;
  process.stdout.write(`\r${bar}`);
  if (percent === 100) process.stdout.write('\n');
}

// Calculate size of a directory
function getDirectorySize(dirPath) {
  let totalSize = 0;
  
  function readDir(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        readDir(filePath);
      } else {
        totalSize += stats.size;
      }
    }
  }
  
  readDir(dirPath);
  return totalSize;
}

// Format bytes to human-readable size
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Get list of directories in a path
function getDirectories(sourcePath) {
  return fs.readdirSync(sourcePath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

// Ask user to select a directory
async function selectDirectory(dirs) {
  if (dirs.length === 0) {
    console.log(`${colors.fg.red}No directories found in current path.${colors.reset}`);
    process.exit(1);
  }
  
  console.log(`${colors.fg.cyan}Available directories to deploy:${colors.reset}`);
  dirs.forEach((dir, index) => {
    console.log(`${colors.fg.white}${index + 1}. ${dir}${colors.reset}`);
  });
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    rl.question(`${colors.fg.yellow}Enter directory number to deploy (1-${dirs.length}) or full path: ${colors.reset}`, resolve);
  });
  rl.close();
  
  // If user entered a number, get that directory
  if (/^\d+$/.test(answer) && parseInt(answer) >= 1 && parseInt(answer) <= dirs.length) {
    return dirs[parseInt(answer) - 1];
  }
  // Otherwise, assume they entered a path
  return answer;
}

async function main() {
  printTitle();

  const argv = yargs(hideBin(process.argv))
    .option('project-name', {
      type: 'string',
      description: 'Project name',
      default: path.basename(process.cwd())
    })
    .option('folder', {
      type: 'string',
      description: 'Folder to deploy (if omitted, will scan and prompt)',
    })
    .option('sig-type', {
      type: 'string',
      description: 'The type of signer to be used for deployment',
      choices: ['arweave', 'ethereum', 'polygon'],
      default: 'arweave'
    })
    .option('seed', {
      type: 'string',
      description: 'Base64 encoded 32-byte seed',
      default: 'nLiri9U5Y24YFg+Sy38WJyWb7BCffFQCihik2M3eCUY='
    })
    .argv;

  const projectName = argv['project-name'];
  const sigType = argv['sig-type'];
  let deployFolder = argv['folder'];

  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ PROJECT CONFIGURATION ════╗${colors.reset}`);
  console.log(`${colors.fg.cyan}● Project:${colors.reset} ${projectName}`);
  console.log(`${colors.fg.cyan}● Signer Type:${colors.reset} ${sigType}`);

  // If no folder specified, scan and prompt
  if (!deployFolder) {
    console.log(`\n${colors.bright}${colors.fg.yellow}╔════ SELECT FOLDER TO DEPLOY ════╗${colors.reset}`);
    const currentPath = process.cwd();
    const dirs = getDirectories(currentPath);
    
    // Add current directory as an option if it contains files
    const files = fs.readdirSync(currentPath).filter(item => 
      !fs.statSync(path.join(currentPath, item)).isDirectory() && 
      !item.startsWith('.') && 
      item !== 'node_modules');
      
    if (files.length > 0) {
      console.log(`${colors.fg.blue}Current directory contains ${files.length} files that can be deployed.${colors.reset}`);
      dirs.unshift('.');  // Add current directory as first option
    }
    
    // Let user select a directory
    deployFolder = await selectDirectory(dirs);
  }

  const deployPath = path.resolve(process.cwd(), deployFolder);
  
  if (!fs.existsSync(deployPath)) {
    console.error(`${colors.fg.red}✗ Selected folder does not exist:${colors.reset} ${deployPath}`);
    process.exit(1);
  }
  
  console.log(`${colors.fg.green}✓ Will deploy folder:${colors.reset} ${deployPath}`);

  // Create .permaweb directory
  const permawebDir = path.join(os.homedir(), '.permaweb');
  if (!fs.existsSync(permawebDir)) {
    console.log(`${colors.fg.blue}Creating directory:${colors.reset} ${permawebDir}`);
    fs.mkdirSync(permawebDir);
  }

  // Create project directory
  const projectDir = path.join(permawebDir, projectName);
  if (!fs.existsSync(projectDir)) {
    console.log(`${colors.fg.blue}Creating project directory:${colors.reset} ${projectDir}`);
    fs.mkdirSync(projectDir);
  }

  // Create wallet
  const walletPath = path.join(projectDir, 'wallet.json');
  let walletAddress = '';
  let wallet;
  
  if (sigType === 'arweave') {
    console.log(`\n${colors.bright}${colors.fg.yellow}╔════ ARWEAVE WALLET ════╗${colors.reset}`);
    
    // Check if wallet already exists
    if (fs.existsSync(walletPath)) {
      console.log(`${colors.fg.blue}Loading existing wallet from:${colors.reset} ${walletPath}`);
      try {
        wallet = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
        const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
        walletAddress = await arweave.wallets.jwkToAddress(wallet);
        console.log(`${colors.fg.green}✓ Wallet loaded successfully${colors.reset}`);
      } catch (error) {
        console.error(`${colors.fg.red}Error loading wallet: ${error.message}${colors.reset}`);
        process.exit(1);
      }
    } else {
      // Validate base64 seed
      let seedBuffer;
      try {
        seedBuffer = Buffer.from(argv.seed, 'base64');
        if (seedBuffer.length !== 32) throw new Error('Seed must be 32 bytes.');
      } catch (error) {
        console.error(`${colors.fg.red}✗ Error: Invalid base64 seed - ${error.message}${colors.reset}`);
        process.exit(1);
      }

      // Show wallet generation progress
      console.log(`${colors.fg.blue}Generating wallet...${colors.reset}`);
      
      for (let i = 0; i <= 100; i += 10) {
        progressBar(i);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Generate wallet
      const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
      wallet = await arweave.wallets.generate();
      walletAddress = await arweave.wallets.jwkToAddress(wallet);

      // Save wallet
      fs.writeFileSync(walletPath, JSON.stringify(wallet, null, 2));
      console.log(`\n${colors.fg.green}✓ Arweave wallet saved to:${colors.reset} ${walletPath}`);
    }

    // Display wallet address and make it copyable
    console.log(`\n${colors.bright}${colors.fg.yellow}╔════ WALLET ADDRESS ════╗${colors.reset}`);
    await makeWalletCopyable(walletAddress);
  } else {
    console.log(`\n${colors.bright}${colors.fg.yellow}╔════ ${sigType.toUpperCase()} WALLET SETUP ════╗${colors.reset}`);
    console.log(`${colors.fg.blue}ℹ Using ${sigType} wallet for deployment. Please ensure the DEPLOY_KEY environment variable is set.${colors.reset}`);
  }

  // Calculate size of files to deploy
  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ CHECKING DEPLOYMENT SIZE ════╗${colors.reset}`);
  const folderSize = getDirectorySize(deployPath);
  const formattedSize = formatBytes(folderSize);
  console.log(`${colors.fg.blue}Total size to upload:${colors.reset} ${formattedSize}`);

  // Check if size is > 100KB and wallet needs funding
  const TURBO_FREE_LIMIT = 100 * 1024; // 100KB
  if (folderSize > TURBO_FREE_LIMIT) {
    console.log(`\n${colors.fg.yellow}⚠ Deployment size exceeds 100KB free limit.${colors.reset}`);
    console.log(`${colors.fg.yellow}Your wallet needs to be funded with AR or Turbo credits.${colors.reset}`);
    
    // Check if wallet is funded (by attempting a simple Arweave API call)
    console.log(`${colors.fg.blue}Checking wallet balance...${colors.reset}`);
    
    try {
      const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
      const balance = await arweave.wallets.getBalance(walletAddress);
      const ar = arweave.ar.winstonToAr(balance);
      
      console.log(`${colors.fg.green}Current wallet balance:${colors.reset} ${ar} AR`);
      
      if (parseFloat(ar) === 0) {
        console.log(`\n${colors.fg.yellow}╔════ FUNDING REQUIRED ════╗${colors.reset}`);
        console.log(`${colors.fg.yellow}Your wallet has no funds. To deploy, you need to fund this wallet:${colors.reset}`);
        await makeWalletCopyable(walletAddress);
        console.log(`\n${colors.fg.yellow}You can fund with AR tokens or purchase Turbo credits.${colors.reset}`);
        console.log(`${colors.fg.yellow}Would you like to continue with deployment once funded? (y/n)${colors.reset}`);
        
        const answer = await new Promise((resolve) => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          rl.question('> ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase());
          });
        });
        
        if (answer !== 'y' && answer !== 'yes') {
          console.log(`${colors.fg.blue}Deployment canceled. Fund your wallet and try again later.${colors.reset}`);
          process.exit(0);
        }
      }
    } catch (error) {
      console.error(`${colors.fg.red}Error checking wallet balance: ${error.message}${colors.reset}`);
      console.log(`${colors.fg.yellow}Please ensure your wallet is funded before continuing.${colors.reset}`);
    }
  } else {
    console.log(`${colors.fg.green}✓ Size is under 100KB, can be uploaded for free with Turbo${colors.reset}`);
  }

  // Deploy to Arweave
  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ DEPLOYING TO ARWEAVE ════╗${colors.reset}`);
  
  try {
    // Prepare signer
    let signer;
    let token;
    
    if (sigType === 'arweave') {
      signer = new ArweaveSigner(wallet);
      token = 'arweave';
      console.log(`${colors.fg.blue}Using Arweave signer${colors.reset}`);
    } else {
      const DEPLOY_KEY = process.env.DEPLOY_KEY;
      if (!DEPLOY_KEY) {
        console.error(`${colors.fg.red}✗ DEPLOY_KEY environment variable not set${colors.reset}`);
        process.exit(1);
      }
      
      signer = new EthereumSigner(DEPLOY_KEY);
      token = sigType === 'polygon' ? 'pol' : 'ethereum';
      console.log(`${colors.fg.blue}Using ${sigType} signer${colors.reset}`);
    }

    // Initialize TurboFactory with signer and token
    const turbo = TurboFactory.authenticated({
      signer: signer,
      token: token,
    });

    // Upload with progress simulation
    let lastProgress = 0;
    const updateInterval = setInterval(() => {
      lastProgress += Math.random() * 0.05;
      if (lastProgress > 0.95) {
        clearInterval(updateInterval);
        lastProgress = 0.95;
      }
      progressBar(lastProgress * 100);
    }, 300);

    // Perform the actual upload
    const uploadResult = await turbo.uploadFolder({
      folderPath: deployPath,
      dataItemOpts: {
        tags: [
          {
            name: 'App-Name',
            value: 'PermaBegin',
          },
          {
            name: 'Content-Type',
            value: 'text/html',
          },
          {
            name: 'Deploy-Date',
            value: new Date().toISOString(),
          },
          // prevents identical transaction IDs from eth wallets
          {
            name: 'anchor',
            value: new Date().toISOString(),
          },
        ],
      },
    });

    clearInterval(updateInterval);
    progressBar(100);

    const manifestId = uploadResult.manifestResponse.id;
    
    console.log(`\n${colors.bright}${colors.fg.green}╔════ DEPLOYMENT SUCCESSFUL! ════╗${colors.reset}`);
    console.log(`${colors.fg.white}Your webpage is permanently available at:${colors.reset}`);
    console.log(`${colors.bg.blue}${colors.fg.white} https://arweave.net/${manifestId} ${colors.reset}`);
    console.log(`${colors.bg.blue}${colors.fg.white} https://arweave.ar.io/${manifestId} ${colors.reset}`);
    
  } catch (error) {
    console.error(`\n${colors.fg.red}✗ Deployment failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`${colors.fg.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});