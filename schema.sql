-- Smart Budget & Saving Manager Database Schema
-- Compatible with SQLite, PostgreSQL, and MySQL

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150),
    currency VARCHAR(10) DEFAULT '₹',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS income (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    source VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    payment_mode VARCHAR(50) DEFAULT 'UPI',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    payment_mode VARCHAR(50) DEFAULT 'UPI',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budgets (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    category VARCHAR(100) NOT NULL,
    monthly_limit DECIMAL(12, 2) NOT NULL,
    month VARCHAR(20) NOT NULL,
    alert_threshold_percent DECIMAL(5, 2) DEFAULT 80.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saving_goals (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    title VARCHAR(150) NOT NULL,
    target_amount DECIMAL(12, 2) NOT NULL,
    saved_amount DECIMAL(12, 2) DEFAULT 0.0,
    target_date DATE,
    category VARCHAR(50) DEFAULT 'General',
    status VARCHAR(30) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goal_deposits (
    id VARCHAR(64) PRIMARY KEY,
    goal_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    deposit_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budget_alerts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    category VARCHAR(100),
    level VARCHAR(30) DEFAULT 'warning',
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
