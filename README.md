# Liuyurl — URL Shortener

A full-stack URL shortener with user authentication, link types, and click tracking.

## Features

- Shorten any URL instantly — no account required
- **Link types** — Public, Private, or Temporary
- **Custom aliases** — pick your own short code (e.g. `/my-link`)
- **Expiry** — temporary links auto-delete after 1h, 24h, 7d, or 30d
- **Click tracking** — see how many times each link was clicked
- **User accounts** — register and manage your own links (with Google OAuth support)
- **Rate limiting** — abuse protection on shorten and auth routes

## Stack

- Node.js + Express
- PostgreSQL
- Vanilla JS / HTML / CSS

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file:
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/linkly
   SESSION_SECRET=any-long-random-string
   BASE_URL=http://localhost:3000
   NODE_ENV=development
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   ```

3. Run:
   ```bash
   npm run dev
   ```

Tables are created automatically on first run.

## Deploy to Vercel

1. Get a free PostgreSQL database from [Neon](https://neon.tech)
2. Push this repo to GitHub and import it on [Vercel](https://vercel.com)
3. Add these environment variables in Vercel → Settings → Environment Variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon connection string |
   | `SESSION_SECRET` | Any long random string |
   | `NODE_ENV` | `production` |
   | `BASE_URL` | Your Vercel URL |
   | `GOOGLE_CLIENT_ID` | Your Google API Client ID |
   | `GOOGLE_CLIENT_SECRET` | Your Google API Client Secret |

4. Deploy — schema initializes automatically on first boot.

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/shorten` | Create a short link |
| `GET` | `/api/urls` | List links |
| `DELETE` | `/api/urls/:code` | Delete a link (owner only) |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/register` | Register |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/:code` | Redirect to original URL |
