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
VERSION=$(grep -oP '"version":\s*"\K[^"]+' "$EXTENSION_DIR/manifest.json")

echo "Building Comping v$VERSION..."

# Create build directory if it doesn't exist
mkdir -p "$BUILD_DIR"

# Clean previous builds
rm -f "$BUILD_DIR"/*.xpi "$BUILD_DIR"/*.zip

# Firefox .xpi (signed package)
echo "Creating Firefox .xpi package..."
cd "$EXTENSION_DIR"
zip -r -FS "../$BUILD_DIR/comping-$VERSION.xpi" \
  manifest.json \
  background.js \
  popup.html \
  popup.js \
  content/ \
  shared/ \
  -x "*.git*" "*.DS_Store" "*~"
cd ..

# Chrome .zip (for manual installation in developer mode)
echo "Creating Chrome .zip package..."
cd "$EXTENSION_DIR"
zip -r -FS "../$BUILD_DIR/comping-$VERSION-chrome.zip" \
  manifest.json \
  background.js \
  popup.html \
  popup.js \
  content/ \
  shared/ \
  -x "*.git*" "*.DS_Store" "*~"
cd ..

echo ""
echo "Build complete!"
echo "  Firefox package: $BUILD_DIR/comping-$VERSION.xpi"
echo "  Chrome package:  $BUILD_DIR/comping-$VERSION-chrome.zip"
echo ""
echo "Installation instructions:"
echo "  Firefox: See INSTALLATION.md for .xpi installation"
echo "  Chrome:  See INSTALLATION.md for .zip installation"
