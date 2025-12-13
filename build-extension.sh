#!/usr/bin/env bash

# Build script for Comping browser extension
# Creates installable packages for Firefox (.xpi) and Chrome (.zip)

set -e

# Check for required tools
if ! command -v zip &> /dev/null; then
    echo "Error: 'zip' command not found."
    echo ""
    echo "Please install zip:"
    echo "  - Debian/Ubuntu: sudo apt-get install zip"
    echo "  - Fedora/RHEL:   sudo dnf install zip"
    echo "  - macOS:         brew install zip"
    echo "  - NixOS:         nix-shell -p zip"
    echo "  - Arch Linux:    sudo pacman -S zip"
    exit 1
fi

EXTENSION_DIR="comping"
BUILD_DIR="build"
TEMP_BUILD_DIR="$BUILD_DIR/temp"
VERSION=$(grep -oP '"version":\s*"\K[^"]+' "$EXTENSION_DIR/manifest.json")

echo "Building Comping v$VERSION..."

# Create build directories
mkdir -p "$BUILD_DIR"
mkdir -p "$TEMP_BUILD_DIR"

# Clean previous builds
rm -f "$BUILD_DIR"/*.xpi "$BUILD_DIR"/*.zip
rm -rf "$TEMP_BUILD_DIR"/*

# Copy extension files to temp build directory
echo "Copying extension files..."
cp -r "$EXTENSION_DIR"/* "$TEMP_BUILD_DIR/"

# Disable debug mode for production build
echo "Disabling debug mode for production..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS requires an empty string argument for -i
  sed -i '' 's/let DEBUG = true;/let DEBUG = false;/' "$TEMP_BUILD_DIR/shared/debug-utils.js"
else
  # Linux (including GitHub Actions)
  sed -i 's/let DEBUG = true;/let DEBUG = false;/' "$TEMP_BUILD_DIR/shared/debug-utils.js"
fi

# Firefox .xpi (signed package)
echo "Creating Firefox .xpi package..."
cd "$TEMP_BUILD_DIR"
zip -r -FS "../comping-$VERSION.xpi" \
  manifest.json \
  background.js \
  popup.html \
  popup.js \
  content/ \
  shared/ \
  -x "*.git*" "*.DS_Store" "*~"
cd ../..

# Chrome .zip (for manual installation in developer mode)
echo "Creating Chrome .zip package..."
cd "$TEMP_BUILD_DIR"
zip -r -FS "../comping-$VERSION-chrome.zip" \
  manifest.json \
  background.js \
  popup.html \
  popup.js \
  content/ \
  shared/ \
  -x "*.git*" "*.DS_Store" "*~"
cd ../..

# Clean up temp directory
echo "Cleaning up..."
rm -rf "$TEMP_BUILD_DIR"

echo ""
echo "Build complete!"
echo "  Firefox package: $BUILD_DIR/comping-$VERSION.xpi"
echo "  Chrome package:  $BUILD_DIR/comping-$VERSION-chrome.zip"
