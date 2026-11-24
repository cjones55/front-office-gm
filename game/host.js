/* Bridge between the game and the Streamlit app that hosts it.
   Streamlit passes the signed-in player's saved careers in; the game's saves go
   back out and Streamlit writes them to the player's account. Outside Streamlit
   (opening index.html directly) this does nothing and the game saves in the
   browser as usual. Uses Streamlit's custom-component messages directly. */
(function () {
  if (!new URLSearchParams(location.search).has('streamlitUrl')) return;

  const post = (type, extra) => window.parent.postMessage(Object.assign({ isStreamlitMessage: true, type }, extra || {}), '*');
  const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const GAP = 8000, RESEND = 20000;
  let seq = 0, lastSent = 0, timer = 0, boot = null, asked = false, onBoot = [];
  const docs = {};      // name -> JSON string, the account's copy as this page knows it
  const pending = {};   // name -> { body, sent: seq it went out in, 0 if not yet }

  function send(value) { seq += 1; post('streamlit:setComponentValue', { value: Object.assign({ sid, seq, booted: !!boot }, value), dataType: 'json' }); return seq; }

  function flush() {
    timer = 0;
    const names = Object.keys(pending);
    if (!names.length) return;
    const out = {};
    names.forEach(n => { out[n] = pending[n].body; });
    const s = send({ docs: out });
    names.forEach(n => { pending[n].sent = s; });
    lastSent = Date.now();
    setTimeout(() => {   // no reply: try again
      let again = false;
      Object.values(pending).forEach(p => { if (p.sent && p.sent <= s) { p.sent = 0; again = true; } });
      if (again) schedule();
    }, RESEND);
    label();
  }
  function schedule() {
    if (timer) return;
    timer = setTimeout(flush, Math.max(400, lastSent + GAP - Date.now()));
  }
  function status() {
    return Object.keys(pending).length ? 'Saving to your account…' : 'Saved to your account';
  }
  function label() {
    try { if (typeof UI !== 'undefined' && Store.uid) { UI.saved = status(); const f = document.querySelector('#savefoot'); if (f) f.textContent = UI.saved; } } catch (e) { /* not drawn yet */ }
  }

  function onRender(args) {
    args = args || {};
    if (args.boot && !boot) {
      boot = args.boot;
      Object.assign(docs, boot.docs || {});
      if (boot.token) {
        const secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `fo_session=${boot.token}; path=/; max-age=${60 * 86400}; SameSite=Lax${secure}`;
      }
      send({ hello: true });
      const cbs = onBoot; onBoot = []; cbs.forEach(f => f());
    } else if (!boot && !asked) {
      asked = true; send({ need: true });
    }
    const a = args.ack;
    if (a && a.sid === sid) {
      Object.keys(pending).forEach(n => { const p = pending[n]; if (p.sent && p.sent <= a.seq) delete pending[n]; });
      if (Object.values(pending).some(p => !p.sent)) schedule();
      label();
    }
  }

  window.addEventListener('message', ev => {
    const d = ev.data;
    if (d && d.type === 'streamlit:render') onRender(d.args);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && Object.values(pending).some(p => !p.sent)) { clearTimeout(timer); flush(); }
  });

  const db = {
    doc(path) {
      const name = String(path).split('/').pop();
      return {
        async get() {
          const b = docs[name];
          let data = null;
          try { data = b == null ? null : JSON.parse(b); } catch (e) { data = null; }
          return { exists: data != null, data: () => data };
        },
        async set(obj) {
          const body = JSON.stringify(obj);
          docs[name] = body;
          pending[name] = { body, sent: 0 };
          schedule();
        }
      };
    }
  };

  window.FO_HOST = {
    prefix: '',
    status,
    ready(start) {
      const go = () => {
        if (boot && boot.user) this.prefix = `u${boot.user.id}:`;
        start({});
      };
      if (boot) go(); else onBoot.push(go);
      setTimeout(() => { if (!boot) { boot = { guest: true, late: true }; const cbs = onBoot; onBoot = []; cbs.forEach(f => f()); } }, 15000);
    },
    async connect() {
      if (!boot || !boot.user || boot.late) return null;
      return { db, uid: boot.user.id, label: `your account (${boot.user.name})` };
    }
  };

  post('streamlit:componentReady', { apiVersion: 1 });
  post('streamlit:setFrameHeight', { height: 1100 });
})();
