#!/bin/bash

# Download the license file
wget -O LICENSE "https://arweave.net/Kr6X0H7gN2yfbfwn1SzBxlpziLOat0lIC0U2Pvl9xdQ"

# Verify the hash
HASH=$(sha256sum LICENSE | cut -d' ' -f1)
EXPECTED_HASH="8486a10c4393cee1c25392769ddd3b2d6c242d6ec7928e1414efff7dfb2f07ef"

if [ "$HASH" != "$EXPECTED_HASH" ]; then
  echo "Error: Hash mismatch!"
  echo "Expected: $EXPECTED_HASH"
  echo "Got:      $HASH"
  exit 1
fi

echo "License file verified with correct hash"

# Create a temporary directory for the license file
mkdir -p /tmp/license-template
cp LICENSE /tmp/license-template/

# Use git filter-branch to add the license file to every commit
git filter-branch --force --tree-filter '
  # Copy license file if it doesnt exist
  if [ ! -f LICENSE ]; then
    cp /tmp/license-template/LICENSE .
  fi
' --tag-name-filter cat -- --all

# Clean up
rm -rf /tmp/license-template

echo "License added to all commits in repository history"
echo "WARNING: This has rewritten history. You will need to force push with:"
echo "git push --force --all origin"
