/**
 * RadarMarket - PostgreSQL Database Client & Connection Pool
 * Configured specifically for persistent cloud deployment on Render.
 * 
 * Features:
 * 1. Automatic SSL configuration with rejectUnauthorized: false for Render PostgreSQL.
 * 2. Enterprise-grade connection pooling (max: 20, idle timeout, connection timeout).
 * 3. Schema auto-migration on boot from schema.sql.
 * 4. Zero-crash offline local fallback for local development without DATABASE_URL.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const databaseUrl = process.env.DATABASE_URL;
let pool = null;
let usePostgres = false;

// Local fallback store file
const LOCAL_STORE_PATH = path.join(__dirname, 'database_local.json');

function loadLocalStore() {
  try {
    if (fs.existsSync(LOCAL_STORE_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, 'utf-8'));
    }
  } catch (e) {}
  return {
    users: [],
    beacons: [],
    transactions: [],
    offers: [],
    messages: [],
    sync_events: [],
    campus_waitlist: []
  };
}

function saveLocalStore(store) {
  try {
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {}
}

let localStore = loadLocalStore();

if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
  usePostgres = true;
  // Render PostgreSQL requires SSL with self-signed certificate acceptance (rejectUnauthorized: false)
  const isLocalHost = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
  const sslConfig = !isLocalHost ? { rejectUnauthorized: false } : false;

  pool = new Pool({
    connectionString: databaseUrl,
    ssl: sslConfig,
    max: 20, // Max concurrent connections in pool
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 5000 // Timeout acquiring connection after 5s
  });

  pool.on('error', (err) => {
    console.error('[DB POOL ERROR] Unexpected PostgreSQL client error:', err.message);
  });
} else {
  console.log('[DB NOTICE] DATABASE_URL not detected in environment.');
  console.log('[DB NOTICE] Running in resilient local database fallback mode.');
}

/**
 * Execute SQL query against PostgreSQL Pool or Local Fallback Store
 * @param {string} text - Parameterized SQL query
 * @param {Array} params - Values for $1, $2, ...
 * @returns {Promise<{ rows: Array, rowCount: number }>}
 */
