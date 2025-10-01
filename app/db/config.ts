import { config } from 'dotenv';

// Loads environment variables from .env file
// Provides TypeScript interface for database config
// Sets sensible defaults for development
// Enables SSL for production
config();

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export const getDatabaseConfig = (): DatabaseConfig => {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'numenor_security',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.NODE_ENV === 'production' ? true : false,
  };
};
