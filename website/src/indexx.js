let generatedInitCommand = '';
let generatedDeployCommand = '';

const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

class Particle {
  constructor() {
    this.reset();
  }
  
  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 4 + 2;
    const colors = [
      'rgba(255, 158, 233, 0.8)', // neon pink
      'rgba(144, 224, 255, 0.8)', // neon blue
      'rgba(162, 255, 204, 0.8)', // neon green
      'rgba(195, 156, 255, 0.8)'  // neon purple
    ];
    this.color = colors[Math.floor(Math.random() * colors.length)];
    this.vx = (Math.random() - 0.5) * 1;
    this.vy = (Math.random() - 0.5) * 1;
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
      this.reset();
    }
  }
  
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

const particles = [];
const particleCount = 50;
for (let i = 0; i < particleCount; i++) {
  particles.push(new Particle());
}

let animationActive = false;
let particleAnimationId = null;

function animate() {
  if (!animationActive) return;
  ctx.fillStyle = document.body.classList.contains('light-mode') ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  particles.forEach(particle => {
    particle.update();
    particle.draw();
  });
  particleAnimationId = requestAnimationFrame(animate);
}

function startParticleAnimation() {
  if (!animationActive) {
    animationActive = true;
    canvas.style.display = 'block';
    animate();
  }
}

function stopParticleAnimation() {
  animationActive = false;
  canvas.style.display = 'none';
  if (particleAnimationId) {
    cancelAnimationFrame(particleAnimationId);
    particleAnimationId = null;
  }
}

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

    // Build the initialization command
    let initCommand = 'npx perma-init';
    if (projectName) initCommand += ` --project-name "${projectName}"`;
    if (buildCommand) initCommand += ` --install "${installCommand}"`;
    if (buildCommand) initCommand += ` --build "${buildCommand}"`;
    if (branch) initCommand += ` --branch "${branch}"`;
    if (deployFolder) initCommand += ` --deploy-folder "${deployFolder}"`;
    if (sigType !== 'arweave') initCommand += ` --sig-type "${sigType}"`;
    if (selectedProcessId) initCommand += ` --ant-process "${selectedProcessId}"`;
    if (arnsName) initCommand += ` --arns "${arnsName}"`;
    if (undername) initCommand += ` --undername "${undername}"`;
    if (autoDeploy) initCommand += ` --auto-deploy`;
    

    // Split into initialization and deployment commands
    let initializationCommand = `# Step 1: Initialize your project\n${initCommand}`;
    let deploymentCommand = `# Deploy your project\nnpm run build-and-deploy`;
    if (sigType !== 'arweave') {
      deploymentCommand += `\n\n# For ${sigType} wallets, set your private key as an environment variable:\n# export DEPLOY_KEY=your_private_key_here\n# Or for Windows:\n# set DEPLOY_KEY=your_private_key_here`;
    }

    // Store the commands globally
    generatedInitCommand = initializationCommand;
    generatedDeployCommand = deploymentCommand;


    return {
      initializationCommand,
      deploymentCommand,
    };
  } catch (error) {
    console.error('Error generating command:', error);
    document.getElementById('status').textContent = `Error: ${error.message}`;
    document.getElementById('status').className = 'status-message error';
    return null;
  }
}


function showHelpSection() {
  document.getElementById('metaTitle').style.display = 'none';
  document.getElementById('subtitle').style.display = 'none';
  document.getElementById('helpSection').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'block';
  toggleBackgroundBlur(true);
  startParticleAnimation();
}

function closeWindow(windowId) {
  document.getElementById(windowId).style.display = 'none';
  document.getElementById('metaTitle').style.display = 'block';
  document.getElementById('subtitle').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'none';
  stopParticleAnimation();
  toggleBackgroundBlur(false);
}
// Generate and show initialization command
async function generateAndShowInitCommand() {
  const commands = await generateCommand();
  if (commands) {
    document.getElementById('configForm').style.display = 'none';
    document.getElementById('initCommandOutputDiv').style.display = 'block';
    document.getElementById('initCommandOutput').textContent = commands.initializationCommand;
    
   

      document.getElementById('seedOutput').textContent = 'Initialize your project and get its wallet address';
    
  }
}

// Show deploy command
function showDeployCommand() {
  document.getElementById('initCommandOutputDiv').style.display = 'none';
  document.getElementById('deployCommandOutputDiv').style.display = 'block';
  document.getElementById('deployCommandOutput').textContent = generatedDeployCommand;
}

