let generatedInitCommand = '';
let generatedDeployCommand = '';
// Assume arnsData is globally available from index.js
// If not, you may need to import or share it (see Notes below)

function toggleEventPoolFields() {
  const useEventPool = document.getElementById('useEventPool').checked;
  document.getElementById('eventPoolFields').style.display = useEventPool ? 'block' : 'none';
}

async function generateCommand() {
  try {
    const projectName = document.getElementById('projectName').value || '';
    const buildCommand = document.getElementById('buildCommand').value || 'npm --version';
    const installCommand = document.getElementById('installCommand').value || '';
    const branch = document.getElementById('branch').value || 'main';
    const deployFolder = document.getElementById('deployFolder').value || 'dist';
    const autoDeploy = document.getElementById('autoDeploy').checked;
    const sigType = document.getElementById('sigType').value;
    const arnsSelect = document.getElementById('arnsNames');
    const selectedProcessId = arnsSelect.value;
    const undername = document.getElementById('undername').value || '';
    const useEventPool = document.getElementById('useEventPool').checked;
    const eventPoolId = useEventPool ? document.getElementById('eventPoolId').value : '';

    // Find the ARNS name for the selected processId
    const selectedArns = arnsData.find(item => item.processId === selectedProcessId);
    if (selectedProcessId && !selectedArns) {
      throw new Error('Selected ARNS name not found in loaded data. Please refresh and try again.');
    }
    const arnsName = selectedArns ? selectedArns.name : '';

    let initCommand = 'npx nitya init';
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
    if (useEventPool && eventPoolId) initCommand += ` --event-pool-id "${eventPoolId}"`;

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
    showStatusMessage('status', `Error: ${error.message}`, 'error');
    return null;
  }
}

function showHelpSection() {
  document.getElementById('helpSection').style.display = 'block';
  toggleBackgroundBlur(true);
}

async function generateAndShowInitCommand() {
  const commands = await generateCommand();
  if (commands) {
    document.getElementById('configForm').style.display = 'none';
    document.getElementById('initCommandOutputDiv').style.display = 'block';
    document.getElementById('initCommandOutput').textContent = commands.initializationCommand;
    document.getElementById('seedOutput').textContent = 'Initialize your project and get its wallet address';
    const grantButton = document.getElementById('grantButton');
    if (grantButton) {
      grantButton.disabled = !mainWalletConnected || !projectWalletAddress;
    }
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

function showConfigForm() {
  document.getElementById('configForm').style.display = 'block';
  document.querySelectorAll('.form-step').forEach((step, index) => {
    step.classList.toggle('active', index === 0);
  });
  toggleBackgroundBlur(true);
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

function toggleEventPoolFields() {
  const checkbox = document.getElementById('useEventPool');
  const fields = document.getElementById('eventPoolFields');
  
  if (checkbox.checked) {
    showEventPoolTerms();
  } else {
    fields.style.display = 'none';
  }
}

function showEventPoolTerms() {
  document.getElementById('eventPoolTerms').style.display = 'block';
}

function acceptEventPoolTerms() {
  document.getElementById('eventPoolFields').style.display = 'block';
  closeWindow('eventPoolTerms');
  document.getElementById('useEventPool').checked = true;
}

function declineEventPoolTerms() {
  document.getElementById('useEventPool').checked = false;
  document.getElementById('eventPoolFields').style.display = 'none';
  closeWindow('eventPoolTerms');
}