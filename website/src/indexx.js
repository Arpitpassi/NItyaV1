let generatedCommand = '';
let projectWalletAddress = '';
let walletSeed = '';
let mainWalletConnected = false;
let sdkLoaded = false;
let arweaveInstance = null;
let arnsData = [];

const REGISTRY_PROCESS_ID = 'bq53rqJm0cHSBm45zS4LOEyXE-IgumsMr9DnO6g608E';
const AO_GATEWAY = 'https://ao.link';

function logDebug(message) {
  const debugPanel = document.getElementById('debugPanel');
  debugPanel.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${message}</div>`;
  debugPanel.scrollTop = debugPanel.scrollHeight;
  console.log(message);
}

function toggleDebugPanel() {
  const debugPanel = document.getElementById('debugPanel');
  debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
}

function showStatusMessage(elementId, message, type) {
  const statusEl = document.getElementById(elementId);
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.classList.remove('hidden');
  setTimeout(() => {
    statusEl.classList.add('hidden');
    statusEl.textContent = '';
    statusEl.className = 'status-message';
  }, 5000);
}

function toggleBackgroundBlur(show) {
  const elements = document.querySelectorAll('body > *:not(#canvas-container):not(.configuration-form):not(.command-output):not(.help-section):not(.status-message):not(.debug-panel):not(.help-button)');
  elements.forEach(el => {
    el.classList.toggle('blur-background', show);
  });
}

function initArweave() {
  if (window.Arweave) {
    arweaveInstance = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
    logDebug('Arweave initialized successfully');
    return arweaveInstance;
  }
  throw new Error('Arweave SDK not loaded');
}

document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlWallet = urlParams.get('wallet');
  if (urlWallet) {
    projectWalletAddress = urlWallet;
    document.getElementById('projectWalletInput').value = projectWalletAddress;
    document.getElementById('projectWalletDisplay').textContent = `Project Wallet Address: ${projectWalletAddress}`;
    document.getElementById('topUpButton').disabled = !mainWalletConnected;
    document.getElementById('grantButton').disabled = !mainWalletConnected;
  }
  
  logDebug(`Available globals - Arweave: ${typeof window.Arweave !== 'undefined'}, arIO: ${typeof window.arIO !== 'undefined'}, window.arweaveWallet: ${typeof window.arweaveWallet !== 'undefined'}`);
  
  try {
    initArweave();
  } catch (error) {
    logDebug(`Failed to initialize Arweave: ${error.message}`);
    showStatusMessage('walletStatus', 'Error initializing Arweave. Please refresh the page.', 'error');
  }
});

function checkWalletAvailability() {
  const wanderWallet = window.arweaveWallet;
  if (wanderWallet) {
    logDebug('Wander wallet detected');
    return { wallet: wanderWallet, type: 'wander' };
  }
  if (window.ethereum && window.ethereum.isMetaMask) {
    logDebug('MetaMask detected, but not compatible');
    return { wallet: null, type: 'unsupported', message: 'MetaMask detected but not compatible with Arweave. Please install Wander wallet.' };
  }
  logDebug('No wallet detected');
  return { wallet: null, type: 'none', message: 'No Arweave wallet detected. Please install Wander wallet.' };
}

function isSdkLoaded() {
  const arweaveLoaded = typeof window.Arweave !== 'undefined';
  const arIOLoaded = typeof window.arIO !== 'undefined' && typeof window.arIO.ANTRegistry !== 'undefined';
  const antLoaded = typeof window.arIO !== 'undefined' && typeof window.arIO.ANT !== 'undefined';
  logDebug(`SDK check - Arweave: ${arweaveLoaded}, arIO: ${arIOLoaded}, ANT: ${antLoaded}`);
  return arweaveLoaded && arIOLoaded && antLoaded;
}

async function waitForSdkToLoad(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (isSdkLoaded()) {
      sdkLoaded = true;
      logDebug('SDKs already loaded');
      return resolve();
    }
    
    logDebug(`Waiting for SDKs to load (timeout: ${timeout}ms)`);
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (isSdkLoaded()) {
        clearInterval(checkInterval);
        sdkLoaded = true;
        logDebug('SDKs loaded successfully');
        resolve();
      }
      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        logDebug(`SDK loading timeout after ${timeout}ms`);
        reject(new Error('SDK loading timeout. Please refresh the page.'));
      }
    }, 100);
  });
}

async function initializeAndConnectWallet() {
  const statusEl = document.getElementById('walletStatus');
  const connectBtn = document.getElementById('connect-wallet');
  const disconnectBtn = document.getElementById('disconnect-wallet');
  const walletText = document.getElementById('wallet-connected-text');
  
  try {
    statusEl.textContent = 'Checking wallet availability...';
    statusEl.className = 'status-message';
    
    const walletInfo = checkWalletAvailability();
    
    if (!walletInfo.wallet) {
      throw new Error(walletInfo.message || 'Wander wallet not detected. Please install Wander.');
    }
    
    logDebug(`Using wallet type: ${walletInfo.type}`);
    
    statusEl.textContent = 'Loading AR.IO SDK...';
    
    if (!sdkLoaded) {
      await waitForSdkToLoad(15000);
    }
    
    statusEl.textContent = 'Connecting to wallet...';
    
    await window.arweaveWallet.connect(['SIGN_TRANSACTION', 'ACCESS_ADDRESS']);
    const address = await window.arweaveWallet.getActiveAddress();
    logDebug(`Connected wallet address: ${address}`);
    
    mainWalletConnected = true;
    document.getElementById('topUpButton').disabled = !projectWalletAddress;
    document.getElementById('grantButton').disabled = !projectWalletAddress;
    
    statusEl.textContent = 'Fetching ARNS names...';
    await populateArnsNames(address);
    
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'block';
    walletText.style.display = 'block';
    showStatusMessage('walletStatus', 'Wallet connected and ARNS names loaded!', 'success');
  } catch (error) {
    console.error('Initialization error:', error);
    logDebug(`Initialization error: ${error.message}`);
    showStatusMessage('walletStatus', `Error: ${error.message}`, 'error');
  }
}

async function disconnectWallet() {
  const connectBtn = document.getElementById('connect-wallet');
  const disconnectBtn = document.getElementById('disconnect-wallet');
  const walletText = document.getElementById('wallet-connected-text');
  
  try {
    await window.arweaveWallet.disconnect();
    mainWalletConnected = false;
    connectBtn.style.display = 'block';
    disconnectBtn.style.display = 'none';
    walletText.style.display = 'none';
    document.getElementById('topUpButton').disabled = true;
    document.getElementById('grantButton').disabled = true;
    showStatusMessage('walletStatus', 'Wallet disconnected', 'success');
    logDebug('Wallet disconnected');
  } catch (error) {
    logDebug(`Disconnect error: ${error.message}`);
    showStatusMessage('walletStatus', `Error: ${error.message}`, 'error');
  }
}

async function getANTProcessesOwnedByWallet({ address, registry }) {
  try {
    const res = await registry.accessControlList({ address });
    if (!res || (!res.Owned && !res.Controlled)) {
      return [];
    }
    
    const owned = Array.isArray(res.Owned) ? res.Owned : [];
    const controlled = Array.isArray(res.Controlled) ? res.Controlled : [];
    return [...new Set([...owned, ...controlled])];
  } catch (error) {
    logDebug(`Error in getANTProcessesOwnedByWallet: ${error.message}`);
    return [];
  }
}

async function populateArnsNames(address) {
  try {
    if (!sdkLoaded) {
      await waitForSdkToLoad();
    }
    
    logDebug('Fetching ANT processes for address: ' + address);
    
    if (!window.arIO || !window.arIO.ANTRegistry || !window.arIO.ANT) {
      throw new Error('ARIO SDK or ANT SDK not loaded or initialized properly');
    }
    
    const registry = window.arIO.ANTRegistry.init();
    const processes = await getANTProcessesOwnedByWallet({ address, registry });
    
    // Loop through process IDs to fetch names
    arnsData = [];
    for (const processId of processes) {
      try {
        const ant = window.arIO.ANT.init({ processId });
        const info = await ant.getInfo();
        const name = info.name || processId; // Fallback to processId if name is not available
        arnsData.push({ name, processId });
        logDebug(`Retrieved name "${name}" for process ID: ${processId}`);
      } catch (error) {
        logDebug(`Error fetching name for process ID ${processId}: ${error.message}`);
        arnsData.push({ name: processId, processId }); // Fallback to processId
      }
    }
    
    logDebug(`Retrieved ${arnsData.length} processes`);
    
    const dropdown = document.getElementById('arnsNames');
    dropdown.innerHTML = '<option value="">Select an ARNS Name</option>';
    
    if (arnsData.length === 0) {
      showStatusMessage('walletStatus', 'Wallet connected! No ARNS processes found for this wallet.', 'success');
      return;
    }
    
    arnsData.forEach(({ name, processId }) => {
      const option = document.createElement('option');
      option.value = processId; // Use processId as the value
      option.textContent = name; // Display the name
      dropdown.appendChild(option);
    });
    
    showStatusMessage('walletStatus', `Found ${arnsData.length} ARNS name${arnsData.length === 1 ? '' : 's'}`, 'success');
  } catch (error) {
    logDebug(`Error fetching ANT processes: ${error.message}`);
    showStatusMessage('walletStatus', `Error loading ARNS names: ${error.message}`, 'error');
    throw error;
  }
}

function usePastedWallet() {
  const pastedWallet = document.getElementById('projectWalletInput').value.trim();
  if (!pastedWallet) {
    showStatusMessage('status', 'Error: Please enter a valid wallet address.', 'error');
    return;
  }
  projectWalletAddress = pastedWallet;
  document.getElementById('projectWalletDisplay').textContent = `Project Wallet Address: ${pastedWallet}`;
  document.getElementById('topUpButton').disabled = !mainWalletConnected;
  document.getElementById('grantButton').disabled = !mainWalletConnected;
  logDebug(`Set project wallet address: ${pastedWallet}`);
  showStatusMessage('status', 'Project wallet address set successfully!', 'success');
}
