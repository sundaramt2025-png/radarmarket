/**
 * RadarMarket - Production Node.js & Express Server with Persistent PostgreSQL
 * Architected for high-concurrency cloud deployment on Render.
 */

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Static Asset Cache Control Middleware
app.use((req, res, next) => {
  if (req.url === '/sw.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (req.url.startsWith('/css/') || req.url.startsWith('/js/')) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
  next();
});

// Serve frontend static assets from root
app.use(express.static(path.join(__dirname)));

// Helper: current epoch seconds
const nowSec = () => Date.now() / 1000;

// Helper: calculate Haversine distance in meters
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: extract authenticated user from Authorization header or X-Device-Id
async function getAuthUser(req) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const deviceId = req.headers['x-device-id'];

    if (token) {
      const resToken = await db.query('SELECT * FROM users WHERE session_token = $1', [token]);
      if (resToken.rows.length > 0) return resToken.rows[0];
    }
    if (deviceId) {
      const resDev = await db.query('SELECT * FROM users WHERE id = $1', [deviceId]);
      if (resDev.rows.length > 0) return resDev.rows[0];
    }
  } catch (e) {}
  return null;
}

// ---------------------------------------------------------------------------
// 1. HEALTH & TELEMETRY ROUTES
// ---------------------------------------------------------------------------

app.get('/api/ping', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const dbCheck = await db.query('SELECT 1');
    if (dbCheck && dbCheck.rows.length > 0) dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'error: ' + e.message;
  }

  res.json({
    status: 'ok',
    timestamp: nowSec(),
    service: 'radarmarket-v3.0.3',
    mode: 'production',
    database: dbStatus,
    runtime: 'node-express'
  });
});

app.get('/api/network-info', (req, res) => {
  const host = req.get('host') || '127.0.0.1:5000';
  const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  res.json({
    active_url: `${protocol}://${host}`,
    public_url: process.env.RENDER_EXTERNAL_URL || `${protocol}://${host}`,
    port: PORT,
    timestamp: nowSec()
  });
});

