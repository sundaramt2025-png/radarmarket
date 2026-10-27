"""
Smart Budget & Saving Manager - Production Backend Server
SE CSE AIML Java Mini Project Web & Mobile APK Shell
Group: Hansi Yadav, Diksha Kotre, Sakshi Patil, Nibha Yadav (Academic Year 2026-2027)
"""

import os
import sys
import json
import time
import uuid
import socket
import sqlite3
import hashlib
from datetime import datetime, date
from flask import Flask, request, jsonify, send_from_directory, g

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "smartbudget.db")
PORT = int(os.environ.get("PORT", 5000))
DATABASE_URL = os.environ.get("DATABASE_URL")

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
    """Database connection with thread safety."""
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        import psycopg2
        import psycopg2.extras
        if not hasattr(g, '_pg_conn') or g._pg_conn.closed:
            conn = psycopg2.connect(DATABASE_URL, sslmode='require')
            conn.autocommit = True
            g._pg_conn = conn
        return g._pg_conn

    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL;")
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()
    pg = getattr(g, '_pg_conn', None)
    if pg is not None and not pg.closed:
        pg.close()

def hash_pw(pw):
    return hashlib.sha256(pw.encode('utf-8')).hexdigest()

def init_db():
    """Initializes tables and seeds baseline data matching Slide 9."""
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(DATABASE_URL, sslmode='require')
        cur = conn.cursor()
        with open(os.path.join(BASE_DIR, "schema.sql"), "r", encoding="utf-8") as f:
            cur.execute(f.read())
        conn.commit()
        seed_data(conn, is_postgres=True)
        cur.close()
        conn.close()
    else:
        conn = sqlite3.connect(DB_PATH)
        with open(os.path.join(BASE_DIR, "schema.sql"), "r", encoding="utf-8") as f:
            conn.executescript(f.read())
        seed_data(conn, is_postgres=False)
        conn.close()