async function query(text, params = []) {
  if (usePostgres && pool) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (process.env.DEBUG_SQL) {
        console.log(`[SQL EXEC] ${duration}ms:`, { text: text.trim().slice(0, 80), rows: res.rowCount });
      }
      return res;
    } catch (err) {
      console.error('[SQL ERROR] Query failed:', {
        error: err.message,
        query: text.trim().slice(0, 100),
        params
      });
      throw err;
    }
  }

  // --- LOCAL FALLBACK QUERY ENGINE ---
  const sql = text.trim();
  const upper = sql.toUpperCase();

  // Ping check
  if (upper === 'SELECT 1' || upper.startsWith('SELECT 1')) {
    return { rows: [{ '?column?': 1 }], rowCount: 1 };
  }

  // USERS
  if (upper.includes('FROM USERS')) {
    if (upper.startsWith('SELECT * FROM USERS WHERE SESSION_TOKEN = $1')) {
      const u = localStore.users.find(x => x.session_token === params[0]);
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }
    if (upper.startsWith('SELECT * FROM USERS WHERE ID = $1')) {
      const u = localStore.users.find(x => x.id === params[0]);
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }
    if (upper.includes('PHONE_NUMBER = $1')) {
      const u = localStore.users.find(x => (x.phone_number === params[0] || x.id === params[1]) && x.phone_otp === params[2]);
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }
  }

  if (upper.startsWith('INSERT INTO USERS')) {
    // Check if inserting or updating
    const userId = params[0];
    let existingIdx = localStore.users.findIndex(x => x.id === userId);
    let userObj;
    if (params.length >= 9) {
      // Google auth insert
      userObj = {
        id: params[0],
        nickname: params[1],
        email: params[2],
        picture: params[3],
        google_id: params[4],
        trust_score: params[5],
        is_verified: 1,
        is_campus_verified: params[6],
        auth_provider: 'google',
        session_token: params[7],
        created_at: params[8],
        last_active_at: params[8]
      };
    } else {
      userObj = {
        id: params[0],
        nickname: params[1],
        lat: params[2],
        lng: params[3],
        upi_vpa: params[4],
        created_at: params[5] || Date.now() / 1000,
        last_active_at: params[5] || Date.now() / 1000
      };
    }

    if (existingIdx >= 0) {
      localStore.users[existingIdx] = { ...localStore.users[existingIdx], ...userObj };
      userObj = localStore.users[existingIdx];
    } else {
      localStore.users.push(userObj);
    }
    saveLocalStore(localStore);
    return { rows: [userObj], rowCount: 1 };
  }

  if (upper.startsWith('UPDATE USERS')) {
    const userId = params[params.length - 1];
    const u = localStore.users.find(x => x.id === userId);
    if (u) {
      if (upper.includes('PHONE_VERIFIED = 1')) {
        u.phone_verified = 1;
        u.phone_otp = null;
        u.phone_otp_expiry = null;
        u.trust_score = Math.max((u.trust_score || 50) + 25.0, 75.0);
      }
      if (upper.includes('SESSION_TOKEN = NULL')) {
        u.session_token = null;
      }
      saveLocalStore(localStore);
      return { rows: [u], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // BEACONS / LISTINGS
  if (upper.startsWith('SELECT * FROM BEACONS') || upper.startsWith('SELECT * FROM ITEMS')) {
    if (upper.includes('WHERE ID = $1')) {
      const b = localStore.beacons.find(x => x.id === params[0]);
      return { rows: b ? [b] : [], rowCount: b ? 1 : 0 };
    }
    if (upper.includes('SELLER_ID = $1')) {
      const b = localStore.beacons.filter(x => (x.seller_id === params[0] || x.seller_google_id === params[0]) && x.status !== 'deleted');
      return { rows: b, rowCount: b.length };
    }
    let list = localStore.beacons.filter(x => x.status !== 'deleted');
    if (params[0] && params[0] !== 'all') {
      list = list.filter(x => x.category === params[0]);
    }
    return { rows: list, rowCount: list.length };
  }

  if (upper.startsWith('INSERT INTO BEACONS') || upper.startsWith('INSERT INTO ITEMS')) {
    const beacon = {
      id: params[0],
      seller_id: params[1],
      seller_name: params[2],
      seller_avatar: params[3],
      seller_rating: params[4],
      seller_verified: params[5],
      seller_phone_verified: params[6],
      seller_campus_verified: params[7],
      seller_google_id: params[8],
      title: params[9],
      category: params[10],
      sub_category: params[11],
      price: params[12],
      original_price: params[13],
      discount_pct: params[14],
      condition: params[15],
      condition_score: params[16],
      dsp_score: params[17],
      lat: params[18],
      lng: params[19],
      landmark: params[20],
      safe_landmark: params[21],
      locality_id: params[22],
      locality_type: params[23],
      image: params[24],
      description: params[25],
      tags: typeof params[26] === 'string' ? JSON.parse(params[26] || '[]') : params[26],
      beacon_type: params[27],
      status: 'active',
      is_available: 1,
      upi_id: params[28],
      upi_qr_image: params[29],
      item_attributes: typeof params[30] === 'string' ? JSON.parse(params[30] || '{}') : params[30],
      handshake_code: params[31],
      created_at: params[32] || Date.now() / 1000
    };
    localStore.beacons.unshift(beacon);
    saveLocalStore(localStore);
    return { rows: [beacon], rowCount: 1 };
  }

  if (upper.startsWith('UPDATE BEACONS') || upper.startsWith('UPDATE ITEMS')) {
    const itemId = params[params.length - 1];
    const b = localStore.beacons.find(x => x.id === itemId);
    if (b) {
      if (upper.includes('STATUS = $1')) {
        b.status = params[0];
        b.is_available = (params[0] === 'sold' || params[0] === 'deleted') ? 0 : 1;
      }
      if (upper.includes('RESERVED_BY = $1')) {
        b.reserved_by = params[0];
      }
      saveLocalStore(localStore);
      return { rows: [b], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // TRANSACTIONS & PURCHASES
  if (upper.startsWith('INSERT INTO TRANSACTIONS')) {
    const tx = {
      id: params[0],
      item_id: params[1],
      buyer_id: params[2],
      buyer_name: params[3],
      seller_id: params[4],
      amount: params[5],
      original_price: params[6] || params[5],
      payment_mode: 'upi',
      order_status: 'completed',
      handshake_code: params[7],
      buyer_declared_paid: 1,
      seller_confirmed_paid: 1,
      created_at: params[8] || Date.now() / 1000,
      updated_at: params[8] || Date.now() / 1000
    };
    localStore.transactions.unshift(tx);
    saveLocalStore(localStore);
    return { rows: [tx], rowCount: 1 };
  }

  if (upper.includes('FROM TRANSACTIONS')) {
    const uid = params[0];
    const list = localStore.transactions.filter(x => x.buyer_id === uid || x.seller_id === uid);
    return { rows: list, rowCount: list.length };
  }

  // OFFERS
  if (upper.startsWith('INSERT INTO OFFERS')) {
    const off = {
      id: params[0],
      item_id: params[1],
      buyer_id: params[2],
      buyer_name: params[3],
      seller_id: params[4],
      original_price: params[5],
      offer_amount: params[6],
      status: 'pending',
      created_at: params[7] || Date.now() / 1000,
      updated_at: params[7] || Date.now() / 1000
    };
    localStore.offers.unshift(off);
    saveLocalStore(localStore);
    return { rows: [off], rowCount: 1 };
  }

  if (upper.startsWith('UPDATE OFFERS')) {
    const offId = params[2];
    const off = localStore.offers.find(x => x.id === offId);
    if (off) {
      off.status = params[0];
      off.updated_at = params[1];
      saveLocalStore(localStore);
      return { rows: [off], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // MESSAGES
  if (upper.startsWith('INSERT INTO MESSAGES')) {
    const msg = {
      id: localStore.messages.length + 1,
      item_id: params[0],
      sender_id: params[1],
      sender_name: params[2],
      sender_email: params[3] || '',
      sender_avatar: params[4] || '',
      text: params[5],
      created_at: params[6] || Date.now() / 1000
    };
    localStore.messages.push(msg);
    saveLocalStore(localStore);
    return { rows: [msg], rowCount: 1 };
  }

  if (upper.startsWith('SELECT * FROM MESSAGES')) {
    const list = localStore.messages.filter(x => x.item_id === params[0]);
    return { rows: list, rowCount: list.length };
  }

  // SYNC EVENTS
  if (upper.startsWith('INSERT INTO SYNC_EVENTS')) {
    const ev = {
      id: localStore.sync_events.length + 1,
      event_type: params[0],
      item_id: params[1],
      payload: typeof params[2] === 'string' ? JSON.parse(params[2]) : params[2],
      created_at: params[3] || Date.now() / 1000
    };
    localStore.sync_events.push(ev);
    saveLocalStore(localStore);
    return { rows: [ev], rowCount: 1 };
  }

  if (upper.startsWith('SELECT * FROM SYNC_EVENTS')) {
    const since = params[0] || 0;
    const list = localStore.sync_events.filter(x => x.created_at > since);
    return { rows: list, rowCount: list.length };
  }

  // CAMPUS WAITLIST
  if (upper.startsWith('INSERT INTO CAMPUS_WAITLIST')) {
    const w = {
      id: localStore.campus_waitlist.length + 1,
      campus_name: params[0],
      email: params[1],
      created_at: params[2] || Date.now() / 1000
    };
    localStore.campus_waitlist.push(w);
    saveLocalStore(localStore);
    return { rows: [w], rowCount: 1 };
  }

  return { rows: [], rowCount: 0 };
}

/**
 * Initialize PostgreSQL Schema on Render Boot
 */
async function initDatabase() {
  if (!usePostgres || !pool) {
    console.log('[DB INIT] Local fallback store ready (zero-configuration local dev).');
    return;
  }

  const client = await pool.connect();
  try {
    console.log('[DB INIT] Connecting to PostgreSQL at Render cloud...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      await client.query(sql);
      console.log('[DB INIT] ✓ Database schema verified and initialized successfully!');
    }
  } catch (err) {
    console.error('[DB INIT ERROR] PostgreSQL Schema initialization warning:', err.message);
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  initDatabase,
  isPostgres: () => usePostgres
};
