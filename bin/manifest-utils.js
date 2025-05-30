import { Readable } from 'stream';
import { TurboFactory, ArweaveSigner, EthereumSigner } from '@ardrive/turbo-sdk';

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

/**
 * Creates a signer instance from wallet key
 * @param {string|Object} walletKey - The wallet key (Arweave JWK JSON string, Ethereum private key, or parsed wallet object)
 * @param {string} network - The network type ('arweave', 'ethereum', 'polygon')
 * @returns {Object} - { signer, token }
 */
export function createSigner(walletKey, network = 'arweave') {
  let signer, token;

  if (typeof walletKey === 'object' && walletKey?.n && walletKey?.d) {
    signer = new ArweaveSigner(walletKey);
    token = 'arweave';
  } else if (typeof walletKey === 'string') {
    try {
      const parsedKey = JSON.parse(walletKey);
      if (parsedKey.n && parsedKey.d) {
        signer = new ArweaveSigner(parsedKey);
        token = 'arweave';
      } else {
        throw new Error('Invalid Arweave wallet JSON');
      }
    } catch {
      if (/^(0x)?[0-9a-fA-F]{64}$/.test(walletKey)) {
        signer = new EthereumSigner(walletKey);
        token = network === 'polygon' ? 'pol' : 'ethereum';
      } else {
        throw new Error('Invalid Ethereum private key or Arweave wallet JSON');
      }
    }
  } else {
    throw new Error('Wallet key must be a string or object');
  }

  return { signer, token };
}

/**
 * Uploads a manifest to Arweave using Turbo
 * @param {string|Object} walletKey - The wallet key or parsed wallet object
 * @param {Object} manifestData - The manifest data object
 * @param {string} poolType - The pool type ('public', 'event', etc.)
 * @param {string} network - The network type
 * @param {Function} showProgress - Optional progress callback
 * @param {Array} additionalTags - Optional additional tags for the upload
 * @returns {string} - The manifest transaction ID
 */
export async function uploadManifest(walletKey, manifestData, poolType = 'public', network = 'arweave', showProgress = null, additionalTags = []) {
  console.log(`${colors.fg.blue}Uploading manifest to Arweave...${colors.reset}`);
  
  const { signer, token } = createSigner(walletKey, network);
  
  const turbo = TurboFactory.authenticated({
    signer: signer,
    token: token,
  });

  const manifestBuffer = Buffer.from(JSON.stringify(manifestData, null, 2));
  const manifestStreamFactory = () => Readable.from(manifestBuffer);
  const manifestSizeFactory = () => manifestBuffer.length;

  try {
    if (showProgress) {
      showProgress('Uploading manifest', 0.5);
    }
    
    // Build default tags
    const defaultTags = [
      { name: 'App-Name', value: 'PermaDeploy' },
      { name: 'anchor', value: new Date().toISOString() },
      { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
      { name: 'Pool-Type', value: poolType }
    ];
    
    // Merge with additional tags
    const allTags = [...defaultTags, ...additionalTags];
    
    const manifestUploadResult = await turbo.uploadFile({
      fileStreamFactory: manifestStreamFactory,
      fileSizeFactory: manifestSizeFactory,
      dataItemOpts: {
        tags: allTags,
      },
    });

    if (showProgress) {
      showProgress('Uploading manifest', 1.0);
    }

    console.log(`${colors.fg.green}✓ Manifest uploaded successfully: ${manifestUploadResult.id}${colors.reset}`);
    return manifestUploadResult.id;
  } catch (error) {
    console.error(`${colors.fg.red}✗ Failed to upload manifest: ${error.message}${colors.reset}`);
    throw error;
  }
}

/**
 * Uploads a file to Arweave using Turbo
 * @param {string|Object} walletKey - The wallet key or parsed wallet object
 * @param {Function} fileStreamFactory - Function that returns a readable stream
 * @param {Function} fileSizeFactory - Function that returns file size
 * @param {string} contentType - MIME type of the file
 * @param {string} network - The network type
 * @param {Array} additionalTags - Optional additional tags
 * @returns {string} - The file transaction ID
 */
export async function uploadFile(walletKey, fileStreamFactory, fileSizeFactory, contentType, network = 'weave', additionalTags = []) {
  const { signer, token } = createSigner(walletKey, network);
  
  const turbo = TurboFactory.authenticated({
    signer: signer,
    token: token,
  });

  const defaultTags = [
    { name: 'App-Name', value: 'PermaDeploy' },
    { name: 'anchor', value: new Date().toISOString() },
    { name: 'Content-Type', value: contentType },
  ];
  
  const allTags = [...defaultTags, ...additionalTags];

  const uploadResult = await turbo.uploadFile({
    fileStreamFactory,
    fileSizeFactory,
    dataItemOpts: {
      tags: allTags,
    },
  });

  return uploadResult.id;
}