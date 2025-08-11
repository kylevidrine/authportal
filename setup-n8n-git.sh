#!/bin/bash

# Configuration
PROJECT_DIR="/volume1/web/n8n"
PROJECT_NAME="n8n"
GITHUB_USERNAME="kylevidrine"  # Replace with your actual GitHub username
LOG_FILE="/volume1/web/n8n-git-setup.log"

echo "=== Setting up Git for n8n: $(date) ===" | tee -a "$LOG_FILE"

# Check if directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    echo "✗ Error: Directory $PROJECT_DIR does not exist" | tee -a "$LOG_FILE"
    exit 1
fi

# Navigate to the project directory
cd "$PROJECT_DIR"
echo "✓ Changed to directory: $PROJECT_DIR" | tee -a "$LOG_FILE"

# Show current directory contents
echo "Current directory contents:" | tee -a "$LOG_FILE"
ls -la | tee -a "$LOG_FILE"

# Initialize git repository
if [ ! -d ".git" ]; then
    echo "Initializing git repository..." | tee -a "$LOG_FILE"
    git init 2>&1 | tee -a "$LOG_FILE"
    echo "✓ Git repository initialized" | tee -a "$LOG_FILE"
else
    echo "✓ Git repository already exists" | tee -a "$LOG_FILE"
fi

# Create .gitignore file
echo "Creating .gitignore file..." | tee -a "$LOG_FILE"
cat > .gitignore << 'EOL'
# Environment files
.env
.env.local
.env.production

# Logs
*.log
logs/
log/

# Temporary files
temp/
tmp/
.tmp/

# Database files (uncomment if you don't want to backup)
# *.db
# *.sqlite

# Mail data (uncomment if you don't want to backup mail data)
# mail/
# maildata/
# vmail/

# Docker volumes data (uncomment if mounted externally)
# data/

# SSL certificates (security - don't commit these)
ssl/
certs/
*.pem
*.key
*.crt

# OS files
.DS_Store
Thumbs.db
*~

# IDE files
.vscode/
.idea/
*.swp
*.swo

# Node.js (if applicable)
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
EOL

echo "✓ .gitignore file created" | tee -a "$LOG_FILE"

# Show what will be added
echo "Files that will be added to git:" | tee -a "$LOG_FILE"
git status --porcelain 2>&1 | tee -a "$LOG_FILE"

# Stage all files
echo "Adding files to git..." | tee -a "$LOG_FILE"
git add . 2>&1 | tee -a "$LOG_FILE"

# Show staged files
echo "Staged files:" | tee -a "$LOG_FILE"
git status --cached --porcelain 2>&1 | tee -a "$LOG_FILE"

# Make initial commit
echo "Making initial commit..." | tee -a "$LOG_FILE"
git commit -m "Initial commit - n8n Docker setup" 2>&1 | tee -a "$LOG_FILE"

# Set up remote (but don't push yet)
echo "Setting up remote repository..." | tee -a "$LOG_FILE"
if ! git remote get-url origin &> /dev/null; then
    git remote add origin "https://github.com/$GITHUB_USERNAME/$PROJECT_NAME.git" 2>&1 | tee -a "$LOG_FILE"
    echo "✓ Remote repository added" | tee -a "$LOG_FILE"
else
    echo "✓ Remote repository already configured" | tee -a "$LOG_FILE"
fi

# Show current git status
echo "Current git status:" | tee -a "$LOG_FILE"
git status 2>&1 | tee -a "$LOG_FILE"

echo "=== Setup Complete: $(date) ===" | tee -a "$LOG_FILE"
echo ""
echo "NEXT STEPS:"
echo "1. Create a repository named '$PROJECT_NAME' on GitHub"
echo "2. Run: cd $PROJECT_DIR && git push -u origin main"
echo "3. Check the log file at: $LOG_FILE"