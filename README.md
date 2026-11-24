# Front Office GM

An unofficial baseball GM simulator for all 30 MLB clubs. Each club starts with its real 40-man roster and every minor leaguer in the system as of Nov 23, 2026. You set lineups, sign free agents, make trades (including taking on salary), shop the deadline trade block, and play games live, batting and pitching yourself.
Not affiliated with MLB or any club. Ratings are invented for the game.

## Accounts

Players can create an account with a username and password. Each club career they start is saved to their account, so they can continue on any device, and they stay logged in on that browser for 60 days. Players can also skip accounts and save in their own browser.

Passwords are stored only as salted PBKDF2 hashes. There's no email and no password reset.

### Database

Accounts and saves go to the Postgres database named in the `DATABASE_URL` secret. Any Postgres works. A free [Neon](https://neon.tech) database is plenty:

1. Create a Neon project and copy its connection string (it starts with `postgresql://`).
2. In Streamlit Community Cloud, open the app's **Settings → Secrets** and add:

   ```toml
   DATABASE_URL = "postgresql://..."
   ```

3. Save. The app restarts and creates its tables on first use.

Without `DATABASE_URL`, the app keeps accounts in a local SQLite file (`accounts.db`). That's fine on your own computer, but on Streamlit Cloud the file is wiped whenever the app restarts, so the login page warns players that accounts are in test mode.

## Run it locally

    pip install -r requirements.txt
    streamlit run app.py

To use Postgres locally, put `DATABASE_URL = "..."` in `.streamlit/secrets.toml` (git ignores that file).

## Deploy

Push this folder to GitHub, then create an app at share.streamlit.io with `app.py` as the main file, and add the `DATABASE_URL` secret.
