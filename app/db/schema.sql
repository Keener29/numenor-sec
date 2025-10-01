-- Numenor Security Database Schema
-- This file contains the initial database schema for the application

-- Create the database (run this manually if needed)
-- CREATE DATABASE numenor_security;

-- Users table for gym owners and administrators
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    gym_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Gyms table for gym information
CREATE TABLE IF NOT EXISTS gyms (
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
CREATE TABLE IF NOT EXISTS monitored_emails (
    id SERIAL PRIMARY KEY,
    gym_id INTEGER,
    email_address VARCHAR(255) NOT NULL,
    is_connected BOOLEAN DEFAULT false,
    last_checked TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phishing alerts
CREATE TABLE IF NOT EXISTS phishing_alerts (
    id SERIAL PRIMARY KEY,
    gym_id INTEGER,
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
    gym_id INTEGER,
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
    gym_id INTEGER,
    email_id INTEGER,
    scan_type VARCHAR(50) NOT NULL, -- full_scan, quick_scan, real_time
    threats_found INTEGER DEFAULT 0,
    emails_processed INTEGER DEFAULT 0,
    scan_duration_ms INTEGER,
    status VARCHAR(20) DEFAULT 'completed', -- running, completed, failed
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance (after foreign keys)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_gyms_owner_id ON gyms(owner_id);
CREATE INDEX IF NOT EXISTS idx_monitored_emails_gym_id ON monitored_emails(gym_id);
CREATE INDEX IF NOT EXISTS idx_phishing_alerts_gym_id ON phishing_alerts(gym_id);
CREATE INDEX IF NOT EXISTS idx_phishing_alerts_created_at ON phishing_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_gym_id ON security_events(gym_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_email_scans_gym_id ON email_scans(gym_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add foreign key constraints after all tables are created
ALTER TABLE gyms ADD CONSTRAINT fk_gyms_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE monitored_emails ADD CONSTRAINT fk_monitored_emails_gym_id FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE;
ALTER TABLE phishing_alerts ADD CONSTRAINT fk_phishing_alerts_gym_id FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE;
ALTER TABLE phishing_alerts ADD CONSTRAINT fk_phishing_alerts_email_id FOREIGN KEY (email_id) REFERENCES monitored_emails(id) ON DELETE CASCADE;
ALTER TABLE security_events ADD CONSTRAINT fk_security_events_gym_id FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE;
ALTER TABLE email_scans ADD CONSTRAINT fk_email_scans_gym_id FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE;
ALTER TABLE email_scans ADD CONSTRAINT fk_email_scans_email_id FOREIGN KEY (email_id) REFERENCES monitored_emails(id) ON DELETE CASCADE;

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_gyms_updated_at BEFORE UPDATE ON gyms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_monitored_emails_updated_at BEFORE UPDATE ON monitored_emails FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_phishing_alerts_updated_at BEFORE UPDATE ON phishing_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
