#!/bin/bash
cd /volume1/web/n8n || { echo "Folder not found"; exit 1; }

# Stop Docker container first
sudo docker-compose down

# Add all changes
git add .

# Commit with a default message if there are changes, otherwise skip
git commit -m "Auto commit before docker build" || echo "No changes to commit"

# Push to GitHub
git push origin master || { echo "Git push failed"; exit 1; }

# Restart Docker container with rebuild
sudo docker-compose up -d --build