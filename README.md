# Numenor Security - Phishing Protection SaaS for Gyms

A React dashboard MVP for a phishing protection SaaS targeting gyms and fitness centers. Built with React Router v7 and TypeScript.

## Features

- **Login Page**: Simple email/password authentication form
- **Signup Page**: Registration form with gym details (gym name, owner name, email, password)
- **Dashboard Page**:
  - Email monitoring table showing 5 business emails
  - Status indicators (Connected/Disconnected)
  - Alert counts for phishing emails detected
  - "Mark Safe" buttons for flagged emails
  - Interactive bar chart showing phishing alerts over 7 days
  - Recent activity feed
- **Landing Page**: Marketing homepage with features and call-to-action

## Tech Stack

- [React Router v7](https://reactrouter.com) - File-based routing
- [React 19](https://react.dev) - UI library with hooks
- [TypeScript](https://www.typescriptlang.org) - Type safety
- [Vite](https://vitejs.dev) - Build tool and dev server
- [PostgreSQL](https://postgresql.org) - Database
- [Node.js pg](https://node-postgres.com) - PostgreSQL client for Node.js

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Generate TypeScript types:**

   ```bash
   npm run typecheck
   ```

   This generates the required React Router v7 type definitions that are needed for the application to compile properly.

3. **Set up the database:**

   First, make sure PostgreSQL 15 is installed and running on your system.

   ```bash
   # Create the database
   createdb numenor_security
   
   # Copy environment variables
   cp .env.example .env
   
   # Edit .env with your database credentials
   # Then run migrations to set up the schema
   npm run db:migrate
   ```

   **Note:** The database schema includes tables for users, gyms, monitored emails, phishing alerts, security events, and email scans with proper indexes and foreign key relationships.

4. **Start the development server:**

   ```bash
   npm run dev
   ```

3. **Open your browser:**

   Navigate to [http://localhost:5173](http://localhost:5173) to see the application.

## Project Structure

```text
├── app/
│   ├── db/
│   │   ├── config.ts        # Database configuration
│   │   ├── connection.ts    # Database connection and utilities
│   │   ├── migrate.ts       # Database migration runner
│   │   └── schema.sql       # Database schema
│   ├── routes/
│   │   ├── home.tsx         # Landing page with marketing content
│   │   ├── login.tsx        # Login form
│   │   ├── signup.tsx       # Registration form
│   │   └── dashboard.tsx    # Main dashboard with monitoring
│   ├── root.tsx             # Root layout component
│   ├── app.css              # Global styles
│   └── routes.ts            # Route configuration
├── public/                  # Static assets
├── package.json
├── tsconfig.json
├── vite.config.ts
└── react-router.config.ts
```

## Pages Overview

### Landing Page (`/`)

- Hero section with value proposition
- Features showcase
- Call-to-action sections
- Navigation to login/signup

### Login Page (`/login`)

- Email and password fields
- Remember me checkbox
- Forgot password link
- Link to signup page

### Signup Page (`/signup`)

- Gym name field
- Owner name field
- Email and password fields
- Password confirmation
- Terms of service agreement
- Link to login page

### Dashboard Page (`/dashboard`)

- **Stats Cards**: Monitored emails, total alerts, protection status
- **Email Monitoring Table**:
  - 5 sample gym emails
  - Connection status with color-coded badges
  - Alert counts with color coding
  - "Mark Safe" buttons for emails with alerts
- **Phishing Alerts Chart**: 7-day bar chart showing daily alert counts
- **Recent Activity Feed**: Timeline of security events
- **Navigation**: Links to dashboard and logout

## Mock Data

The application uses mock data for demonstration:

- 5 sample gym email addresses
- Simulated connection statuses
- Mock alert counts
- Sample 7-day chart data
- Recent activity events

## Styling

- **Responsive Design**: Mobile-first approach
- **Color Scheme**: Blue primary, gray neutrals
- **Components**: Cards, tables, forms, buttons
- **Icons**: Emoji-based icons for simplicity

## Development

- **TypeScript**: Full type safety
- **React Hooks**: Functional components with useState
- **React Router**: Client-side routing
- **Hot Reload**: Vite development server

## Build

```bash
npm run build
```

## Learn More

- [React Router v7 Documentation](https://reactrouter.com)
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