// Go back to initialization command from deploy command
function goBackToInitCommand() {
  document.getElementById('deployCommandOutputDiv').style.display = 'none';
  document.getElementById('initCommandOutputDiv').style.display = 'block';
}

// Copy initialization command
function copyInitCommand() {
  const commandOutput = document.getElementById('initCommandOutput');
  const range = document.createRange();
  range.selectNode(commandOutput);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.execCommand('copy');
  window.getSelection().removeAllRanges();
  
  showStatusMessage('status', 'Initialization command copied to clipboard!', 'success');
}

// Copy deployment command
function copyDeployCommand() {
  const commandOutput = document.getElementById('deployCommandOutput');
  const range = document.createRange();
  range.selectNode(commandOutput);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.execCommand('copy');
  window.getSelection().removeAllRanges();
  
  showStatusMessage('status', 'Deployment command copied to clipboard!', 'success');
}

// Close windows
function closeWindow(windowId) {
  document.getElementById(windowId).style.display = 'none';
  document.getElementById('metaTitle').style.display = 'block';
  document.getElementById('subtitle').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'none';
  stopParticleAnimation();
  toggleBackgroundBlur(false);
}

function showConfigForm() {
  document.getElementById('metaTitle').style.display = 'none';
  document.getElementById('subtitle').style.display = 'none';
  document.getElementById('configForm').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'block';
  document.querySelectorAll('.form-step').forEach((step, index) => {
    step.classList.toggle('active', index === 0);
  });
  toggleBackgroundBlur(true);
  startParticleAnimation();
}

// Navigate to wallet operations step
function goToWalletOperations() {
  document.getElementById('commandOutputDiv').style.display = 'none';
  document.getElementById('configForm').style.display = 'flex';
  nextStep(3); // Go to step 4 (wallet operations)
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
    logDebug(`Top-up error: ${error.message}`);
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

    const selectedName = document.getElementById('arnsNames').options[document.getElementById('arnsNames').selectedIndex].textContent;
    const ant = window.arIO.ANT.init({ processId: selectedProcessId, signer: window.arweaveWallet });
    await ant.addController({ controller: projectWalletAddress });

    showStatusMessage('status', `Controller access granted for "${selectedName}"!`, 'success');
  } catch (error) {
    logDebug(`Grant controller error: ${error.message}`);
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
  if (currentStep === 0 || currentStep === 4) {
    document.getElementById('configForm').style.display = 'none';
    document.getElementById('commandOutputDiv').style.display = 'none';
    document.getElementById('metaTitle').style.display = 'block';
    document.getElementById('subtitle').style.display = 'block';
    document.getElementById('particleCanvas').style.display = 'none';
    toggleBackgroundBlur(false);
    stopParticleAnimation();
  } else {
    steps[currentStep].classList.remove('active');
    steps[currentStep - 1].classList.add('active');
  }
}

function closeWindow(windowId) {
  document.getElementById(windowId).style.display = 'none';
  document.getElementById('metaTitle').style.display = 'block';
  document.getElementById('subtitle').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'none';
  stopParticleAnimation();
  toggleBackgroundBlur(false);
  }


function generateCommandWrapper() {
  generateCommand();
  document.getElementById('configForm').style.display = 'none';
  document.getElementById('commandOutputDiv').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'none';
  toggleBackgroundBlur(true);
}

function goToWalletOperations() {
  document.getElementById('commandOutputDiv').style.display = 'none';
  document.getElementById('configForm').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'block';
  toggleBackgroundBlur(true);
  document.querySelectorAll('.form-step').forEach((step, index) => {
    step.classList.toggle('active', index === 3);
  });
}

function showConfigForm() {
  document.getElementById('metaTitle').style.display = 'none';
  document.getElementById('subtitle').style.display = 'none';
  document.getElementById('configForm').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'block';
  document.querySelectorAll('.form-step').forEach((step, index) => {
    step.classList.toggle('active', index === 0);
  });
  toggleBackgroundBlur(true);
  startParticleAnimation();
}

document.addEventListener('DOMContentLoaded', function() {
  const themeToggle = document.getElementById('themeToggle');
  themeToggle.addEventListener('click', function() {
    document.body.classList.toggle('light-mode');
    themeToggle.textContent = document.body.classList.contains('light-mode') ? 'DARK MODE' : 'LIGHT MODE';
  });
  
  document.getElementById('generateCommandBtn').addEventListener('click', showConfigForm);
});


