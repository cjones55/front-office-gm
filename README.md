# Front Office GM

An unofficial baseball GM simulator for all 30 MLB clubs. Each club starts with its real 40-man roster and every minor leaguer in the system as of Nov 23, 2026. You set lineups, sign free agents, make trades (including taking on salary), shop the deadline trade block, and play games live, batting and pitching yourself.
Not affiliated with MLB or any club. Ratings are invented for the game.

Run it locally:

    pip install -r requirements.txt
    streamlit run app.py

Deploy on Streamlit Community Cloud: push this folder to GitHub, then create an app at share.streamlit.io with `app.py` as the main file.

Saves are kept in each player's own browser, one career per club.
