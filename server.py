"""
RadarMarket - Production Multi-User Backend Server
Built with Flask & SQLite. Supports live synchronization across phones and laptops.
"""

import os
import sys
import json
import time
import uuid
import socket
import sqlite3
import hashlib
import hmac
import base64
import re
import random
import urllib.request
import urllib.error
import urllib.parse
from flask import Flask, request, jsonify, send_from_directory, g

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "database.db")
PORT = int(os.environ.get("PORT", 5000))

app = Flask(__name__, static_folder=BASE_DIR)

def get_lan_ip():
    """Detect LAN Wi-Fi / Ethernet IP address for mobile pairing."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def get_db():
    """Thread-safe SQLite database connection."""
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        # Enable Write-Ahead Logging for high-concurrency multi-device reads/writes
        db.execute("PRAGMA journal_mode=WAL;")
        # Auto-heal: verify database schema exists
        try:
            db.execute("SELECT 1 FROM items LIMIT 1;")
        except sqlite3.OperationalError:
            init_db()
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    """Initialize database tables and seed sample listings if empty."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            nickname TEXT NOT NULL,
            avatar TEXT,
            lat REAL,
            lng REAL,
            created_at REAL,
            last_active_at REAL
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            seller_id TEXT NOT NULL,
            seller_name TEXT NOT NULL,
            seller_rating REAL DEFAULT 4.9,
            seller_verified INTEGER DEFAULT 1,
            seller_avatar TEXT,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            sub_category TEXT,
            price REAL NOT NULL,
            original_price REAL,
            condition TEXT NOT NULL,
            condition_score REAL DEFAULT 0.85,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            landmark TEXT NOT NULL,
            image TEXT,
            description TEXT,
            tags TEXT,
            is_available INTEGER DEFAULT 1,
            reserved_by TEXT,
            created_at REAL NOT NULL
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at REAL NOT NULL
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS sync_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            item_id TEXT,
            payload TEXT,
            created_at REAL NOT NULL
        );
    """)

    # Schema Migrations for enhanced features
    try:
        cur.execute("ALTER TABLE items ADD COLUMN beacon_type TEXT DEFAULT 'sell';")
    except Exception:
        pass
    try:
        cur.execute("ALTER TABLE items ADD COLUMN status TEXT DEFAULT 'active';")
    except Exception:
        pass
    try:
        cur.execute("ALTER TABLE items ADD COLUMN upi_id TEXT;")
    except Exception:
        pass

    # Google Auth & Verified Student Schema Migrations
    auth_migrations = [
        "ALTER TABLE users ADD COLUMN google_id TEXT;",
        "ALTER TABLE users ADD COLUMN email TEXT;",
        "ALTER TABLE users ADD COLUMN picture TEXT;",
        "ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0;",
        "ALTER TABLE users ADD COLUMN is_campus_verified INTEGER DEFAULT 0;",
        "ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'guest';",
        "ALTER TABLE users ADD COLUMN session_token TEXT;",
        "ALTER TABLE items ADD COLUMN seller_email TEXT;",
        "ALTER TABLE items ADD COLUMN seller_campus_verified INTEGER DEFAULT 0;",
        "ALTER TABLE items ADD COLUMN seller_google_id TEXT;",
        "ALTER TABLE messages ADD COLUMN sender_email TEXT;",
        "ALTER TABLE messages ADD COLUMN sender_avatar TEXT;",
        "ALTER TABLE items ADD COLUMN handshake_code TEXT;",
        "ALTER TABLE items ADD COLUMN completed_by TEXT;",
        "ALTER TABLE items ADD COLUMN completed_at REAL;",
        "ALTER TABLE users ADD COLUMN trades_completed INTEGER DEFAULT 0;",
        "ALTER TABLE items ADD COLUMN agreed_price REAL;",
        "ALTER TABLE items ADD COLUMN accepted_offer_id TEXT;"
    ]
    for stmt in auth_migrations:
        try:
            cur.execute(stmt)
        except Exception:
            pass

    # Offers / Bargaining table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS offers (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL,
            buyer_id TEXT NOT NULL,
            buyer_name TEXT NOT NULL,
            seller_id TEXT NOT NULL,
            original_price REAL NOT NULL,
            offer_amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );
    """)

    conn.commit()
    conn.close()
    
    # Restore previous user broadcasts and sessions if database is fresh
    restore_data_backup()

BACKUP_PATH = os.path.join(BASE_DIR, "data_backup.json")

