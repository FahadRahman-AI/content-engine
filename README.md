# Forward Thinking Co content engine

Researches, writes, designs, reviews, posts and learns from one Instagram carousel a day for
@forwardthinkingco (operated by Studio FX). Every day at 21:00 (Europe/London) it drafts tomorrow's
post and emails it to you; you approve it; at 07:00 it posts.

## How a day works
1. **21:00** the engine picks the pillar, researches, writes the post, has a second pass fact-check it, renders the slides and emails you.
2. **You** click Approve or Reject (with a note) in the email.
3. **07:00** it posts to Instagram if you approved. A post that fails the fact-check is never published; that day is skipped and you get an email.

Two modes (stored in the database, `MODE` is just the starting value):
- **draft**: posts only what you approved.
- **auto**: posts at 07:00 unless you rejected it.

**Emergency stop:** every email has a *Pause all publishing* link (and a *Resume* link).

## One-time setup

### 1. Supabase (database)
1. Create a project. In **SQL Editor** run all of `supabase/schema.sql`.
2. Click **Connect**, copy the **Session pooler** connection string, replace `[YOUR-PASSWORD]` with your database password (no square brackets) and put it in `.env` as `DATABASE_URL`.
3. `npm run dbcheck` should show `saved OK`, then `npm run seed` loads the example posts.

### 2. Keys in `.env`
Copy `.env.example` to `.env` and fill it in:
- `ANTHROPIC_API_KEY` from console.anthropic.com, `CLAUDE_MODEL=claude-opus-5-5`.
- `GMAIL_USER` and `GMAIL_APP_PASSWORD` (an app password from myaccount.google.com/apppasswords; needs 2-step verification).
- `APPROVAL_SECRET`: run `openssl rand -hex 32` and paste the result.
- `NOTES_PASSWORD`: any password. It protects the `/notes` page.
- `BASE_URL`: your public address (see Deploy). Use `http://localhost:3000` only for testing on your own computer.

### 3. Brand files
Fill in the catchphrase in `brand/brief.md` and check `brand/products.md` describes only things that really exist.

### 4. Instagram (Meta)
You need a **Creator or Business** Instagram account.
1. developers.facebook.com, log in, **My Apps → Create App**. Use case **Other**, app type **Business**.
2. In the app, add the **Instagram** product and choose **API setup with Instagram business login**.
3. **App roles → Roles → Add People → Instagram Tester**: enter the Instagram username. Accept the invite at instagram.com/accounts/manage_access (Tester Invites tab).
4. Back on **API setup with Instagram business login**: **Add account**, then **Generate token**. Put it in `.env` as `IG_ACCESS_TOKEN`.
5. Get the account ID (use your own token):
   `curl "https://graph.instagram.com/v25.0/me?fields=user_id,username&access_token=TOKEN"`
   and put `user_id` in `.env` as `IG_USER_ID`.

The token lasts 60 days. The engine renews it automatically when it is 50 days old.

### 5. Deploy (Railway)
Instagram downloads the slide images from your server, and your phone needs to reach the Approve button, so the engine must run at a public https address.
1. Push this folder to a private GitHub repo (`.env` is ignored, never commit it).
2. railway.app: **New Project → Deploy from GitHub repo**. It builds from the `Dockerfile` using `railway.toml`.
3. **Variables**: add every line from your `.env` (including `DATABASE_URL`).
4. **Settings → Networking → Generate Domain**. Put that `https://…up.railway.app` address into the `BASE_URL` variable and redeploy.
5. The schedule starts by itself on Railway.

## Everyday commands
| Command | What it does |
|---|---|
| `npm run dry` | Writes a post and renders it into `out/dry/`. Saves, emails and posts nothing. |
| `npm run generate` | Writes tomorrow's post, saves the draft, emails you. |
| `node src/cli.js email <post-id>` | Re-sends a draft's review email. |
| `node src/cli.js publish <post-id>` | Posts one approved post to Instagram now. |
| `node src/cli.js publish-today` | What the 07:00 job does. |
| `node src/cli.js refresh-token --force` | Renews the Instagram token now. |
| `npm start` | Web app (approve links, `/notes`). Add `ENABLE_CRON=true` to also run the schedule locally. |
| `npm run dbcheck` | Checks the database connection. |
| `npm test` | Runs the tests. |

## Notes page
`/notes` on your public address: add a real note (and optional photo) after you build or ship something. Notes are the only source for "I built…" posts. After 7 days with no notes, the engine only writes tool, saveable and general habits posts.