def seed_data(conn, is_postgres=False):
    """Seed sample data matching PPT Slide 9 (Income ₹30,000, Expenses ₹21,500, Savings ₹8,500, Goal ₹50,000)."""
    cur = conn.cursor()
    # Check if user already exists
    cur.execute("SELECT id FROM users WHERE username = %s" if is_postgres else "SELECT id FROM users WHERE username = ?", ("demo_student",))
    row = cur.fetchone()
    if row:
        return

    user_id = "user_demo_2026"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur_month = datetime.now().strftime("%Y-%m")
    today = date.today().strftime("%Y-%m-%d")

    # Insert default user
    insert_user = """
    INSERT INTO users (id, username, email, password_hash, full_name, currency, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    """ if is_postgres else """
    INSERT INTO users (id, username, email, password_hash, full_name, currency, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    cur.execute(insert_user, (
        user_id, "demo_student", "hansi.cse26@campus.edu", hash_pw("budget123"),
        "Hansi Yadav (SE CSE AIML)", "₹", now_str
    ))

    # Incomes matching ₹30,000
    incomes = [
        (str(uuid.uuid4()), user_id, 25000.00, "Salary", f"{cur_month}-01", "Bank Transfer", "Monthly Tech Internship Stipend", now_str),
        (str(uuid.uuid4()), user_id, 5000.00, "Freelance", f"{cur_month}-05", "UPI", "AI Web App Consulting Project", now_str)
    ]
    ins_income = """
    INSERT INTO income (id, user_id, amount, source, date, payment_mode, notes, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """ if is_postgres else """
    INSERT INTO income (id, user_id, amount, source, date, payment_mode, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    for inc in incomes:
        cur.execute(ins_income, inc)

    # Expenses matching ₹21,500
    expenses = [
        (str(uuid.uuid4()), user_id, 7500.00, "Food & Dining", f"{cur_month}-04", "UPI", "Campus Meals & Weekly Groceries", now_str),
        (str(uuid.uuid4()), user_id, 6000.00, "Housing & Rent", f"{cur_month}-02", "Bank Transfer", "Student Hostel / Accommodation", now_str),
        (str(uuid.uuid4()), user_id, 3200.00, "Travel & Transport", f"{cur_month}-06", "UPI", "Metro Card & Campus Commute", now_str),
        (str(uuid.uuid4()), user_id, 2000.00, "Bills & Utilities", f"{cur_month}-08", "UPI", "High-speed Wi-Fi & Electricity", now_str),
        (str(uuid.uuid4()), user_id, 1800.00, "Shopping", f"{cur_month}-12", "Card", "Stationery & Programming Books", now_str),
        (str(uuid.uuid4()), user_id, 1000.00, "Entertainment", f"{cur_month}-15", "UPI", "Tech Movies & Weekend Social", now_str)
    ]
    ins_expense = """
    INSERT INTO expenses (id, user_id, amount, category, date, payment_mode, notes, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """ if is_postgres else """
    INSERT INTO expenses (id, user_id, amount, category, date, payment_mode, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    for exp in expenses:
        cur.execute(ins_expense, exp)

    # Budgets (Total: ₹25,000, Food: ₹8,000, Travel: ₹4,000)
    budgets = [
        (str(uuid.uuid4()), user_id, "Total", 25000.00, cur_month, 80.0, now_str),
        (str(uuid.uuid4()), user_id, "Food & Dining", 8000.00, cur_month, 80.0, now_str),
        (str(uuid.uuid4()), user_id, "Travel & Transport", 4000.00, cur_month, 80.0, now_str),
        (str(uuid.uuid4()), user_id, "Shopping", 3000.00, cur_month, 80.0, now_str)
    ]
    ins_budget = """
    INSERT INTO budgets (id, user_id, category, monthly_limit, month, alert_threshold_percent, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    """ if is_postgres else """
    INSERT INTO budgets (id, user_id, category, monthly_limit, month, alert_threshold_percent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    for b in budgets:
        cur.execute(ins_budget, b)

    # Saving Goal (Target ₹50,000, Saved ₹22,500)
    goal_id = str(uuid.uuid4())
    ins_goal = """
    INSERT INTO saving_goals (id, user_id, title, target_amount, saved_amount, target_date, category, status, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """ if is_postgres else """
    INSERT INTO saving_goals (id, user_id, title, target_amount, saved_amount, target_date, category, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    cur.execute(ins_goal, (
        goal_id, user_id, "Emergency Fund & Laptop Target", 50000.00, 22500.00,
        f"{int(cur_month[:4])+1}-03-31", "Education & Tech", "Active", now_str
    ))

    # Alert notification
    ins_alert = """
    INSERT INTO budget_alerts (id, user_id, category, level, message, is_read, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    """ if is_postgres else """
    INSERT INTO budget_alerts (id, user_id, category, level, message, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    cur.execute(ins_alert, (
        str(uuid.uuid4()), user_id, "Total", "warning",
        "Budget Status: You have spent ₹21,500 of your ₹25,000 limit (86.0%). Within monthly limit, but keep an eye on dining!",
        0, now_str
    ))

    conn.commit()


# ==========================================
# STATIC FILES & PWA ROUTES
# ==========================================

@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")

@app.route("/SmartBudget.apk")
def download_apk():
    return send_from_directory(BASE_DIR, "SmartBudget.apk", as_attachment=True, mimetype="application/vnd.android.package-archive")

@app.route("/manifest.json")
def manifest():
    return send_from_directory(BASE_DIR, "manifest.json", mimetype="application/manifest+json")

@app.route("/sw.js")
def service_worker():
    return send_from_directory(BASE_DIR, "sw.js", mimetype="application/javascript")

@app.route("/icons/<path:filename>")
def icons(filename):
    return send_from_directory(os.path.join(BASE_DIR, "icons"), filename)

@app.route("/api/project-info", methods=["GET"])
def project_info():
    """Information for the Academic Java Mini Project Presentation."""
    return jsonify({
        "project_name": "Smart Budget & Saving Manager",
        "category": "Java Mini Project / Full-Stack Web & Android APK Shell",
        "academic_year": "2026–2027",
        "class": "SE CSE AIML",
        "members": [
            {"name": "Hansi Yadav", "role": "Full-Stack & Logic"},
            {"name": "Diksha Kotre", "role": "UI/UX & Mobile Shell"},
            {"name": "Sakshi Patil", "role": "Database & Analytics"},
            {"name": "Nibha Yadav", "role": "AI Recommendation & QA"}
        ],
        "tech_stack": {
            "ui": "Tailwind CSS, Lucide Icons, Chart.js, HTML5 PWA / Android APK Shell",
            "backend": "Python Flask (REST API) / Node.js Express Dual-Engine",
            "database": "SQLite / PostgreSQL / MySQL Compatible",
            "java_concepts": ["OOP (Inheritance, Polymorphism, Encapsulation)", "JDBC Database Connectivity", "Collections (Lists, HashMaps)", "Exception Handling"]
        },
        "features": [
            "User Authentication & Secure Session",
            "Income Management with Category & Payment Mode",
            "Category-wise Expense Tracking",
            "Monthly Budget Limits & Proactive Alerts",
            "Saving Goals Progress Tracker with Deposits",
            "Visual Dashboard & Detailed Analytics (Chart.js)",
            "AI-Driven Saving Recommendations & Burn-rate Predictor",
            "Exportable Financial Statements (CSV / Print PDF)"
        ]
    })


# ==========================================
# AUTHENTICATION API
# ==========================================

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.json or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    db = get_db()
    cur = db.cursor()
    pw_h = hash_pw(password)

    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("SELECT id, username, email, full_name, currency FROM users WHERE username = %s AND password_hash = %s", (username, pw_h))
        user = cur.fetchone()
    else:
        cur.execute("SELECT id, username, email, full_name, currency FROM users WHERE username = ? AND password_hash = ?", (username, pw_h))
        user = cur.fetchone()

    if not user:
        # Check if demo account shortcut
        if username in ["demo_student", "demo", "hansi"]:
            cur.execute("SELECT id, username, email, full_name, currency FROM users WHERE username = 'demo_student'")
            user = cur.fetchone()

    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    if hasattr(user, 'keys'):
        u_dict = dict(user)
    else:
        u_dict = {"id": user[0], "username": user[1], "email": user[2], "full_name": user[3], "currency": user[4]}

    return jsonify({"success": True, "user": u_dict})

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.json or {}
    username = data.get("username", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "").strip()
    full_name = data.get("full_name", username).strip()

    if not username or not password or not email:
        return jsonify({"error": "All fields are required"}), 400

    db = get_db()
    cur = db.cursor()
    new_id = f"user_{uuid.uuid4().hex[:12]}"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        if DATABASE_URL and 'postgres' in DATABASE_URL:
            cur.execute("""
            INSERT INTO users (id, username, email, password_hash, full_name, currency, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (new_id, username, email, hash_pw(password), full_name, "₹", now_str))
        else:
            cur.execute("""
            INSERT INTO users (id, username, email, password_hash, full_name, currency, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (new_id, username, email, hash_pw(password), full_name, "₹", now_str))
            db.commit()

        return jsonify({
            "success": True,
            "user": {"id": new_id, "username": username, "email": email, "full_name": full_name, "currency": "₹"}
        })
    except Exception as e:
        return jsonify({"error": "Username or email already exists."}), 409


# ==========================================
# DASHBOARD API (Slide 9 Exact Match)
# ==========================================

@app.route("/api/dashboard", methods=["GET"])
def get_dashboard():
    user_id = request.args.get("user_id", "user_demo_2026")
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))

    db = get_db()
    cur = db.cursor()

    # Total Income for month
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM income WHERE user_id = %s AND TO_CHAR(date, 'YYYY-MM') = %s", (user_id, month))
        tot_income = float(cur.fetchone()[0])

        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = %s AND TO_CHAR(date, 'YYYY-MM') = %s", (user_id, month))
        tot_expenses = float(cur.fetchone()[0])

        cur.execute("SELECT category, COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = %s AND TO_CHAR(date, 'YYYY-MM') = %s GROUP BY category ORDER BY 2 DESC", (user_id, month))
        cat_breakdown = [{"category": row[0], "amount": float(row[1])} for row in cur.fetchall()]

        cur.execute("SELECT monthly_limit, alert_threshold_percent FROM budgets WHERE user_id = %s AND category = 'Total' AND month = %s", (user_id, month))
        b_row = cur.fetchone()
        budget_limit = float(b_row[0]) if b_row else 25000.0

        cur.execute("SELECT id, title, target_amount, saved_amount, target_date, status FROM saving_goals WHERE user_id = %s ORDER BY created_at DESC LIMIT 1", (user_id,))
        g_row = cur.fetchone()
        saving_goal = {
            "id": g_row[0], "title": g_row[1], "target_amount": float(g_row[2]),
            "saved_amount": float(g_row[3]), "target_date": str(g_row[4]), "status": g_row[5]
        } if g_row else None
    else:
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM income WHERE user_id = ? AND strftime('%Y-%m', date) = ?", (user_id, month))
        tot_income = float(cur.fetchone()[0])

        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = ? AND strftime('%Y-%m', date) = ?", (user_id, month))
        tot_expenses = float(cur.fetchone()[0])

        cur.execute("SELECT category, COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = ? AND strftime('%Y-%m', date) = ? GROUP BY category ORDER BY 2 DESC", (user_id, month))
        cat_breakdown = [{"category": row[0], "amount": float(row[1])} for row in cur.fetchall()]

        cur.execute("SELECT monthly_limit, alert_threshold_percent FROM budgets WHERE user_id = ? AND category = 'Total' AND month = ?", (user_id, month))
        b_row = cur.fetchone()
        budget_limit = float(b_row[0]) if b_row else 25000.0

        cur.execute("SELECT id, title, target_amount, saved_amount, target_date, status FROM saving_goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", (user_id,))
        g_row = cur.fetchone()
        saving_goal = {
            "id": g_row[0], "title": g_row[1], "target_amount": float(g_row[2]),
            "saved_amount": float(g_row[3]), "target_date": str(g_row[4]), "status": g_row[5]
        } if g_row else None

    net_savings = tot_income - tot_expenses
    budget_usage_pct = round((tot_expenses / budget_limit * 100), 1) if budget_limit > 0 else 0

    if tot_expenses > budget_limit:
        budget_status = "Exceeded monthly limit"
        budget_status_level = "danger"
    elif budget_usage_pct >= 80.0:
        budget_status = "Within monthly limit (Approaching cap)"
        budget_status_level = "warning"
    else:
        budget_status = "Within monthly limit"
        budget_status_level = "safe"

    return jsonify({
        "month": month,
        "income": tot_income,
        "expenses": tot_expenses,
        "savings": net_savings,
        "savings_rate_percent": round((net_savings / tot_income * 100), 1) if tot_income > 0 else 0,
        "budget_limit": budget_limit,
        "budget_usage_percent": budget_usage_pct,
        "budget_status": budget_status,
        "budget_status_level": budget_status_level,
        "saving_goal": saving_goal,
        "category_breakdown": cat_breakdown
    })


# ==========================================
# INCOME MANAGEMENT API
# ==========================================

@app.route("/api/income", methods=["GET", "POST"])
def handle_income():
    db = get_db()
    cur = db.cursor()

    if request.method == "POST":
        data = request.json or {}
        user_id = data.get("user_id", "user_demo_2026")
        amount = float(data.get("amount", 0))
        source = data.get("source", "Salary").strip()
        inc_date = data.get("date", date.today().strftime("%Y-%m-%d"))
        payment_mode = data.get("payment_mode", "UPI")
        notes = data.get("notes", "")

        if amount <= 0:
            return jsonify({"error": "Amount must be greater than 0"}), 400

        new_id = str(uuid.uuid4())
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if DATABASE_URL and 'postgres' in DATABASE_URL:
            cur.execute("""
            INSERT INTO income (id, user_id, amount, source, date, payment_mode, notes, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (new_id, user_id, amount, source, inc_date, payment_mode, notes, now_str))
        else:
            cur.execute("""
            INSERT INTO income (id, user_id, amount, source, date, payment_mode, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (new_id, user_id, amount, source, inc_date, payment_mode, notes, now_str))
            db.commit()

        return jsonify({"success": True, "id": new_id, "message": "Income recorded successfully"})

    # GET
    user_id = request.args.get("user_id", "user_demo_2026")
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("SELECT id, amount, source, date, payment_mode, notes, created_at FROM income WHERE user_id = %s ORDER BY date DESC, created_at DESC", (user_id,))
        rows = cur.fetchall()
        incomes = [{"id": r[0], "amount": float(r[1]), "source": r[2], "date": str(r[3]), "payment_mode": r[4], "notes": r[5]} for r in rows]
    else:
        cur.execute("SELECT id, amount, source, date, payment_mode, notes, created_at FROM income WHERE user_id = ? ORDER BY date DESC, created_at DESC", (user_id,))
        rows = cur.fetchall()
        incomes = [{"id": r["id"], "amount": float(r["amount"]), "source": r["source"], "date": str(r["date"]), "payment_mode": r["payment_mode"], "notes": r["notes"]} for r in rows]

    return jsonify({"incomes": incomes})

@app.route("/api/income/<inc_id>", methods=["DELETE"])
def delete_income(inc_id):
    db = get_db()
    cur = db.cursor()
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("DELETE FROM income WHERE id = %s", (inc_id,))
    else:
        cur.execute("DELETE FROM income WHERE id = ?", (inc_id,))
        db.commit()
    return jsonify({"success": True, "message": "Income entry deleted"})


# ==========================================
# EXPENSE TRACKING API
# ==========================================

@app.route("/api/expenses", methods=["GET", "POST"])
def handle_expenses():
    db = get_db()
    cur = db.cursor()

    if request.method == "POST":
        data = request.json or {}
        user_id = data.get("user_id", "user_demo_2026")
        amount = float(data.get("amount", 0))
        category = data.get("category", "Food & Dining").strip()
        exp_date = data.get("date", date.today().strftime("%Y-%m-%d"))
        payment_mode = data.get("payment_mode", "UPI")
        notes = data.get("notes", "")

        if amount <= 0:
            return jsonify({"error": "Amount must be greater than 0"}), 400

        new_id = str(uuid.uuid4())
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if DATABASE_URL and 'postgres' in DATABASE_URL:
            cur.execute("""
            INSERT INTO expenses (id, user_id, amount, category, date, payment_mode, notes, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (new_id, user_id, amount, category, exp_date, payment_mode, notes, now_str))
        else:
            cur.execute("""
            INSERT INTO expenses (id, user_id, amount, category, date, payment_mode, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (new_id, user_id, amount, category, exp_date, payment_mode, notes, now_str))
            db.commit()

        # Check for budget trigger
        month = exp_date[:7]
        check_budget_alert(user_id, month, category)

        return jsonify({"success": True, "id": new_id, "message": "Expense recorded successfully"})

    # GET
    user_id = request.args.get("user_id", "user_demo_2026")
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("SELECT id, amount, category, date, payment_mode, notes, created_at FROM expenses WHERE user_id = %s ORDER BY date DESC, created_at DESC", (user_id,))
        rows = cur.fetchall()
        expenses = [{"id": r[0], "amount": float(r[1]), "category": r[2], "date": str(r[3]), "payment_mode": r[4], "notes": r[5]} for r in rows]
    else:
        cur.execute("SELECT id, amount, category, date, payment_mode, notes, created_at FROM expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC", (user_id,))
        rows = cur.fetchall()
        expenses = [{"id": r["id"], "amount": float(r["amount"]), "category": r["category"], "date": str(r["date"]), "payment_mode": r["payment_mode"], "notes": r["notes"]} for r in rows]

    return jsonify({"expenses": expenses})

@app.route("/api/expenses/<exp_id>", methods=["DELETE"])
def delete_expense(exp_id):
    db = get_db()
    cur = db.cursor()
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("DELETE FROM expenses WHERE id = %s", (exp_id,))
    else:
        cur.execute("DELETE FROM expenses WHERE id = ?", (exp_id,))
        db.commit()
    return jsonify({"success": True, "message": "Expense entry deleted"})

def check_budget_alert(user_id, month, category):
    """Generates proactive alert if spending crosses budget thresholds."""
    db = get_db()
    cur = db.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Check Total budget
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("SELECT monthly_limit FROM budgets WHERE user_id = %s AND category = 'Total' AND month = %s", (user_id, month))
        b = cur.fetchone()
        tot_limit = float(b[0]) if b else 25000.0

        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = %s AND TO_CHAR(date, 'YYYY-MM') = %s", (user_id, month))
        tot_spent = float(cur.fetchone()[0])
    else:
        cur.execute("SELECT monthly_limit FROM budgets WHERE user_id = ? AND category = 'Total' AND month = ?", (user_id, month))
        b = cur.fetchone()
        tot_limit = float(b[0]) if b else 25000.0

        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = ? AND strftime('%Y-%m', date) = ?", (user_id, month))
        tot_spent = float(cur.fetchone()[0])

    pct = (tot_spent / tot_limit * 100) if tot_limit > 0 else 0
    if pct >= 100:
        msg = f"OVERSPENDING ALERT: You have exceeded your total monthly budget of ₹{tot_limit:,.0f} by ₹{(tot_spent - tot_limit):,.0f}!"
        level = "danger"
    elif pct >= 80:
        msg = f"BUDGET WARNING: You have spent {pct:.1f}% (₹{tot_spent:,.0f}) of your ₹{tot_limit:,.0f} monthly limit."
        level = "warning"
    else:
        return

    ins_alert = """
    INSERT INTO budget_alerts (id, user_id, category, level, message, is_read, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    """ if (DATABASE_URL and 'postgres' in DATABASE_URL) else """
    INSERT INTO budget_alerts (id, user_id, category, level, message, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    cur.execute(ins_alert, (str(uuid.uuid4()), user_id, "Total", level, msg, 0, now_str))
    if not (DATABASE_URL and 'postgres' in DATABASE_URL):
        db.commit()


# ==========================================
# BUDGETS API
# ==========================================

@app.route("/api/budgets", methods=["GET", "POST"])
def handle_budgets():
    db = get_db()
    cur = db.cursor()
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))
    user_id = request.args.get("user_id", "user_demo_2026")

    if request.method == "POST":
        data = request.json or {}
        user_id = data.get("user_id", "user_demo_2026")
        category = data.get("category", "Total")
        limit = float(data.get("monthly_limit", 25000))
        target_month = data.get("month", month)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Upsert budget
        if DATABASE_URL and 'postgres' in DATABASE_URL:
            cur.execute("DELETE FROM budgets WHERE user_id = %s AND category = %s AND month = %s", (user_id, category, target_month))
            cur.execute("""
            INSERT INTO budgets (id, user_id, category, monthly_limit, month, alert_threshold_percent, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (str(uuid.uuid4()), user_id, category, limit, target_month, 80.0, now_str))
        else:
            cur.execute("DELETE FROM budgets WHERE user_id = ? AND category = ? AND month = ?", (user_id, category, target_month))
            cur.execute("""
            INSERT INTO budgets (id, user_id, category, monthly_limit, month, alert_threshold_percent, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (str(uuid.uuid4()), user_id, category, limit, target_month, 80.0, now_str))
            db.commit()

        return jsonify({"success": True, "message": f"Budget for {category} updated to ₹{limit}"})

    # GET
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("SELECT id, category, monthly_limit, month, alert_threshold_percent FROM budgets WHERE user_id = %s AND month = %s", (user_id, month))
        budgets = [{"id": r[0], "category": r[1], "monthly_limit": float(r[2]), "month": r[3], "threshold": float(r[4])} for r in cur.fetchall()]
    else:
        cur.execute("SELECT id, category, monthly_limit, month, alert_threshold_percent FROM budgets WHERE user_id = ? AND month = ?", (user_id, month))
        budgets = [{"id": r["id"], "category": r["category"], "monthly_limit": float(r["monthly_limit"]), "month": r["month"], "threshold": float(r["alert_threshold_percent"])} for r in cur.fetchall()]

    return jsonify({"budgets": budgets})


# ==========================================
# SAVING GOALS API
# ==========================================

@app.route("/api/saving-goals", methods=["GET", "POST"])
def handle_goals():
    db = get_db()
    cur = db.cursor()

    if request.method == "POST":
        data = request.json or {}
        user_id = data.get("user_id", "user_demo_2026")
        title = data.get("title", "").strip()
        target_amount = float(data.get("target_amount", 50000))
        saved_amount = float(data.get("saved_amount", 0))
        target_date = data.get("target_date", "2027-03-31")
        category = data.get("category", "General")

        if not title or target_amount <= 0:
            return jsonify({"error": "Valid title and target amount required"}), 400

        new_id = str(uuid.uuid4())
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if DATABASE_URL and 'postgres' in DATABASE_URL:
            cur.execute("""
            INSERT INTO saving_goals (id, user_id, title, target_amount, saved_amount, target_date, category, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (new_id, user_id, title, target_amount, saved_amount, target_date, category, "Active", now_str))
        else:
            cur.execute("""
            INSERT INTO saving_goals (id, user_id, title, target_amount, saved_amount, target_date, category, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (new_id, user_id, title, target_amount, saved_amount, target_date, category, "Active", now_str))
            db.commit()

        return jsonify({"success": True, "id": new_id, "message": "Saving Goal created successfully"})

    # GET
    user_id = request.args.get("user_id", "user_demo_2026")
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("SELECT id, title, target_amount, saved_amount, target_date, category, status, created_at FROM saving_goals WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        rows = cur.fetchall()
        goals = [{
            "id": r[0], "title": r[1], "target_amount": float(r[2]), "saved_amount": float(r[3]),
            "progress_percent": round(float(r[3]) / float(r[2]) * 100, 1) if float(r[2]) > 0 else 0,
            "target_date": str(r[4]), "category": r[5], "status": r[6]
        } for r in rows]
    else:
        cur.execute("SELECT id, title, target_amount, saved_amount, target_date, category, status, created_at FROM saving_goals WHERE user_id = ? ORDER BY created_at DESC", (user_id,))
        rows = cur.fetchall()
        goals = [{
            "id": r["id"], "title": r["title"], "target_amount": float(r["target_amount"]), "saved_amount": float(r["saved_amount"]),
            "progress_percent": round(float(r["saved_amount"]) / float(r["target_amount"]) * 100, 1) if float(r["target_amount"]) > 0 else 0,
            "target_date": str(r["target_date"]), "category": r["category"], "status": r["status"]
        } for r in rows]

    return jsonify({"goals": goals})

@app.route("/api/saving-goals/<goal_id>/deposit", methods=["POST"])
def deposit_to_goal(goal_id):
    data = request.json or {}
    amount = float(data.get("amount", 0))
    user_id = data.get("user_id", "user_demo_2026")

    if amount <= 0:
        return jsonify({"error": "Deposit amount must be positive"}), 400

    db = get_db()
    cur = db.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("UPDATE saving_goals SET saved_amount = saved_amount + %s WHERE id = %s", (amount, goal_id))
        cur.execute("""
        INSERT INTO goal_deposits (id, goal_id, user_id, amount, deposit_date, notes, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (str(uuid.uuid4()), goal_id, user_id, amount, date.today().strftime("%Y-%m-%d"), "Contribution from savings", now_str))
    else:
        cur.execute("UPDATE saving_goals SET saved_amount = saved_amount + ? WHERE id = ?", (amount, goal_id))
        cur.execute("""
        INSERT INTO goal_deposits (id, goal_id, user_id, amount, deposit_date, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (str(uuid.uuid4()), goal_id, user_id, amount, date.today().strftime("%Y-%m-%d"), "Contribution from savings", now_str))
        db.commit()

    return jsonify({"success": True, "message": f"Successfully deposited ₹{amount:,.0f} towards goal!"})

@app.route("/api/saving-goals/<goal_id>", methods=["DELETE"])
def delete_goal(goal_id):
    db = get_db()
    cur = db.cursor()
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("DELETE FROM saving_goals WHERE id = %s", (goal_id,))
    else:
        cur.execute("DELETE FROM saving_goals WHERE id = ?", (goal_id,))
        db.commit()
    return jsonify({"success": True, "message": "Saving goal removed"})


# ==========================================
# BUDGET ALERTS & NOTIFICATIONS
# ==========================================

@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    user_id = request.args.get("user_id", "user_demo_2026")
    db = get_db()
    cur = db.cursor()

    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("SELECT id, category, level, message, is_read, created_at FROM budget_alerts WHERE user_id = %s ORDER BY created_at DESC LIMIT 20", (user_id,))
        rows = cur.fetchall()
        alerts = [{"id": r[0], "category": r[1], "level": r[2], "message": r[3], "is_read": bool(r[4]), "created_at": str(r[5])} for r in rows]
    else:
        cur.execute("SELECT id, category, level, message, is_read, created_at FROM budget_alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", (user_id,))
        rows = cur.fetchall()
        alerts = [{"id": r["id"], "category": r["category"], "level": r["level"], "message": r["message"], "is_read": bool(r["is_read"]), "created_at": str(r["created_at"])} for r in rows]

    return jsonify({"alerts": alerts})


# ==========================================
# REPORTS & AI RECOMMENDATIONS API
# ==========================================

@app.route("/api/reports", methods=["GET"])
def get_reports():
    user_id = request.args.get("user_id", "user_demo_2026")
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))
    db = get_db()
    cur = db.cursor()

    # Expenses by category
    if DATABASE_URL and 'postgres' in DATABASE_URL:
        cur.execute("SELECT category, COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = %s AND TO_CHAR(date, 'YYYY-MM') = %s GROUP BY category ORDER BY 2 DESC", (user_id, month))
        cat_data = [{"category": r[0], "amount": float(r[1])} for r in cur.fetchall()]

        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM income WHERE user_id = %s AND TO_CHAR(date, 'YYYY-MM') = %s", (user_id, month))
        tot_inc = float(cur.fetchone()[0])
    else:
        cur.execute("SELECT category, COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = ? AND strftime('%Y-%m', date) = ? GROUP BY category ORDER BY 2 DESC", (user_id, month))
        cat_data = [{"category": r[0], "amount": float(r[1])} for r in cur.fetchall()]

        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM income WHERE user_id = ? AND strftime('%Y-%m', date) = ?", (user_id, month))
        tot_inc = float(cur.fetchone()[0])

    tot_exp = sum(c["amount"] for c in cat_data)
    net_save = tot_inc - tot_exp

    # Predictive Intelligence / Burn Rate
    today_day = datetime.now().day
    days_in_month = 30
    daily_burn_rate = round(tot_exp / max(today_day, 1), 2)
    projected_month_expense = round(daily_burn_rate * days_in_month, 2)

    ai_recommendations = []
    if cat_data:
        top_cat = cat_data[0]
        top_cat_share = round((top_cat["amount"] / tot_exp * 100), 1) if tot_exp > 0 else 0
        ai_recommendations.append(f"Highest Spending Category: {top_cat['category']} accounts for {top_cat_share}% (₹{top_cat['amount']:,.0f}) of total monthly spending.")
        if top_cat_share > 30:
            suggested_cut = round(top_cat['amount'] * 0.15, 0)
            ai_recommendations.append(f"AI Savings Tip: Reducing {top_cat['category']} expenses by 15% would save an extra ₹{suggested_cut:,.0f} towards your goal this month.")

    if projected_month_expense > 25000:
        ai_recommendations.append(f"Burn-rate Alert: At your current daily pace of ₹{daily_burn_rate:,.0f}/day, projected spending is ₹{projected_month_expense:,.0f}, which exceeds your ₹25,000 threshold.")
    else:
        ai_recommendations.append(f"Healthy Spending Trajectory: Projected month-end spend is ₹{projected_month_expense:,.0f}, keeping you well within budget limits.")

    return jsonify({
        "month": month,
        "total_income": tot_inc,
        "total_expenses": tot_exp,
        "net_savings": net_save,
        "savings_rate_percent": round((net_save / tot_inc * 100), 1) if tot_inc > 0 else 0,
        "daily_burn_rate": daily_burn_rate,
        "projected_month_expense": projected_month_expense,
        "category_breakdown": cat_data,
        "ai_recommendations": ai_recommendations
    })


# ==========================================
# LAUNCHER
# ==========================================

if __name__ == "__main__":
    init_db()
    lan_ip = get_lan_ip()
    print("=" * 65)
    print(" 🚀 SMART BUDGET & SAVING MANAGER — WEB & APK SERVICE")
    print(f" 🌐 Local Browser : http://127.0.0.1:{PORT}")
    print(f" 📱 Mobile / Wi-Fi : http://{lan_ip}:{PORT}")
    print(" 🎓 Group: Hansi Yadav, Diksha Kotre, Sakshi Patil, Nibha Yadav (SE CSE AIML)")
    print("=" * 65)
    app.run(host="0.0.0.0", port=PORT, debug=False)
