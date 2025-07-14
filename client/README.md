# Paymaster CRM & HRM Web App (Frontend)

This project is a comprehensive CRM (Customer Relationship Management) and HRM (Human Resources Management) solution, developed using the MERN stack. The app focuses on managing core business processes like attendance, job applications, and recruitment, streamlining workflows in a user-friendly interface.

## Table of Contents

- [Features](#features)
- [Technologies Used](#technologies-used)
- [Libraries](#libraries)
- [Folder Structure](#folder-structure)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [Usage](#usage)

## Features

- **Attendance Management**: Track and record employee attendance.
- **Job Applications**: Manage and review job applications for different roles.
- **Recruitment Process**: Schedule interviews, track applicants' statuses, and manage candidate information.
- **Data Visualization**: Leverage charts and data tables to view and analyze HRM/CRM data in real-time.

## Technologies Used

- **React**: Frontend framework for building UI components.
- **JavaScript**: Primary programming language for the client side.
- **SCSS**: Preprocessor for CSS, enabling easier management of styles.
- **MUI (Material-UI)**: UI components to create a responsive, accessible, and modern interface.
- **Firebase**: Used for handling push notifications and real-time updates.

## Libraries

The following libraries enhance the functionality and design of the app. Here’s a list along with their use cases:

### Core Libraries

| Library            | Version  | Use Case                                                                         |
| ------------------ | -------- | -------------------------------------------------------------------------------- |
| `react`            | ^17.0.2  | Core library for building user interfaces.                                       |
| `react-dom`        | ^17.0.2  | Allows React components to be rendered in the DOM.                               |
| `react-router-dom` | ^6.23.1  | Provides routing functionality for navigating between pages.                     |
| `react-scripts`    | 5.0.1    | Scripts for managing and building the React application.                         |
| `axios`            | ^1.7.7   | HTTP client for making requests to APIs.                                         |
| `dayjs`            | ^1.11.13 | Lightweight library for parsing, validating, manipulating, and formatting dates. |
| `formik`           | ^2.4.6   | Manages form state and validation.                                               |
| `yup`              | ^1.4.0   | Schema builder for input validation in forms (used with Formik).                 |

### UI Libraries

| Library               | Version  | Use Case                                                                                   |
| --------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `@mui/material`       | ^5.16.5  | Material-UI components for building a consistent and customizable UI.                      |
| `@mui/icons-material` | ^5.16.1  | Material Icons for adding icons to the app’s UI.                                           |
| `@mui/x-date-pickers` | ^7.22.1  | Date picker components from MUI, used for date selection in forms.                         |
| `bootstrap`           | ^5.3.3   | Responsive, mobile-first components for a sleek UI.                                        |
| `react-bootstrap`     | ^2.10.2  | React wrapper for Bootstrap, allowing easy integration of Bootstrap components with React. |
| `sass`                | ^1.77.4  | Preprocessor for writing more maintainable and modular CSS.                                |
| `@emotion/react`      | ^11.11.4 | CSS-in-JS library integrated with MUI for styling components.                              |
| `@emotion/styled`     | ^11.11.5 | Styled components using Emotion, supporting theme-based styling.                           |

### Data Visualization

| Library                | Version | Use Case                                                                           |
| ---------------------- | ------- | ---------------------------------------------------------------------------------- |
| `apexcharts`           | ^3.54.1 | JavaScript charting library for interactive and responsive charts.                 |
| `react-apexcharts`     | ^1.4.1  | React wrapper for ApexCharts, providing chart components for React applications.   |
| `material-react-table` | ^2.13.0 | Data table component with customizable columns, pagination, and filtering options. |

### Utilities

| Library               | Version | Use Case                                                                                     |
| --------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `firebase`            | ^11.0.1 | Used for push notifications, real-time updates, and managing authentication (if applicable). |
| `fuse.js`             | ^7.0.0  | Lightweight fuzzy-search library to provide search functionality.                            |
| `react-beautiful-dnd` | ^13.1.1 | Provides drag-and-drop capabilities for enhancing user interaction.                          |
| `lottie-react`        | ^2.4.0  | Used for adding Lottie animations to enhance user engagement.                                |

## Folder Structure

The following folder structure is organized to maintain clean code and easy navigation.

```plaintext
root
├── build                 # Production build files
├── node_modules          # Project dependencies
├── public
│   ├── index.html        # Main HTML file for the app
│   ├── favicon.ico       # Favicon for the app
│   ├── firebase-messaging-sw.js  # Firebase service worker for notifications
│   ├── manifest.json     # Web app manifest for PWA support
│   └── serviceWorker.js  # Service worker for caching and offline support
├── src                   # Main source code
│   ├── assets            # Static assets
│   │   ├── data          # Data files
│   │   ├── images        # Image files
│   │   ├── lottie        # Lottie animation files
│   │   ├── Application Architecture.png  # Application architecture image
│   │   └── Application Architecture.txt  # Application architecture description
│   ├── components        # Reusable components
│   ├── contexts          # React contexts for state management
│   ├── forms             # Form components and validation schemas
│   ├── hooks             # Custom hooks for reusable logic
│   ├── modals            # Modal components
│   ├── pages             # Page components for different views
│   ├── routes            # Routing logic
│   │   ├── ProtectedRoute.js       # Route for authenticated users
│   │   ├── routesConfig.js         # Route configuration
│   │   └── UnAuthorisedRoute.js    # Route for unauthenticated access
│   ├── schemas           # Schema definitions for data validation
│   ├── styles            # SCSS files for styling
│   ├── utils             # Utility functions
│   ├── App.js            # Main App component
│   ├── App.scss          # Main SCSS file
│   ├── firebase.js       # Firebase configuration
│   ├── index.css         # Global CSS styles
│   └── index.js          # Main entry point for the React app
├── .env.development      # Environment variables for development
├── .env.production       # Environment variables for production
├── .gitignore            # Files to ignore in version control
├── buildspec.yml         # AWS CodeBuild configuration for CI/CD
├── package-lock.json     # Lockfile for dependencies
├── package.json          # Project metadata and dependencies
└── README.md             # Documentation file
```

## Environment Variables

```bash
### Development Environment Variables
 - REACT_APP_API_STRING="http://localhost:9002/api"
 - REACT_APP_VAPID_KEY="XXXXXXXXXXXXXXXXXXXX"

### Production Environment Variables
 - REACT_APP_API_STRING="https://sameer-yadav.online/api"
 - REACT_APP_VAPID_KEY="XXXXXXXXXXXXXXXXXXXX"
```

## Installation

To set up and run this project locally, follow these steps:

```bash
### Clone the repository
git clone <repository-url>

### Navigate to the project directory
cd crm-hrm-web-app

### Install dependencies
npm install

### Start the development server
npm run start

### Build the application for production (excludes source maps for security)
npm run build

### Serve the production build locally (for testing production)
npm run serve
```

## Usage

After starting the development server, open the app in your browser by navigating to `http://localhost:3000`. You can log in and start managing CRM and HRM functionalities, such as tracking attendance, processing job applications, and more.
