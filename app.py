"""Front Office GM on Streamlit, with player accounts.

Players sign up with a username and password. Each club career they start is
saved to their account, so they can pick it up on any device. Players can also
skip accounts and save in their own browser.
"""
from __future__ import annotations

import html
import os
import time
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

import accounts

st.set_page_config(page_title="Front Office GM", page_icon="⚾", layout="wide")

st.markdown(
    """
    <style>
      header[data-testid="stHeader"], footer, #MainMenu {display: none !important;}
      .block-container {padding: 0 0 0 0 !important; max-width: 100% !important;}
      iframe {border: 0; display: block;}
      /* saving re-runs the script; keep the game from dimming while it does */
      .stElementContainer[data-stale="true"]:has(iframe) {opacity: 1 !important; transition: none !important;}
      .fo-bar {display: flex; align-items: center; gap: 10px; padding: 6px 14px 2px; font-size: 14px; color: #c9d4ea;}
      .fo-bar b {color: #fff;}
      .fo-hero {text-align: center; padding: 6vh 0 8px;}
      .fo-hero h1 {font-size: 40px; margin: 0; letter-spacing: .5px;}
      .fo-hero p {color: #b8c4dc; margin: 6px 0 0;}
      .fo-fine {color: #8d9bb8; font-size: 12.5px; text-align: center; margin-top: 10px;}
    </style>
    """,
    unsafe_allow_html=True,
)

GAME = components.declare_component("front_office_gm", path=str(Path(__file__).parent / "game"))
ss = st.session_state


def _secret(name: str) -> str | None:
    try:
        value = st.secrets.get(name)
    except Exception:  # no secrets file at all
        value = None
    return value or os.environ.get(name) or None


@st.cache_resource(show_spinner=False)
def store() -> accounts.Store:
    return accounts.Store(url=_secret("DATABASE_URL"))


@st.cache_resource(show_spinner=False)
def _attempts() -> dict:
    """Failed log-ins per username, shared by every visitor, to slow down guessing."""
    return {}


def _too_many(name: str) -> bool:
    now = time.time()
    tries = [t for t in _attempts().get(name.lower(), []) if now - t < 900]
    _attempts()[name.lower()] = tries
    return len(tries) >= 10


def _failed(name: str) -> None:
    _attempts().setdefault(name.lower(), []).append(time.time())


def _reset_game_state() -> None:
    for k in ("booted", "last_msg", "ack", "send_token", "save_error"):
        ss.pop(k, None)


def _sign_in(user: dict) -> None:
    _reset_game_state()
    ss.user = user
    ss.token = store().new_session(user["id"])
    ss.send_token = True


def _play_as_guest() -> None:
    _reset_game_state()
    ss.user = {"guest": True}


def _log_out() -> None:
    try:
        store().end_session(ss.get("token"))
    except Exception:  # still log out on this device
        pass
    _reset_game_state()
    ss.pop("token", None)
    ss.user = None
    ss.cookie_checked = True


# ---- remember the player between visits --------------------------------
if not ss.get("cookie_checked"):
    ss.cookie_checked = True
    tok = st.context.cookies.get("fo_session")
    if tok:
        try:
            u = store().user_for_token(tok)
        except Exception:
            u = None
        if u:
            ss.user = u
            ss.token = tok


