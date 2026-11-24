import streamlit as st

from game_page import build_page

st.set_page_config(page_title="Front Office GM", page_icon="⚾", layout="wide")

# Give the game the whole window: hide Streamlit's header, footer and padding.
st.markdown(
    """
    <style>
      header[data-testid="stHeader"], footer, #MainMenu {display: none !important;}
      .block-container {padding: 0 !important; max-width: 100% !important;}
      iframe {border: 0; display: block;}
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_data
def page() -> str:
    return build_page()


if hasattr(st, "iframe"):
    st.iframe(page(), height=1100)
else:  # older Streamlit releases
    import streamlit.components.v1 as components

    components.html(page(), height=1100, scrolling=True)
