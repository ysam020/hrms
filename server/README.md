# Paymaster CRM & HRM Web App (Frontend)

This project is a comprehensive CRM (Customer Relationship Management) and HRM (Human Resources Management) solution, developed using the MERN stack. The app focuses on managing core business processes like attendance, job applications, and recruitment, streamlining workflows in a user-friendly interface.

## Table of Contents

- [Features](#features)
- [Technologies Used](#technologies-used)
- [Libraries](#libraries)
- [Folder Structure](#folder-structure)
- [Environment Variables](#environment-variables)
- [Installation](#installation)

## Features

- **Session Management**: Middleware-based session verification for secure user management (`verifySession.mjs`).
- **AWS SDK Integration**: Uses AWS SDK for S3 and SES for cloud storage and email functionality.
- **Environment-based Scripts**: Start scripts for different environments (development, server, and production).
- **Swagger Documentation**: Automatically generates API documentation using Swagger.
- **Data Encryption**: Uses bcrypt for secure hashing of sensitive data.
- **Real-time Notifications**: Firebase integration enables push notifications.
- **Task Scheduling**: Uses `node-schedule` for handling scheduled tasks.
- **QR Code Generation**: Supports QR code creation using `qrcode` library.

## Technologies Used

- **Node.js**: JavaScript runtime environment
- **Express**: Web framework for Node.js
- **AWS SDK**: S3 and SES client integration for storage and email functionality
- **Firebase Admin**: For real-time notifications and user management
- **Swagger**: API documentation

## Libraries

The following libraries enhance the functionality and design of the app. Here’s a list along with their use cases:

| Library                         | Version  | Use Case                                               |
| ------------------------------- | -------- | ------------------------------------------------------ |
| `@aws-sdk/client-s3`            | ^3.688.0 | AWS SDK for S3 services                                |
| `@aws-sdk/client-ses`           | ^3.687.0 | AWS SDK for SES services                               |
| `@aws-sdk/s3-request-presigner` | ^3.688.0 | Request Pre-signed URL to upload files on AWS S3       |
| `axios`                         | ^1.7.7   | HTTP client for API requests                           |
| `base64url`                     | ^3.0.1   | Convert credentials to buffer                          |
| `bcrypt`                        | ^5.1.0   | Library for hashing passwords                          |
| `body-parser`                   | ^1.20.2  | Parse incoming request bodies                          |
| `compression`                   | ^1.7.4   | Middleware to compress response bodies                 |
| `cookie-parser`                 | ^1.4.7   | Parse cookies attached to incoming HTTP requests       |
| `cors`                          | ^2.8.5   | Cross origin resource sharing                          |
| `crypto`                        | ^1.0.1   | Library for AES-256 encryption                         |
| `dotenv`                        | ^16.1.4  | Loads environment variables from `.env` file           |
| `express`                       | ^4.18.2  | Web framework for creating server and APIs             |
| `firebase-admin`                | ^12.7.0  | Firebase Admin SDK for server-side Firebase operations |
| `node-schedule`                 | ^2.1.1   | Job scheduling                                         |
| `nodemon`                       | ^3.0.1   | Automatically restarts Node.js server on code changes  |
| `pm2`                           | ^5.3.0   | PM2 is a process manager for Node.js                   |
| `qrcode`                        | ^1.5.4   | QR code generation                                     |
| `speakeasy`                     | ^2.0.0   | For Google Authenticator two-factor authentication     |
| `swagger-jsdoc`                 | ^6.2.8   | Swagger documentation generation from JSDoc comments   |
| `swagger-ui-express`            | ^5.0.1   | Swagger UI for API documentation                       |

## Folder Structure

The following folder structure is organized to maintain clean code and easy navigation.

```plaintext
root
├── middlewares
	└── verifySession.mjs # Middleware for session verification
├── model # Database models
├── node_modules # Project dependencies
├── routes # API route definitions
├── scripts # Scripts for deployment setup
	└── before_install.sh # Pre-installation script
	└── application_start.sh # Start script
	└── application_stop.sh # Stop script
├── utils # Utility functions
├── .env # Environment variables
├── .gitignore # Files to ignore in version control
├── app.mjs # Main application file
├── appspec.yml # AWS CodeDeploy configuration
├── ecosystem.config.json # PM2 configuration for process management
├── eslint.config.js # ESLint configuration
├── nodemon.json # Nodemon configuration
├── package-lock.json # Lockfile for dependencies
├── package.json # Project metadata and dependencies
├── swaggerConfig.js # Swagger configuration
```

## Environment Variables

```bash

### Environment Variables
- ACCESS_KEY="XXXXXXXXXX"
- SECRET_ACCESS_KEY="XXXXXXXXXX"
- REGION="XXXXXXXXXX"
- BUCKET="XXXXXXXXXX"

- JWT_SECRET="XXXXXXXXXX"

- EMAIL_FROM="XXXXXXXXXX"

- OPENCAGE_API_KEY="XXXXXXXXXX"

- CRYPTO_ENCRYPTION_KEY="XXXXXXXXXX"

- TYPE="XXXXXXXXXXX"
- PROJECT_ID="XXXXXXXXXX"
- PRIVATE_KEY_ID="XXXXXXXXXX"
- PRIVATE_KEY="-----BEGIN PRIVATE KEY-----XXXXXXXXXX-----END PRIVATE KEY-----\n"
- CLIENT_EMAIL="XXXXXXXXXX"
- CLIENT_ID="XXXXXXXXXX"
- AUTH_URI="XXXXXXXXXX"
- TOKEN_URI="XXXXXXXXXX"
- AUTH_PROVIDER_CERT_URI="XXXXXXXXXX"
- CLIENT_CERT_URL="XXXXXXXXXX"
- UNIVERSE_DOMAIN="XXXXXXXXXX"

- DEV_MONGODB_URI="XXXXXXXXXX"
- PROD_MONGODB_URI="XXXXXXXXXX"
```

## Installation

To set up and run this project locally, follow these steps:

```bash
### Clone the repository
git  clone <repository-url>

### Navigate to the project directory
cd  pm-crm-backend

### Install dependencies
npm  install

### Create .env file
Create a .env in root folder and add variables

### Start the development server
nodemon
```