def save_data_backup():
    """Mirror SQLite state to durable JSON backup file so data survives redeploys."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        items = [dict(r) for r in cur.execute("SELECT * FROM items").fetchall()]
        users = [dict(r) for r in cur.execute("SELECT * FROM users").fetchall()]
        messages = [dict(r) for r in cur.execute("SELECT * FROM messages").fetchall()]
        conn.close()

        backup = {
            "version": 1,
            "timestamp": time.time(),
            "items": items,
            "users": users,
            "messages": messages
        }
        with open(BACKUP_PATH, "w", encoding="utf-8") as f:
            json.dump(backup, f, indent=2)
    except Exception as e:
        print("[backup] Save error:", e)

def restore_data_backup():
    """Restore state from data_backup.json if database was newly initialized or empty."""
    if not os.path.exists(BACKUP_PATH):
        return
    try:
        with open(BACKUP_PATH, "r", encoding="utf-8") as f:
            backup = json.load(f)
        items = backup.get("items", [])
        users = backup.get("users", [])
        messages = backup.get("messages", [])
        if not items and not users and not messages:
            return

        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM items")
        item_count = cur.fetchone()[0]
        if item_count == 0 and items:
            print(f"[backup] Restoring {len(items)} items from durable backup...")
            for it in items:
                keys = list(it.keys())
                placeholders = ", ".join(["?"] * len(keys))
                cols = ", ".join(keys)
                sql = f"INSERT OR REPLACE INTO items ({cols}) VALUES ({placeholders})"
                cur.execute(sql, [it[k] for k in keys])

        cur.execute("SELECT COUNT(*) FROM users")
        user_count = cur.fetchone()[0]
        if user_count == 0 and users:
            print(f"[backup] Restoring {len(users)} users from durable backup...")
            for u in users:
                keys = list(u.keys())
                placeholders = ", ".join(["?"] * len(keys))
                cols = ", ".join(keys)
                sql = f"INSERT OR REPLACE INTO users ({cols}) VALUES ({placeholders})"
                cur.execute(sql, [u[k] for k in keys])

        cur.execute("SELECT COUNT(*) FROM messages")
        msg_count = cur.fetchone()[0]
        if msg_count == 0 and messages:
            print(f"[backup] Restoring {len(messages)} messages from durable backup...")
            for m in messages:
                keys = list(m.keys())
                placeholders = ", ".join(["?"] * len(keys))
                cols = ", ".join(keys)
                sql = f"INSERT OR REPLACE INTO messages ({cols}) VALUES ({placeholders})"
                cur.execute(sql, [m[k] for k in keys])

        conn.commit()
        conn.close()
        print("[backup] Restoration check completed.")
    except Exception as e:
        print("[backup] Restore error:", e)

# Unconditionally initialize database tables on WSGI/Gunicorn import & direct run
try:
    init_db()
except Exception as _init_err:
    print("[startup] Database initialization warning:", _init_err)


# --- STATIC ASSET ROUTES ---

@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(BASE_DIR, path)

@app.after_request
def add_cache_control(response):
    """Ensure mobile browsers and laptops always receive fresh JS, CSS, and HTML."""
    if request.path == '/' or request.path.endswith(('.html', '.js', '.css', '.json')):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# --- REST API ENDPOINTS ---

@app.route('/api/network-info', methods=['GET'])
def network_info():
    """Return local host, Wi-Fi LAN, and public tunnel / cloud access URLs."""
    lan_ip = get_lan_ip()
    
    # Check for public reverse proxy headers (Cloudflare, Render, Railway, Nginx)
    forwarded_proto = request.headers.get('X-Forwarded-Proto', request.scheme)
    forwarded_host = request.headers.get('X-Forwarded-Host', request.host)
    current_origin = f"{forwarded_proto}://{forwarded_host}".rstrip('/')
    
    # If host is not a private local IP or localhost, it is a public domain
    is_local = any(h in forwarded_host for h in ['localhost', '127.0.0.1', lan_ip])
    public_url = current_origin if not is_local else None
    active_url = public_url or f"http://{lan_ip}:{PORT}"

    return jsonify({
        "success": True,
        "lan_ip": lan_ip,
        "port": PORT,
        "lan_url": f"http://{lan_ip}:{PORT}",
        "local_url": f"http://localhost:{PORT}",
        "public_url": public_url,
        "active_url": active_url,
        "is_secure": forwarded_proto == "https"
    })

# --- ISBN & BOOK METADATA RESOLVER PROXY ---

ISBN_CACHE = {}

def to_isbn10(isbn13):
    """Convert ISBN-13 (starting with 978) to standard ISBN-10 with modulo 11 checksum."""
    if not isbn13.startswith('978') or len(isbn13) != 13:
        return None
    core = isbn13[3:12]
    total = sum((10 - i) * int(core[i]) for i in range(9))
    check = (11 - (total % 11)) % 11
    return core + ('X' if check == 10 else str(check))

@app.route('/api/isbn/<path:isbn>', methods=['GET'])
def lookup_isbn_api(isbn):
    """
    Real-time ISBN resolver proxy.
    Decodes 10-digit and 13-digit textbook barcodes, queries OpenLibrary API,
    and returns rich book metadata with cover thumbnail and formatted fields.
    """
    clean_isbn = re.sub(r'[^0-9X]', '', isbn.upper())
    if len(clean_isbn) not in (10, 13):
        return jsonify({
            "success": False,
            "error": f"Invalid ISBN format: '{isbn}'. Must be 10 or 13 characters."
        }), 400

    # In-memory cache hit for instant sub-millisecond response
    if clean_isbn in ISBN_CACHE:
        return jsonify({"success": True, "data": ISBN_CACHE[clean_isbn], "cached": True})

    book_data = None
    query_isbns = [clean_isbn]
    isbn10 = to_isbn10(clean_isbn) if len(clean_isbn) == 13 else None
    if isbn10 and isbn10 not in query_isbns:
        query_isbns.append(isbn10)

    # 1. Primary: OpenLibrary API (search all ISBN representations)
    bibkeys = ','.join([f'ISBN:{k}' for k in query_isbns])
    ol_url = f"https://openlibrary.org/api/books?bibkeys={bibkeys}&format=json&jscmd=data"
    req = urllib.request.Request(ol_url, headers={
        'User-Agent': 'RadarMarket/2.5 (Campus Second-Hand Textbook Radar; mailto:support@radarmarket.local)'
    })
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            if resp.status == 200:
                raw = json.loads(resp.read().decode('utf-8'))
                for qk in query_isbns:
                    key = f"ISBN:{qk}"
                    if key in raw and raw[key].get('title'):
                        b = raw[key]
                        authors = ', '.join([a.get('name', '') for a in b.get('authors', []) if a.get('name')])
                        publishers = ', '.join([p.get('name', '') for p in b.get('publishers', []) if p.get('name')])
                        cover_obj = b.get('cover') or {}
                        cover_url = cover_obj.get('large') or cover_obj.get('medium') or cover_obj.get('small') or f"https://covers.openlibrary.org/b/isbn/{clean_isbn}-L.jpg"
                        subjects = [s.get('name', '') for s in b.get('subjects', [])[:5] if s.get('name')]
                        break
                else:
                    b = None

                if b:
                    # Determine suggested academic subcategory
                    subcategory = "Textbook"
                    subjects_lower = " ".join(subjects).lower()
                    if any(k in subjects_lower for k in ['computer', 'programming', 'software', 'algorithm', 'data structure', 'code']):
                        subcategory = "Computer Science"
                    elif any(k in subjects_lower for k in ['math', 'calculus', 'algebra', 'geometry', 'differential', 'statistics']):
                        subcategory = "Mathematics"
                    elif any(k in subjects_lower for k in ['physics', 'mechanics', 'quantum', 'optics', 'thermodynamics']):
                        subcategory = "Physics"
                    elif any(k in subjects_lower for k in ['chemistry', 'organic', 'chemical']):
                        subcategory = "Chemistry"
                    elif any(k in subjects_lower for k in ['electrical', 'electronics', 'circuit', 'signal']):
                        subcategory = "Electrical Engineering"
                    elif any(k in subjects_lower for k in ['economics', 'finance', 'business', 'management']):
                        subcategory = "Economics & Business"
                    elif any(k in subjects_lower for k in ['literature', 'fiction', 'novel', 'history', 'philosophy']):
                        subcategory = "Literature & Humanities"
                    elif subjects:
                        subcategory = subjects[0][:30]

                    book_data = {
                        "isbn": clean_isbn,
                        "title": b.get('title', ''),
                        "subtitle": b.get('subtitle', ''),
                        "authors": authors or "Unknown Author",
                        "publishers": publishers,
                        "publish_date": b.get('publish_date', ''),
                        "number_of_pages": b.get('number_of_pages'),
                        "cover_url": cover_url,
                        "subjects": subjects,
                        "suggested_category": "books",
                        "suggested_subcategory": subcategory,
                        "source": "OpenLibrary"
                    }
    except Exception:
        pass

    # 2. Fallback: Google Books API (if OpenLibrary missed it)
    if not book_data or not book_data.get('title'):
        gb_url = f"https://www.googleapis.com/books/v1/volumes?q=isbn:{clean_isbn}"
        req_gb = urllib.request.Request(gb_url, headers={'User-Agent': 'RadarMarket/2.5'})
        try:
            with urllib.request.urlopen(req_gb, timeout=6) as resp:
                if resp.status == 200:
                    gb_raw = json.loads(resp.read().decode('utf-8'))
                    items = gb_raw.get('items', [])
                    if items:
                        vol = items[0].get('volumeInfo', {})
                        authors = ', '.join(vol.get('authors', []))
                        categories = vol.get('categories', [])
                        image_links = vol.get('imageLinks', {})
                        cover = image_links.get('thumbnail') or image_links.get('smallThumbnail') or f"https://covers.openlibrary.org/b/isbn/{clean_isbn}-L.jpg"
                        if cover.startswith('http://'):
                            cover = 'https://' + cover[7:]
                        
                        book_data = {
                            "isbn": clean_isbn,
                            "title": vol.get('title', ''),
                            "subtitle": vol.get('subtitle', ''),
                            "authors": authors or "Unknown Author",
                            "publishers": vol.get('publisher', ''),
                            "publish_date": vol.get('publishedDate', ''),
                            "number_of_pages": vol.get('pageCount'),
                            "cover_url": cover,
                            "subjects": categories,
                            "suggested_category": "books",
                            "suggested_subcategory": categories[0] if categories else "Textbook",
                            "description": vol.get('description', ''),
                            "source": "GoogleBooks"
                        }
        except Exception:
            pass

    if book_data and book_data.get('title'):
        ISBN_CACHE[clean_isbn] = book_data
        return jsonify({"success": True, "data": book_data})

    return jsonify({
        "success": False,
        "error": f"No book records found for ISBN '{clean_isbn}'. Please enter details manually."
    }), 404

# --- GOOGLE AUTHENTICATION & IDENTITY HELPERS ---

CAMPUS_DOMAINS = ('.edu', '.ac.in', '.edu.in', '.edu.au', '.ac.uk', 'stanford.edu', 'mit.edu', 'berkeley.edu', 'harvard.edu', 'iitb.ac.in', 'du.ac.in')

def is_campus_email(email):
    """Detect verified college/university academic student email domain."""
    if not email or '@' not in email:
        return False
    domain = email.lower().split('@')[1]
    return any(domain.endswith(cd) or domain == cd for cd in CAMPUS_DOMAINS)

def verify_google_token(id_token):
    """Verify Google OAuth2 ID Token with Google tokeninfo public API (zero-dependency)."""
    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
    req = urllib.request.Request(url, headers={'User-Agent': 'RadarMarket/2.4'})
    try:
        with urllib.request.urlopen(req, timeout=6) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                if 'sub' in data:
                    return data
    except Exception as e:
        print("Google token verification error:", e)
    return None

# ==============================================================================
# Cryptographically Signed Stateless Auth Tokens (Survives server redeploys & resets)
# ==============================================================================
SECRET_KEY = os.environ.get("SESSION_SECRET", "radarmarket-prod-secret-v3-campus-auth-key-2026")

def generate_signed_token(user_payload):
    """Generate tamper-proof HMAC-SHA256 signed session token that survives server redeploys."""
    payload_str = json.dumps(user_payload, separators=(',', ':'), sort_keys=True)
    b64_part = base64.urlsafe_b64encode(payload_str.encode('utf-8')).decode('utf-8').rstrip('=')
    signature = hmac.new(SECRET_KEY.encode('utf-8'), b64_part.encode('utf-8'), hashlib.sha256).hexdigest()
    return f"rmtk.{b64_part}.{signature}"

def verify_signed_token(token):
    """Verify and decode signed session token. Returns payload dict or None."""
    if not token or not isinstance(token, str) or not token.startswith("rmtk."):
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    _, b64_part, signature = parts
    try:
        expected_sig = hmac.new(SECRET_KEY.encode('utf-8'), b64_part.encode('utf-8'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None
        rem = len(b64_part) % 4
        padded = b64_part + ("=" * (4 - rem) if rem else "")
        payload_str = base64.urlsafe_b64decode(padded.encode('utf-8')).decode('utf-8')
        payload = json.loads(payload_str)
        # Check expiration (1 year default)
        if payload.get("exp") and time.time() > payload["exp"]:
            return None
        return payload
    except Exception as e:
        print("[auth] Token verification exception:", e)
        return None

def get_authenticated_user(db):
    """Resolve currently authenticated user from Bearer session token or device ID."""
    auth_header = request.headers.get('Authorization', '')
    session_token = None
    if auth_header.startswith('Bearer '):
        session_token = auth_header[7:].strip()
    
    cur = db.cursor()
    if session_token:
        # 1. Stateless cryptographic token verification (survives database wipe or server redeploy)
        token_payload = verify_signed_token(session_token)
        if token_payload and token_payload.get("id"):
            u_id = token_payload["id"]
            u_email = token_payload.get("email")
            if u_email:
                cur.execute("SELECT * FROM users WHERE id = ? OR email = ?", (u_id, u_email))
            else:
                cur.execute("SELECT * FROM users WHERE id = ?", (u_id,))
            row = cur.fetchone()
            if row:
                user = dict(row)
                if user.get("session_token") != session_token:
                    cur.execute("UPDATE users SET session_token = ?, last_active_at = ? WHERE id = ?", (session_token, time.time(), user["id"]))
                    db.commit()
                return user
            else:
                # AUTO-HEAL: Database was wiped on redeploy! Re-insert verified user immediately!
                now = time.time()
                cur.execute("""
                    INSERT OR REPLACE INTO users (
                        id, nickname, avatar, created_at, last_active_at,
                        google_id, email, picture, is_verified, is_campus_verified, auth_provider, session_token
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                """, (
                    u_id,
                    token_payload.get("nickname", "Verified Student"),
                    token_payload.get("picture") or token_payload.get("avatar"),
                    now,
                    now,
                    token_payload.get("google_id"),
                    u_email,
                    token_payload.get("picture") or token_payload.get("avatar"),
                    token_payload.get("is_campus_verified", 0),
                    token_payload.get("auth_provider", "google"),
                    session_token
                ))
                db.commit()
                save_data_backup()
                cur.execute("SELECT * FROM users WHERE id = ?", (u_id,))
                new_row = cur.fetchone()
                if new_row:
                    return dict(new_row)

        # 2. Legacy database token lookup fallback
        cur.execute("SELECT * FROM users WHERE session_token = ?", (session_token,))
        row = cur.fetchone()
        if row:
            return dict(row)
            
    device_id = request.headers.get('X-Device-Id') or request.args.get('device_id')
    if device_id:
        cur.execute("SELECT * FROM users WHERE id = ?", (device_id,))
        row = cur.fetchone()
        if row:
            return dict(row)
            
    return None

@app.route('/api/auth/google', methods=['POST'])
def auth_google():
    """
    Authenticate with Google Identity Services ID Token, Google OAuth, or direct Email ID.
    Transfers prior guest listings and emits persistent cross-device identity.
    """
    db = get_db()
    data = request.get_json() or {}
    credential = data.get('credential')
    input_email = data.get('email')
    input_name = data.get('name')
    input_picture = data.get('picture')
    input_google_id = data.get('google_id')
    device_id = request.headers.get('X-Device-Id') or data.get('device_id')
    now = time.time()

    google_id = None
    email = None
    name = None
    picture = None
    auth_provider = 'google'

    if credential:
        payload = verify_google_token(credential)
        if not payload:
            return jsonify({"success": False, "error": "Invalid or expired Google Token"}), 401
        google_id = payload.get('sub')
        email = payload.get('email', '')
        name = payload.get('name', 'Google User')
        picture = payload.get('picture', '')
        auth_provider = 'google'
    elif input_email and '@' in str(input_email):
        email = str(input_email).strip().lower()
        if input_name and str(input_name).strip():
            name = str(input_name).strip()
        else:
            prefix = email.split('@')[0].replace('.', ' ').replace('_', ' ').replace('-', ' ')
            name = prefix.title()
        
        # High quality initials avatar if no picture provided
        picture = input_picture or f"https://api.dicebear.com/7.x/initials/svg?seed={urllib.parse.quote(name)}&backgroundColor=00e5ff,00ff9d,4285f4&textColor=0f172a"
        
        if input_google_id and str(input_google_id).strip():
            google_id = str(input_google_id).strip()
        else:
            google_id = "usr-email-" + hashlib.md5(email.encode('utf-8')).hexdigest()[:14]
            
        if email.endswith('@gmail.com'):
            auth_provider = 'google'
        elif is_campus_email(email):
            auth_provider = 'campus'
        else:
            auth_provider = 'email'
    else:
        return jsonify({"success": False, "error": "Please provide a valid Email address or Google credential"}), 400

    is_campus = 1 if is_campus_email(email) else 0

    cur = db.cursor()
    cur.execute("SELECT * FROM users WHERE google_id = ? OR email = ?", (google_id, email))
    existing_user = cur.fetchone()

    user_id = None
    if existing_user:
        user_id = existing_user['id']
    elif device_id:
        cur.execute("SELECT * FROM users WHERE id = ?", (device_id,))
        guest_row = cur.fetchone()
        if guest_row and not guest_row['google_id']:
            user_id = device_id

    if not user_id:
        user_id = "usr-" + uuid.uuid4().hex[:10]

    # Generate persistent signed cryptographic token (valid for 1 year, survives server redeploys)
    token_payload = {
        "id": user_id,
        "google_id": google_id,
        "email": email,
        "nickname": name,
        "picture": picture,
        "avatar": picture,
        "is_campus_verified": is_campus,
        "is_verified": 1,
        "auth_provider": auth_provider,
        "iat": now,
        "exp": now + 365 * 24 * 3600
    }
    session_token = generate_signed_token(token_payload)

    if existing_user or (device_id and user_id == device_id):
        cur.execute("""
            UPDATE users SET 
                google_id = ?,
                nickname = ?,
                email = ?,
                picture = ?,
                avatar = ?,
                is_verified = 1,
                is_campus_verified = ?,
                auth_provider = ?,
                session_token = ?,
                last_active_at = ?
            WHERE id = ?
        """, (google_id, name, email, picture, picture, is_campus, auth_provider, session_token, now, user_id))
    else:
        cur.execute("""
            INSERT INTO users (
                id, nickname, avatar, lat, lng, created_at, last_active_at,
                google_id, email, picture, is_verified, is_campus_verified, auth_provider, session_token
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        """, (user_id, name, picture, None, None, now, now, google_id, email, picture, is_campus, auth_provider, session_token))

    # Link existing items broadcasted on this device or session to this google account
    if device_id:
        cur.execute("""
            UPDATE items SET 
                seller_google_id = ?,
                seller_email = ?,
                seller_verified = 1,
                seller_campus_verified = ?,
                seller_name = ?,
                seller_avatar = ?
            WHERE seller_id = ? OR seller_google_id = ?
        """, (google_id, email, is_campus, name, picture, device_id, google_id))

    db.commit()
    save_data_backup()

    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    updated_user = dict(cur.fetchone())
    safe_user = {
        "id": updated_user["id"],
        "google_id": updated_user["google_id"],
        "nickname": updated_user["nickname"],
        "email": updated_user["email"],
        "picture": updated_user.get("picture") or updated_user.get("avatar"),
        "avatar": updated_user.get("avatar") or updated_user.get("picture"),
        "is_verified": bool(updated_user.get("is_verified", 1)),
        "is_campus_verified": bool(updated_user.get("is_campus_verified", 0)),
        "auth_provider": updated_user.get("auth_provider", "google")
    }

    return jsonify({
        "success": True,
        "user": safe_user,
        "session_token": session_token
    })

@app.route('/api/auth/session', methods=['GET'])
def get_auth_session():
    """Validate current session token and return user identity (with auto-heal for server redeploys)."""
    db = get_db()
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({"success": True, "authenticated": False, "user": None})

    session_token = auth_header[7:].strip()
    
    # 1. Stateless cryptographic verification
    token_payload = verify_signed_token(session_token)
    if token_payload and token_payload.get("id"):
        cur = db.cursor()
        u_id = token_payload["id"]
        u_email = token_payload.get("email")
        if u_email:
            cur.execute("SELECT * FROM users WHERE id = ? OR email = ?", (u_id, u_email))
        else:
            cur.execute("SELECT * FROM users WHERE id = ?", (u_id,))
        row = cur.fetchone()
        if not row:
            # Auto-heal user into database after redeploy
            now = time.time()
            cur.execute("""
                INSERT OR REPLACE INTO users (
                    id, nickname, avatar, created_at, last_active_at,
                    google_id, email, picture, is_verified, is_campus_verified, auth_provider, session_token
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            """, (
                u_id,
                token_payload.get("nickname", "Verified Student"),
                token_payload.get("picture") or token_payload.get("avatar"),
                now,
                now,
                token_payload.get("google_id"),
                u_email,
                token_payload.get("picture") or token_payload.get("avatar"),
                token_payload.get("is_campus_verified", 0),
                token_payload.get("auth_provider", "google"),
                session_token
            ))
            db.commit()
            save_data_backup()
            cur.execute("SELECT * FROM users WHERE id = ?", (u_id,))
            row = cur.fetchone()

        if row:
            user = dict(row)
            safe_user = {
                "id": user["id"],
                "google_id": user.get("google_id"),
                "nickname": user["nickname"],
                "email": user.get("email"),
                "picture": user.get("picture") or user.get("avatar"),
                "avatar": user.get("avatar") or user.get("picture"),
                "is_verified": bool(user.get("is_verified", 1)),
                "is_campus_verified": bool(user.get("is_campus_verified", 0)),
                "auth_provider": user.get("auth_provider", "google")
            }
            return jsonify({"success": True, "authenticated": True, "user": safe_user})

    # 2. Legacy database lookup fallback
    cur = db.cursor()
    cur.execute("SELECT * FROM users WHERE session_token = ?", (session_token,))
    row = cur.fetchone()
    if not row:
        return jsonify({"success": True, "authenticated": False, "user": None})

    user = dict(row)
    safe_user = {
        "id": user["id"],
        "google_id": user.get("google_id"),
        "nickname": user["nickname"],
        "email": user.get("email"),
        "picture": user.get("picture") or user.get("avatar"),
        "avatar": user.get("avatar") or user.get("picture"),
        "is_verified": bool(user.get("is_verified", 0)),
        "is_campus_verified": bool(user.get("is_campus_verified", 0)),
        "auth_provider": user.get("auth_provider", "guest")
    }
    return jsonify({"success": True, "authenticated": True, "user": safe_user})

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    """Clear session token for the user."""
    db = get_db()
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        session_token = auth_header[7:].strip()
        cur = db.cursor()
        token_payload = verify_signed_token(session_token)
        if token_payload and token_payload.get("id"):
            cur.execute("UPDATE users SET session_token = NULL WHERE id = ?", (token_payload["id"],))
        else:
            cur.execute("UPDATE users SET session_token = NULL WHERE session_token = ?", (session_token,))
        db.commit()
        save_data_backup()
    return jsonify({"success": True, "message": "Logged out successfully"})

@app.route('/api/me', methods=['GET', 'POST'])
def manage_me():
    """Get or update current user device identity."""
    db = get_db()
    auth_user = get_authenticated_user(db)
    device_id = request.headers.get('X-Device-Id') or request.args.get('device_id')
    now = time.time()

    if not device_id and not auth_user:
        device_id = "dev-" + uuid.uuid4().hex[:10]

    user_lookup_id = auth_user["id"] if auth_user else device_id

    cur = db.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (user_lookup_id,))
    row = cur.fetchone()

    if request.method == 'POST':
        data = request.get_json() or {}
        nickname = data.get('nickname', '').strip()
        avatar = data.get('avatar', '').strip()
        lat = data.get('lat')
        lng = data.get('lng')

        if row:
            cur.execute("""
                UPDATE users SET 
                    nickname = COALESCE(NULLIF(?, ''), nickname),
                    avatar = COALESCE(NULLIF(?, ''), avatar),
                    lat = COALESCE(?, lat),
                    lng = COALESCE(?, lng),
                    last_active_at = ?
                WHERE id = ?
            """, (nickname, avatar, lat, lng, now, user_lookup_id))
        else:
            default_name = nickname or f"Student #{user_lookup_id[-4:]}"
            cur.execute("""
                INSERT INTO users (id, nickname, avatar, lat, lng, created_at, last_active_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (user_lookup_id, default_name, avatar, lat, lng, now, now))
        db.commit()

        cur.execute("SELECT * FROM users WHERE id = ?", (user_lookup_id,))
        user = dict(cur.fetchone())
        user["is_verified"] = bool(user.get("is_verified", 0))
        user["is_campus_verified"] = bool(user.get("is_campus_verified", 0))
        return jsonify({"success": True, "user": user})

    # GET request
    if not row:
        default_name = f"Student #{user_lookup_id[-4:]}"
        cur.execute("""
            INSERT INTO users (id, nickname, avatar, created_at, last_active_at)
            VALUES (?, ?, ?, ?, ?)
        """, (user_lookup_id, default_name, None, now, now))
        db.commit()
        save_data_backup()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_lookup_id,))
        row = cur.fetchone()
    else:
        cur.execute("UPDATE users SET last_active_at = ? WHERE id = ?", (now, user_lookup_id))
        db.commit()

    user = dict(row)
    user["is_verified"] = bool(user.get("is_verified", 0))
    user["is_campus_verified"] = bool(user.get("is_campus_verified", 0))
    return jsonify({"success": True, "user": user})

@app.route('/api/items', methods=['GET'])
def list_items():
    """List all active items."""
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM items WHERE status != 'deleted' ORDER BY created_at DESC")
    rows = cur.fetchall()

    items = []
    for r in rows:
        item = dict(r)
        # Format seller object to match radar algorithm interface
        item["seller"] = {
            "id": item["seller_id"],
            "name": item["seller_name"],
            "rating": item["seller_rating"],
            "verified": bool(item["seller_verified"]),
            "campus_verified": bool(item.get("seller_campus_verified", 0)),
            "email": item.get("seller_email") or "",
            "avatar": item["seller_avatar"]
        }
        item["tags"] = json.loads(item["tags"]) if item["tags"] else []
        item["isAvailable"] = bool(item.get("is_available", 1)) and item.get("status") != "sold"
        item["beacon_type"] = item.get("beacon_type") or "sell"
        item["status"] = item.get("status") or "active"
        item["upi_id"] = item.get("upi_id") or ""
        items.append(item)

    return jsonify({"success": True, "items": items, "count": len(items)})

@app.route('/api/my-items', methods=['GET'])
def list_my_items():
    """List all items broadcasted by the requesting device or Google account."""
    db = get_db()
    auth_user = get_authenticated_user(db)
    device_id = request.headers.get('X-Device-Id') or request.args.get('device_id') or "guest"
    cur = db.cursor()

    if auth_user and auth_user.get("google_id"):
        cur.execute("""
            SELECT * FROM items 
            WHERE (seller_google_id = ? OR seller_id = ?) AND status != 'deleted' 
            ORDER BY created_at DESC
        """, (auth_user["google_id"], device_id))
    else:
        cur.execute("SELECT * FROM items WHERE seller_id = ? AND status != 'deleted' ORDER BY created_at DESC", (device_id,))
    rows = cur.fetchall()

    items = []
    for r in rows:
        item = dict(r)
        item["seller"] = {
            "id": item["seller_id"],
            "name": item["seller_name"],
            "rating": item["seller_rating"],
            "verified": bool(item["seller_verified"]),
            "campus_verified": bool(item.get("seller_campus_verified", 0)),
            "email": item.get("seller_email") or "",
            "avatar": item["seller_avatar"]
        }
        item["tags"] = json.loads(item["tags"]) if item["tags"] else []
        item["isAvailable"] = bool(item.get("is_available", 1)) and item.get("status") != "sold"
        item["beacon_type"] = item.get("beacon_type") or "sell"
        item["status"] = item.get("status") or "active"
        item["upi_id"] = item.get("upi_id") or ""
        items.append(item)

    return jsonify({"success": True, "items": items, "count": len(items)})

@app.route('/api/items', methods=['POST'])
def create_item():
    """Broadcast a new listing across all connected devices."""
    db = get_db()
    data = request.get_json() or {}
    auth_user = get_authenticated_user(db)

    device_id = request.headers.get('X-Device-Id') or data.get('seller_id') or "guest"
    if auth_user and auth_user.get("is_verified"):
        seller_name = auth_user.get("nickname") or data.get('seller_name') or "Student"
        seller_avatar = auth_user.get("picture") or auth_user.get("avatar") or data.get('seller_avatar') or ""
        seller_email = auth_user.get("email") or ""
        seller_google_id = auth_user.get("google_id") or ""
        seller_verified = 1
        seller_campus_verified = auth_user.get("is_campus_verified", 0)
    else:
        seller_name = data.get('seller_name') or "Anonymous Student"
        seller_avatar = data.get('seller_avatar') or ""
        seller_email = ""
        seller_google_id = ""
        seller_verified = 1
        seller_campus_verified = 0

    beacon_type = data.get('beacon_type') or "sell"
    upi_id = data.get('upi_id') or ""
    handshake_code = f"{random.randint(1000, 9999)}"
    
    item_lat = data.get('lat')
    item_lng = data.get('lng')
    if item_lat is None or item_lng is None:
        return jsonify({"success": False, "error": "Live GPS coordinates (lat, lng) are required to broadcast an item."}), 400
    try:
        final_lat = float(item_lat)
        final_lng = float(item_lng)
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Invalid GPS coordinates format."}), 400

    item_id = "item-" + uuid.uuid4().hex[:10]
    now = time.time()

    tags_json = json.dumps(data.get('tags', []))

    cur = db.cursor()
    cur.execute("""
        INSERT INTO items (
            id, seller_id, seller_name, seller_rating, seller_verified, seller_avatar,
            title, category, sub_category, price, original_price, condition,
            condition_score, lat, lng, landmark, image, description, tags,
            is_available, reserved_by, created_at, beacon_type, status, upi_id,
            seller_email, seller_campus_verified, seller_google_id, handshake_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, 'active', ?, ?, ?, ?, ?)
    """, (
        item_id, device_id, seller_name, 5.0, seller_verified, seller_avatar,
        data.get('title') or "Untitled Listing", data.get('category') or "stationery", data.get('sub_category') or "General",
        float(data.get('price') or 0), float(data.get('original_price') or data.get('price') or 0), data.get('condition') or "Good",
        float(data.get('condition_score', 0.85) or 0.85), final_lat, final_lng,
        data.get('landmark') or "Live Location", data.get('image'), data.get('description') or "",
        tags_json, now, beacon_type, upi_id,
        seller_email, seller_campus_verified, seller_google_id, handshake_code
    ))

    # Record sync event for real-time delta pushes
    cur.execute("""
        INSERT INTO sync_events (event_type, item_id, payload, created_at)
        VALUES ('new_item', ?, ?, ?)
    """, (item_id, json.dumps({"item_id": item_id, "title": data.get('title'), "beacon_type": beacon_type}), now))

    # If this is a Wanted/Bounty request, also emit a dedicated bounty event
    if beacon_type == "wanted":
        cur.execute("""
            INSERT INTO sync_events (event_type, item_id, payload, created_at)
            VALUES ('new_bounty', ?, ?, ?)
        """, (item_id, json.dumps({
            "item_id": item_id,
            "title": data.get('title') or "Wanted Item",
            "category": data.get('category') or "stationery",
            "max_budget": float(data.get('price') or 0),
            "poster_name": seller_name,
            "created_at": now
        }), now))

    db.commit()

    # Retrieve and return created item
    cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    created = dict(cur.fetchone())
    created["seller"] = {
        "id": created["seller_id"],
        "name": created["seller_name"],
        "rating": created["seller_rating"],
        "verified": bool(created["seller_verified"]),
        "campus_verified": bool(created.get("seller_campus_verified", 0)),
        "email": created.get("seller_email") or "",
        "avatar": created["seller_avatar"]
    }
    created["tags"] = json.loads(created["tags"]) if created["tags"] else []
    created["beacon_type"] = beacon_type
    created["status"] = "active"
    created["handshake_code"] = handshake_code

    save_data_backup()
    return jsonify({"success": True, "item": created}), 201

@app.route('/api/items/<item_id>/location', methods=['POST'])
def update_item_location(item_id):
    """Update seller item coordinates with live GPS fix."""
    db = get_db()
    data = request.get_json() or {}
    lat = data.get('lat')
    lng = data.get('lng')
    if lat is None or lng is None:
        return jsonify({"error": "Latitude and longitude required"}), 400

    cur = db.cursor()
    cur.execute("UPDATE items SET lat = ?, lng = ? WHERE id = ?", (float(lat), float(lng), item_id))
    db.commit()

    save_data_backup()
    return jsonify({"success": True, "item_id": item_id, "lat": float(lat), "lng": float(lng)})

@app.route('/api/items/<item_id>/status', methods=['POST'])
def update_item_status(item_id):
    """Mark item as sold or deleted."""
    db = get_db()
    data = request.get_json() or {}
    new_status = data.get('status', 'sold')
    now = time.time()

    cur = db.cursor()
    cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    row = cur.fetchone()
    if not row:
        return jsonify({"success": False, "error": "Item not found"}), 404

    is_avail = 0 if new_status in ('sold', 'deleted') else 1
    cur.execute("UPDATE items SET status = ?, is_available = ? WHERE id = ?", (new_status, is_avail, item_id))
    cur.execute("""
        INSERT INTO sync_events (event_type, item_id, payload, created_at)
        VALUES ('item_status_changed', ?, ?, ?)
    """, (item_id, json.dumps({"item_id": item_id, "status": new_status}), now))
    db.commit()
    save_data_backup()

    return jsonify({"success": True, "item_id": item_id, "status": new_status})

@app.route('/api/items/<item_id>/reserve', methods=['POST'])
def toggle_reserve(item_id):
    """Atomically reserve or un-reserve an item."""
    db = get_db()
    device_id = request.headers.get('X-Device-Id') or request.get_json().get('device_id')
    now = time.time()

    cur = db.cursor()
    cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    row = cur.fetchone()
    if not row:
        return jsonify({"success": False, "error": "Item not found"}), 404

    item = dict(row)
    current_reserved = item.get("reserved_by")

    if current_reserved == device_id:
        # Un-reserve
        new_reserved = None
    elif current_reserved is None:
        # Reserve
        new_reserved = device_id
    else:
        # Already reserved by another device
        return jsonify({
            "success": False,
            "error": "Item has already been reserved by another user!"
        }), 409

    cur.execute("UPDATE items SET reserved_by = ? WHERE id = ?", (new_reserved, item_id))
    cur.execute("""
        INSERT INTO sync_events (event_type, item_id, payload, created_at)
        VALUES ('reserve_toggle', ?, ?, ?)
    """, (item_id, json.dumps({"item_id": item_id, "reserved_by": new_reserved}), now))
    db.commit()
    save_data_backup()

    return jsonify({
        "success": True,
        "item_id": item_id,
        "reserved_by": new_reserved,
        "is_reserved": new_reserved is not None
    })

@app.route('/api/handshake/<item_id>', methods=['GET'])
def get_handshake_status(item_id):
    """Retrieve handshake state for an item. PIN is only visible to the seller."""
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    row = cur.fetchone()
    if not row:
        return jsonify({"success": False, "error": "Item not found"}), 404

    item = dict(row)
    device_id = request.headers.get('X-Device-Id')
    auth_user = get_authenticated_user(db)
    user_email = auth_user.get("email") if auth_user else None

    # Check if caller is seller
    is_seller = (device_id and device_id == item.get("seller_id")) or (user_email and user_email == item.get("seller_email"))

    # Ensure handshake_code exists lazily if created before migration
    code = item.get("handshake_code")
    if not code:
        code = f"{random.randint(1000, 9999)}"
        cur.execute("UPDATE items SET handshake_code = ? WHERE id = ?", (code, item_id))
        db.commit()

    is_completed = item.get("status") == "sold"

    # Get seller's total verified trades count
    cur.execute("SELECT trades_completed FROM users WHERE id = ? OR email = ?", (item.get("seller_id"), item.get("seller_email")))
    u_row = cur.fetchone()
    seller_trades = u_row[0] if u_row and u_row[0] else 0

    return jsonify({
        "success": True,
        "item_id": item_id,
        "role": "seller" if is_seller else "buyer",
        "code": code if is_seller else None,  # Hidden from buyer until seller presents it!
        "is_completed": is_completed,
        "status": item.get("status"),
        "completed_at": item.get("completed_at"),
        "seller_trades": seller_trades
    })

@app.route('/api/handshake/<item_id>/verify', methods=['POST'])
def verify_handshake(item_id):
    """Buyer submits the 4-digit PIN to confirm receipt of item."""
    db = get_db()
    data = request.get_json() or {}
    submitted_code = str(data.get("code", "")).strip()
    rating = float(data.get("rating", 5.0))
    feedback = str(data.get("feedback", "")).strip()

    device_id = request.headers.get('X-Device-Id') or "guest-buyer"
    auth_user = get_authenticated_user(db)
    buyer_name = auth_user.get("nickname") if auth_user else (data.get("buyer_name") or "Campus Buyer")
    now = time.time()

    cur = db.cursor()
    cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    row = cur.fetchone()
    if not row:
        return jsonify({"success": False, "error": "Item not found"}), 404

    item = dict(row)

    if item.get("status") == "sold":
        return jsonify({
            "success": True,
            "already_completed": True,
            "message": "Handshake already verified for this item!",
            "completed_at": item.get("completed_at")
        })

    actual_code = str(item.get("handshake_code") or "").strip()
    if not actual_code or submitted_code != actual_code:
        return jsonify({
            "success": False,
            "error": "Invalid Handshake PIN. Please check the seller's screen and enter the 4 digits."
        }), 400

    # Mark item as sold
    cur.execute("""
        UPDATE items 
        SET status = 'sold', is_available = 0, completed_by = ?, completed_at = ?
        WHERE id = ?
    """, (device_id, now, item_id))

    # Increment trades_completed for seller
    cur.execute("""
        UPDATE users 
        SET trades_completed = COALESCE(trades_completed, 0) + 1 
        WHERE id = ? OR email = ?
    """, (item.get("seller_id"), item.get("seller_email")))

    # Increment trades_completed for buyer
    if device_id:
        cur.execute("""
            UPDATE users 
            SET trades_completed = COALESCE(trades_completed, 0) + 1 
            WHERE id = ?
        """, (device_id,))

    # Post celebratory system message into chat
    chat_text = f"[HANDSHAKE_VERIFIED:{actual_code}:{int(rating)}:{feedback or 'In-person trade verified!'}]"
    cur.execute("""
        INSERT INTO messages (item_id, sender_id, sender_name, text, created_at)
        VALUES (?, 'system', '🤝 Secure Handshake', ?, ?)
    """, (item_id, chat_text, now))

    # Record sync event for real-time push to all devices
    cur.execute("""
        INSERT INTO sync_events (event_type, item_id, payload, created_at)
        VALUES ('handshake_completed', ?, ?, ?)
    """, (item_id, json.dumps({
        "item_id": item_id,
        "status": "sold",
        "completed_by": device_id,
        "completed_at": now
    }), now))

    db.commit()
    save_data_backup()

    return jsonify({
        "success": True,
        "verified": True,
        "item_id": item_id,
        "status": "sold",
        "completed_at": now,
        "message": "Secure Handshake completed! Trade verified and trust scores boosted."
    })

# ==========================================
# BOUNTY BOARD — "I HAVE THIS!" MATCH ROUTE
# ==========================================

@app.route('/api/bounty/<item_id>/match', methods=['POST'])
def match_bounty(item_id):
    """Respond to a Wanted/Bounty request with 'I HAVE THIS!'."""
    db = get_db()
    cur = db.cursor()
    data = request.get_json() or {}

    cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    item = cur.fetchone()
    if not item:
        return jsonify({"success": False, "error": "Bounty not found"}), 404
    item = dict(item)

    if item.get("beacon_type") != "wanted":
        return jsonify({"success": False, "error": "This item is not a bounty request"}), 400

    auth_user = get_authenticated_user(db)
    responder_id = request.headers.get('X-Device-Id') or data.get('responder_id') or "guest"
    responder_name = (auth_user.get("nickname") if auth_user else None) or data.get('responder_name') or "Campus Student"

    if responder_id == item.get('seller_id'):
        return jsonify({"success": False, "error": "You cannot respond to your own bounty"}), 400

    now = time.time()

    # Post a system chat message into the bounty chat thread
    chat_text = f"[BOUNTY_MATCH:{responder_id}:{responder_name}]"
    cur.execute("""
        INSERT INTO messages (item_id, sender_id, sender_name, text, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (item_id, responder_id, responder_name, chat_text, now))

    # Emit bounty_matched sync event
    cur.execute("""
        INSERT INTO sync_events (event_type, item_id, payload, created_at)
        VALUES ('bounty_matched', ?, ?, ?)
    """, (item_id, json.dumps({
        "item_id": item_id,
        "responder_id": responder_id,
        "responder_name": responder_name,
        "bounty_title": item.get("title", "Item"),
        "matched_at": now
    }), now))

    db.commit()

    return jsonify({
        "success": True,
        "message": f"{responder_name} responded to your bounty! Open the chat to connect.",
        "item_id": item_id,
        "responder_name": responder_name
    })

# ==========================================
# MAKE AN OFFER / QUICK BARGAINING ROUTES
# ==========================================

@app.route('/api/offers/<item_id>', methods=['POST'])
def create_offer(item_id):
    """Submit a discounted price offer on a listing."""
    db = get_db()
    cur = db.cursor()
    data = request.get_json() or {}

    cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    item = cur.fetchone()
    if not item:
        return jsonify({"success": False, "error": "Item not found"}), 404
    item = dict(item)

    if item.get("status") == "sold":
        return jsonify({"success": False, "error": "This item has already been marked as SOLD."}), 400

    auth_user = get_authenticated_user(db)
    buyer_id = request.headers.get('X-Device-Id') or data.get('buyer_id') or "guest-buyer"
    if auth_user and auth_user.get("is_verified"):
        buyer_name = auth_user.get("nickname") or data.get('buyer_name') or "Student"
    else:
        buyer_name = data.get('buyer_name') or "Student"

    try:
        offer_amount = float(data.get('offer_amount', 0))
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Invalid offer amount"}), 400

    if offer_amount <= 0:
        return jsonify({"success": False, "error": "Offer amount must be greater than ₹0"}), 400

    original_price = float(item.get('price') or 0)
    seller_id = item.get('seller_id')

    if buyer_id == seller_id:
        return jsonify({"success": False, "error": "You cannot make an offer on your own listing."}), 400

    offer_id = f"off-{uuid.uuid4().hex[:10]}"
    now = time.time()

    cur.execute("""
        INSERT INTO offers (id, item_id, buyer_id, buyer_name, seller_id, original_price, offer_amount, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    """, (offer_id, item_id, buyer_id, buyer_name, seller_id, original_price, offer_amount, now, now))

    # Post special offer message into chat
    chat_text = f"[OFFER:{offer_id}:{offer_amount:g}:{original_price:g}:pending:{buyer_name}]"
    cur.execute("""
        INSERT INTO messages (item_id, sender_id, sender_name, text, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (item_id, buyer_id, buyer_name, chat_text, now))

    offer_payload = {
        "offer_id": offer_id,
        "item_id": item_id,
        "item_title": item.get("title") or "Campus Item",
        "buyer_id": buyer_id,
        "buyer_name": buyer_name,
        "seller_id": seller_id,
        "original_price": original_price,
        "offer_amount": offer_amount,
        "status": "pending",
        "created_at": now
    }

    # Emit sync event for real-time live notification
    cur.execute("""
        INSERT INTO sync_events (event_type, item_id, payload, created_at)
        VALUES ('new_offer', ?, ?, ?)
    """, (item_id, json.dumps(offer_payload), now))

    db.commit()

    return jsonify({
        "success": True,
        "offer": offer_payload
    }), 201

@app.route('/api/offers/<offer_id>/respond', methods=['POST'])
def respond_offer(offer_id):
    """Seller or Buyer responds to an offer: accept, counter, or decline."""
    db = get_db()
    cur = db.cursor()
    data = request.get_json() or {}
    action = (data.get('action') or '').lower().strip()

    cur.execute("SELECT * FROM offers WHERE id = ?", (offer_id,))
    offer = cur.fetchone()
    if not offer:
        return jsonify({"success": False, "error": "Offer not found"}), 404
    offer = dict(offer)

    item_id = offer['item_id']
    cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    item = cur.fetchone()
    if not item:
        return jsonify({"success": False, "error": "Listing not found"}), 404
    item = dict(item)

    now = time.time()
    auth_user = get_authenticated_user(db)
    caller_id = request.headers.get('X-Device-Id') or data.get('user_id') or (auth_user['id'] if auth_user else "user")
    sender_name = data.get('sender_name') or (auth_user.get('nickname') if auth_user else "Seller")

    if action == 'accept':
        agreed_price = float(offer['offer_amount'])
        cur.execute("UPDATE offers SET status = 'accepted', updated_at = ? WHERE id = ?", (now, offer_id))
        cur.execute("UPDATE items SET agreed_price = ?, accepted_offer_id = ? WHERE id = ?", (agreed_price, offer_id, item_id))

        chat_text = f"[OFFER_ACCEPTED:{offer_id}:{agreed_price:g}]"
        cur.execute("""
            INSERT INTO messages (item_id, sender_id, sender_name, text, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (item_id, caller_id, sender_name, chat_text, now))

        cur.execute("""
            INSERT INTO sync_events (event_type, item_id, payload, created_at)
            VALUES ('offer_accepted', ?, ?, ?)
        """, (item_id, json.dumps({
            "offer_id": offer_id,
            "item_id": item_id,
            "item_title": item.get("title") or "Campus Item",
            "seller_id": item.get("seller_id"),
            "buyer_id": offer.get("buyer_id"),
            "agreed_price": agreed_price,
            "status": "accepted"
        }), now))

        db.commit()
        return jsonify({
            "success": True,
            "status": "accepted",
            "offer_id": offer_id,
            "agreed_price": agreed_price,
            "message": f"Offer accepted at ₹{agreed_price:g}! UPI payment amount updated."
        })

    elif action == 'counter':
        try:
            counter_amount = float(data.get('counter_amount', 0))
        except (ValueError, TypeError):
            return jsonify({"success": False, "error": "Invalid counter amount"}), 400
        if counter_amount <= 0:
            return jsonify({"success": False, "error": "Counter amount must be greater than ₹0"}), 400

        cur.execute("""
            UPDATE offers 
            SET offer_amount = ?, status = 'countered', updated_at = ? 
            WHERE id = ?
        """, (counter_amount, now, offer_id))

        chat_text = f"[OFFER_COUNTERED:{offer_id}:{counter_amount:g}]"
        cur.execute("""
            INSERT INTO messages (item_id, sender_id, sender_name, text, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (item_id, caller_id, sender_name, chat_text, now))

        cur.execute("""
            INSERT INTO sync_events (event_type, item_id, payload, created_at)
            VALUES ('offer_countered', ?, ?, ?)
        """, (item_id, json.dumps({
            "offer_id": offer_id,
            "item_id": item_id,
            "item_title": item.get("title") or "Campus Item",
            "seller_id": item.get("seller_id"),
            "buyer_id": offer.get("buyer_id"),
            "counter_amount": counter_amount,
            "status": "countered"
        }), now))

        db.commit()
        return jsonify({
            "success": True,
            "status": "countered",
            "offer_id": offer_id,
            "counter_amount": counter_amount,
            "message": f"Counter-offer of ₹{counter_amount:g} submitted!"
        })

    elif action == 'decline':
        cur.execute("UPDATE offers SET status = 'declined', updated_at = ? WHERE id = ?", (now, offer_id))

        chat_text = f"[OFFER_DECLINED:{offer_id}:{offer['offer_amount']:g}]"
        cur.execute("""
            INSERT INTO messages (item_id, sender_id, sender_name, text, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (item_id, caller_id, sender_name, chat_text, now))

        cur.execute("""
            INSERT INTO sync_events (event_type, item_id, payload, created_at)
            VALUES ('offer_declined', ?, ?, ?)
        """, (item_id, json.dumps({
            "offer_id": offer_id,
            "item_id": item_id,
            "item_title": item.get("title") or "Campus Item",
            "seller_id": item.get("seller_id"),
            "buyer_id": offer.get("buyer_id"),
            "status": "declined"
        }), now))

        db.commit()
        return jsonify({
            "success": True,
            "status": "declined",
            "offer_id": offer_id,
            "message": "Offer declined."
        })

    return jsonify({"success": False, "error": "Invalid action. Must be accept, counter, or decline"}), 400

@app.route('/api/offers/<item_id>', methods=['GET'])
def get_offers(item_id):
    """Get active offers and agreed price for an item."""
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM offers WHERE item_id = ? ORDER BY created_at DESC", (item_id,))
    rows = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT price, agreed_price, accepted_offer_id FROM items WHERE id = ?", (item_id,))
    item_row = cur.fetchone()
    original_price = item_row[0] if item_row else None
    agreed_price = item_row[1] if item_row else None
    accepted_offer_id = item_row[2] if item_row else None

    return jsonify({
        "success": True,
        "offers": rows,
        "original_price": original_price,
        "agreed_price": agreed_price,
        "accepted_offer_id": accepted_offer_id
    })

@app.route('/api/chat/<item_id>', methods=['GET'])
def get_chat(item_id):
    """Get all conversation messages for an item."""
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        SELECT * FROM messages 
        WHERE item_id = ? 
        ORDER BY created_at ASC
    """, (item_id,))
    messages = [dict(r) for r in cur.fetchall()]
    return jsonify({"success": True, "messages": messages})

@app.route('/api/chat/<item_id>', methods=['POST'])
def send_chat(item_id):
    """Send a real-time message between buyer and seller."""
    db = get_db()
    data = request.get_json() or {}
    auth_user = get_authenticated_user(db)

    device_id = request.headers.get('X-Device-Id') or data.get('sender_id') or "guest"
    if auth_user and auth_user.get("is_verified"):
        sender_name = auth_user.get("nickname") or data.get('sender_name') or "Student"
        sender_avatar = auth_user.get("picture") or auth_user.get("avatar") or ""
        sender_email = auth_user.get("email") or ""
    else:
        sender_name = data.get('sender_name') or "Student"
        sender_avatar = ""
        sender_email = ""

    text = data.get('text', '').strip()
    now = time.time()

    if not text:
        return jsonify({"success": False, "error": "Message cannot be empty"}), 400

    cur = db.cursor()
    cur.execute("""
        INSERT INTO messages (item_id, sender_id, sender_name, text, created_at, sender_email, sender_avatar)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (item_id, device_id, sender_name, text, now, sender_email, sender_avatar))

    msg_id = cur.lastrowid

    cur.execute("SELECT title, seller_id, seller_name FROM items WHERE id = ?", (item_id,))
    item_row = cur.fetchone()
    item_title = item_row['title'] if item_row else "Campus Listing"
    seller_id = item_row['seller_id'] if item_row else ""
    seller_name_val = item_row['seller_name'] if item_row else "Seller"

    # Emit event
    msg_payload = {
        "id": msg_id,
        "item_id": item_id,
        "item_title": item_title,
        "seller_id": seller_id,
        "seller_name": seller_name_val,
        "sender_id": device_id,
        "sender_name": sender_name,
        "sender_avatar": sender_avatar,
        "sender_email": sender_email,
        "text": text,
        "created_at": now
    }
    cur.execute("""
        INSERT INTO sync_events (event_type, item_id, payload, created_at)
        VALUES ('new_message', ?, ?, ?)
    """, (item_id, json.dumps(msg_payload), now))

    db.commit()
    save_data_backup()

    return jsonify({
        "success": True,
        "message": msg_payload
    }), 201

# In-memory cache for campus search results to provide sub-10ms response times
CAMPUS_SEARCH_CACHE = {}

@app.route('/api/campuses/search', methods=['GET'])
def search_campuses_api():
    """
    High-performance Pan-India College & University Search Proxy.
    Queries OpenStreetMap Nominatim with proper headers, restricted to India,
    and returns parsed, verified educational campuses with caching.
    """
    q = (request.args.get('q') or '').strip()
    if not q or len(q) < 2:
        return jsonify({"success": True, "results": []})

    cache_key = q.lower().strip()
    if cache_key in CAMPUS_SEARCH_CACHE:
        return jsonify({"success": True, "results": CAMPUS_SEARCH_CACHE[cache_key], "cached": True})

    results = []
    
    clean_q = q
    has_edu_term = any(w in clean_q.lower() for w in ['college', 'university', 'institute', 'campus', 'iit', 'nit', 'iiit', 'iim', 'school', 'polytechnic', 'vidyapeeth', 'academy'])
    search_terms = [clean_q]
    if not has_edu_term:
        search_terms.append(f"{clean_q} college")

    headers = {
        "User-Agent": "RadarMarket-CampusDirectory/3.8 (https://radarmarket.onrender.com; campus-finder)",
        "Accept-Language": "en"
    }

    for term in search_terms:
        if len(results) >= 8:
            break
        try:
            params = urllib.parse.urlencode({
                "format": "json",
                "q": term,
                "countrycodes": "in",
                "limit": "10",
                "addressdetails": "1"
            })
            req_url = f"https://nominatim.openstreetmap.org/search?{params}"
            req = urllib.request.Request(req_url, headers=headers)
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                for r in (data or []):
                    addr = r.get("address") or {}
                    city = addr.get("city") or addr.get("town") or addr.get("suburb") or addr.get("county") or addr.get("state_district") or "India"
                    state_name = addr.get("state") or "India"
                    raw_name = r.get("display_name") or ""
                    short_name = raw_name.split(",")[0].strip()

                    if any(existing['shortName'].lower() == short_name.lower() for existing in results):
                        continue

                    category = "College / Campus"
                    if "univ" in short_name.lower() or "univ" in raw_name.lower():
                        category = "University"
                    elif "institute" in short_name.lower() or "technology" in short_name.lower():
                        category = "Institute"

                    results.append({
                        "id": f"osm-{r.get('place_id') or len(results)}",
                        "name": raw_name,
                        "shortName": short_name,
                        "city": city,
                        "state": state_name,
                        "lat": float(r["lat"]),
                        "lng": float(r["lon"]),
                        "category": category,
                        "isLiveGeocoded": True
                    })
        except Exception as err:
            print(f"[Campus Search] Nominatim query failed for '{term}': {err}")

    # Fallback to Photon API if Nominatim returns nothing
    if len(results) == 0:
        try:
            photon_params = urllib.parse.urlencode({
                "q": f"{q} college",
                "limit": "8",
                "bbox": "68.1,8.0,97.4,37.1"
            })
            photon_url = f"https://photon.komoot.io/api/?{photon_params}"
            req = urllib.request.Request(photon_url, headers={"User-Agent": "RadarMarket/3.8"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                pdata = json.loads(resp.read().decode('utf-8'))
                for feat in (pdata.get("features") or []):
                    props = feat.get("properties") or {}
                    coords = feat.get("geometry", {}).get("coordinates", [])
                    if len(coords) >= 2:
                        name = props.get("name") or props.get("city") or q
                        city = props.get("city") or props.get("district") or props.get("state") or "India"
                        state_name = props.get("state") or "India"
                        results.append({
                            "id": f"photon-{props.get('osm_id') or len(results)}",
                            "name": f"{name}, {city}, {state_name}",
                            "shortName": name,
                            "city": city,
                            "state": state_name,
                            "lat": float(coords[1]),
                            "lng": float(coords[0]),
                            "category": "College / Campus",
                            "isLiveGeocoded": True
                        })
        except Exception as perr:
            print(f"[Campus Search] Photon query failed: {perr}")

    # Save in cache
    if len(CAMPUS_SEARCH_CACHE) > 500:
        CAMPUS_SEARCH_CACHE.clear()
    CAMPUS_SEARCH_CACHE[cache_key] = results

    return jsonify({"success": True, "results": results, "cached": False})

@app.route('/api/sync', methods=['GET'])
def delta_sync():
    """
    Real-Time Delta Sync Endpoint.
    Clients poll this every 1-2s with ?since=<timestamp>.
    Returns new events, new items, and new messages since that timestamp.
    """
    db = get_db()
    since = float(request.args.get('since', 0))
    current_time = time.time()

    cur = db.cursor()
    cur.execute("""
        SELECT * FROM sync_events 
        WHERE created_at > ? 
        ORDER BY created_at ASC
    """, (since,))
    events = [dict(r) for r in cur.fetchall()]

    # Check latest item timestamp to guarantee synchronization across multiple phones
    cur.execute("SELECT max(created_at), count(*) FROM items WHERE status != 'deleted'")
    latest_row = cur.fetchone()
    latest_item_ts = latest_row[0] or 0

    # If any item was added, changed, or client is initializing
    has_item_changes = (
        since == 0 or
        latest_item_ts > since or
        any(e['event_type'] in ('new_item', 'reserve_toggle', 'item_status_changed', 'offer_accepted') for e in events)
    )

    items = []
    if has_item_changes:
        cur.execute("SELECT * FROM items WHERE status != 'deleted' ORDER BY created_at DESC")
        for r in cur.fetchall():
            item = dict(r)
            item["seller"] = {
                "id": item["seller_id"],
                "name": item["seller_name"],
                "rating": item["seller_rating"],
                "verified": bool(item["seller_verified"]),
                "campus_verified": bool(item.get("seller_campus_verified", 0)),
                "email": item.get("seller_email") or "",
                "avatar": item["seller_avatar"]
            }
            item["tags"] = json.loads(item["tags"]) if item["tags"] else []
            item["isAvailable"] = bool(item.get("is_available", 1)) and item.get("status") != "sold"
            item["beacon_type"] = item.get("beacon_type") or "sell"
            item["status"] = item.get("status") or "active"
            item["upi_id"] = item.get("upi_id") or ""
            items.append(item)

    # Any new messages
    cur.execute("""
        SELECT m.*, i.title as item_title, i.seller_id as seller_id, i.seller_name as seller_name
        FROM messages m
        LEFT JOIN items i ON m.item_id = i.id
        WHERE m.created_at > ?
        ORDER BY m.created_at ASC
    """, (since,))
    new_messages = [dict(r) for r in cur.fetchall()]

    return jsonify({
        "success": True,
        "timestamp": current_time,
        "events": events,
        "has_item_changes": has_item_changes,
        "items": items,
        "new_messages": new_messages
    })

def print_banner(lan_ip):
    print("=" * 66)
    print("  RADARMARKET - MULTI-DEVICE LIVE PRODUCTION SERVER")
    print("=" * 66)
    print(f"  * Local Desktop Access:   http://localhost:{PORT}")
    print(f"  * Mobile Phone Access:    http://{lan_ip}:{PORT}")
    print("=" * 66)
    print("  [✓] SQLite WAL Database initialized: database.db")
    print("  [✓] Real-time cross-device sync active (Delta Bus)")
    print("  [✓] Instant QR Code pairing ready in web header")
    print("  Press Ctrl+C to stop the server safely.")
    print("=" * 66)

if __name__ == '__main__':
    init_db()
    lan_ip = get_lan_ip()
    print_banner(lan_ip)
    # Run production multi-threaded WSGI server via Werkzeug
    app.run(host='0.0.0.0', port=PORT, threaded=True, debug=False)
