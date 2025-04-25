const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const { TurboFactory, ArweaveSigner } = require('@ardrive/turbo-sdk');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Directory for storing user-submitted wallet keyfiles
const SPONSOR_WALLET_DIR = path.join(process.env.HOME, '.permaweb', 'sponsor', 'wallets');

// API keys for different endpoints
const DEPLOY_API_KEY = 'deploy-api-key-123'; // For /upload
const SPONSOR_API_KEY = 'sponsor-api-key-456'; // For /upload-wallet

// Middleware to validate API key based on endpoint
app.use((req, res, next) => {
  const apiKey = req.header('X-API-Key');
  const path = req.path;

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  if (path === '/upload' && apiKey !== DEPLOY_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key for upload endpoint' });
  }

  if (path === '/upload-wallet' && apiKey !== SPONSOR_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key for upload-wallet endpoint' });
  }

  next();
});

// Endpoint to receive user wallet keyfiles
app.post('/upload-wallet', upload.single('wallet'), async (req, res) => {
  try {
    // Validate uploaded file
    if (!req.file) {
      throw new Error('No wallet keyfile provided');
    }
    const walletPath = req.file.path;
    let walletData;
    try {
      walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
    } catch (error) {
      throw new Error(`Invalid wallet keyfile: ${error.message}`);
    }
    if (!walletData.n || !walletData.d) {
      throw new Error('Invalid Arweave JWK format');
    }

    // Derive wallet address (requires Arweave library)
    const Arweave = require('arweave');
    const arweave = Arweave.init({});
    const walletAddress = await arweave.wallets.jwkToAddress(walletData);

    // Save wallet keyfile with address as filename
    const targetPath = path.join(SPONSOR_WALLET_DIR, `${walletAddress}.json`);
    if (!fs.existsSync(SPONSOR_WALLET_DIR)) {
      fs.mkdirSync(SPONSOR_WALLET_DIR, { recursive: true });
    }
    fs.renameSync(walletPath, targetPath);

    res.json({ message: 'Wallet keyfile uploaded successfully', walletAddress });
  } catch (error) {
    console.error('Wallet upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/upload', upload.single('zip'), async (req, res) => {
  try {
    // Load available wallet keyfiles
    if (!fs.existsSync(SPONSOR_WALLET_DIR)) {
      throw new Error(`Sponsor wallet directory not found at ${SPONSOR_WALLET_DIR}`);
    }
    const walletFiles = fs.readdirSync(SPONSOR_WALLET_DIR)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(SPONSOR_WALLET_DIR, file));
    if (walletFiles.length === 0) {
      throw new Error(`No wallet keyfiles found in ${SPONSOR_WALLET_DIR}`);
    }

    // Randomly select a wallet keyfile
    const selectedWalletPath = walletFiles[Math.floor(Math.random() * walletFiles.length)];
    let sponsorWallet;
    try {
      sponsorWallet = JSON.parse(fs.readFileSync(selectedWalletPath, 'utf-8'));
    } catch (error) {
      throw new Error(`Invalid wallet keyfile at ${selectedWalletPath}: ${error.message}`);
    }
    if (!sponsorWallet.n || !sponsorWallet.d) {
      throw new Error(`Invalid Arweave JWK format in wallet keyfile: ${selectedWalletPath}`);
    }
    console.log(`Using wallet keyfile: ${selectedWalletPath}`);

    // Unzip the uploaded file
    const zipPath = req.file.path;
    const tempDir = path.join(__dirname, 'temp', Date.now().toString());
    try {
      fs.mkdirSync(tempDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create temporary directory ${tempDir}: ${error.message}`);
    }

    await new Promise((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: tempDir }))
        .on('close', resolve)
        .on('error', reject);
    });

    // Validate contents
    const files = getAllFiles(tempDir);
    const totalSize = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
    if (totalSize > 50 * 1024 * 1024) {
      throw new Error('Total size exceeds 50 MB');
    }

    const allowedExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg'];
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        throw new Error(`Invalid file type: ${ext}`);
      }
    }

    // Upload to Arweave using selected sponsor wallet
    const signer = new ArweaveSigner(sponsorWallet);
    const turbo = TurboFactory.authenticated({ signer, token: 'arweave' });

    const uploadResult = await turbo.uploadFolder({
      folderPath: tempDir,
      dataItemOpts: {
        tags: [
          { name: 'App-Name', value: 'PermaDeploy' },
          { name: 'anchor', value: new Date().toISOString() },
        ],
      },
    });

    const manifestId = uploadResult.manifestResponse.id;

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.unlinkSync(zipPath);

    res.json({ manifestId });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

function getAllFiles(dir) {
  let files = [];
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  });
  return files;
}

app.listen(3000, () => {
  console.log('Sponsor server running on port 3000');
});