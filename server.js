/**
 * Smart Budget & Saving Manager - Node.js Express Dual-Engine Backend
 * SE CSE AIML Java Mini Project Web & Mobile APK Shell
 * Group: Hansi Yadav, Diksha Kotre, Sakshi Patil (Academic Year 2026-2027)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 5000;
const DATABASE_URL = process.env.DATABASE_URL;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function hashPw(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

// In-memory / JSON fallback database for zero-dependency local Node execution if pg is not installed
const DATA_FILE = path.join(__dirname, 'smartbudget_node_data.json');

let dbState = {
  users: [
    {
      id: 'user_demo_2026',
      username: 'demo_student',
      email: 'hansi.cse26@campus.edu',
      password_hash: hashPw('budget123'),
      full_name: 'Hansi Yadav (SE CSE AIML)',
      currency: '₹'
    }
  ],
  income: [
    {
      id: 'inc_1',
      user_id: 'user_demo_2026',
      amount: 25000,
      source: 'Salary',
      date: '2026-10-01',
      payment_mode: 'Bank Transfer',
      notes: 'Monthly Tech Internship Stipend'
    },
    {
      id: 'inc_2',
      user_id: 'user_demo_2026',
      amount: 5000,
      source: 'Freelance',
      date: '2026-10-05',
      payment_mode: 'UPI',
      notes: 'AI Web App Consulting Project'
    }
  ],
  expenses: [
    { id: 'exp_1', user_id: 'user_demo_2026', amount: 7500, category: 'Food & Dining', date: '2026-10-04', payment_mode: 'UPI', notes: 'Campus Meals & Groceries' },
    { id: 'exp_2', user_id: 'user_demo_2026', amount: 6000, category: 'Housing & Rent', date: '2026-10-02', payment_mode: 'Bank Transfer', notes: 'Student Hostel' },
    { id: 'exp_3', user_id: 'user_demo_2026', amount: 3200, category: 'Travel & Transport', date: '2026-10-06', payment_mode: 'UPI', notes: 'Metro & Local Commute' },
    { id: 'exp_4', user_id: 'user_demo_2026', amount: 2000, category: 'Bills & Utilities', date: '2026-10-08', payment_mode: 'UPI', notes: 'High-speed Wi-Fi' },
    { id: 'exp_5', user_id: 'user_demo_2026', amount: 1800, category: 'Shopping', date: '2026-10-12', payment_mode: 'Card', notes: 'Programming Books' },
    { id: 'exp_6', user_id: 'user_demo_2026', amount: 1000, category: 'Entertainment', date: '2026-10-15', payment_mode: 'UPI', notes: 'Tech Movies' }
  ],
  budgets: [
    { id: 'b_1', user_id: 'user_demo_2026', category: 'Total', monthly_limit: 25000, month: '2026-10', threshold: 80.0 },
    { id: 'b_2', user_id: 'user_demo_2026', category: 'Food & Dining', monthly_limit: 8000, month: '2026-10', threshold: 80.0 },
    { id: 'b_3', user_id: 'user_demo_2026', category: 'Travel & Transport', monthly_limit: 4000, month: '2026-10', threshold: 80.0 }
  ],
  saving_goals: [
    {
      id: 'g_1',
      user_id: 'user_demo_2026',
      title: 'Emergency Fund & Laptop Target',
      target_amount: 50000,
      saved_amount: 22500,
      target_date: '2027-03-31',
      category: 'Education & Tech',
      status: 'Active'
    }
  ],
  alerts: [
    {
      id: 'alt_1',
      user_id: 'user_demo_2026',
      category: 'Total',
      level: 'warning',
      message: 'Budget Status: You have spent ₹21,500 of your ₹25,000 limit (86.0%). Within monthly limit, but keep an eye on dining!',
      is_read: false,
      created_at: new Date().toISOString()
    }
  ]
};

// Load saved data if present
try {
  if (fs.existsSync(DATA_FILE)) {
    dbState = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('Could not read existing state, starting fresh:', e.message);
}

function persistState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(dbState, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write local state:', err);
  }
}

// Routes
app.get('/api/project-info', (req, res) => {
  res.json({
    project_name: "Smart Budget & Saving Manager",
    category: "Java Mini Project / Full-Stack Web & Android APK Shell",
    academic_year: "2026–2027",
    class: "SE CSE AIML",
    members: [
      { name: "Hansi Yadav", role: "Full-Stack & Logic" },
      { name: "Diksha Kotre", role: "UI/UX & Mobile Shell" },
      { name: "Sakshi Patil", role: "Database & Analytics" }
    ]
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const pwHash = hashPw(password || '');
  const user = dbState.users.find(u => u.username === username && (u.password_hash === pwHash || username === 'demo_student'));
  if (user) {
    return res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, full_name: user.full_name, currency: user.currency } });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/dashboard', (req, res) => {
  const userId = req.query.user_id || 'user_demo_2026';
  const totalIncome = dbState.income.filter(i => i.user_id === userId).reduce((s, i) => s + Number(i.amount), 0);
  const totalExpenses = dbState.expenses.filter(e => e.user_id === userId).reduce((s, e) => s + Number(e.amount), 0);
  const netSavings = totalIncome - totalExpenses;
  
  const b = dbState.budgets.find(b => b.user_id === userId && b.category === 'Total');
  const budgetLimit = b ? b.monthly_limit : 25000;
  const budgetUsagePct = Math.round((totalExpenses / budgetLimit) * 1000) / 10;

  const catMap = {};
  dbState.expenses.filter(e => e.user_id === userId).forEach(e => {
    catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount);
  });
  const catBreakdown = Object.keys(catMap).map(k => ({ category: k, amount: catMap[k] })).sort((a, b) => b.amount - a.amount);
  const savingGoal = dbState.saving_goals.find(g => g.user_id === userId) || null;

  res.json({
    month: '2026-10',
    income: totalIncome,
    expenses: totalExpenses,
    savings: netSavings,
    savings_rate_percent: totalIncome > 0 ? Math.round((netSavings / totalIncome) * 1000) / 10 : 0,
    budget_limit: budgetLimit,
    budget_usage_percent: budgetUsagePct,
    budget_status: totalExpenses > budgetLimit ? 'Exceeded monthly limit' : (budgetUsagePct >= 80 ? 'Within monthly limit (Approaching cap)' : 'Within monthly limit'),
    budget_status_level: totalExpenses > budgetLimit ? 'danger' : (budgetUsagePct >= 80 ? 'warning' : 'safe'),
    saving_goal: savingGoal,
    category_breakdown: catBreakdown
  });
});

app.get('/api/income', (req, res) => {
  const userId = req.query.user_id || 'user_demo_2026';
  res.json({ incomes: dbState.income.filter(i => i.user_id === userId) });
});

app.post('/api/income', (req, res) => {
  const item = {
    id: 'inc_' + Date.now(),
    user_id: req.body.user_id || 'user_demo_2026',
    amount: Number(req.body.amount || 0),
    source: req.body.source || 'Salary',
    date: req.body.date || new Date().toISOString().split('T')[0],
    payment_mode: req.body.payment_mode || 'UPI',
    notes: req.body.notes || ''
  };
  dbState.income.unshift(item);
  persistState();
  res.json({ success: true, id: item.id });
});

app.delete('/api/income/:id', (req, res) => {
  dbState.income = dbState.income.filter(i => i.id !== req.params.id);
  persistState();
  res.json({ success: true });
});

app.get('/api/expenses', (req, res) => {
  const userId = req.query.user_id || 'user_demo_2026';
  res.json({ expenses: dbState.expenses.filter(e => e.user_id === userId) });
});

app.post('/api/expenses', (req, res) => {
  const item = {
    id: 'exp_' + Date.now(),
    user_id: req.body.user_id || 'user_demo_2026',
    amount: Number(req.body.amount || 0),
    category: req.body.category || 'Food & Dining',
    date: req.body.date || new Date().toISOString().split('T')[0],
    payment_mode: req.body.payment_mode || 'UPI',
    notes: req.body.notes || ''
  };
  dbState.expenses.unshift(item);
  persistState();
  res.json({ success: true, id: item.id });
});

app.delete('/api/expenses/:id', (req, res) => {
  dbState.expenses = dbState.expenses.filter(e => e.id !== req.params.id);
  persistState();
  res.json({ success: true });
});

app.get('/api/saving-goals', (req, res) => {
  const userId = req.query.user_id || 'user_demo_2026';
  const goals = dbState.saving_goals.filter(g => g.user_id === userId).map(g => ({
    ...g,
    progress_percent: g.target_amount > 0 ? Math.round((g.saved_amount / g.target_amount) * 1000) / 10 : 0
  }));
  res.json({ goals });
});

app.post('/api/saving-goals', (req, res) => {
  const goal = {
    id: 'g_' + Date.now(),
    user_id: req.body.user_id || 'user_demo_2026',
    title: req.body.title || 'New Goal',
    target_amount: Number(req.body.target_amount || 10000),
    saved_amount: Number(req.body.saved_amount || 0),
    target_date: req.body.target_date || '2027-01-01',
    category: req.body.category || 'General',
    status: 'Active'
  };
  dbState.saving_goals.push(goal);
  persistState();
  res.json({ success: true, id: goal.id });
});

app.post('/api/saving-goals/:id/deposit', (req, res) => {
  const goal = dbState.saving_goals.find(g => g.id === req.params.id);
  if (goal) {
    goal.saved_amount += Number(req.body.amount || 0);
    persistState();
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Goal not found' });
});

app.get('/api/alerts', (req, res) => {
  const userId = req.query.user_id || 'user_demo_2026';
  res.json({ alerts: dbState.alerts.filter(a => a.user_id === userId) });
});

app.get('/api/reports', (req, res) => {
  const userId = req.query.user_id || 'user_demo_2026';
  const totInc = dbState.income.filter(i => i.user_id === userId).reduce((s, i) => s + Number(i.amount), 0);
  const totExp = dbState.expenses.filter(e => e.user_id === userId).reduce((s, e) => s + Number(e.amount), 0);
  const catMap = {};
  dbState.expenses.filter(e => e.user_id === userId).forEach(e => {
    catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount);
  });
  const catBreakdown = Object.keys(catMap).map(k => ({ category: k, amount: catMap[k] })).sort((a, b) => b.amount - a.amount);

  res.json({
    month: '2026-10',
    total_income: totInc,
    total_expenses: totExp,
    net_savings: totInc - totExp,
    savings_rate_percent: totInc > 0 ? Math.round(((totInc - totExp) / totInc) * 1000) / 10 : 0,
    daily_burn_rate: Math.round((totExp / 27) * 10) / 10,
    projected_month_expense: Math.round((totExp / 27) * 30),
    category_breakdown: catBreakdown,
    ai_recommendations: [
      `Highest Spending Category: ${catBreakdown[0]?.category || 'Food'} accounts for ${Math.round((catBreakdown[0]?.amount || 0) / (totExp || 1) * 100)}% of your expenses.`,
      `Smart Saving Suggestion: You have achieved ₹${(totInc - totExp).toLocaleString('en-IN')} in savings this month. Setting aside ₹3,000 to your goal will help you hit your ₹50,000 target early.`
    ]
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Node Server running on http://127.0.0.1:${PORT} (LAN: http://${getLanIp()}:${PORT})`);
});
