# Numenor Security - Phishing Protection SaaS for Small & Medium Businesses

A full-stack phishing protection SaaS designed for small to medium businesses. Built with React Router v7, Express.js, and PostgreSQL.

## Features

### Frontend

- **Login Page**: JWT-based authentication with secure login
- **Signup Page**: User registration with business details and automatic business creation
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
- **Business Management**: Business information and statistics
- **Email Monitoring**: Add, remove, and manage monitored email addresses (single or bulk) with smart UI controls (max 5 emails per business)
- **Intelligent Phishing Detection**: Advanced text analysis with subject/body distinction and false positive reduction
- **Phishing Alerts**: Create, update, and track phishing threats with improved accuracy
- **Security Logging**: Comprehensive audit trail of all activities
- **Data Validation**: Input validation with Zod schemas
- **Error Handling**: Centralized error handling and logging

### Modular Architecture

- **Email Management**: Split into focused modules for better maintainability
  - `email-management.ts` - CRUD operations (GET, POST, PUT, DELETE)
  - `email-actions.ts` - Actions like resend and statistics
  - `emails.ts` - Main router that composes all modules
  - `oauth.ts` - OAuth flow including email approval/denial
- **Single Responsibility**: Each module handles one specific concern
- **Clean Composition**: Main router combines modules without duplication

## Tech Stack

### Frontend

