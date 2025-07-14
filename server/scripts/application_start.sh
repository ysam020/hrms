#!/bin/bash
# Navigate to the application directory
cd /home/ec2-user/cicd/pm-cicd

# Add npm and node to path
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # Loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # Loads nvm bash_completion

# Set NODE_ENV to production
export NODE_ENV=production

# Retrieve environment variables (adjust parameter names as needed)
# AWS
export ACCESS_KEY=$(aws ssm get-parameter --name "ACCESS_KEY" --query "Parameter.Value" --output text)
export SECRET_ACCESS_KEY=$(aws ssm get-parameter --name "SECRET_ACCESS_KEY" --query "Parameter.Value" --output text)
export REGION=$(aws ssm get-parameter --name "REGION" --query "Parameter.Value" --output text)
export BUCKET=$(aws ssm get-parameter --name "BUCKET" --query "Parameter.Value" --output text)
# JWT
export JWT_SECRET=$(aws ssm get-parameter --name "JWT_SECRET" --query "Parameter.Value" --output text)
# Sender Email
export EMAIL_FROM=$(aws ssm get-parameter --name "EMAIL_FROM" --query "Parameter.Value" --output text)
# Geolocation API Key
export OPENCAGE_API_KEY=$(aws ssm get-parameter --name "OPENCAGE_API_KEY" --query "Parameter.Value" --output text)
# AES 256 Encryption Secret Key
export CRYPTO_ENCRYPTION_KEY=$(aws ssm get-parameter --name "CRYPTO_ENCRYPTION_KEY" --query "Parameter.Value" --output text)
# FCM
export TYPE=$(aws ssm get-parameter --name "TYPE" --query "Parameter.Value" --output text)
export PROJECT_ID=$(aws ssm get-parameter --name "PROJECT_ID" --query "Parameter.Value" --output text)
export PRIVATE_KEY_ID=$(aws ssm get-parameter --name "PRIVATE_KEY_ID" --query "Parameter.Value" --output text)
export PRIVATE_KEY=$(aws ssm get-parameter --name "PRIVATE_KEY" --query "Parameter.Value" --output text)
export CLIENT_EMAIL=$(aws ssm get-parameter --name "CLIENT_EMAIL" --query "Parameter.Value" --output text)
export CLIENT_ID=$(aws ssm get-parameter --name "CLIENT_ID" --query "Parameter.Value" --output text)
export AUTH_URI=$(aws ssm get-parameter --name "AUTH_URI" --query "Parameter.Value" --output text)
export TOKEN_URI=$(aws ssm get-parameter --name "TOKEN_URI" --query "Parameter.Value" --output text)
export AUTH_PROVIDER_CERT_URI=$(aws ssm get-parameter --name "AUTH_PROVIDER_CERT_URI" --query "Parameter.Value" --output text)
export CLIENT_CERT_URL=$(aws ssm get-parameter --name "CLIENT_CERT_URL" --query "Parameter.Value" --output text)
export UNIVERSE_DOMAIN=$(aws ssm get-parameter --name "UNIVERSE_DOMAIN" --query "Parameter.Value" --output text)
# MongoDB
export DEV_MONGODB_URI=$(aws ssm get-parameter --name "DEV_MONGODB_URI" --query "Parameter.Value" --output text)
export PROD_MONGODB_URI=$(aws ssm get-parameter --name "PROD_MONGODB_URI" --query "Parameter.Value" --output text)

# Install node modules
npm install
npm install nodemon pm2 -g

# Start the Node.js app with PM2 in production mode
pm2 start ecosystem.config.json --env production
