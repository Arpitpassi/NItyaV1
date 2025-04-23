# Nitya - Deploy to Arweave

A web-based tool to simplify deploying projects to the Arweave permaweb. This application provides an intuitive interface for configuring projects, generating deployment commands, and managing Arweave wallets and ARNS (Arweave Name System) processes. We bring back the control of deployments of your projects back to you in your own hands.

## Features

- **Wallet Integration**: Connect to Arweave wallets (e.g., Wander) or Ethereum/Polygon wallets for deployment.
- **Project Configuration**: Easily configure project details like build commands, branches, and deploy folders.
- **ARNS Support**: Link deployments to ARNS names and undernames for human-readable URLs.
- **Command Generation**: Generate initialization and deployment commands for use with perma-deploy tools.
- **Wallet Operations**: Fund project wallets and grant controller access to ARNS processes.
- **Automatic Deployment**: Optionally set up auto-deployment on git commits.
- **Responsive UI**: A sleek interface with light/dark mode and particle animations.

## Prerequisites

Before using Nitya, ensure you have:

- A modern web browser (Chrome, Firefox, etc.).
- An Arweave wallet (e.g., Wander) or an Ethereum/Polygon wallet (e.g., MetaMask, though compatibility is limited to specific operations).
- Node.js installed for running deployment commands.
- A funded Arweave wallet for deployments (minimum ~0.1 AR for small files; more for larger uploads).
- (Optional) Git installed for automatic deployment setups.

## Getting Started

### 1. Access the Application

**Option A: Hosted Version**
Visit the hosted version at [Insert hosted URL here, e.g., https://nitya_enginesoup.ar.io

**Option B: Run Locally**
Clone the repository and serve the application locally:

```bash
git clone https://github.com/Arpitpassi/Nitya(formerly anantweb).git
cd Nitya
npm install
npm start
```

Open http://localhost:3000 in your browser (assumes you have a basic Node.js server setup, not included in provided code).

### 2. Connect Your Wallet

1. Click **Connect Wallet** (Step 1).
2. Select your wallet type (Arweave, Ethereum, or Polygon).
3. Approve the connection in your wallet (e.g., Wander for Arweave).
4. Once connected, your ARNS processes (if any) will populate the dropdown.

### 3. Configure Your Project

1. Click **Generate Command** (Step 2).
2. Fill out the configuration form:
   - **Project Name** (optional): Name your project.
   - **Branch**: Git branch to deploy (e.g., main).
   - **Install Command**: Dependency installation command (e.g., npm install).
   - **Build Command**: Build command (e.g., npm run build).
   - **Deploy Folder**: Output folder (e.g., dist).
   - **Auto-Deploy**: Check to enable automatic deployment on commits.
   - **Wallet Type**: Choose Arweave, Ethereum, or Polygon.
   - **ANT Process**: Select an ARNS process (if applicable).
   - **ARNS Name** (optional): Specify an ARNS name (e.g., myapp).
   - **Undername** (optional): Specify an undername (e.g., dev).
3. Click Next through the steps and Generate to create the commands.

### 4. Initialize Your Project

1. Copy the Initialization Command from the output. Example:

```bash
npm install nitya@0.0.11
npx perma-deploy-init --project-name "my-project" --build "npm run build" --branch "main" --deploy-folder "dist" --auto-deploy 
```

2. Run the command in your project's root directory.
   - This sets up a `.perma-deploy` directory with configuration.
   - For Arweave wallets, it generates a wallet file in `~/.permaweb/<project-name>/wallet.json`.
   - Updates package.json with deploy and build-and-deploy scripts.
   - Optionally sets up a git pre-commit hook for auto-deployment.

3. If using an Arweave wallet, note the generated wallet address and fund it:
   - Fund with at least 0.1 AR (or Turbo credits) for small deployments.
   - Use the **Top Up Project Wallet** button to send 0.1 AR to the project wallet (requires main wallet connection).

4. If using ARNS, grant controller access to the project wallet:
   - Select an ANT process and click **Grant Controller Access**.

### 5. Deploy Your Project

1. Copy the Deploy Command from the output. Example:

```bash
npm run perma-deploy-deploy
```

2. Run the command in your project directory.
   - Builds the project using the specified build command.
   - Uploads the deploy-folder (e.g., dist) to Arweave.
   - Updates the ARNS record (if configured) with the new transaction ID.

3. View your deployment at:
   - `https://arweave.net/[TX_ID]` (transaction ID from deployment output).
   - Or via ARNS: `https://[undername].[arns-name].ar` (e.g., dev.myapp.ar).

### 6. Automatic Deployment (Optional)

If you enabled Auto-Deploy, every git commit on the specified branch wilnitya@0.0.11l trigger:

```bash
npm run perma-deploy-deploy
```

Ensure your project wallet is funded to avoid failed deployments.

## Deployment Information

### Configuration Storage:
- Project config: `./.perma-deploy/config.json`.
- Arweave wallet: `~/.permaweb/<project-name>/wallet.json`.

### Signer Types:
- **Arweave**: Uses a generated wallet (requires funding).
- **Ethereum/Polygon**: Set DEPLOY_KEY environment variable with your private key.

```bash
export DEPLOY_KEY=your_private_key_here  # Linux/Mac
set DEPLOY_KEY=your_private_key_here     # Windows
```

### ARNS Integration:
- Requires an ANT process ID (owned or controlled by your wallet).
- Updates undername records with deployment transaction IDs.

### Turbo Integration:
- Uses @ardrive/turbo-sdk for efficient uploads.
- Supports Arweave, Ethereum, and Polygon signers.

## Project Structure

```
Nitya/
├── dist/                    # Bundled JS dependencies
├── src/
│   ├── index.js             # Main logic (wallet, commands, UI)
│   ├── style.css            # Styles for the interface
├── index.html               # Main HTML file
├── perma-deploy-init.js     # CLI for project initialization
├── perma-deploy-deploy.js   # CLI for deployment
├── README.md                # This file
```

## Troubleshooting

### Wallet Connection Issues:
- Ensure Wander is installed and unlocked for Arweave wallets.
- Check browser console or debug panel (index.js:logDebug) for errors.

### SDK Loading Errors:
- Refresh the page if AR.IO or Arweave SDKs fail to load.
- Verify internet connectivity (scripts load from unpkg.com).

### Deployment Fails:
- Check if the project wallet is funded (Arweave).
- Verify DEPLOY_KEY for Ethereum/Polygon wallets.
- Ensure deploy-folder exists and is not empty.

### ARNS Not Updating:
- Confirm the wallet has controller/owner access to the ANT process.
- Use Grant Controller Access if needed.

### Auto-Deploy Not Triggering:
- Verify `.git/hooks/pre-commit` exists and is executable (`chmod +x`).
- Check git initialization (`git init`).

## Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature-name`).
3. Commit changes (`git commit -m "Add feature"`).
4. Push to the branch (`git push origin feature-name`).
5. Open a Pull Request.

Please include tests and update documentation as needed.

## License

This project is licensed under the GNU Affero General Public License v3.0

## Acknowledgements

- Built with Arweave and AR.IO.
- Uses @ardrive/turbo-sdk for uploads and @ar.io/sdk for ARNS management.
- Inspired by the need for simple permaweb deployment tools.
