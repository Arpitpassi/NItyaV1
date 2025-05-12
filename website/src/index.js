let generatedInitCommand = '';
let generatedDeployCommand = '';

async function generateCommand() {
  try {
    const projectName = document.getElementById('projectName').value || '';
    const buildCommand = document.getElementById('buildCommand').value || 'npm run build';
    const installCommand = document.getElementById('installCommand').value || 'npm install';
    const branch = document.getElementById('branch').value || 'main';
    const deployFolder = document.getElementById('deployFolder').value || 'dist';
    const autoDeploy = document.getElementById('autoDeploy').checked;
    const sigType = document.getElementById('sigType').value;
    const arnsSelect = document.getElementById('arnsNames');
    const selectedProcessId = arnsSelect.value;
    const arnsName = document.getElementById('arnsName').value || '';
    const undername = document.getElementById('undername').value || '';

    let initCommand = 'npx perma-init';
    if (projectName) initCommand += ` --project-name "${projectName}"`;
    if (installCommand) initCommand += ` --install "${installCommand}"`;
    if (buildCommand) initCommand += ` --build "${buildCommand}"`;
    if (branch) initCommand += ` --branch "${branch}"`;
    if (deployFolder) initCommand += ` --deploy-folder "${deployFolder}"`;
    if (sigType !== 'arweave') initCommand += ` --sig-type "${sigType}"`;
    if (selectedProcessId) initCommand += ` --ant-process "${selectedProcessId}"`;
    if (arnsName) initCommand += ` --arns "${arnsName}"`;
    if (undername) initCommand += ` --undername "${undername}"`;
    if (autoDeploy) initCommand += ` --auto-deploy`;

    let initializationCommand = `# Step 1: Initialize your project\n${initCommand}`;
    let deploymentCommand = `# Deploy your project\nnpm run build-and-deploy`;
    if (sigType !== 'arweave') {
      deploymentCommand += `\n\n# For ${sigType} wallets, set your private key as an environment variable:\n# export DEPLOY_KEY=your_private_key_here\n# Or for Windows:\n# set DEPLOY_KEY=your_private_key_here`;
    }

    generatedInitCommand = initializationCommand;
    generatedDeployCommand = deploymentCommand;

    return {
      initializationCommand,
      deploymentCommand,
    };
  } catch (error) {
    console.error('Error generating command:', error);
    document.getElementById('status').textContent = `Error: ${error.message}`;
    document.getElementById('status').classList.add('error');
    return null;
  }
}

function showHelpSection() {
  document.getElementById('helpSection').style.display = 'block';
  toggleBackgroundBlur(true);
}


function toggleBackgroundBlur(blur) {
  const elements = document.querySelectorAll('body > *:not(#canvas-container):not(.configuration-form):not(.command-output):not(.help-section):not(.status-message):not(.debug-panel):not(.help-button)');
  elements.forEach(el => {
    el.classList.toggle('blur-background', blur);
  });
}

async function generateAndShowInitCommand() {
  const commands = await generateCommand();
  if (commands) {
    document.getElementById('configForm').style.display = 'none';
    document.getElementById('initCommandOutputDiv').style.display = 'block';
    document.getElementById('initCommandOutput').textContent = commands.initializationCommand;
    document.getElementById('seedOutput').textContent = 'Initialize your project and get its wallet address';
  }
}

function showDeployCommand() {
  document.getElementById('initCommandOutputDiv').style.display = 'none';
  document.getElementById('deployCommandOutputDiv').style.display = 'block';
  document.getElementById('deployCommandOutput').textContent = generatedDeployCommand;
}

function goBackToInitCommand() {
  document.getElementById('deployCommandOutputDiv').style.display = 'none';
  document.getElementById('initCommandOutputDiv').style.display = 'block';
}



function copyInitCommand() {
  const commandOutput = document.getElementById('initCommandOutput');
  navigator.clipboard.writeText(commandOutput.textContent).then(() => {
    showStatusMessage('status', 'Initialization command copied to clipboard!', 'success');
  });
}

