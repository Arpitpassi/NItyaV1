# NITYA - Arweave Deployment Protocol

NITYA is a tool for permanently deploying web applications and onboarding users to the decentralized Arweave network. This README provides step-by-step instructions to set up and deploy your project using NITYA, including details on pool-based deployments for larger files.

## Prerequisites

- **Node.js and npm**: Ensure Node.js (v14 or higher) and npm are installed.
- **Git**: Required for version control and automatic deployment setup. (Files up to 100KB can skip this step)
- **Arweave Wallet**: Install the Wander wallet extension for Arweave or prepare an Ethereum/Polygon private key.
- **Sponsor Server**: For pool-based deployments, ensure a sponsor server is running (default: `http://localhost:3000/upload`) and configured via `nitya-setup`.

## Installation

1. **Install perma-deploy**: Run the following command in your project directory to install the NITYA deployment tool:

   ```bash
   npm install nitya@0.0.30
   ```

## Step-by-Step Setup and Deployment

### Step 1: Connect Your Wallet

1. **Access the NITYA Interface**:

   - Open the NITYA web interface (provided URL or hosted deployment).
   - Click **Connect Wallet** and approve the connection in your Wander wallet (for Arweave) or ensure your Ethereum/Polygon wallet is ready.

2. **Verify Connection**:

   - Once connected, the interface will display "Wallet Connected" and list any ARNS (Arweave Name System) processes associated with your wallet.

### Step 2: Configure Your Project

1. **Open Configuration Form**:

   - Click **Generate Command** in the NITYA interface to open the configuration form.

2. **Fill in Project Details**:

   - **Project Name**: Optional, defaults to the current directory name.
   - **Branch**: Specify the branch to deploy (e.g., `main`).
   - **Install Command**: Specify the command to install dependencies (e.g., `npm install`).
   - **Build Command**: Specify the build command (e.g., `npm run build`).
   - **Deploy Folder**: Specify the output folder (e.g., `dist`).
   - **Wallet Type**: Select `arweave` (more options coming soon).
   - **Auto Deploy**: Check to enable automatic deployment on git commits.
   - **ANT Process**: Select an ANT process ID from your wallet (if applicable).
   - **ARNS Name**: Optional, specify an ARNS name (e.g., `myapp`).
   - **Undername**: Optional, specify an ARNS undername (e.g., `dev`).

3. **Generate Initialization Command**:

   - Click **Generate** to create the initialization command.
   - Copy the command displayed in the "Initialization Command" section.

### Step 3: Initialize Your Project

1. **Run Initialization Command**:

   - In your project directory, paste and run the copied initialization command (e.g., `npx perma-init --project-name "my-project" ...`).
   - This creates a `.perma-deploy` directory with a `config.json` file and, for Arweave wallets, generates a wallet file in `~/.permaweb/<project-name>/wallet.json`.

2. **Copy Project Wallet Address**:

   - If using an Arweave wallet, the interface or terminal will display the generated wallet address. Copy it for the next steps.
   - For Ethereum/Polygon, note that you'll need to set the `DEPLOY_KEY` environment variable later.

### Step 4: Fund and Grant Controller Access

1. **Paste Project Wallet Address**:

   - In the NITYA interface, under "Wallet Operations," paste the project wallet address and click **Set Project Wallet**.

2. **Top Up Project Wallet** (for files &gt;100KB with direct upload):

   - Click **Top Up Project Wallet** to transfer 0.1 AR from your connected wallet to the project wallet. This is required for direct uploads of folders larger than 100KB.
   - Confirm the transaction in your Wander wallet.

3. **Grant Controller Access** (if using ARNS):

   - Select an ANT process from the dropdown (if not already selected).
   - Click **Grant Controller Access** to allow the project wallet to manage the selected ARNS name.
   - Confirm the transaction in your Wander wallet.

### Step 5: Deploy Your Project

1. **Copy Deploy Command**:

   - In the NITYA interface, navigate to the "Deploy Command" section (accessible after initialization).
   - Copy the deploy command (e.g., `npm run build-and-deploy`).

2. **Set Environment Variable (for Ethereum/Polygon)**:

   - If using an Ethereum or Polygon wallet, set the `DEPLOY_KEY` environment variable:

     ```bash
     # Linux/macOS
     export DEPLOY_KEY=your_private_key_here
     # Windows
     set DEPLOY_KEY=your_private_key_here
     ```

3. **Choose Deployment Method (for files &gt;100KB)**:

   - If your deploy folder exceeds 100KB, you will be prompted in the terminal to choose between:
     - **Direct Upload**: Uses your project wallet, requiring at least 0.1 AR for funding.
     - **Sponsor Pool**: Uploads via a sponsor server, reducing the need for wallet funding. Two pool types are available:
       - **Community Pool**: Select for general use, no additional credentials needed.
       - **Event Pool**: Requires an event pool name and password for access.
   - Follow the terminal prompts:
     - Enter `y` to use a sponsor pool or `n` for direct upload.
     - If using a sponsor pool, select `1` for community pool or `2` for event pool.
     - For event pools, provide the pool name and password when prompted.