- [React Router v7](https://reactrouter.com) - File-based routing
- [React 19](https://react.dev) - UI library with hooks
- [TypeScript](https://www.typescriptlang.org) - Type safety
- [Vite](https://vitejs.dev) - Build tool and dev server
- [Tailwind CSS](https://tailwindcss.com) - Utility-first CSS framework

### Backend

- [Express.js](https://expressjs.com) - Web framework
- [PostgreSQL](https://postgresql.org) - Database
- [Node.js pg](https://node-postgres.com) - PostgreSQL client
- [JWT](https://jwt.io) - Authentication tokens
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js) - Password hashing
- [Zod](https://zod.dev) - Schema validation
- [Helmet](https://helmetjs.github.io) - Security headers
- [CORS](https://github.com/expressjs/cors) - Cross-origin resource sharing

## Quick Start (Docker - Recommended)

The fastest way to get started is using Docker Compose:

```bash
# 1. Clone the repository
git clone <repository-url>
cd clicksafe

# 2. Copy environment variables
cp docker.env.example .env

# 3. Installations
#Mac
brew install ngrok
#Windows at https://ngrok.com/download/windows

npm install

# 4. Start all services
docker-compose up -d
ngrok http 3001 # copy to google cloud console

# 5. Access the application
# Frontend: http://localhost:3000
# API: http://localhost:3001
```

That's it! The application will be running with:

- ✅ **Frontend**: [http://localhost:3000](http://localhost:3000)
- ✅ **API**: [http://localhost:3001](http://localhost:3001)
- ✅ **Database**: PostgreSQL with automatic migrations
- ✅ **Redis**: Caching and session storage

📖 **For detailed setup instructions, see [QUICK_START.md](QUICK_START.md)**

📧 **For Gmail OAuth setup (required for email monitoring), see [GMAIL_OAUTH_SETUP.md](GMAIL_OAUTH_SETUP.md)**

## Manual Development Setup

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

   **Note:** The database schema includes tables for users, businesses, monitored emails, phishing alerts, security events, and email scans with proper indexes and foreign key relationships.

4. **Start the development servers:**

   ```bash
   # Start the frontend (React Router)
   npm run dev

   # In a separate terminal, start the backend API
   npm run api:dev
   ```

5. **Open your browser:**
   - **Frontend**: Navigate to [http://localhost:3000](http://localhost:3000)
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
│   │   │   ├── business.ts  # Business management
│   │   │   ├── emails.ts    # Email monitoring (main router)
│   │   │   ├── email-management.ts # Email CRUD operations
│   │   │   ├── email-actions.ts  # Email actions & stats
│   │   │   ├── oauth.ts     # OAuth flow & email approval/denial
│   │   │   └── alerts.ts    # Phishing alerts
│   │   ├── schemas/         # Validation schemas
│   │   │   ├── user.ts      # User validation
│   │   │   ├── business.ts  # Business validation
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
│   ├── components/          # Reusable React components
│   │   └── Dropdown.tsx     # Collapsible dropdown component
│   ├── root.tsx             # Root layout component
│   ├── app.css              # Global styles with Tailwind directives
│   └── routes.ts            # Route configuration
├── public/                  # Static assets
├── .env.example             # Environment variables template
├── package.json
├── tsconfig.json
├── vite.config.ts
├── react-router.config.ts
├── tailwind.config.js        # Tailwind CSS configuration
└── postcss.config.js         # PostCSS configuration
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

- Business name field
- Contact name field
- Email and password fields
- Password confirmation with real-time validation
- Terms of service agreement
- Link to login page

### Dashboard Page (`/dashboard`)

- **Stats Cards**: Monitored emails, total alerts, protection status
- **Email Monitoring Section**:
  - Collapsible dropdown interface for each email
  - Connection status with color-coded badges
  - Alert counts with color coding
  - Individual alert details (sender, subject, threat level, type, description)
  - "Mark Safe" and "Mark Pending" buttons for individual alerts
  - "Mark All Safe" button for each email
- **Phishing Alerts Chart**: 7-day bar chart showing daily alert counts
- **Recent Activity Feed**: Timeline of security events
- **Navigation**: Links to dashboard and logout

## API Endpoints

### Authentication (`/api/auth`)

- `POST /register` - Register new user and create business
- `POST /login` - User authentication with JWT
- `GET /me` - Get current user profile
- `POST /change-password` - Change user password
- `POST /logout` - Logout and log security event

### Business Management (`/api/business`)

- `GET /` - Get business information
- `PUT /` - Update business details
- `GET /stats` - Get business statistics (emails, alerts, etc.)

### Email Monitoring (`/api/emails`)

- `GET /` - List monitored emails (with pagination)
- `POST /` - Add single email for monitoring
- `POST /bulk` - Add multiple emails for monitoring (max 5 per business, max 5 per request)
- `PUT /:id` - Update email connection status
- `DELETE /:id` - Remove email from monitoring
- `GET /stats` - Get email monitoring statistics

#### Email Monitoring Architecture (Gmail)

This project uses Gmail history-based delta polling to efficiently detect new messages without missing events:

- **History delta polling**: Each mailbox maintains a persisted `last_history_id` anchor and queries Gmail `history.list` for changes since that anchor. New INBOX message IDs are fetched and analyzed.
- **Jittered schedule**: Global monitoring loop runs on a randomized interval between 60–120 seconds to reduce API spikes and contention.
- **Fallback and re-anchoring**: If Gmail reports the history anchor is too old, the system performs a bounded timestamp-based resync and then resets the anchor to the current `historyId`.
- **Deduplication**: Processed message IDs are stored for short-term exactly-once semantics, preventing reprocessing during retries or re-anchoring.
- **Persistence**: Offsets are stored per mailbox in `email_offsets`; processed message IDs are stored in `processed_emails`.

This approach significantly reduces API usage compared to fixed-interval full scans while maintaining strong reliability for SMB inboxes.

### OAuth Integration (`/api/oauth`)

- `GET /gmail/auth-url` - Generate Gmail OAuth authorization URL
- `GET /api/oauth/gmail/callback` - Handle OAuth callback from Google
- `POST /gmail/disconnect` - Disconnect Gmail OAuth
- `GET /status/:emailAddress` - Check OAuth connection status
- `POST /gmail/test` - Test Gmail OAuth connection

#### Email Connection Status

**Connected Email:**

- The email address is **actively being monitored** for phishing attempts
- The system can **receive and analyze emails** sent to this address
- **Real-time scanning** is enabled for incoming messages
- The email is **integrated with your security monitoring system**

**Disconnected Email:**

- The email address is **not currently being monitored**
- The system **cannot scan incoming emails** to this address
- **No real-time protection** against phishing attempts
- The email exists in your system but is **inactive for security purposes**

This connection status determines whether the email security system is actively protecting that inbox from phishing threats.

### Phishing Alerts (`/api/alerts`)

- `GET /` - List alerts (with filtering & pagination)
- `GET /:id` - Get specific alert details
- `PUT /:id` - Update alert status
- `POST /` - Create new alert
- `GET /stats` - Get alert statistics and trends

## Database Schema

The PostgreSQL database includes:

- **Users**: User accounts with authentication
  - Stores business owners/administrators who can access the system
  - Contains login credentials, personal info, and business association
  - One user per business (business owner/administrator)

- **Businesses**: Business information and settings
  - Business information for each company
  - Contains business name, address, contact details, and settings
  - Each business has one owner (user) and multiple monitored emails

- **Monitored Emails**: Email addresses being monitored
  - **What it is**: The actual email inboxes that the system watches for phishing attempts
  - **Purpose**: Tracks which email addresses belong to each business and their connection status
  - **Contains**: Email address, connection status (connected/disconnected), last scan time
  - **Example**: `info@mybusiness.com`, `support@mybusiness.com`, `admin@mybusiness.com`

- **Phishing Alerts**: Detected threats with metadata
  - **What it is**: Individual phishing attempts that were caught by the system
  - **Purpose**: Records each suspicious email that was sent to monitored addresses
  - **Contains**: Email details (sender, subject, content), threat level, alert type, status
  - **Example**: "Suspicious login attempt from unknown IP", "Fake invoice attachment detected"

- **Security Events**: Audit log of all activities
  - **What it is**: System activity log for compliance and monitoring
  - **Purpose**: Tracks all user actions and system events for security auditing
  - **Contains**: User actions (login, logout, password changes), system events, IP addresses
  - **Example**: "User logged in from 192.168.1.100", "Password changed", "Email added to monitoring"

- **Email Scans**: Monitoring operation logs
  - **What it is**: Technical logs of the email scanning process
  - **Purpose**: Tracks the health and performance of email monitoring operations
  - **Contains**: Scan timestamps, success/failure status, processing times, error messages
  - **Example**: "Scan completed for info@mybusiness.com at 2025-01-02 10:30:00", "Connection timeout error"

- **Email Offsets**: History anchors per mailbox (Gmail)
  - **What it is**: Stores `last_history_id` for each connected Gmail mailbox
  - **Purpose**: Enables efficient delta polling without re-reading the entire mailbox
  - **Contains**: `business_id`, `email_address`, `provider`, `last_history_id`, timestamps

- **Processed Emails**: Deduplication ledger
  - **What it is**: Tracks message IDs that have already been analyzed
  - **Purpose**: Ensures exactly-once processing during retries and anchor resets
  - **Contains**: `business_id`, `email_address`, `message_id`, processed timestamp

All tables include proper indexes, foreign key relationships, and automatic timestamp updates.

## Styling

- **Tailwind CSS**: Utility-first CSS framework for rapid UI development
- **Responsive Design**: Mobile-first approach with responsive breakpoints
- **Color Scheme**: Blue primary, gray neutrals with semantic color coding
- **Components**: Reusable components with consistent styling
- **Custom Components**: Form inputs, buttons, badges, and dropdowns
- **Icons**: Emoji-based icons for simplicity

### Tailwind CSS Migration

The project has been migrated from custom CSS to Tailwind CSS v3.4.0 for improved maintainability and faster development:

#### Configuration Files

- **`tailwind.config.js`**: Tailwind configuration with Inter font family
- **`postcss.config.js`**: PostCSS configuration for Tailwind processing
- **`app/app.css`**: Contains Tailwind directives and custom component classes

#### Custom Component Classes

The following custom classes are available in `app/app.css`:

```css
/* Form Components */
.form-input              /* Standard form input styling */
.form-input-error        /* Error state for form inputs */
.btn-primary            /* Primary button styling */
.error-message          /* Error message styling */

/* Badge Components */
.badge-threat-critical   /* Critical threat level badge */
.badge-threat-high       /* High threat level badge */
.badge-threat-medium     /* Medium threat level badge */
.badge-threat-low        /* Low threat level badge */
.badge-status-safe       /* Safe status badge */
.badge-status-pending    /* Pending status badge */
.badge-status-reviewed   /* Reviewed status badge */
.badge-status-threat     /* Threat status badge */
.badge-connected         /* Connected email badge */
.badge-disconnected      /* Disconnected email badge */
.badge-pending           /* Pending alerts badge */
```

#### Recent UI Improvements

- **Responsive Hero Section**: Side-by-side layout on wide screens, stacked on mobile
- **Enhanced Signup Form**: Real-time password validation with visual feedback
- **Improved Dashboard**: Collapsible email monitoring with detailed alert information
- **Better Button Styling**: Consistent hover states and cursor indicators

## Development

### Frontend Development

- **TypeScript**: Full type safety
- **React Hooks**: Functional components with useState
- **React Router**: Client-side routing
- **Tailwind CSS**: Utility-first styling with PostCSS processing
- **Hot Reload**: Vite development server with HMR

### Backend Development

- **Express.js**: RESTful API with middleware (Middleware is your security guard, data validator, and error handler)
- **JWT Authentication**: Secure token-based auth
- **Input Validation**: Zod schema validation
- **Error Handling**: Centralized error management
- **Database**: PostgreSQL with connection pooling

## Docker Development

### Daily Development Commands

```bash
# Start all services
docker-compose up -d

# View logs (all services)
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
docker-compose logs -f frontend

# Stop services
docker-compose down

# Rebuild and restart (after code changes)
docker-compose up --build -d

# Access database
docker-compose exec postgres psql -U numenor_user -d numenor_security
```

### Docker Services

- **Frontend**: React Router app on port 3000
- **API**: Express.js server on port 3001
- **PostgreSQL**: Database with persistent storage
- **Redis**: Caching and session storage
- **Migration**: Automatic database schema setup

### Production Deployment

```bash
# Copy production environment file
cp docker.env.example .env

# Update .env with production values
nano .env

# Start production services
docker-compose -f docker-compose.prod.yml up -d

# View production logs
docker-compose -f docker-compose.prod.yml logs -f
```

## Available Scripts

```bash
# Frontend
npm run dev          # Start React Router dev server
npm run build        # Build for production
npm run typecheck    # Generate types and check TypeScript

# Backend
npm run api:dev      # Start Express API server
npm run api:build  # Build API for production

# Database
npm run db:migrate   # Run database migrations

# Docker
docker-compose up -d                    # Start development environment
docker-compose -f docker-compose.prod.yml up -d  # Start production environment
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
FRONTEND_URL=http://localhost:3000

# Security
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-super-secret-session-key-here

# Gmail OAuth Configuration (Required for email monitoring)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3001/api/oauth/gmail/callback

# Email Configuration (Optional - for sending permission emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Numenor Security <your-email@gmail.com>
```

**Note**: Gmail OAuth setup is required for email monitoring functionality. See [GMAIL_OAUTH_SETUP.md](GMAIL_OAUTH_SETUP.md) for detailed setup instructions.

## Security Features

- **Password Hashing**: bcrypt with salt rounds
- **JWT Tokens**: Secure authentication with expiration
- **Input Validation**: Zod schema validation with RFC 5322 email validation
- **SQL Injection Protection**: Parameterized queries
- **XSS Protection**: React auto-escaping and input sanitization
- **DoS Protection**: Input size limits and rate limiting (10 req/s)
- **CSRF Protection**: HTTP-only cookies with SameSite policy
- **CORS Configuration**: Controlled cross-origin access
- **Security Headers**: Helmet.js protection
- **Audit Logging**: Comprehensive security event tracking

## Learn More

### Frontend

- [React Router v7 Documentation](https://reactrouter.com)
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

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

## 📋 TODO List

### High Priority

1. **Register any needed emails** - Set up proper email addresses for production use
2. **Paid WHOIS lookups** - Consider upgrading to paid WHOIS API services for better reliability and to fix current warnings
3. **GMAIL has numenor dev setup for connecting gmail, needs for prod too**

### Future Enhancements

- Implement machine learning for threat detection

## License

This project is licensed under the MIT License.