function copyDeployCommand() {
  const commandOutput = document.getElementById('deployCommandOutput');
  navigator.clipboard.writeText(commandOutput.textContent).then(() => {
    showStatusMessage('status', 'Deployment command copied to clipboard!', 'success');
  });
}

function showStatusMessage(elementId, message, type) {
  const statusEl = document.getElementById(elementId);
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  setTimeout(() => {
    statusEl.className = 'status-message';
    statusEl.textContent = '';
  }, 3000);
}

function showConfigForm() {
  document.getElementById('configForm').style.display = 'block';
  document.querySelectorAll('.form-step').forEach((step, index) => {
    step.classList.toggle('active', index === 0);
  });
  toggleBackgroundBlur(true);
}

async function topUpWallet() {
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Initiating top-up...';
  statusEl.className = 'status-message';

  try {
    if (!window.arweaveWallet) throw new Error('Wander wallet not detected.');
    if (!mainWalletConnected) throw new Error('Connect your wallet first.');
    if (!projectWalletAddress) throw new Error('Set a project wallet address.');

    if (!arweaveInstance) arweaveInstance = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });

    const senderAddress = await window.arweaveWallet.getActiveAddress();
    const balanceAR = arweaveInstance.ar.winstonToAr(await arweaveInstance.wallets.getBalance(senderAddress));
    if (parseFloat(balanceAR) < 0.1001) throw new Error('Need at least 0.1001 AR.');

    const tx = await arweaveInstance.createTransaction({
      target: projectWalletAddress,
      quantity: arweaveInstance.ar.arToWinston('0.1')
    }, 'use_wallet');

    statusEl.textContent = 'Submitting transaction...';
    const signedTx = await window.arweaveWallet.sign(tx);
    const response = await window.arweaveWallet.dispatch(signedTx);

    showStatusMessage('status', `Top-up successful! TX ID: ${response.id}`, 'success');
  } catch (error) {
    console.error(`Top-up error: ${error.message}`);
    showStatusMessage('status', `Error: ${error.message}`, 'error');
  }
}

async function grantControllerAccess() {
  const selectedProcessId = document.getElementById('arnsNames').value;
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Granting controller access...';
  statusEl.className = 'status-message';

  try {
    if (!window.arweaveWallet) throw new Error('Wander wallet not detected.');
    if (!mainWalletConnected) throw new Error('Connect your wallet first.');
    if (!projectWalletAddress) throw new Error('Set a project wallet address.');
    if (!selectedProcessId) throw new Error('Select an ARNS name.');

    if (!window.arIO || !window.arIO.ANT) throw new Error('ARIO SDK not loaded.');

    const selectedName = document.getElementById('arnsNames').options[document.getElementById('arnsNames').selectedIndex].text;
    const ant = window.arIO.ANT.init({ processId: selectedProcessId, signer: window.arweaveWallet });
    await ant.addController({ controller: projectWalletAddress });

    showStatusMessage('status', `Controller access granted for "${selectedName}"!`, 'success');
  } catch (error) {
    console.error(`Grant controller error: ${error.message}`);
    showStatusMessage('status', `Error: ${error.message}`, 'error');
  }
}

function nextStep(currentStep) {
  const steps = document.querySelectorAll('.form-step');
  if (currentStep < steps.length - 1) {
    steps[currentStep].classList.remove('active');
    steps[currentStep + 1].classList.add('active');
  }
}

function goBack(currentStep) {
  const steps = document.querySelectorAll('.form-step');
  if (currentStep > 0) {
    steps[currentStep].classList.remove('active');
    steps[currentStep - 1].classList.add('active');
  } else {
    document.getElementById('configForm').style.display = 'none';
    toggleBackgroundBlur(false);
  }
}

function closeWindow(windowId) {
  document.getElementById(windowId).style.display = 'none';
  toggleBackgroundBlur(false);
}