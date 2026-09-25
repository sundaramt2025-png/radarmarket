-- RadarMarket Persistent Cloud PostgreSQL Database Schema
-- Compatible with Render PostgreSQL (PostgreSQL 14 / 15 / 16)

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USERS TABLE
-- Stores user IDs, Google Sign-In profile info, verified phone numbers (+91), and trust scores
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) PRIMARY KEY,
    nickname VARCHAR(100) NOT NULL,
    avatar TEXT,
    email VARCHAR(255) UNIQUE,
    picture TEXT,
    google_id VARCHAR(255) UNIQUE,
    phone_number VARCHAR(20),
    phone_verified INTEGER DEFAULT 0,
    phone_otp VARCHAR(10),
    phone_otp_expiry DOUBLE PRECISION,
    trust_score DOUBLE PRECISION DEFAULT 50.0,
    seller_rating DOUBLE PRECISION DEFAULT 4.9,
    trades_completed INTEGER DEFAULT 0,
    is_verified INTEGER DEFAULT 0,
    is_campus_verified INTEGER DEFAULT 0,
    auth_provider VARCHAR(50) DEFAULT 'guest',
    upi_vpa VARCHAR(128),
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    session_token TEXT,
    created_at DOUBLE PRECISION NOT NULL,
    last_active_at DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);

-- 3. BEACONS / LISTINGS TABLE
-- Stores beacon items (title, category, description, price, discount, condition, GPS coordinates, seller ID, DSP-VI telemetry scores, and active status)
CREATE TABLE IF NOT EXISTS beacons (
    id VARCHAR(64) PRIMARY KEY,
    seller_id VARCHAR(128) NOT NULL,
    seller_name VARCHAR(100) NOT NULL,
    seller_rating DOUBLE PRECISION DEFAULT 4.9,
    seller_verified INTEGER DEFAULT 1,
    seller_avatar TEXT,
    seller_email VARCHAR(255),
    seller_phone_verified INTEGER DEFAULT 0,
    seller_campus_verified INTEGER DEFAULT 0,
    seller_google_id VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    sub_category VARCHAR(100),
    price DOUBLE PRECISION NOT NULL,
    original_price DOUBLE PRECISION,
    discount_pct INTEGER DEFAULT 0,
    condition VARCHAR(64) NOT NULL,
    condition_score DOUBLE PRECISION DEFAULT 0.85,
    dsp_score DOUBLE PRECISION DEFAULT 85.0,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    landmark VARCHAR(255) NOT NULL,
    safe_landmark VARCHAR(255),
    locality_id VARCHAR(128),
    locality_type VARCHAR(64) DEFAULT 'campus',
    image TEXT,
    description TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    beacon_type VARCHAR(32) DEFAULT 'sell',
    status VARCHAR(32) DEFAULT 'active',
    is_available INTEGER DEFAULT 1,
    reserved_by VARCHAR(128),
    upi_id VARCHAR(128),
    upi_qr_image TEXT,
    item_attributes JSONB DEFAULT '{}'::jsonb,
    handshake_code VARCHAR(10),
    agreed_price DOUBLE PRECISION,
    accepted_offer_id VARCHAR(64),
    completed_by VARCHAR(128),
    completed_at DOUBLE PRECISION,
    created_at DOUBLE PRECISION NOT NULL
);

-- Backwards compatibility view: alias 'items' to 'beacons'
CREATE OR REPLACE VIEW items AS SELECT * FROM beacons;

CREATE INDEX IF NOT EXISTS idx_beacons_category ON beacons(category);
CREATE INDEX IF NOT EXISTS idx_beacons_status ON beacons(status);
CREATE INDEX IF NOT EXISTS idx_beacons_coords ON beacons(lat, lng);
CREATE INDEX IF NOT EXISTS idx_beacons_seller ON beacons(seller_id);
CREATE INDEX IF NOT EXISTS idx_beacons_created_at ON beacons(created_at DESC);

-- 4. PURCHASES / TRANSACTIONS TABLE
-- Stores purchase details, UPI P2P payment info, escrow/handshake status, and order statuses
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(64) PRIMARY KEY,
    item_id VARCHAR(64) NOT NULL,
    buyer_id VARCHAR(128) NOT NULL,
    buyer_name VARCHAR(100) NOT NULL,
    seller_id VARCHAR(128) NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    original_price DOUBLE PRECISION,
    upi_tx_ref VARCHAR(128),
    payment_mode VARCHAR(32) DEFAULT 'upi',
    order_status VARCHAR(32) DEFAULT 'pending', -- pending, completed, cancelled
    handshake_code VARCHAR(10),
    buyer_declared_paid INTEGER DEFAULT 0,
    seller_confirmed_paid INTEGER DEFAULT 0,
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_item ON transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(order_status);

-- 5. OFFERS / BARGAINING TABLE
CREATE TABLE IF NOT EXISTS offers (
    id VARCHAR(64) PRIMARY KEY,
    item_id VARCHAR(64) NOT NULL,
    buyer_id VARCHAR(128) NOT NULL,
    buyer_name VARCHAR(100) NOT NULL,
    seller_id VARCHAR(128) NOT NULL,
    original_price DOUBLE PRECISION NOT NULL,
    offer_amount DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) DEFAULT 'pending', -- pending, accepted, rejected, counter
    upi_tx_ref VARCHAR(128),
    buyer_declared_paid INTEGER DEFAULT 0,
    seller_confirmed_paid INTEGER DEFAULT 0,
    payment_mode VARCHAR(32) DEFAULT 'upi',
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offers_item ON offers(item_id);
CREATE INDEX IF NOT EXISTS idx_offers_buyer ON offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_offers_seller ON offers(seller_id);

-- 6. PRIVATE REAL-TIME CHAT MESSAGES (SECURE ROOM SCOPING)
-- Persistent database storage ensuring buyer/seller privacy without data leaks
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    listing_id VARCHAR(64) NOT NULL,
    item_id VARCHAR(64) NOT NULL,
    room_id VARCHAR(256) NOT NULL,
    sender_id VARCHAR(128) NOT NULL,
    receiver_id VARCHAR(128) NOT NULL,
    buyer_id VARCHAR(128) NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    sender_email VARCHAR(255),
    sender_avatar TEXT,
    message_text TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at DOUBLE PRECISION NOT NULL
);

-- Schema migration helpers for existing cloud databases
ALTER TABLE messages ADD COLUMN IF NOT EXISTS listing_id VARCHAR(64);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS room_id VARCHAR(256);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS receiver_id VARCHAR(128);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS buyer_id VARCHAR(128);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_text TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_listing_id ON messages(listing_id);
CREATE INDEX IF NOT EXISTS idx_messages_item ON messages(item_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_participants ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- 7. MULTI-DEVICE REAL-TIME SYNC EVENTS
CREATE TABLE IF NOT EXISTS sync_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    item_id VARCHAR(64),
    payload JSONB DEFAULT '{}'::jsonb,
    created_at DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_events_created ON sync_events(created_at DESC);

-- 8. CAMPUS EXPANSION WAITLIST
CREATE TABLE IF NOT EXISTS campus_waitlist (
    id SERIAL PRIMARY KEY,
    campus_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at DOUBLE PRECISION NOT NULL
);
