"""Builds the game as one self-contained HTML page (all scripts inlined)."""
from pathlib import Path
import re

GAME = Path(__file__).parent / "game"
SCRIPTS = ["data.js", "engine.js", "live.js", "clutch.js", "ui.js", "gameday.js"]


def build_page(extra_js: str = "") -> str:
    body = (GAME / "index.html").read_text(encoding="utf-8")
    body = body.replace('<meta name="claude:viewport-fit-sides" content="cover">', "")
    for name in SCRIPTS:
        tag = re.compile(r'<script src="' + re.escape(name) + r'"[^>]*></script>')
        code = (GAME / name).read_text(encoding="utf-8").replace("</script", "<\\/script")
        body, n = tag.subn(lambda _m: "<script>\n" + code + "\n</script>", body)
        if n != 1:
            raise RuntimeError(f"could not inline {name}")
    if extra_js:
        body += "\n<script>\n" + extra_js + "\n</script>"
    return (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<style>html,body{margin:0}</style></head><body>" + body + "</body></html>"
    )
