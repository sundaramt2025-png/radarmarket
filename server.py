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
import re
import urllib.request
import urllib.error
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
        "ALTER TABLE messages ADD COLUMN sender_avatar TEXT;"
    ]
    for stmt in auth_migrations:
        try:
            cur.execute(stmt)
        except Exception:
            pass

    conn.commit()

    # Seed initial items if database is empty
    cur.execute("SELECT COUNT(*) FROM items")
    count = cur.fetchone()[0]
    if count == 0:
        seed_initial_items(conn)

    conn.close()

def seed_initial_items(conn):
    """Seed high quality university stationery & books dataset."""
    now = time.time()
    initial_items = [
        # Stationery
        (
            "stat-001", "seller-system-1", "Aarav Sharma (Campus)", 4.9, 1,
            "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80",
            "Casio fx-991EX ClassWiz Scientific Calculator", "stationery", "Calculators & Electronics",
            650, 1595, "Like New", 0.95, 28.6165, 77.2110, "2nd Floor, Science Library",
            "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80",
            "Barely used for 1 semester. Matrix, vector, spreadsheet functions working. Has solar + battery.",
            json.dumps(["calculator", "casio", "engineering", "math"]), 1, None, now - 18000
        ),
        (
            "stat-002", "seller-system-2", "Sneha Patel (Arch)", 4.7, 1,
            "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
            "Rotring Professional Technical Drafting Compass Set", "stationery", "Drafting & Architecture",
            850, 2200, "Good", 0.85, 28.6075, 77.2085, "Architecture Design Studio 4",
            "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=600&q=80",
            "German precision brass compass with extension bar, lead container, and universal adapter.",
            json.dumps(["drafting", "compass", "rotring", "architecture"]), 1, None, now - 36000
        ),
        (
            "stat-003", "seller-system-3", "Vikram Mehta", 5.0, 1,
            "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=120&q=80",
            "Lamy Safari Charcoal Fountain Pen (Fine Nib)", "stationery", "Fine Writing & Pens",
            1100, 2400, "Like New", 0.95, 28.6142, 77.2070, "Campus Cafe Lounge",
            "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80",
            "Matte black ABS body, original Z28 piston converter included + 3 blue cartridges.",
            json.dumps(["pen", "lamy", "fountain pen", "calligraphy"]), 1, None, now - 7200
        ),
        (
            "stat-004", "seller-system-4", "Tanya Sen (Arts)", 4.8, 0,
            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80",
            "Copic Sketch & Touch Twin Alcohol Art Markers (24 Colors)", "stationery", "Art Supplies & Illustration",
            1400, 3800, "Good", 0.80, 28.6210, 77.2010, "Fine Arts Faculty Wing",
            "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=600&q=80",
            "Dual tip (chisel and brush). Tested with plenty of ink left. Includes desk organizer.",
            json.dumps(["art", "markers", "copic", "drawing"]), 1, None, now - 86400
        ),
        # Books
        (
            "book-001", "seller-system-5", "Rohan Varma (Math)", 4.9, 1,
            "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80",
            "Advanced Engineering Mathematics (10th Ed) - Erwin Kreyszig", "books", "Engineering & Mathematics",
            490, 1250, "Good", 0.85, 28.6160, 77.2095, "Reading Room 3, Central Library",
            "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80",
            "Standard text for ODE, PDE, Linear Algebra, Complex Analysis. Binding intact.",
            json.dumps(["mathematics", "kreyszig", "engineering", "textbook"]), 1, None, now - 28000
        ),
        (
            "book-002", "seller-system-6", "Ananya Iyer (CS)", 5.0, 1,
            "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80",
            "Introduction to Algorithms (CLRS 3rd Edition)", "books", "Computer Science",
            920, 2400, "Like New", 0.95, 28.6175, 77.2055, "CS Department Lab 102",
            "https://images.unsplash.com/photo-1532012164546-f432f2e3777a?auto=format&fit=crop&w=600&q=80",
            "Hardcover edition, pristine pages, zero markings. Essential computer science foundation.",
            json.dumps(["algorithms", "clrs", "dsa", "coding", "mit"]), 1, None, now - 10800
        ),
        (
            "book-003", "seller-system-7", "Karan Johar", 4.8, 1,
            "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=120&q=80",
            "Concepts of Physics (Vol 1 & 2 Complete Set) - HC Verma", "books", "Physics & Exam Prep",
            380, 990, "Good", 0.85, 28.6080, 77.2030, "Hostel 7 Common Hall",
            "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80",
            "Both volumes with full solved examples and conceptual questions.",
            json.dumps(["physics", "hc verma", "jee", "neet", "mechanics"]), 1, None, now - 43200
        ),
        (
            "book-004", "seller-system-8", "Devika Rao", 4.9, 1,
            "https://images.unsplash.com/photo-1548142813-c348350df52b?auto=format&fit=crop&w=120&q=80",
            "1984 + Animal Farm (George Orwell Collector's Duo)", "books", "Literature & Fiction",
            250, 650, "Like New", 0.95, 28.6168, 77.2060, "Humanities Courtyard",
            "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=600&q=80",
            "Pristine spine, no creases or markings. Classic dystopian literature.",
            json.dumps(["fiction", "orwell", "classics", "novels"]), 1, None, now - 21600
        ),
        (
            "book-005", "seller-system-9", "Kabir Singh", 4.8, 1,
            "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=120&q=80",
            "Atomic Habits - James Clear (Hardcover Edition)", "books", "Self-Help & Productivity",
            320, 799, "Like New", 0.95, 28.6090, 77.2135, "Student Sports Pavilion",
            "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=600&q=80",
            "Hardcover edition with original bookmark ribbon. Excellent condition.",
            json.dumps(["atomic habits", "productivity", "bestseller"]), 1, None, now - 54000
        )
    ]

    cur = conn.cursor()
    cur.executemany("""
        INSERT INTO items (
            id, seller_id, seller_name, seller_rating, seller_verified, seller_avatar,
            title, category, sub_category, price, original_price, condition,
            condition_score, lat, lng, landmark, image, description, tags,
            is_available, reserved_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, initial_items)
    conn.commit()

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

def get_authenticated_user(db):
    """Resolve currently authenticated user from Bearer session token or device ID."""
    auth_header = request.headers.get('Authorization', '')
    session_token = None
    if auth_header.startswith('Bearer '):
        session_token = auth_header[7:].strip()
    
    cur = db.cursor()
    if session_token:
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
    Authenticate with Google Identity Services ID Token or Instant Demo Campus Profile.
    Transfers prior guest listings and emits persistent cross-device identity.
    """
    db = get_db()
    data = request.get_json() or {}
    credential = data.get('credential')
    is_demo = data.get('demo', False)
    device_id = request.headers.get('X-Device-Id') or data.get('device_id')
    now = time.time()

    google_id = None
    email = None
    name = None
    picture = None

    if credential:
        payload = verify_google_token(credential)
        if not payload:
            return jsonify({"success": False, "error": "Invalid or expired Google Token"}), 401
        google_id = payload.get('sub')
        email = payload.get('email', '')
        name = payload.get('name', 'Google User')
        picture = payload.get('picture', '')
    elif is_demo:
        email = data.get('email', 'student@iitb.ac.in')
        name = data.get('name', 'Campus Student')
        picture = data.get('picture') or f"https://api.dicebear.com/7.x/bottts/svg?seed={email}"
        google_id = "google-demo-" + hashlib.md5(email.lower().encode()).hexdigest()[:14]
    else:
        return jsonify({"success": False, "error": "No credential or demo account provided"}), 400

    is_campus = 1 if is_campus_email(email) else 0
    session_token = "sess-" + uuid.uuid4().hex

    cur = db.cursor()
    cur.execute("SELECT * FROM users WHERE google_id = ? OR email = ?", (google_id, email))
    existing_user = cur.fetchone()

    user_id = None
    if existing_user:
        user_id = existing_user['id']
        cur.execute("""
            UPDATE users SET 
                google_id = ?,
                nickname = ?,
                email = ?,
                picture = ?,
                avatar = ?,
                is_verified = 1,
                is_campus_verified = ?,
                auth_provider = 'google',
                session_token = ?,
                last_active_at = ?
            WHERE id = ?
        """, (google_id, name, email, picture, picture, is_campus, session_token, now, user_id))
    else:
        # Check if device_id exists as guest
        if device_id:
            cur.execute("SELECT * FROM users WHERE id = ?", (device_id,))
            guest_row = cur.fetchone()
            if guest_row and not guest_row['google_id']:
                user_id = device_id
                cur.execute("""
                    UPDATE users SET 
                        google_id = ?,
                        nickname = ?,
                        email = ?,
                        picture = ?,
                        avatar = ?,
                        is_verified = 1,
                        is_campus_verified = ?,
                        auth_provider = 'google',
                        session_token = ?,
                        last_active_at = ?
                    WHERE id = ?
                """, (google_id, name, email, picture, picture, is_campus, session_token, now, user_id))

        if not user_id:
            user_id = "usr-" + uuid.uuid4().hex[:10]
            cur.execute("""
                INSERT INTO users (
                    id, nickname, avatar, lat, lng, created_at, last_active_at,
                    google_id, email, picture, is_verified, is_campus_verified, auth_provider, session_token
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'google', ?)
            """, (user_id, name, picture, 28.6139, 77.2090, now, now, google_id, email, picture, is_campus, session_token))

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
    """Validate current session token and return user identity."""
    db = get_db()
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({"success": True, "authenticated": False, "user": None})

    session_token = auth_header[7:].strip()
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
        cur.execute("UPDATE users SET session_token = NULL WHERE session_token = ?", (session_token,))
        db.commit()
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
            seller_email, seller_campus_verified, seller_google_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, 'active', ?, ?, ?, ?)
    """, (
        item_id, device_id, seller_name, 5.0, seller_verified, seller_avatar,
        data.get('title'), data.get('category'), data.get('sub_category'),
        data.get('price'), data.get('original_price'), data.get('condition'),
        data.get('condition_score', 0.85), data.get('lat'), data.get('lng'),
        data.get('landmark'), data.get('image'), data.get('description'),
        tags_json, now, beacon_type, upi_id,
        seller_email, seller_campus_verified, seller_google_id
    ))

    # Record sync event for real-time delta pushes
    cur.execute("""
        INSERT INTO sync_events (event_type, item_id, payload, created_at)
        VALUES ('new_item', ?, ?, ?)
    """, (item_id, json.dumps({"item_id": item_id, "title": data.get('title'), "beacon_type": beacon_type}), now))

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

    return jsonify({"success": True, "item": created}), 201

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

    return jsonify({
        "success": True,
        "item_id": item_id,
        "reserved_by": new_reserved,
        "is_reserved": new_reserved is not None
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

    # Emit event
    msg_payload = {
        "id": msg_id,
        "item_id": item_id,
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

    return jsonify({
        "success": True,
        "message": msg_payload
    }), 201

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

    # If any item was added or changed, return updated items
    has_item_changes = any(e['event_type'] in ('new_item', 'reserve_toggle', 'item_status_changed') for e in events)
    items = []
    if has_item_changes or since == 0:
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
    cur.execute("SELECT * FROM messages WHERE created_at > ? ORDER BY created_at ASC", (since,))
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