// ---------------------------------------------------------------------------
// 2. USER AUTHENTICATION & PROFILE ROUTES
// ---------------------------------------------------------------------------

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, email, name, picture, google_id } = req.body;
    let userEmail = email;
    let userName = name;
    let userPicture = picture;
    let userGid = google_id;

    // Decode JWT payload if credential string was passed directly
    if (credential && typeof credential === 'string' && credential.includes('.')) {
      try {
        const parts = credential.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        userEmail = payload.email || userEmail;
        userName = payload.name || userName;
        userPicture = payload.picture || userPicture;
        userGid = payload.sub || userGid;
      } catch (e) {}
    }

    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'Valid email required' });
    }

    const userId = userGid ? `google-${userGid}` : `usr-${crypto.createHash('md5').update(userEmail).digest('hex').slice(0, 12)}`;
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const now = nowSec();

    const isEdu = userEmail.endsWith('.edu') || userEmail.endsWith('.ac.in') || userEmail.endsWith('.edu.in');
    const campusVerified = isEdu ? 1 : 0;
    const initialTrust = isEdu ? 80.0 : 70.0;

    const queryText = `
      INSERT INTO users (
        id, nickname, email, picture, google_id,
        trust_score, is_verified, is_campus_verified, auth_provider,
        session_token, created_at, last_active_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 1, $7, 'google', $8, $9, $9)
      ON CONFLICT (id) DO UPDATE SET
        nickname = COALESCE(EXCLUDED.nickname, users.nickname),
        picture = COALESCE(EXCLUDED.picture, users.picture),
        session_token = EXCLUDED.session_token,
        last_active_at = EXCLUDED.last_active_at
      RETURNING *;
    `;

    const result = await db.query(queryText, [
      userId,
      userName || 'Student',
      userEmail,
      userPicture || '',
      userGid || '',
      initialTrust,
      campusVerified,
      sessionToken,
      now
    ]);

    const user = result.rows[0];
    res.json({
      success: true,
      user,
      session_token: sessionToken
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const deviceId = req.headers['x-device-id'];

    if (!token && !deviceId) {
      return res.json({ authenticated: false, user: null });
    }

    let user = null;
    if (token) {
      const resToken = await db.query('SELECT * FROM users WHERE session_token = $1', [token]);
      if (resToken.rows.length > 0) user = resToken.rows[0];
    }

    if (!user && deviceId) {
      const resDev = await db.query('SELECT * FROM users WHERE id = $1', [deviceId]);
      if (resDev.rows.length > 0) user = resDev.rows[0];
    }

    if (!user) {
      return res.json({ authenticated: false, user: null });
    }

    res.json({ authenticated: true, user });
  } catch (err) {
    res.status(500).json({ authenticated: false, error: err.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      await db.query('UPDATE users SET session_token = NULL WHERE session_token = $1', [token]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.all('/api/me', async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'] || 'guest-' + crypto.randomBytes(4).toString('hex');
    const now = nowSec();

    if (req.method === 'POST') {
      const { nickname, lat, lng, upi_vpa } = req.body;
      const queryText = `
        INSERT INTO users (id, nickname, lat, lng, upi_vpa, created_at, last_active_at)
        VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT (id) DO UPDATE SET
          nickname = COALESCE($2, users.nickname),
          lat = COALESCE($3, users.lat),
          lng = COALESCE($4, users.lng),
          upi_vpa = COALESCE($5, users.upi_vpa),
          last_active_at = $6
        RETURNING *;
      `;
      const result = await db.query(queryText, [
        deviceId,
        nickname || 'Student',
        lat ? parseFloat(lat) : null,
        lng ? parseFloat(lng) : null,
        upi_vpa || null,
        now
      ]);
      return res.json({ success: true, user: result.rows[0] });
    }

    // GET
    let result = await db.query('SELECT * FROM users WHERE id = $1', [deviceId]);
    if (result.rows.length === 0) {
      const createText = `
        INSERT INTO users (id, nickname, created_at, last_active_at)
        VALUES ($1, $2, $3, $3)
        RETURNING *;
      `;
      result = await db.query(createText, [deviceId, 'Student ' + deviceId.slice(-4), now]);
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Phone OTP Authentication (+91 Verification)
app.post('/api/auth/phone/send-otp', async (req, res) => {
  try {
    const { phone_number, device_id } = req.body;
    if (!phone_number) {
      return res.status(400).json({ success: false, error: 'Phone number required' });
    }

    const cleanPhone = phone_number.replace(/[^0-9]/g, '').slice(-10);
    const mockOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = nowSec() + 600; // 10 minutes
    const devId = device_id || req.headers['x-device-id'] || `phone-${cleanPhone}`;

    const queryText = `
      INSERT INTO users (id, nickname, phone_number, phone_otp, phone_otp_expiry, created_at, last_active_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6)
      ON CONFLICT (id) DO UPDATE SET
        phone_number = $3,
        phone_otp = $4,
        phone_otp_expiry = $5,
        last_active_at = $6
      RETURNING *;
    `;
    await db.query(queryText, [devId, 'Student ' + cleanPhone.slice(-4), cleanPhone, mockOtp, expiry, nowSec()]);

    res.json({
      success: true,
      message: `OTP sent to +91 ${cleanPhone}`,
      otp: mockOtp, // Included for instant sandbox testing
      expiry_seconds: 600
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/phone/verify-otp', async (req, res) => {
  try {
    const { phone_number, otp, device_id } = req.body;
    const cleanPhone = phone_number ? phone_number.replace(/[^0-9]/g, '').slice(-10) : '';
    const devId = device_id || req.headers['x-device-id'];

    const result = await db.query(
      'SELECT * FROM users WHERE (phone_number = $1 OR id = $2) AND phone_otp = $3',
      [cleanPhone, devId, String(otp).trim()]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP code.' });
    }

    const user = result.rows[0];
    if (user.phone_otp_expiry && user.phone_otp_expiry < nowSec()) {
      return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new code.' });
    }

    // Unlock verified trust badge and score boost
    const updateText = `
      UPDATE users SET
        phone_verified = 1,
        phone_otp = NULL,
        phone_otp_expiry = NULL,
        trust_score = GREATEST(trust_score + 25.0, 75.0),
        last_active_at = $1
      WHERE id = $2
      RETURNING *;
    `;
    const updated = await db.query(updateText, [nowSec(), user.id]);

    res.json({
      success: true,
      phone_verified: true,
      phone_number: cleanPhone,
      user: updated.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. BEACONS / LISTINGS ROUTES (CRUD + GEOSPATIAL RADAR)
// ---------------------------------------------------------------------------

app.get('/api/items', async (req, res) => {
  try {
    const { category, beacon_type, lat, lng, radius_meters } = req.query;

    let queryText = "SELECT * FROM beacons WHERE status != 'deleted'";
    const params = [];

    if (category && category !== 'all') {
      params.push(category);
      queryText += ` AND category = $${params.length}`;
    }

    if (beacon_type && beacon_type !== 'all') {
      params.push(beacon_type);
      queryText += ` AND beacon_type = $${params.length}`;
    }

    queryText += " ORDER BY created_at DESC LIMIT 200;";

    const result = await db.query(queryText, params);
    let items = result.rows;

    // Optional geospatial distance calculation & perimeter filtering
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxRadius = radius_meters ? parseFloat(radius_meters) : 50000; // default 50km

      items = items.map((it) => {
        const dist = haversineMeters(userLat, userLng, it.lat, it.lng);
        return { ...it, distance: Math.round(dist) };
      }).filter((it) => it.distance <= maxRadius);
    }

    res.json({
      items,
      count: items.length,
      status: 'ok',
      storage: 'persistent_postgresql'
    });
  } catch (err) {
    console.error('Fetch items error:', err);
    res.status(500).json({ error: err.message, items: [] });
  }
});

app.get('/api/my-items', async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    let userId = deviceId;
    if (token) {
      const uRes = await db.query('SELECT id, google_id FROM users WHERE session_token = $1', [token]);
      if (uRes.rows.length > 0) {
        userId = uRes.rows[0].google_id || uRes.rows[0].id;
      }
    }

    if (!userId) {
      return res.json({ items: [] });
    }

    const queryText = `
      SELECT * FROM beacons
      WHERE (seller_id = $1 OR seller_google_id = $1) AND status != 'deleted'
      ORDER BY created_at DESC;
    `;
    const result = await db.query(queryText, [userId]);
    res.json({ items: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message, items: [] });
  }
});

app.post('/api/items', async (req, res) => {
  try {
    const data = req.body;
    const title = (data.title || '').trim();
    const category = (data.category || 'stationery').trim();
    const price = parseFloat(data.price || 0);

    if (!title || isNaN(price) || price < 0) {
      return res.status(400).json({ success: false, error: 'Valid title and price are required.' });
    }

    const itemId = `item-${crypto.randomBytes(5).toString('hex')}`;
    const handshakeCode = Math.floor(1000 + Math.random() * 9000).toString();
    const now = nowSec();

    const sellerId = data.seller_id || req.headers['x-device-id'] || 'guest_seller';
    const sellerName = (data.seller_name || 'Student Seller').trim();
    const originalPrice = data.original_price ? parseFloat(data.original_price) : Math.round(price * 1.5);
    const discountPct = originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

    const lat = parseFloat(data.lat || 19.1334);
    const lng = parseFloat(data.lng || 72.9133);

    const queryText = `
      INSERT INTO beacons (
        id, seller_id, seller_name, seller_avatar, seller_rating,
        seller_verified, seller_phone_verified, seller_campus_verified, seller_google_id,
        title, category, sub_category, price, original_price, discount_pct,
        condition, condition_score, dsp_score, lat, lng, landmark, safe_landmark,
        locality_id, locality_type, image, description, tags, beacon_type,
        status, is_available, upi_id, upi_qr_image, item_attributes,
        handshake_code, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26, $27, $28,
        'active', 1, $29, $30, $31,
        $32, $33
      )
      RETURNING *;
    `;

    const values = [
      itemId,
      sellerId,
      sellerName,
      data.seller_avatar || '',
      data.seller_rating || 5.0,
      data.seller_verified || 1,
      data.seller_phone_verified || 0,
      data.seller_campus_verified || 0,
      data.seller_google_id || '',
      title,
      category,
      data.sub_category || data.subCategory || 'Item',
      price,
      originalPrice,
      discountPct,
      data.condition || 'Good',
      parseFloat(data.condition_score || 0.85),
      parseFloat(data.dsp_score || 88.0),
      lat,
      lng,
      data.landmark || data.safe_landmark || 'Campus Center',
      data.safe_landmark || data.landmark || 'Campus Center',
      data.locality_id || null,
      data.locality_type || 'campus',
      data.image || '',
      data.description || '',
      JSON.stringify(data.tags || [category]),
      data.beacon_type || 'sell',
      data.upi_id || '',
      data.upi_qr_image || '',
      JSON.stringify(data.item_attributes || {}),
      handshakeCode,
      now
    ];

    const result = await db.query(queryText, values);
    const item = result.rows[0];

    // Broadcast sync event to network
    await db.query(
      'INSERT INTO sync_events (event_type, item_id, payload, created_at) VALUES ($1, $2, $3, $4)',
      ['item_created', itemId, JSON.stringify(item), now]
    );

    res.json({
      success: true,
      item,
      handshake_code: handshakeCode
    });
  } catch (err) {
    console.error('Create item error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const handleItemStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const newStatus = status || 'sold';
    const isAvail = (newStatus === 'sold' || newStatus === 'deleted') ? 0 : 1;

    const queryText = `
      UPDATE beacons SET status = $1, is_available = $2 WHERE id = $3 RETURNING *;
    `;
    const result = await db.query(queryText, [newStatus, isAvail, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    // Sync event
    await db.query(
      'INSERT INTO sync_events (event_type, item_id, payload, created_at) VALUES ($1, $2, $3, $4)',
      ['item_status_changed', id, JSON.stringify({ item_id: id, status: newStatus }), nowSec()]
    );

    res.json({ success: true, item_id: id, status: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
app.post('/api/items/:id/status', handleItemStatus);
app.patch('/api/items/:id/status', handleItemStatus);

app.post('/api/items/:id/reserve', async (req, res) => {
  try {
    const { id } = req.params;
    const deviceId = req.headers['x-device-id'] || req.body.device_id;

    const check = await db.query('SELECT * FROM beacons WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    const item = check.rows[0];
    const isReservedByMe = item.reserved_by === deviceId;
    const newReserved = isReservedByMe ? null : deviceId;

    const updated = await db.query(
      'UPDATE beacons SET reserved_by = $1 WHERE id = $2 RETURNING *',
      [newReserved, id]
    );

    await db.query(
      'INSERT INTO sync_events (event_type, item_id, payload, created_at) VALUES ($1, $2, $3, $4)',
      ['item_reserved', id, JSON.stringify({ item_id: id, reserved_by: newReserved }), nowSec()]
    );

    res.json({
      success: true,
      is_reserved: !isReservedByMe,
      reserved_by: newReserved
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. PURCHASES, TRANSACTIONS & SECRET HANDSHAKE VERIFICATION
// ---------------------------------------------------------------------------

app.get('/api/handshake/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT handshake_code FROM beacons WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({
      success: true,
      handshake_code: result.rows[0].handshake_code || '1234'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/handshake/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, buyer_id, buyer_name } = req.body;

    const itemRes = await db.query('SELECT * FROM beacons WHERE id = $1', [id]);
    if (itemRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    const item = itemRes.rows[0];
    if (String(item.handshake_code).trim() !== String(code).trim()) {
      return res.status(400).json({ success: false, error: 'Invalid 4-digit handshake code.' });
    }

    const now = nowSec();
    const txId = `tx-${crypto.randomBytes(6).toString('hex')}`;
    const buyerId = buyer_id || req.headers['x-device-id'] || 'buyer_verified';
    const buyerName = buyer_name || 'Verified Buyer';

    // 1. Mark item as sold
    await db.query(
      `UPDATE beacons SET
        status = 'sold',
        is_available = 0,
        completed_by = $1,
        completed_at = $2
      WHERE id = $3`,
      [buyerId, now, id]
    );

    // 2. Insert persistent transaction record
    const txQuery = `
      INSERT INTO transactions (
        id, item_id, buyer_id, buyer_name, seller_id, amount,
        original_price, payment_mode, order_status, handshake_code,
        buyer_declared_paid, seller_confirmed_paid, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'upi', 'completed', $8, 1, 1, $9, $9)
      RETURNING *;
    `;
    const txRes = await db.query(txQuery, [
      txId,
      id,
      buyerId,
      buyerName,
      item.seller_id,
      item.price,
      item.original_price || item.price,
      code,
      now
    ]);

    // 3. Increment trades completed for seller
    await db.query(
      'UPDATE users SET trades_completed = trades_completed + 1, trust_score = trust_score + 10 WHERE id = $1',
      [item.seller_id]
    );

    // 4. Sync event
    await db.query(
      'INSERT INTO sync_events (event_type, item_id, payload, created_at) VALUES ($1, $2, $3, $4)',
      ['item_sold', id, JSON.stringify({ item_id: id, transaction_id: txId }), now]
    );

    res.json({
      success: true,
      verified: true,
      transaction: txRes.rows[0],
      message: 'Secret handshake verified! Transaction completed successfully.'
    });
  } catch (err) {
    console.error('Handshake verification error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// View transaction / purchase history
app.get('/api/purchases', async (req, res) => {
  try {
    const userId = req.headers['x-device-id'];
    if (!userId) return res.json({ purchases: [] });

    const queryText = `
      SELECT t.*, b.title as item_title, b.image as item_image, b.category as item_category
      FROM transactions t
      LEFT JOIN beacons b ON t.item_id = b.id
      WHERE t.buyer_id = $1 OR t.seller_id = $1
      ORDER BY t.created_at DESC;
    `;
    const result = await db.query(queryText, [userId]);
    res.json({ purchases: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPI Payment Declaration & Confirmation
app.post('/api/payment/declare', async (req, res) => {
  try {
    const { item_id, upi_tx_ref, amount } = req.body;
    const buyerId = req.headers['x-device-id'] || 'buyer_device';

    const itemRes = await db.query('SELECT * FROM beacons WHERE id = $1', [item_id]);
    if (itemRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    const txId = `tx-${crypto.randomBytes(6).toString('hex')}`;
    const now = nowSec();

    const insertText = `
      INSERT INTO transactions (
        id, item_id, buyer_id, buyer_name, seller_id, amount,
        upi_tx_ref, payment_mode, order_status, buyer_declared_paid, created_at, updated_at
      )
      VALUES ($1, $2, $3, 'Student Buyer', $4, $5, $6, 'upi', 'pending', 1, $7, $7)
      RETURNING *;
    `;
    const result = await db.query(insertText, [
      txId,
      item_id,
      buyerId,
      itemRes.rows[0].seller_id,
      parseFloat(amount || itemRes.rows[0].price),
      upi_tx_ref || 'UPI-DIRECT',
      now
    ]);

    res.json({ success: true, transaction: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 5. BARGAINING OFFERS & CHAT MESSAGES
// ---------------------------------------------------------------------------

app.post('/api/offers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { offer_amount, buyer_id, buyer_name } = req.body;

    const itemRes = await db.query('SELECT * FROM beacons WHERE id = $1', [id]);
    if (itemRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    const item = itemRes.rows[0];
    const offerId = `off-${crypto.randomBytes(5).toString('hex')}`;
    const now = nowSec();

    const queryText = `
      INSERT INTO offers (
        id, item_id, buyer_id, buyer_name, seller_id,
        original_price, offer_amount, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $8)
      RETURNING *;
    `;

    const result = await db.query(queryText, [
      offerId,
      id,
      buyer_id || req.headers['x-device-id'] || 'buyer',
      buyer_name || 'Student',
      item.seller_id,
      item.price,
      parseFloat(offer_amount),
      now
    ]);

    // Send offer message directly into chat feed
    const offerMsg = `[OFFER:${offerId}:${offer_amount}:${item.price}:pending:${buyer_name || 'Student'}]`;
    await db.query(
      'INSERT INTO messages (item_id, sender_id, sender_name, text, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, buyer_id || 'buyer', buyer_name || 'Student', offerMsg, now]
    );

    res.json({ success: true, offer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/offers/:offer_id/respond', async (req, res) => {
  try {
    const { offer_id } = req.params;
    const { action } = req.body; // 'accept' or 'reject'
    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    const now = nowSec();

    const result = await db.query(
      'UPDATE offers SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *',
      [newStatus, now, offer_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    const offer = result.rows[0];
    const msgText = action === 'accept'
      ? `[OFFER_ACCEPTED:${offer_id}:${offer.offer_amount}]`
      : `[OFFER_REJECTED:${offer_id}]`;

    await db.query(
      'INSERT INTO messages (item_id, sender_id, sender_name, text, created_at) VALUES ($1, $2, $3, $4, $5)',
      [offer.item_id, offer.seller_id, 'Seller', msgText, now]
    );

    res.json({ success: true, offer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 5. SECURE PRIVATE REAL-TIME CHAT & MESSAGING (SOCKET.IO & REST)
// Strict Room Scoping (chat_${listingId}_${buyerId}) to Prevent Global Data Leaks
// ---------------------------------------------------------------------------

// Helper: Authorize listing participant (buyer or seller)
async function authorizeChatParticipant(listingId, userId, requestedBuyerId = null) {
  if (!listingId || !userId) return { authorized: false, reason: 'Missing listingId or userId' };

  const itemRes = await db.query('SELECT * FROM beacons WHERE id = $1', [listingId]);
  if (itemRes.rows.length === 0) {
    return { authorized: false, reason: 'Listing not found' };
  }

  const item = itemRes.rows[0];
  const isSeller = (userId === item.seller_id || userId === item.seller_google_id);

  if (isSeller) {
    return {
      authorized: true,
      role: 'seller',
      item,
      sellerId: item.seller_id,
      buyerId: requestedBuyerId || null
    };
  }

  // If not seller, user is a buyer
  return {
    authorized: true,
    role: 'buyer',
    item,
    sellerId: item.seller_id,
    buyerId: userId
  };
}

// Socket.io Connection & Scoped Room Events
io.on('connection', (socket) => {
  // 1. Join a strictly scoped private room: chat_${listingId}_${buyerId}
  socket.on('join_room', async (data) => {
    try {
      const { listing_id, buyer_id, user_id } = data || {};
      if (!listing_id || !buyer_id || !user_id) {
        return socket.emit('error', { message: 'listing_id, buyer_id, and user_id are required' });
      }

      const auth = await authorizeChatParticipant(listing_id, user_id, buyer_id);
      if (!auth.authorized) {
        return socket.emit('error', { message: auth.reason });
      }

      // Verify that if caller is buyer, buyer_id matches their own ID
      if (auth.role === 'buyer' && buyer_id !== user_id) {
        return socket.emit('error', { message: 'Unauthorized: Buyers cannot access other buyers rooms' });
      }

      const roomId = `chat_${listing_id}_${buyer_id}`;
      socket.join(roomId);
      socket.emit('joined_room', { roomId, listing_id, buyer_id });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // 2. Leave room
  socket.on('leave_room', (data) => {
    const { roomId } = data || {};
    if (roomId) socket.leave(roomId);
  });

  // 3. Send message through WebSocket with strict room emission
  socket.on('send_message', async (data) => {
    try {
      const { listing_id, buyer_id, sender_id, text, sender_name, sender_email, sender_avatar } = data || {};
      if (!listing_id || !buyer_id || !sender_id || !text || !text.trim()) {
        return socket.emit('error', { message: 'Missing required message parameters' });
      }

      const auth = await authorizeChatParticipant(listing_id, sender_id, buyer_id);
      if (!auth.authorized) {
        return socket.emit('error', { message: auth.reason });
      }

      if (auth.role === 'buyer' && buyer_id !== sender_id) {
        return socket.emit('error', { message: 'Unauthorized sender for this room' });
      }

      const receiverId = auth.role === 'seller' ? buyer_id : auth.sellerId;
      const roomId = `chat_${listing_id}_${buyer_id}`;
      const now = nowSec();

      // Database-backed chat storage in PostgreSQL
      const insertQuery = `
        INSERT INTO messages (
          listing_id, item_id, room_id, sender_id, receiver_id, buyer_id,
          sender_name, sender_email, sender_avatar, message_text, text, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *;
      `;
      const result = await db.query(insertQuery, [
        listing_id,
        listing_id,
        roomId,
        sender_id,
        receiverId,
        buyer_id,
        sender_name || 'Student',
        sender_email || '',
        sender_avatar || '',
        text.trim(),
        text.trim(),
        now
      ]);

      const savedMsg = result.rows[0];

      // CRITICAL: Emit ONLY to the private room. No global broadcast!
      io.to(roomId).emit('new_message', savedMsg);
      io.to(roomId).emit('newChatMessage', savedMsg);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });
});

app.get('/api/chat/:item_id', async (req, res) => {
  try {
    const { item_id } = req.params;
    const authUser = await getAuthUser(req);
    const callerId = req.headers['x-device-id'] || (authUser && authUser.id) || req.query.user_id || 'guest';
    const callerGoogleId = authUser && authUser.google_id;
    const requestedBuyerId = req.query.buyer_id;

    // Check listing
    const itemRes = await db.query('SELECT * FROM beacons WHERE id = $1', [item_id]);
    if (itemRes.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found', messages: [] });
    }
    const item = itemRes.rows[0];
    const isSeller = (callerId === item.seller_id || (callerGoogleId && callerGoogleId === item.seller_google_id));

    let messages = [];

    if (isSeller) {
      // Seller can view a specific buyer's thread or all threads for their own listing
      if (requestedBuyerId) {
        const roomId = `chat_${item_id}_${requestedBuyerId}`;
        const result = await db.query(
          `SELECT * FROM messages 
           WHERE (listing_id = $1 OR item_id = $1) 
             AND (room_id = $2 OR buyer_id = $3 OR sender_id = $3 OR receiver_id = $3) 
           ORDER BY created_at ASC`,
          [item_id, roomId, requestedBuyerId]
        );
        messages = result.rows;
      } else {
        const result = await db.query(
          `SELECT * FROM messages 
           WHERE (listing_id = $1 OR item_id = $1) 
           ORDER BY created_at ASC`,
          [item_id]
        );
        messages = result.rows;
      }
    } else {
      // Caller is a buyer: PRIVACY ENFORCEMENT
      // A buyer can ONLY access their own thread with the seller
      const buyerId = callerId;
      const roomId = `chat_${item_id}_${buyerId}`;
      const result = await db.query(
        `SELECT * FROM messages 
         WHERE (listing_id = $1 OR item_id = $1) 
           AND (room_id = $2 OR buyer_id = $3 OR sender_id = $3 OR receiver_id = $3) 
         ORDER BY created_at ASC`,
        [item_id, roomId, buyerId]
      );
      messages = result.rows;
    }

    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ error: err.message, messages: [] });
  }
});

app.post('/api/chat/:item_id', async (req, res) => {
  try {
    const { item_id } = req.params;
    const { text, sender_name, sender_id, sender_avatar, sender_email, buyer_id: reqBuyerId, receiver_id: reqReceiverId } = req.body;
    const authUser = await getAuthUser(req);
    const callerId = sender_id || req.headers['x-device-id'] || (authUser && authUser.id) || 'guest';
    const callerGoogleId = authUser && authUser.google_id;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text required' });
    }

    // Check listing
    const itemRes = await db.query('SELECT * FROM beacons WHERE id = $1', [item_id]);
    if (itemRes.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    const item = itemRes.rows[0];
    const isSeller = (callerId === item.seller_id || (callerGoogleId && callerGoogleId === item.seller_google_id));

    let buyerId = null;
    let receiverId = null;

    if (isSeller) {
      // Seller is messaging a buyer
      buyerId = reqBuyerId || reqReceiverId;
      if (!buyerId) {
        // Fallback: lookup the most recent buyer who messaged this listing
        const recent = await db.query(
          `SELECT buyer_id, sender_id FROM messages 
           WHERE (listing_id = $1 OR item_id = $1) AND sender_id != $2 
           ORDER BY created_at DESC LIMIT 1`,
          [item_id, callerId]
        );
        buyerId = recent.rows.length > 0 ? (recent.rows[0].buyer_id || recent.rows[0].sender_id) : 'buyer';
      }
      receiverId = buyerId;
    } else {
      // Caller is buyer messaging the seller
      buyerId = callerId;
      receiverId = item.seller_id;
    }

    const roomId = `chat_${item_id}_${buyerId}`;
    const now = nowSec();

    // Database-backed storage in PostgreSQL
    const insertQuery = `
      INSERT INTO messages (
        listing_id, item_id, room_id, sender_id, receiver_id, buyer_id,
        sender_name, sender_email, sender_avatar, message_text, text, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    const result = await db.query(insertQuery, [
      item_id,
      item_id,
      roomId,
      callerId,
      receiverId,
      buyerId,
      sender_name || (authUser && authUser.nickname) || 'Student',
      sender_email || (authUser && authUser.email) || '',
      sender_avatar || (authUser && authUser.picture) || '',
      text.trim(),
      text.trim(),
      now
    ]);

    const savedMsg = result.rows[0];

    // CRITICAL: Emit strictly to private room. Never emit globally.
    io.to(roomId).emit('new_message', savedMsg);
    io.to(roomId).emit('newChatMessage', savedMsg);

    res.json({ success: true, message: savedMsg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real-time synchronization event polling with strict caller message scoping
app.get('/api/sync', async (req, res) => {
  try {
    const since = parseFloat(req.query.since || 0);
    const authUser = await getAuthUser(req);
    const callerId = req.headers['x-device-id'] || (authUser && authUser.id) || req.query.device_id || '';
    const callerGoogleId = authUser && authUser.google_id;

    // Filter sync events (general item updates)
    const result = await db.query(
      'SELECT * FROM sync_events WHERE created_at > $1 ORDER BY created_at ASC LIMIT 100',
      [since]
    );

    // Filter chat messages STRICTLY to the caller (buyer or seller) to eliminate global leakage
    let newMessages = [];
    if (callerId || callerGoogleId) {
      const msgRes = await db.query(
        `SELECT * FROM messages 
         WHERE created_at > $1 
           AND (sender_id = $2 OR receiver_id = $2 OR buyer_id = $2 OR sender_id = $3 OR receiver_id = $3)
         ORDER BY created_at ASC LIMIT 50`,
        [since, callerId, callerGoogleId || callerId]
      );
      newMessages = msgRes.rows;
    }

    res.json({
      success: true,
      events: result.rows,
      new_messages: newMessages,
      timestamp: nowSec()
    });
  } catch (err) {
    res.status(500).json({ error: err.message, events: [], new_messages: [] });
  }
});

// Waitlist registration
app.post('/api/waitlist', async (req, res) => {
  try {
    const { campus_name, email } = req.body;
    if (!campus_name || !email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid campus and email required' });
    }
    await db.query(
      'INSERT INTO campus_waitlist (campus_name, email, created_at) VALUES ($1, $2, $3)',
      [campus_name.trim(), email.trim().toLowerCase(), nowSec()]
    );
    res.json({ success: true, message: 'Campus added to expansion waitlist!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 6. SPA WILDCARD ROUTE (Fallback for HTML5 History / Deep Links)
// ---------------------------------------------------------------------------

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------------------------------------------------------------------
// 7. BOOTSTRAP SERVER & DATABASE
// ---------------------------------------------------------------------------

async function startServer() {
  try {
    // 1. Initialize persistent PostgreSQL schema
    await db.initDatabase();

    // 2. Start HTTP + Socket.io listener
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n======================================================`);
      console.log(`🚀 RadarMarket Node.js server running on port ${PORT}`);
      console.log(`📡 Persistent Database: ${process.env.DATABASE_URL ? 'PostgreSQL Active (Render Cloud)' : 'Local Fallback'}`);
      console.log(`💬 Private Socket.io Chat Engine: Active`);
      console.log(`🌐 Local URL: http://localhost:${PORT}`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('Fatal server boot failure:', err);
    process.exit(1);
  }
}

startServer();
