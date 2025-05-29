import fs from 'fs';
import path from 'path';
import Arweave from 'arweave';

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https'
});

export async function loadWallet(walletPath) {
  try {
    console.log(`Attempting to load wallet from: ${walletPath}`);
    if (!fs.existsSync(walletPath)) {
      throw new Error(`Wallet file not found at: ${walletPath}`);
    }

    const walletData = await fs.promises.readFile(walletPath, 'utf8');
    let wallet;
    try {
      wallet = JSON.parse(walletData);
      console.log('Wallet JSON parsed successfully');
    } catch (parseError) {
      throw new Error(`Failed to parse wallet file: ${parseError.message}`);
    }
    
    // Validate required JWK fields
    if (!wallet.kty || !wallet.n || !wallet.e || !wallet.d) {
      console.error('Wallet content:', JSON.stringify(wallet, null, 2));
      throw new Error('Invalid Arweave JWK: missing required fields (kty, n, e, d)');
    }
    
    // Derive wallet address for verification
    const walletAddress = await arweave.wallets.ownerToAddress(wallet.n);
    console.log(`✓ Wallet loaded successfully. Address: ${walletAddress}`);
    
    return wallet;
  } catch (error) {
    console.error(`Failed to load wallet: ${error.message}`);
    throw error;
  }
}

export function loadSponsorConfig() {
  const SPONSOR_DIR = path.join(process.env.HOME, '.nitya', 'sponsor');
  const CONFIG_PATH = path.join(SPONSOR_DIR, 'config.json');
  
  if (!fs.existsSync(CONFIG_PATH)) {
    console.warn(`Sponsor configuration not found at ${CONFIG_PATH}. Proceeding with defaults.`);
    return {};
  }
  
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    console.log('✓ Sponsor configuration loaded');
    return config;
  } catch (error) {
    console.error(`Error reading sponsor config: ${error.message}`);
    throw error;
  }
}

export async function loadProjectWallet(walletPath = null) {
  try {
    let resolvedWalletPath = walletPath;
    
    // If no walletPath provided, try to load from config
    if (!resolvedWalletPath) {
      const config = loadSponsorConfig();
      if (!config.projectWalletPath) {
        throw new Error('Project wallet path not found in config. Please specify walletPath or set up your project wallet in ~/.perma-deploy/config.json.');
      }
      resolvedWalletPath = path.resolve(config.projectWalletPath);
    }
    
    console.log(`Resolved project wallet path: ${resolvedWalletPath}`);
    if (!fs.existsSync(resolvedWalletPath)) {
      throw new Error(`Project wallet file not found at: ${resolvedWalletPath}`);
    }
    
    const wallet = await loadWallet(resolvedWalletPath);
    return { walletData: wallet, walletPath: resolvedWalletPath };
  } catch (error) {
    console.error(`Error loading project wallet: ${error.message}`);
    throw error;
  }
}