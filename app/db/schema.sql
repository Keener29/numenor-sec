-- Numenor Security Database Schema
-- This file contains the initial database schema for the application

-- Create the database (run this manually if needed)
-- CREATE DATABASE numenor_security;

-- Users table for business owners and administrators
-- Note: business relationship is via businesses.owner_id (single source of truth)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Businesss table for business information
CREATE TABLE IF NOT EXISTS businesses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner_id INTEGER,
    address TEXT,
    phone VARCHAR(20),
    website VARCHAR(255),
    member_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email addresses to monitor
-- Connection status is determined by presence of OAuth tokens in oauth_tokens table
CREATE TABLE IF NOT EXISTS monitored_emails (
    id SERIAL PRIMARY KEY,
    business_id INTEGER,
    email_address VARCHAR(255) NOT NULL,
    last_checked TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phishing alerts
CREATE TABLE IF NOT EXISTS phishing_alerts (
    id SERIAL PRIMARY KEY,
    business_id INTEGER,
    email_id INTEGER,
    subject VARCHAR(500),
    sender_email VARCHAR(255),
    recipient_email VARCHAR(255),
    threat_level VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    status VARCHAR(20) DEFAULT 'pending', -- pending, reviewed, safe, threat
    alert_type VARCHAR(50), -- phishing, malware, suspicious_link, etc.
    description TEXT,
    raw_email_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Security events log
CREATE TABLE IF NOT EXISTS security_events (
    id SERIAL PRIMARY KEY,
    business_id INTEGER,
    event_type VARCHAR(50) NOT NULL, -- login, logout, email_scan, alert_created, etc.
    description TEXT,
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email scan results
CREATE TABLE IF NOT EXISTS email_scans (
    id SERIAL PRIMARY KEY,
    business_id INTEGER,
    email_id INTEGER,
    scan_type VARCHAR(50) NOT NULL, -- full_scan, quick_scan, real_time
    threats_found INTEGER DEFAULT 0,
    emails_processed INTEGER DEFAULT 0,
    scan_duration_ms INTEGER,
    status VARCHAR(20) DEFAULT 'completed', -- running, completed, failed
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- OAuth tokens for email service providers
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL,
    email_address VARCHAR(255) NOT NULL,
    provider VARCHAR(20) NOT NULL DEFAULT 'gmail',
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    scope TEXT NOT NULL,
    token_type VARCHAR(50) NOT NULL DEFAULT 'Bearer',
    expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Unique constraint to prevent duplicate tokens for same business/email/provider
    CONSTRAINT unique_oauth_tokens_business_email_provider 
        UNIQUE (business_id, email_address, provider)
);

CREATE TABLE IF NOT EXISTS email_offsets (
    business_id INTEGER NOT NULL,
    email_address TEXT NOT NULL,
    provider TEXT NOT NULL,
    last_history_id TEXT,
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business_id, email_address, provider)
);

CREATE TABLE IF NOT EXISTS processed_emails (
    business_id INTEGER NOT NULL,
    email_address TEXT NOT NULL,
    message_id TEXT NOT NULL,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business_id, email_address, message_id)
);

CREATE TABLE IF NOT EXISTS account_deletions (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255),
    reason TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Password reset tokens (single-use)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance (after foreign keys)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_monitored_emails_business_id ON monitored_emails(business_id);
CREATE INDEX IF NOT EXISTS idx_phishing_alerts_business_id ON phishing_alerts(business_id);
CREATE INDEX IF NOT EXISTS idx_phishing_alerts_created_at ON phishing_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_business_id ON security_events(business_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_email_scans_business_id ON email_scans(business_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_business_id ON oauth_tokens(business_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_email_address ON oauth_tokens(email_address);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON oauth_tokens(provider);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expiry_date ON oauth_tokens(expiry_date);

-- Indexes for reset tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add foreign key constraints after all tables are created
-- Use DO blocks to check if constraints exist before adding them (idempotent)
DO $$
BEGIN
    -- businesses.owner_id -> users.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_businesses_owner_id'
    ) THEN
        ALTER TABLE businesses ADD CONSTRAINT fk_businesses_owner_id 
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    -- monitored_emails.business_id -> businesses.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_monitored_emails_business_id'
    ) THEN
        ALTER TABLE monitored_emails ADD CONSTRAINT fk_monitored_emails_business_id 
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;

    -- phishing_alerts.business_id -> businesses.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_phishing_alerts_business_id'
    ) THEN
        ALTER TABLE phishing_alerts ADD CONSTRAINT fk_phishing_alerts_business_id 
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;

    -- phishing_alerts.email_id -> monitored_emails.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_phishing_alerts_email_id'
    ) THEN
        ALTER TABLE phishing_alerts ADD CONSTRAINT fk_phishing_alerts_email_id 
            FOREIGN KEY (email_id) REFERENCES monitored_emails(id) ON DELETE CASCADE;
    END IF;

    -- security_events.business_id -> businesses.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_security_events_business_id'
    ) THEN
        ALTER TABLE security_events ADD CONSTRAINT fk_security_events_business_id 
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;

    -- email_scans.business_id -> businesses.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_email_scans_business_id'
    ) THEN
        ALTER TABLE email_scans ADD CONSTRAINT fk_email_scans_business_id 
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;

    -- email_scans.email_id -> monitored_emails.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_email_scans_email_id'
    ) THEN
        ALTER TABLE email_scans ADD CONSTRAINT fk_email_scans_email_id 
            FOREIGN KEY (email_id) REFERENCES monitored_emails(id) ON DELETE CASCADE;
    END IF;

    -- email_offsets.business_id -> businesses.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_email_offsets_business_id'
    ) THEN
        ALTER TABLE email_offsets ADD CONSTRAINT fk_email_offsets_business_id 
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;

    -- processed_emails.business_id -> businesses.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_processed_emails_business_id'
    ) THEN
        ALTER TABLE processed_emails ADD CONSTRAINT fk_processed_emails_business_id 
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;

    -- oauth_tokens.business_id -> businesses.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_oauth_tokens_business_id'
    ) THEN
        ALTER TABLE oauth_tokens ADD CONSTRAINT fk_oauth_tokens_business_id 
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes for new foreign keys
CREATE INDEX IF NOT EXISTS idx_email_offsets_business_id ON email_offsets(business_id);
CREATE INDEX IF NOT EXISTS idx_processed_emails_business_id ON processed_emails(business_id);

-- Indexes for account_deletions (for analytics queries)
CREATE INDEX IF NOT EXISTS idx_account_deletions_user_email ON account_deletions(user_email);
CREATE INDEX IF NOT EXISTS idx_account_deletions_deleted_at ON account_deletions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_account_deletions_business_name ON account_deletions(business_name);

-- Apply updated_at triggers (idempotent - drop and recreate if exists)
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_businesses_updated_at ON businesses;
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_monitored_emails_updated_at ON monitored_emails;
CREATE TRIGGER update_monitored_emails_updated_at BEFORE UPDATE ON monitored_emails FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_phishing_alerts_updated_at ON phishing_alerts;
CREATE TRIGGER update_phishing_alerts_updated_at BEFORE UPDATE ON phishing_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_oauth_tokens_updated_at ON oauth_tokens;
CREATE TRIGGER update_oauth_tokens_updated_at BEFORE UPDATE ON oauth_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
