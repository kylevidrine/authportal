#!/bin/bash

PROJECT_DIR="/volume1/web/n8n"
PROJECT_NAME="n8n"
LOG_FILE="/volume1/web/n8n-backup.log"

echo "=== n8n Backup Started: $(date) ===" | tee -a "$LOG_FILE"

# Check if directory exists and is a git repo
if [ ! -d "$PROJECT_DIR" ]; then
    echo "✗ Error: Directory $PROJECT_DIR does not exist" | tee -a "$LOG_FILE"
    exit 1
fi

if [ ! -d "$PROJECT_DIR/.git" ]; then
    echo "✗ Error: $PROJECT_DIR is not a git repository" | tee -a "$LOG_FILE"
    exit 1
fi

# Navigate to project directory
cd "$PROJECT_DIR"
echo "✓ Changed to directory: $PROJECT_DIR" | tee -a "$LOG_FILE"

# Check for changes
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git status --porcelain)" ]; then
    echo "Changes detected in $PROJECT_NAME" | tee -a "$LOG_FILE"
    
    # Show what's changed
    echo "Changed files:" | tee -a "$LOG_FILE"
    git status --porcelain 2>&1 | tee -a "$LOG_FILE"
    
    # Add changes
    echo "Adding changes..." | tee -a "$LOG_FILE"
    git add . 2>&1 | tee -a "$LOG_FILE"
    
    # Commit changes
    echo "Committing changes..." | tee -a "$LOG_FILE"
    if git commit -m "Automated backup $(date '+%Y-%m-%d %H:%M:%S')" 2>&1 | tee -a "$LOG_FILE"; then
        echo "✓ Changes committed successfully" | tee -a "$LOG_FILE"
        
        # Push to remote
        echo "Pushing to remote repository..." | tee -a "$LOG_FILE"
        if git push origin master 2>&1 | tee -a "$LOG_FILE"; then
            echo "✓ Successfully pushed to remote repository" | tee -a "$LOG_FILE"
        else
            echo "✗ Failed to push to remote repository" | tee -a "$LOG_FILE"
        fi
    else
        echo "✗ Failed to commit changes" | tee -a "$LOG_FILE"
    fi
else
    echo "- No changes detected in $PROJECT_NAME" | tee -a "$LOG_FILE"
fi

echo "=== n8n Backup Completed: $(date) ===" | tee -a "$LOG_FILE"
echo ""