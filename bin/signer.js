import crypto from 'crypto';
import Arweave from 'arweave';

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https'
});

export async function signZipBuffer(wallet, zipBuffer) {
  try {
    console.log('Preparing to sign zip buffer');
    if (!wallet) {
      throw new Error('Wallet is null or undefined');
    }
    if (!wallet.n) {
      console.error('Wallet content:', JSON.stringify(wallet, null, 2));
      throw new Error('Wallet missing public key (n field)');
    }

    console.log(`Using public key (n): ${wallet.n.substring(0, 16)}...`);
    const hash = crypto.createHash('sha256').update(zipBuffer).digest();
    const hashHex = hash.toString('hex');
    
    const signature = await arweave.crypto.sign(wallet, hash);
    const signatureB64 = Buffer.from(signature).toString('base64');
    const walletAddress = await arweave.wallets.ownerToAddress(wallet.n);
    
    console.log(`✓ Zip signed (hash: ${hashHex.substring(0, 16)}..., address: ${walletAddress})`);
    
    return {
      hash: hashHex,
      signature: signatureB64,
      publicKey: wallet.n,
      zipSize: zipBuffer.length,
      timestamp: new Date().toISOString(),
      walletAddress
    };
  } catch (error) {
    console.error(`Failed to sign zip: ${error.message}`);
    throw error;
  }
}