def login_screen() -> None:
    _, mid, _ = st.columns([1, 1.1, 1])
    with mid:
        st.markdown(
            '<div class="fo-hero"><h1>⚾ Front Office GM</h1>'
            "<p>Run any of the 30 big-league clubs: trades, free agency, the farm, and every game.</p></div>",
            unsafe_allow_html=True,
        )
        try:
            store()
            db_ok = True
        except Exception:
            db_ok = False
            st.error("Accounts are unavailable right now. You can still play and save in this browser.")

        if db_ok:
            t_in, t_new = st.tabs(["Log in", "Create account"])
            with t_in:
                with st.form("login", border=False):
                    name = st.text_input("Username", max_chars=20, key="li_name")
                    pw = st.text_input("Password", type="password", max_chars=200, key="li_pw")
                    go = st.form_submit_button("Log in", type="primary", width="stretch")
                if go:
                    if _too_many(name or ""):
                        st.error("Too many tries for that username. Wait a few minutes and try again.")
                    else:
                        try:
                            user = store().check_login(name, pw)
                        except accounts.AccountError as e:
                            _failed(name or "")
                            st.error(str(e))
                        except Exception:
                            st.error("Could not reach the accounts database. Try again in a moment.")
                        else:
                            _sign_in(user)
                            st.rerun()
            with t_new:
                with st.form("signup", border=False):
                    name = st.text_input("Pick a username", max_chars=20, key="su_name",
                                         help="3 to 20 letters, numbers, dots, dashes or underscores.")
                    pw = st.text_input("Password", type="password", max_chars=200, key="su_pw",
                                       help="At least 6 characters.")
                    pw2 = st.text_input("Password again", type="password", max_chars=200, key="su_pw2")
                    go = st.form_submit_button("Create account", type="primary", width="stretch")
                if go:
                    if pw != pw2:
                        st.error("The two passwords don't match.")
                    else:
                        try:
                            user = store().create_user(name, pw)
                        except accounts.AccountError as e:
                            st.error(str(e))
                        except Exception:
                            st.error("Could not reach the accounts database. Try again in a moment.")
                        else:
                            _sign_in(user)
                            st.rerun()
                st.caption("There's no email and no password reset, so pick a password you'll remember.")

        st.button("Play without an account", on_click=_play_as_guest, width="stretch")
        notes = ["Without an account, careers save only in this browser."]
        if db_ok and store().kind == "sqlite" and accounts.on_streamlit_cloud():
            notes.append("Accounts on this app are in test mode and may reset when the app restarts.")
        notes.append("Unofficial fan game. Not affiliated with MLB or any club.")
        st.markdown('<div class="fo-fine">' + "<br>".join(html.escape(n) for n in notes) + "</div>",
                    unsafe_allow_html=True)


def game_screen() -> None:
    user = ss.user
    guest = bool(user.get("guest"))
    key = "game_guest" if guest else f"game_{user['id']}"

    # Handle the latest message from the game (each one only once).
    msg = ss.get(key)
    if isinstance(msg, dict) and msg.get("sid"):
        mark = (msg["sid"], msg.get("seq"))
        if mark != ss.get("last_msg"):
            ss.last_msg = mark
            if msg.get("need"):
                ss.booted = False
            elif msg.get("booted"):
                ss.booted = True
                ss.send_token = False
            if msg.get("docs") and not guest:
                try:
                    store().save_docs(user["id"], msg["docs"])
                    ss.ack = {"sid": msg["sid"], "seq": msg["seq"]}
                    ss.save_error = False
                except Exception:
                    ss.save_error = True  # the game tries again shortly

    left, right = st.columns([6, 1], vertical_alignment="center")
    with left:
        if guest:
            text = "Playing without an account. Careers save in this browser only."
        else:
            text = f"Signed in as <b>{html.escape(user['name'])}</b>. Careers save to your account."
            if ss.get("save_error"):
                text += " <span style='color:#ffb3a7'>Couldn't reach the server; your browser has a copy and it will retry.</span>"
        st.markdown(f'<div class="fo-bar">⚾ {text}</div>', unsafe_allow_html=True)
    with right:
        if guest:
            st.button("Log in or sign up", on_click=_log_out, width="stretch")
        else:
            st.button("Log out", on_click=_log_out, width="stretch")

    boot = None
    if not ss.get("booted"):
        if guest:
            boot = {"guest": True}
        else:
            try:
                docs = store().load_docs(user["id"])
            except Exception:
                docs = {}
                st.warning("Couldn't load your saved careers right now. Reload the page to try again.")
            boot = {"user": {"id": user["id"], "name": user["name"]}, "docs": docs}
            if ss.get("send_token") and ss.get("token"):
                boot["token"] = ss.token
    GAME(boot=boot, ack=ss.get("ack"), key=key, default=None)


if ss.get("user"):
    game_screen()
else:
    login_screen()
