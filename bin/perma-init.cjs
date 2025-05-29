#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const Arweave = require('arweave');
const { execSync } = require('child_process');
const readline = require('readline');

// ANSI colors and styling for terminal outputs
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

function printTitle() {
  console.log(`${colors.fg.magenta}
    ███╗   ██╗██╗████████╗██╗   ██╗ █████╗ 
    ████╗  ██║██║╚══██╔══╝╚██╗ ██╔╝██╔══██╗
    ██╔██╗ ██║██║   ██║    ╚████╔╝ ███████║
    ██║╚██╗██║██║   ██║     ╚██╔╝  ██╔══██║
    ██║ ╚████║██║   ██║      ██║   ██║  ██║
    ╚═╝  ╚═══╝╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝
                                                                      
    ${colors.fg.white}> Permanently deploy your web apps to the decentralized Arweave network${colors.fg.cyan}    
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

// Function to make wallet address copyable
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
          console.log(`${colors.fg.red}Tip: For Linux, install xsel, xclip, or wl-copy for clipboard support.${colors.reset}`);
        }
      }
      
      resolve();
    });
  });
}

// Progress bar for visual feedback
function progressBar(percent, width = 30) {
  const filled = Math.round(width * (percent / 100));
  const empty = width - filled;
  const bar = `${colors.fg.green}[${'█'.repeat(filled)}${colors.fg.red}${' '.repeat(empty)}] ${percent.toFixed(0)}%${colors.reset}`;
  process.stdout.write(`\r${bar}`);
  if (percent === 100) process.stdout.write('\n');
}

async function main() {
  printTitle();

  const argv = yargs(hideBin(process.argv))
    .option('project-name', {
      type: 'string',
      description: 'Project name',
      default: path.basename(process.cwd())
    })
    .option('build', {
      type: 'string',
      description: 'Build command (e.g., npm run build)'
    })
    .option('branch', {
      type: 'string',
      description: 'Branch to deploy (e.g., main)'
    })
    .option('arns', {
      type: 'string',
      description: 'ARNS name (e.g., myapp)'
    })
    .option('undername', {
      type: 'string',
      description: 'ARNS undername (e.g., dev)'
    })
    .option('ant-process', {
      type: 'string',
      description: 'ANT process ID'
    })
    .option('seed', {
      type: 'string',
      description: 'Base64 encoded 32-byte seed',
      default: 'nLiri9U5Y24YFg+Sy38WJyWb7BCffFQCihik2M3eCUY='
    })
    .option('sig-type', {
      type: 'string',
      description: 'The type of signer to be used for deployment',
      choices: ['arweave', 'ethereum', 'polygon'],
      default: 'arweave'
    })
    .option('deploy-folder', {
      type: 'string',
      description: 'Folder to deploy',
      default: 'dist'
    })
    .option('auto-deploy', {
      type: 'boolean',
      description: 'Setup automatic deployment on commit',
      default: false
    })
    .option('event-pool-id', {
      type: 'string',
      description: 'Event pool ID for sponsored deployment'
    })  
    .check(argv => {
      if (argv.sigType === 'arweave' && !argv.seed) {
        throw new Error('--seed is required when sig-type is arweave');
      }
      return true;
    })
    .argv;

  const projectName = argv['project-name'];
  const sigType = argv['sig-type'];

  console.log(`\n${colors.bright}${colors.fg.yellow}╔════ PROJECT CONFIGURATION ════╗${colors.reset}`);
  console.log(`${colors.fg.cyan}● Project:${colors.reset} ${projectName}`);
  console.log(`${colors.fg.cyan}● Signer Type:${colors.reset} ${sigType}`);
  console.log(`${colors.fg.cyan}● Deploy Folder:${colors.reset} ${argv['deploy-folder'] || 'dist'}`);
  
  if (argv.build) console.log(`${colors.fg.cyan}● Build Command:${colors.reset} ${argv.build}`);
  if (argv.branch) console.log(`${colors.fg.cyan}● Deploy Branch:${colors.reset} ${argv.branch}`);
  if (argv.arns) console.log(`${colors.fg.cyan}● ARNS Name:${colors.reset} ${argv.arns}`);
  if (argv.undername) console.log(`${colors.fg.cyan}● Undername:${colors.reset} ${argv.undername}`);
  if (argv['ant-process']) console.log(`${colors.fg.cyan}● ANT Process:${colors.reset} ${argv['ant-process']}`);
  if (argv['event-pool-id']) console.log(`${colors.fg.cyan}● Event Pool ID:${colors.reset} ${argv['event-pool-id']}`);

  // Define the .permaweb directory in the home directory
  const permawebDir = path.join(os.homedir(), '.permaweb');
  if (!fs.existsSync(permawebDir)) {
    console.log(`${colors.fg.blue}Creating directory:${colors.reset} ${permawebDir}`);
    fs.mkdirSync(permawebDir);
  }

  // Define the project-specific directory inside .permaweb
  const projectDir = path.join(permawebDir, projectName);
  if (!fs.existsSync(projectDir)) {
    console.log(`${colors.fg.blue}Creating project directory:${colors.reset} ${projectDir}`);
    fs.mkdirSync(projectDir);
  }

  // Define the wallet path inside the project directory
  const walletPath = path.join(projectDir, 'wallet.json');

  let walletAddress = '';
  let existingWalletPath = null;
  let existingWalletAddress = null;

  // Check for existing config to reuse wallet if possible
  const configPath = path.join(process.cwd(), '.perma-deploy', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (existingConfig.sigType === 'arweave' && existingConfig.walletPath && fs.existsSync(existingConfig.walletPath)) {
        existingWalletPath = existingConfig.walletPath;
        existingWalletAddress = existingConfig.walletAddress;
      }
    } catch (error) {
      console.warn(`${colors.fg.yellow}⚠ Warning: Could not read existing config.json for wallet check - ${error.message}. Proceeding with new wallet if needed.${colors.reset}`);
    }
  }

  // Handle wallet creation based on sig-type
  if (sigType === 'arweave') {
    console.log(`\n${colors.bright}${colors.fg.yellow}╔════ ARWEAVE WALLET SETUP ════╗${colors.reset}`);
    
    if (existingWalletPath && existingWalletAddress) {
      console.log(`${colors.fg.blue}Using existing wallet from: ${existingWalletPath}${colors.reset}`);
      walletAddress = existingWalletAddress;
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

      // Initialize Arweave
      const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
      const wallet = await arweave.wallets.generate(); // Generate JWK
      walletAddress = await arweave.wallets.jwkToAddress(wallet);

      // Save wallet to ~/.permaweb/<project-name>/wallet.json
      fs.writeFileSync(walletPath, JSON.stringify(wallet, null, 2));
      console.log(`\n${colors.fg.green}✓ Arweave wallet saved to:${colors.reset} ${walletPath}`);
    }

    // Make wallet address copyable
    console.log(`\n${colors.bright}${colors.fg.yellow}╔════ WALLET ADDRESS ════╗${colors.reset}`);
    await makeWalletCopyable(walletAddress);
    console.log(`${colors.fg.green}Make sure to fund this wallet with AR or Turbo credits before deployment if the file size is greater than 100kb.${colors.reset}`);
   
  } else {
    console.log(`\n${colors.bright}${colors.fg.yellow}╔════ ${sigType.toUpperCase()} WALLET SETUP ════╗${colors.reset}`);
    console.log(`${colors.fg.blue}ℹ Using ${sigType} wallet for deployment. No wallet file needed.${colors.reset}`);
    console.log(`${colors.fg.green}ℹ You will need to set the DEPLOY_KEY environment variable with your private key.${colors.reset}`);
    console.log(`${colors.fg.green}ℹ For ${sigType} wallets, provide the raw private key without encoding.${colors.reset}`);
  }

  // Create .perma-deploy directory if it doesn't exist
  const permaDeployDir = path.join(process.cwd(), '.perma-deploy');
  if (!fs.existsSync(permaDeployDir)) {
    console.log(`${colors.fg.blue}Creating .perma-deploy directory...${colors.reset}`);
    fs.mkdirSync(permaDeployDir);
  }

  // Save config
  let config = {
    projectName,
    walletPath: sigType === 'arweave' ? (existingWalletPath || walletPath) : null,
    buildCommand: argv.build || '',
    deployBranch: argv.branch || 'main',
    arnsName: argv.arns || null,
    undername: argv.undername || null,
    antProcess: argv['ant-process'] || null,
    deployFolder: argv['deploy-folder'] || 'dist',
    sigType,
    walletAddress,
    eventPoolId: argv['event-pool-id'] || null,
  };

  // Check if config.json already exists
  if (fs.existsSync(configPath)) {
    console.log(`${colors.fg.blue}Updating existing configuration...${colors.reset}`);
    try {
      const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      // Merge new config with existing, only updating provided fields
      config = {
        ...existingConfig,
        projectName: argv['project-name'] !== path.basename(process.cwd()) ? projectName : existingConfig.projectName,
        walletPath: sigType === 'arweave' ? (existingWalletPath || walletPath) : null,
        buildCommand: argv.build !== undefined ? argv.build : existingConfig.buildCommand,
        deployBranch: argv.branch !== undefined ? argv.branch : existingConfig.deployBranch,
        arnsName: argv.arns !== undefined ? argv.arns : existingConfig.arnsName,
        undername: argv.undername !== undefined ? argv.undername : existingConfig.undername,
        antProcess: argv['ant-process'] !== undefined ? argv['ant-process'] : existingConfig.antProcess,
        deployFolder: argv['deploy-folder'] !== undefined ? argv['deploy-folder'] : existingConfig.deployFolder,
        sigType: argv['sig-type'] !== undefined ? sigType : existingConfig.sigType,
        walletAddress: walletAddress || existingConfig.walletAddress,
        eventPoolId: argv['event-pool-id'] !== undefined ? argv['event-pool-id'] : existingConfig.eventPoolId,
      };
    } catch (error) {
      console.warn(`${colors.fg.yellow}⚠ Warning: Could not read existing config.json - ${error.message}. Creating new config.${colors.reset}`);
    }
  } else {
    console.log(`${colors.fg.blue}Creating new configuration...${colors.reset}`);
  }

  // Write the updated or new config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`${colors.fg.green}✓ Configuration saved to: ${configPath}${colors.reset}`);
  
  // Create deploy script in package.json
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      console.log(`${colors.fg.blue}Updating package.json with deploy scripts...${colors.reset}`);
      
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Add deploy script
      if (!packageJson.scripts) packageJson.scripts = {};
      
      let deployCommand = 'perma-deploy';
      if (config.antProcess) {
        deployCommand += ` --ant-process ${config.antProcess}`;
      }
      if (config.undername) {
        deployCommand += ` --undername ${config.undername}`;
      }
      
      packageJson.scripts['deploy'] = deployCommand;
      
      // Add build and deploy combined script only if build command is provided
      if (config.buildCommand) {
        packageJson.scripts['build-and-deploy'] = `${config.buildCommand} && npx nitya deploy`;
      }
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log(`${colors.fg.green}✓ Added deploy scripts to package.json${colors.reset}`);
    }
  } catch (error) {
    console.warn(`${colors.fg.yellow}⚠ Warning: Could not update package.json - ${error.message}${colors.reset}`);
  }

  // Set up automatic deployment
  if (argv['auto-deploy']) {
    try {
      // Check if git is initialized
      if (!fs.existsSync(path.join(process.cwd(), '.git'))) {
        console.log(`${colors.fg.blue}Initializing git repository...${colors.reset}`);
        execSync('git init', { stdio: 'inherit' });
      }
      
      // Setup post-commit hook
      const hookScript = `#!/bin/sh
# Auto-deploy to Arweave
echo "Running auto-deploy to Arweave..."
npx nitya deploy
`;
      const hooksDir = path.join(process.cwd(), '.git', 'hooks');
      const hookPath = path.join(hooksDir, 'post-commit');
      
      if (!fs.existsSync(hooksDir)) {
      // Validate hookScript content for compatibility
      if (!hookScript.startsWith('#!/bin/sh')) {
        console.error(`${colors.fg.red}Error: Hook script is not compatible with the shell environment. Ensure it starts with #!/bin/sh.${colors.reset}`);
        process.exit(1);
      }

      fs.writeFileSync(hookPath, hookScript);
      }
      fs.writeFileSync(hookPath, hookScript);
      fs.chmodSync(hookPath, '755');
      console.log(`${colors.fg.green}✓ Set up post-commit hook for automatic deployment${colors.reset}`);
    } catch (error) {
      console.warn(`${colors.fg.yellow}⚠ Warning: Could not set up automatic deployment - ${error.message}${colors.reset}`);
    }
  }

  // Create a README.md file with deployment instructions if it doesn't exist
  const readmePath = path.join(process.cwd(), 'README.md');
  if (!fs.existsSync(readmePath)) {
    console.log(`${colors.fg.blue}Creating README.md with deployment instructions...${colors.reset}`);
    
    const readmeContent = `# ${projectName}

## Deployment Information

This project is configured to deploy to Arweave using the perma-deploy tools.

### Configuration
- Project name: ${config.projectName}
- Build command: ${config.buildCommand || ''}
- Deploy branch: ${config.deployBranch || 'main'}
- Deploy folder: ${config.deployFolder || 'dist'}
- Signer type: ${config.sigType}
${config.arnsName ? `- ARNS name: ${config.arnsName}` : ''}
${config.undername ? `- Undername: ${config.undername}` : ''}
${config.antProcess ? `- ANT process: ${config.antProcess}` : ''}
${config.eventPoolId ? `- Event Pool ID: ${config.eventPoolId}` : ''}

### Deployment Instructions

1. Make sure your environment is properly set up:
   ${config.sigType === 'arweave' ? 
     `- The wallet at ${config.walletPath} should be funded with AR or Turbo credits.` : 
     `- Set the DEPLOY_KEY environment variable with your ${config.sigType} private key.`}

2. Deploy your application:
   \`\`\`
   npx nitya deploy
   \`\`\`

${argv['auto-deploy'] ? '**Note:** This project is configured to automatically deploy on every commit.' : ''}
`;
    fs.writeFileSync(readmePath, readmeContent);
    console.log(`${colors.fg.green}✓ Created README.md with deployment instructions${colors.reset}`);
  }

  console.log(`\n${colors.bright}${colors.fg.green}╔════ SETUP COMPLETE! ════╗${colors.reset}`);
  console.log(`${colors.fg.white}● Config saved to: ${configPath}${colors.reset}`);

  // Check if any of these properties are defined in the config
  const hasAntConfig = config.antProcess !== null && config.antProcess !== undefined;
  const hasArnsName = config.arnsName !== null && config.arnsName !== undefined;
  const hasUndername = config.undername !== null && config.undername !== undefined;

  if (config.antProcess) {
    console.log(`\n${colors.fg.white}Your app will be deployed to: https://arweave.net/[YOUR_TX_ID]${colors.reset}`);
    if (config.arnsName && config.undername) {
      console.log(`${colors.fg.white}And will be accessible via: ${config.undername}_${config.arnsName}.ar.io${colors.reset}`);
    } else if (config.arnsName) {
      console.log(`${colors.fg.white}And will be accessible via: ${config.arnsName}.ar${colors.reset}`);
    }
  }

  console.log(`\n${colors.fg.white}Get started with:${colors.reset}`);

  // If none of the properties are defined in the config, show npx command
  if (!hasAntConfig && !hasArnsName && !hasUndername) {
    console.log(`${colors.bg.green}${colors.fg.black} npx nitya deploy and top up your wallet with turbo credits ${colors.reset}`);
  } else {
    console.log(`${colors.bg.green}${colors.fg.black} Granting controller access and top up your wallet with turbo credits ${colors.reset}`);
  }
}

main().catch(error => {
  console.error(`${colors.fg.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});