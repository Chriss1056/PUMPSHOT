#!/bin/bash

# ============================================
# Pumpshot Docker Update Script
# ============================================

set -e  # Exit on any error

# --- Configuration ---
CONTAINER_NAME="pumpshot"
PROJECT_DIR="PUMPSHOT"
PORT="3000"
TEMP_CONTAINER_NAME="${CONTAINER_NAME}_new"

# --- Get version info from user ---
read -p "Enter the OLD version number to remove (e.g. 1.0): " OLD_VERSION
read -p "Enter the NEW version number to build (e.g. 1.1): " NEW_VERSION

# Confirm before proceeding
echo ""
echo "=== Summary ==="
echo "Old image to remove: ${CONTAINER_NAME}:v${OLD_VERSION}"
echo "New image to build:  ${CONTAINER_NAME}:v${NEW_VERSION}"
echo "================"
read -p "Proceed? (y/n): " CONFIRM

if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

# --- Navigate to project directory ---
echo ""
echo ">>> Navigating to ${PROJECT_DIR}/..."
cd "${PROJECT_DIR}/"

# --- Check for .env file ---
echo ">>> Checking for .env file..."
if [[ ! -f ".env" ]]; then
    echo ""
    echo "❌ ERROR: No .env file found in $(pwd)"
    echo "Please create a .env file before running this script."
    exit 1
fi
echo "✅ .env file found."

# --- Pull latest code ---
echo ""
echo ">>> Fetching latest changes from remote..."
git fetch

echo ""
echo ">>> Pulling latest changes..."
git pull

# --- Verify .env still exists after pull ---
if [[ ! -f ".env" ]]; then
    echo ""
    echo "❌ ERROR: .env file missing after git pull!"
    exit 1
fi

# --- Build the new image ---
echo ""
echo ">>> Building new image '${CONTAINER_NAME}:v${NEW_VERSION}'..."
docker build -t "${CONTAINER_NAME}:v${NEW_VERSION}" .

# --- Start new container on a temporary port to verify it works ---
echo ""
echo ">>> Starting new container for health check..."
docker run \
    --name="${TEMP_CONTAINER_NAME}" \
    --env-file .env \
    -p "3001:${PORT}" \
    -d "${CONTAINER_NAME}:v${NEW_VERSION}"

echo ">>> Waiting for new container to stabilize..."
sleep 5

# --- Verify new container is running ---
if ! docker ps --format '{{.Names}}' | grep -q "^${TEMP_CONTAINER_NAME}$"; then
    echo ""
    echo "❌ ERROR: New container failed to start!"
    echo ">>> Logs from failed container:"
    docker logs "${TEMP_CONTAINER_NAME}"
    docker container remove -f "${TEMP_CONTAINER_NAME}" || true
    echo ""
    echo "Old container is still running. No changes were made."
    exit 1
fi
echo "✅ New container is healthy."

# ============================================
# QUICK SWITCH - minimize downtime
# ============================================
echo ""
echo ">>> Performing quick switch..."

# Stop and remove the old container
docker stop "${CONTAINER_NAME}" || echo "Old container was not running."
docker container remove "${CONTAINER_NAME}" || echo "Old container did not exist."

# Stop the temp container and remove it
docker stop "${TEMP_CONTAINER_NAME}"
docker container remove "${TEMP_CONTAINER_NAME}"

# Immediately start the final container on the correct port
docker run \
    --name="${CONTAINER_NAME}" \
    --restart unless-stopped \
    --env-file .env \
    -p "${PORT}:${PORT}" \
    -d "${CONTAINER_NAME}:v${NEW_VERSION}"

echo "✅ Switch complete. Downtime was only a few seconds."

# ============================================
# CLEANUP
# ============================================
echo ""
echo ">>> Removing old image '${CONTAINER_NAME}:v${OLD_VERSION}'..."
docker image remove "${CONTAINER_NAME}:v${OLD_VERSION}" || echo "Old image did not exist."

echo ""
echo ">>> Pruning Docker builder cache..."
docker builder prune -f

# --- Done ---
echo ""
echo "============================================"
echo "✅ Update complete!"
echo "Container '${CONTAINER_NAME}' is now running with image v${NEW_VERSION}"
echo "============================================"
docker ps | grep "${CONTAINER_NAME}"