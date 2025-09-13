# ClickSafe - Phishing Protection SaaS for Gyms

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

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start the development server:**

   ```bash
   npm run dev
   ```

3. **Open your browser:**

   Navigate to [http://localhost:5173](http://localhost:5173) to see the application.

## Project Structure

```text
├── app/
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
