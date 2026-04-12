require('dotenv').config();
const express    = require('express');
const { nanoid } = require('nanoid');
const path       = require('path');
const bcrypt     = require('bcrypt');
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const { Pool }   = require('pg');
const rateLimit  = require('express-rate-limit');
const passport   = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app      = express();
const PORT     = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || null;

// ── Database ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      google_id     TEXT UNIQUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    DO $$ BEGIN
      ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    EXCEPTION WHEN others THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
    EXCEPTION WHEN duplicate_column THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS urls (
      id           SERIAL PRIMARY KEY,
      code         TEXT UNIQUE NOT NULL,
      original_url TEXT NOT NULL,
      user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type         TEXT NOT NULL DEFAULT 'public',
      expires_at   TIMESTAMPTZ,
      clicks       INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.set('trust proxy', 1); // trust Railway/Render/AWS reverse proxy

app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'a-very-secret-default-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use(express.static(path.join(__dirname, 'public')));

// ── Passport Config ───────────────────────────────────────────────────────────
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [id]);
    done(null, rows[0]);
  } catch (err) {
    done(err, null);
  }
});
app.use(passport.initialize());
app.use(passport.session());

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const googleId = profile.id;
      let username = profile.displayName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);

      // Check if user exists by google_id
      let { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
      if (rows.length) return done(null, rows[0]);

      // Check if user exists by email but no google_id
      rows = (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows;
      if (rows.length) {
        const user = rows[0];
        await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
        return done(null, user);
      }

      // Ensure username uniqueness
      let attempts = 0;
      let uniqueUsername = username;
      while (true) {
        const res = await pool.query('SELECT id FROM users WHERE username = $1', [uniqueUsername]);
        if (res.rows.length === 0) break;
        uniqueUsername = username + Math.floor(Math.random() * 1000);
        if (++attempts > 10) throw new Error('Could not generate unique username');
      }

      // Create new user
      const res = await pool.query(
        'INSERT INTO users (username, email, google_id) VALUES ($1, $2, $3) RETURNING *',
        [uniqueUsername, email, googleId]
      );
      done(null, res.rows[0]);
    } catch (err) {
      done(err, null);
    }
  }));
}

// ── Rate limiters ─────────────────────────────────────────────────────────────
const shortenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId && !req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function getUserId(req) {
  return req.session.userId || (req.user && req.user.id) || null;
}

function formatUrl(req, row) {
  return {
    code:        row.code,
    shortUrl:    `${BASE_URL || `${req.protocol}://${req.get('host')}`}/${row.code}`,
    originalUrl: row.original_url,
    type:        row.type,
    expiresAt:   row.expires_at,
    clicks:      row.clicks,
    createdAt:   row.created_at,
    userId:      row.user_id,
  };
}

// ── Auth routes ───────────────────────────────────────────────────────────────

app.get('/api/auth/me', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json(null);
  const { rows } = await pool.query(
    'SELECT id, username, email FROM users WHERE id = $1',
    [userId]
  );
  res.json(rows[0] || null);
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
      [username.trim(), email.trim().toLowerCase(), hash]
    );
    const user = rows[0];
    req.session.userId   = user.id;
    req.session.username = user.username;
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'Username or email already taken' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email.trim().toLowerCase()]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'Invalid email or password' });
  req.session.userId   = user.id;
  req.session.username = user.username;
  res.json({ id: user.id, username: user.username });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.logout) {
    req.logout((err) => {
      if (err) return res.status(500).json({ error: 'Logout failed' });
      req.session.destroy(() => res.json({ success: true }));
    });
  } else {
    req.session.destroy(() => res.json({ success: true }));
  }
});

// Google Auth
app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/?error=login_failed' }), (req, res) => {
  res.redirect('/');
});

// ── URL routes ────────────────────────────────────────────────────────────────

app.post('/api/shorten', shortenLimiter, async (req, res) => {
  const { url, type = 'public', expiresIn, alias } = req.body;
  const userId = getUserId(req);

  if (!url) return res.status(400).json({ error: 'URL is required' });
  try { new URL(url); } catch {
    return res.status(400).json({ error: 'Invalid URL. Make sure to include http:// or https://' });
  }

  if (type === 'private' && !userId)
    return res.status(401).json({ error: 'Log in to create private links' });

  // Resolve short code
  let code;
  if (alias && alias.trim()) {
    code = alias.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(code))
      return res.status(400).json({ error: 'Alias can only contain letters, numbers, - and _' });
    const { rows } = await pool.query('SELECT id FROM urls WHERE code = $1', [code]);
    if (rows.length) return res.status(409).json({ error: 'That alias is already taken' });
  } else {
    code = nanoid(7);
  }

  // Expiry
  let expiresAt = null;
  if (type === 'temporary') {
    const durations = { '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
    const ms = durations[expiresIn] || durations['24h'];
    expiresAt = new Date(Date.now() + ms).toISOString();
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO urls (code, original_url, user_id, type, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [code, url, userId, type, expiresAt]
    );
    res.json(formatUrl(req, rows[0]));
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'Code conflict, please try again' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/urls', async (req, res) => {
  const userId = getUserId(req);
  const { rows } = userId
    ? await pool.query(
        'SELECT * FROM urls WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      )
    : await pool.query(
        "SELECT * FROM urls WHERE type = 'public' ORDER BY created_at DESC"
      );
  res.json(rows.map(r => formatUrl(req, r)));
});

app.delete('/api/urls/:code', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { rows } = await pool.query('SELECT * FROM urls WHERE code = $1', [req.params.code]);
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });
  await pool.query('DELETE FROM urls WHERE code = $1', [req.params.code]);
  res.json({ success: true });
});

// ── Redirect ──────────────────────────────────────────────────────────────────
app.get('/:code', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM urls WHERE code = $1', [req.params.code]);
  const row = rows[0];
  if (!row) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    await pool.query('DELETE FROM urls WHERE code = $1', [row.code]);
    return res.status(410).sendFile(path.join(__dirname, 'public', '404.html'));
  }

  await pool.query('UPDATE urls SET clicks = clicks + 1 WHERE code = $1', [row.code]);
  res.redirect(row.original_url);
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  // Local dev
  initDB()
    .then(() => app.listen(PORT, () => console.log(`Linkly running at http://localhost:${PORT}`)))
    .catch(err => { console.error('DB init failed:', err); process.exit(1); });
} else {
  // Vercel serverless
  initDB().catch(console.error);
}

module.exports = app;
