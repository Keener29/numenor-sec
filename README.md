# Numenor Security - Phishing Protection SaaS for Gyms

A full-stack phishing protection SaaS targeting gyms and fitness centers. Built with React Router v7, Express.js, and PostgreSQL.

## Features

### Frontend
- **Login Page**: JWT-based authentication with secure login
- **Signup Page**: User registration with gym details and automatic gym creation
- **Dashboard Page**:
  - Real-time email monitoring with connection status
  - Phishing alert management with threat level classification
  - Interactive statistics and charts
  - Recent activity feed with security events
  - Responsive design for all devices
- **Landing Page**: Marketing homepage with features and call-to-action

### Backend API
- **Authentication System**: JWT-based auth with password hashing
- **User Management**: Registration, login, profile management
- **Gym Management**: Gym information and statistics
- **Email Monitoring**: Add, remove, and manage monitored email addresses
- **Phishing Alerts**: Create, update, and track phishing threats
- **Security Logging**: Comprehensive audit trail of all activities
- **Data Validation**: Input validation with Zod schemas
- **Error Handling**: Centralized error handling and logging

## Tech Stack

### Frontend
- [React Router v7](https://reactrouter.com) - File-based routing
- [React 19](https://react.dev) - UI library with hooks
- [TypeScript](https://www.typescriptlang.org) - Type safety
- [Vite](https://vitejs.dev) - Build tool and dev server

### Backend
- [Express.js](https://expressjs.com) - Web framework
- [PostgreSQL](https://postgresql.org) - Database
- [Node.js pg](https://node-postgres.com) - PostgreSQL client
- [JWT](https://jwt.io) - Authentication tokens
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js) - Password hashing
- [Zod](https://zod.dev) - Schema validation
- [Helmet](https://helmetjs.github.io) - Security headers
- [CORS](https://github.com/expressjs/cors) - Cross-origin resource sharing

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

4. **Start the development servers:**

   ```bash
   # Start the frontend (React Router)
   npm run dev
   
   # In a separate terminal, start the backend API
   npm run api:dev
   ```

5. **Open your browser:**

   - **Frontend**: Navigate to [http://localhost:5173](http://localhost:5173)
   - **Backend API**: [http://localhost:3001](http://localhost:3001)
   - **API Documentation**: [http://localhost:3001/api](http://localhost:3001/api)
   - **Health Check**: [http://localhost:3001/health](http://localhost:3001/health)

## Project Structure

```text
├── app/
│   ├── api/                 # Backend API
│   │   ├── middleware/      # Express middleware
│   │   │   ├── auth.ts      # JWT authentication
│   │   │   ├── validation.ts # Request validation
│   │   │   └── errorHandler.ts # Error handling
│   │   ├── routes/          # API routes
│   │   │   ├── auth.ts      # Authentication endpoints
│   │   │   ├── gym.ts       # Gym management
│   │   │   ├── emails.ts    # Email monitoring
│   │   │   └── alerts.ts    # Phishing alerts
│   │   ├── schemas/         # Validation schemas
│   │   │   ├── user.ts      # User validation
│   │   │   ├── gym.ts       # Gym validation
│   │   │   ├── email.ts     # Email validation
│   │   │   └── alerts.ts    # Alert validation
│   │   ├── utils/           # Utility functions
│   │   │   └── auth.ts      # Auth utilities
│   │   └── server.ts        # Express server setup
│   ├── db/                  # Database layer
│   │   ├── config.ts        # Database configuration
│   │   ├── connection.ts    # Database connection and utilities
│   │   ├── migrate.ts       # Database migration runner
│   │   └── schema.sql       # Database schema
│   ├── routes/              # Frontend routes
│   │   ├── home.tsx         # Landing page
│   │   ├── login.tsx        # Login form
│   │   ├── signup.tsx       # Registration form
│   │   └── dashboard.tsx    # Main dashboard
│   ├── root.tsx             # Root layout component
│   ├── app.css              # Global styles
│   └── routes.ts            # Route configuration
├── public/                  # Static assets
├── .env.example             # Environment variables template
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

## API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - Register new user and create gym
- `POST /login` - User authentication with JWT
- `GET /me` - Get current user profile
- `POST /change-password` - Change user password
- `POST /logout` - Logout and log security event

### Gym Management (`/api/gym`)
- `GET /` - Get gym information
- `PUT /` - Update gym details
- `GET /stats` - Get gym statistics (emails, alerts, etc.)

### Email Monitoring (`/api/emails`)
- `GET /` - List monitored emails (with pagination)
- `POST /` - Add email for monitoring
- `PUT /:id` - Update email connection status
- `DELETE /:id` - Remove email from monitoring
- `GET /stats` - Get email monitoring statistics

### Phishing Alerts (`/api/alerts`)
- `GET /` - List alerts (with filtering & pagination)
- `GET /:id` - Get specific alert details
- `PUT /:id` - Update alert status
- `POST /` - Create new alert
- `GET /stats` - Get alert statistics and trends

## Database Schema

The PostgreSQL database includes:

- **Users**: User accounts with authentication
- **Gyms**: Gym information and settings
- **Monitored Emails**: Email addresses being monitored
- **Phishing Alerts**: Detected threats with metadata
- **Security Events**: Audit log of all activities
- **Email Scans**: Monitoring operation logs

All tables include proper indexes, foreign key relationships, and automatic timestamp updates.

## Styling

- **Responsive Design**: Mobile-first approach
- **Color Scheme**: Blue primary, gray neutrals
- **Components**: Cards, tables, forms, buttons
- **Icons**: Emoji-based icons for simplicity

## Development

### Frontend Development
- **TypeScript**: Full type safety
- **React Hooks**: Functional components with useState
- **React Router**: Client-side routing
- **Hot Reload**: Vite development server

### Backend Development
- **Express.js**: RESTful API with middleware (Middleware is your security guard, data validator, and error handler)
- **JWT Authentication**: Secure token-based auth
- **Input Validation**: Zod schema validation
- **Error Handling**: Centralized error management
- **Database**: PostgreSQL with connection pooling

### Available Scripts

```bash
# Frontend
npm run dev          # Start React Router dev server
npm run build        # Build for production
npm run typecheck    # Generate types and check TypeScript

# Backend
npm run api:dev      # Start Express API server
npm run api:build    # Build API for production

# Database
npm run db:migrate   # Run database migrations
```

## Environment Variables

Create a `.env` file from `.env.example`:

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=numenor_security
DB_USER=your_username
DB_PASSWORD=your_password

# Application Configuration
NODE_ENV=development
API_PORT=3001

# Security
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-super-secret-session-key-here
```

## Security Features

- **Password Hashing**: bcrypt with salt rounds
- **JWT Tokens**: Secure authentication with expiration
- **Input Validation**: Zod schema validation
- **SQL Injection Protection**: Parameterized queries
- **CORS Configuration**: Controlled cross-origin access
- **Security Headers**: Helmet.js protection
- **Audit Logging**: Comprehensive security event tracking

## Learn More

### Frontend
- [React Router v7 Documentation](https://reactrouter.com)
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)

### Backend
- [Express.js Documentation](https://expressjs.com)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [JWT Documentation](https://jwt.io/introduction)
- [Zod Documentation](https://zod.dev)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and ensure everything works
5. Submit a pull request

## License

This project is licensed under the MIT License.
