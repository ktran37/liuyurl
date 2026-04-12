# Linkly — URL Shortener

A clean, full-stack URL shortener with user authentication, link types, and click tracking. Built with Node.js, Express, and PostgreSQL.

## Features

- Shorten any URL instantly (no account required)
- **Link types** — Public, Private, or Temporary
- **Custom aliases** — choose your own short code (e.g. `/my-link`)
- **Expiry** — temporary links auto-delete after 1h, 24h, 7d, or 30d
- **Click tracking** — see how many times each link was clicked
- **User accounts** — register/login to manage your own links
- **Rate limiting** — brute-force and abuse protection built in

## Tech Stack

- **Backend** — Node.js, Express
- **Database** — PostgreSQL (via `pg`)
- **Auth** — bcrypt password hashing, express-session with pg session store
- **Frontend** — Vanilla JS, HTML, CSS (no framework)

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL database (local or remote)

### Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/linkly.git
   cd linkly
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the project root:
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/linkly
   SESSION_SECRET=your-long-random-secret
   BASE_URL=http://localhost:3000
   NODE_ENV=development
   ```

4. Start the server:
   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`

The database tables are created automatically on first run.

## Deployment (Vercel + Neon)

1. Create a free PostgreSQL database at [neon.tech](https://neon.tech)
2. Push the repo to GitHub
3. Import the project on [vercel.com](https://vercel.com)
4. Set environment variables in Vercel → Settings → Environment Variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Your Neon connection string |
   | `SESSION_SECRET` | A long random string |
   | `NODE_ENV` | `production` |
   | `BASE_URL` | Your Vercel URL (e.g. `https://linkly.vercel.app`) |

5. Deploy — the database schema is initialized automatically.

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/shorten` | Create a short URL |
| `GET` | `/api/urls` | List URLs (own links if logged in, public if not) |
| `DELETE` | `/api/urls/:code` | Delete a link (owner only) |
| `GET` | `/api/auth/me` | Get current user |
| `POST` | `/api/auth/register` | Register |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/:code` | Redirect to original URL |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Secret for signing session cookies |
| `NODE_ENV` | No | Set to `production` in prod |
| `BASE_URL` | No | Public base URL for generating short links |
| `PORT` | No | Port to listen on (default: 3000) |
