let generatedCommand = '';
let projectWalletAddress = '';
let walletSeed = '';
let mainWalletConnected = false;
let sdkLoaded = false;
let arweaveInstance = null;
let arnsData = [];
// Constants for ANT Registry and AO Gateway
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
    const grantButton = document.getElementById('grantButton');
    if (grantButton) {
      grantButton.disabled = !mainWalletConnected;
    } else {
      logDebug('Warning: grantButton not found in DOM');
    }
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
    
    statusEl.textContent = 'Connecting to wallet...';
    
    await window.arweaveWallet.connect(['SIGN_TRANSACTION', 'ACCESS_ADDRESS']);
    const address = await window.arweaveWallet.getActiveAddress();
    logDebug(`Connected wallet address: ${address}`);
    
    mainWalletConnected = true;
    
    const grantButton = document.getElementById('grantButton');
    if (grantButton) {
      grantButton.disabled = !projectWalletAddress;
    } else {
      logDebug('Warning: grantButton not found in DOM');
    }
    
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
    const grantButton = document.getElementById('grantButton');
    if (grantButton) {
      grantButton.disabled = true;
    }
    showStatusMessage('walletStatus', 'Wallet disconnected', 'success');
    logDebug('Wallet disconnected');
  } catch (error) {
    logDebug(`Disconnect error: ${error.message}`);
    showStatusMessage('walletStatus', `Error: ${error.message}`, 'error');
  }
}

async function populateArnsNames(walletAddress) {
  try {
    logDebug('Fetching ARNS names for address: ' + walletAddress);
    
    const registryUrl = 'https://cu.ardrive.io/dry-run?process-id=i_le_yKKPVstLTDSmkHRqf-wYphMnwB9OhleiTgMkWc';
    const namesUrl = 'https://cu.ardrive.io/dry-run?process-id=qNvAoz0TgcH7DMg8BCVn8jF32QH5L6T29VjHxhHqqGE';
    
    const headers = {
      'accept': '*/*',
      'content-type': 'application/json',
      'origin': 'https://arns.app',
      'referer': 'https://arns.app/'
    };

    // First API call to get owned process IDs
    const registryBody = JSON.stringify({
      Id: "1234",
      Target: "i_le_yKKPVstLTDSmkHRqf-wYphMnwB9OhleiTgMkWc",
      Owner: "1234",
      Anchor: "0",
      Data: "1234",
      Tags: [
        { name: "Action", value: "Access-Control-List" },
        { name: "Address", value: walletAddress },
        { name: "Data-Protocol", value: "ao" },
        { name: "Type", value: "Message" },
        { name: "Variant", value: "ao.TN.1" }
      ]
    });

    const registryResponse = await fetch(registryUrl, { method: 'POST', headers, body: registryBody });
    if (!registryResponse.ok) throw new Error(`Registry API error: ${registryResponse.status}`);
    
    const registryData = JSON.parse(await registryResponse.text());
    
    let ownedProcessIds = [];
    if (registryData.Messages?.[0]?.Data) {
      const ownedData = JSON.parse(registryData.Messages[0].Data);
      ownedProcessIds = ownedData.Owned || [];
    }

    logDebug(`Found ${ownedProcessIds.length} owned process IDs`);

    if (ownedProcessIds.length === 0) {
      logDebug('No owned process IDs found for this wallet');
      showStatusMessage('walletStatus', 'Wallet connected! No ARNS names found for this wallet.', 'success');
      return;
    }

    // Second API call to get names for owned process IDs (with pagination)
    let cursor = "";
    const processIdToItem = new Map();
    let keepPaging = true;

    while (keepPaging) {
      const tags = [
        { name: "Action", value: "Paginated-Records" },
        { name: "Limit", value: "1000" },
        { name: "Data-Protocol", value: "ao" },
        { name: "Type", value: "Message" },
        { name: "Variant", value: "ao.TN.1" }
      ];
      
      if (cursor) tags.push({ name: "Cursor", value: cursor });

      const namesBody = JSON.stringify({
        Id: "1234",
        Target: "qNvAoz0TgcH7DMg8BCVn8jF32QH5L6T29VjHxhHqqGE",
        Owner: "1234",
        Anchor: "0",
        Data: "1234",
        Tags: tags
      });

      const namesResponse = await fetch(namesUrl, { method: 'POST', headers, body: namesBody });
      if (!namesResponse.ok) throw new Error(`Names API error: ${namesResponse.status}`);

      const namesText = await namesResponse.text();
      const namesData = JSON.parse(namesText);
      
      if (namesData.Messages?.[0]?.Data) {
        const parsedData = JSON.parse(namesData.Messages[0].Data);
        const items = parsedData.items || [];
        
        for (const item of items) {
          if (ownedProcessIds.includes(item.processId)) {
            processIdToItem.set(item.processId, item);
          }
        }

        if (parsedData.nextCursor) {
          cursor = parsedData.nextCursor;
        } else {
          keepPaging = false;
        }
      } else {
        keepPaging = false;
      }
    }

    // Populate arnsData
    arnsData = ownedProcessIds.map(processId => {
      const item = processIdToItem.get(processId);
      if (item) {
        return {
          name: item.name,
          processId: item.processId
        };
      } else {
        return {
          name: `Unnamed (${processId})`, // Fallback for debugging
          processId
        };
      }
    }).filter(item => item.name !== `Unnamed (${item.processId})`); // Filter out unnamed items

    logDebug(`Retrieved ${arnsData.length} ARNS names`);

    const dropdown = document.getElementById('arnsNames');
    if (!dropdown) {
      logDebug('Error: Dropdown element with ID "arnsNames" not found in DOM');
      throw new Error('Dropdown element not found');
    }
    
    dropdown.innerHTML = '<option value="">Select an ARNS Name</option>';
    
    if (arnsData.length === 0) {
      logDebug('No valid ARNS names found after filtering');
      showStatusMessage('walletStatus', 'Wallet connected! No valid ARNS names found for this wallet.', 'success');
      return;
    }
    
    arnsData.forEach(({ name, processId }) => {
      const option = document.createElement('option');
      option.value = processId;
      option.textContent = name;
      dropdown.appendChild(option);
    });
    
    showStatusMessage('walletStatus', `Found ${arnsData.length} ARNS name${arnsData.length === 1 ? '' : 's'}`, 'success');
  } catch (error) {
    logDebug(`Error fetching ARNS names: ${error.message}`);
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
  const grantButton = document.getElementById('grantButton');
  if (grantButton) {
    grantButton.disabled = !mainWalletConnected;
  }
  logDebug(`Set project wallet address: ${pastedWallet}`);
  showStatusMessage('status', 'Project wallet address set successfully!', 'success');
}