4. **Run Deploy Command**:

   - In your project directory, run the copied deploy command:

     ```bash
     npm perma-deploy
     ```

   - **Direct Upload**: The folder is uploaded to Arweave using the project wallet, with progress displayed in the terminal.

   - **Sponsor Pool**: The folder is zipped, sent to the sponsor server, and uploaded to Arweave. The terminal shows: `Zipping folder...`, `Sending to sponsor server...`, and `✓ Sponsored deployment completed` upon success.

5. **View Deployment**:

   - Upon successful deployment, the terminal will display URLs like:
     - `https://arweave.ar.io/<manifestId>`
     - `https://arweave.net/<manifestId>`
     - If using ARNS: `https://<undername>_<arnsName>.ar.io` or `https://<arnsName>.ar.io`

## Automatic Deployment (Optional)

If you enabled **Auto Deploy** during initialization:

- A git `post-commit` hook is created in `.git/hooks/post-commit`.
- Every git commit on the specified branch (e.g., `main`) will automatically run `npm run build-and-deploy`, prompting for pool selection if the folder exceeds 100KB.

## Pool-Based Deployments

Pool-based deployments are designed for folders larger than 100KB, allowing uploads via a sponsor server to reduce wallet funding requirements. Here's how it works:

- **When Triggered**: If the deploy folder exceeds 100KB, the terminal prompts: `Folder size exceeds 100KB. Do you want to use the sponsor pool for deployment? (y/n):`.
- **Pool Selection**:
  - Choose `y` to use a sponsor pool, then select:
    - `1` for **Community Pool** (no credentials needed).
    - `2` for **Event Pool** (requires pool name and password).
  - Community pools are simpler, while event pools are for specific events with restricted access.
- **Process**:
  - The deploy folder is zipped into `deploy.zip`.
  - The zip file, pool type, and (for event pools) credentials are sent to the sponsor server (`http://localhost:3000/upload`) with an API key (`deploy-api-key-123`).
  - The server handles the Arweave upload and returns a `manifestId`.
  - The temporary zip file is deleted.
- **Requirements**:
  - A sponsor wallet must be configured at `~/.nitya/sponsor/config.json` (set up via `nitya-setup`).
  - The sponsor server must be running and accessible.
- **Benefits**: Reduces the need for AR funding in the project wallet, making large deployments more accessible.
- **Limitations**:
  - Requires a running sponsor server (default: localhost).
  - Event pool deployments need valid credentials, validated by the server.
  - No real-time upload progress feedback for sponsor pool uploads.

## Troubleshooting

- **Wallet Connection Issues**:

  - Ensure the Wander wallet is installed and unlocked.
  - Refresh the NITYA interface if SDKs fail to load.

- **Deployment Fails**:

  - Verify the project wallet has sufficient AR (0.1 AR for &gt;100KB direct uploads).
  - Check the build command and deploy folder paths in `.perma-deploy/config.json`.
  - For sponsor pool errors, ensure the sponsor wallet is configured in `~/.nitya/sponsor/config.json` and the server is running.

- **Sponsor Pool Issues**:

  - Run `nitya-setup` to configure the sponsor wallet if not set up.
  - Verify the sponsor server is accessible at `http://localhost:3000/upload`.
  - For event pools, ensure the pool name and password are correct.
  - Check server logs for errors if the upload fails.

## Additional Notes

- **Wallet Funding**: For Arweave wallets, fund the project wallet with AR or Turbo credits via the NITYA interface or manually. Sponsor pools minimize this need for large files.
- **Sponsor Pools**: Community pools are ideal for general use, while event pools are suited for specific, credential-protected deployments.
- **Configuration Storage**: The `.perma-deploy/config.json` file stores your project settings. Do not commit sensitive data (e.g., wallet files) to version control.
- **Support**: Refer to the "Need Help? Setup Guide" in the NITYA interface for visual instructions.

## Example Commands

```bash
# Initialize project
npx perma-init --project-name "my-project" --build "npm run build" --branch "main" --deploy-folder "dist" --auto-deploy

<<<<<<< HEAD
This project is licensed under the GNU Affero General Public License v3.0

## Acknowledgements

- Built with Arweave and AR.IO.
- Uses @ardrive/turbo-sdk for uploads and @ar.io/sdk for ARNS management.
- Inspired by the need for simple permaweb deployment tools.



 The link to curl -s https://raw.githubusercontent.com/Arpitpassi/permadeploysetupsh/main/perma.sh | bash
=======
# Deploy project
npm perma-deploy
```
>>>>>>> refs/remotes/origin/main
