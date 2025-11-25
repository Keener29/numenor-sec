import dotenv from 'dotenv';

// Loads environment variables from .env file
// Provides TypeScript interface for database config
// Sets sensible defaults for development
// Enables SSL for production
dotenv.config();

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export const getDatabaseConfig = (): DatabaseConfig => {
  const password = process.env.DB_PASSWORD;
  if (!password) {
    throw new Error('DB_PASSWORD environment variable is required');
  }

  const user = process.env.DB_USER;
  if (!user) {
    throw new Error('DB_USER environment variable is required');
  }

  // Ensure we're not using postgres superuser in production
  if (process.env.NODE_ENV === 'production' && user === 'postgres') {
    throw new Error('Cannot use postgres superuser in production. Use a dedicated application user.');
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number.parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'numenor_security',
    user,
    password,
    ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production',
  };
};
