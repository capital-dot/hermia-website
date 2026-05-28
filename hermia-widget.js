/* =====================================================================
   HERMIA WIDGET — shared file
   Put this file in the MAIN folder of your repo as:  hermia-widget.js
   Then on any page you want the bot, add ONE line before </body>:
       <script src="/hermia-widget.js"></script>
   Change the bot once here, it updates on every page automatically.
   ===================================================================== */
(function () {
  // Don't load twice if a page accidentally includes it twice
  if (window.__hermiaLoaded) return;
  window.__hermiaLoaded = true;

  /* ---------- THE BRAIN (personality / rules) ---------- */
  var HERMIA_SYSTEM = `You are the AI concierge for Hermia, a premium real estate lead intelligence and pipeline prioritisation platform for agents and real estate teams.

Hermia helps agents stop wasting time on cold/low-intent leads by identifying serious buyers faster, prioritising hot leads, organising inbound enquiries, and improving speed-to-lead.

CONVERSATION STYLE - this is the most important rule:
- Talk like a normal, warm, intelligent human. Exactly like ChatGPT would.
- If someone says "hi", just say hi back warmly and ask how you can help. NEVER say things like "your query has been validated against our framework". That is robotic and banned.
- Keep replies short and natural. Match the person's energy.
- Answer questions plainly: what Hermia does, how it works, is this a bot, pricing, setup, CRM integration.
- Be calm, premium, helpful. Never pushy. Never spam a trial offer. Only mention booking a demo if it genuinely fits.
- No corporate jargon, no fake technical language, no emojis unless they use them first.
- If you don't know something, say so simply and suggest confirming it during onboarding.

The brand is black, gold, white - elegant and trustworthy. You are here to help and build trust, not to sell aggressively.`;

  /* ---------- INJECT HTML ---------- */
  var html = `
  <div id="hermia-widget">
    <button id="hermia-trigger" aria-label="Open Hermia assistant">
      <svg viewBox="0 0 24 24" width="26" height="26" stroke="#C9A35B" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>
      <span class="hermia-pulse"></span>
    </button>
    <div id="hermia-window" role="dialog" aria-label="Hermia assistant">
      <div class="hermia-header">
        <div class="hermia-headmeta">
          <span class="hermia-live"></span>
          <div><h4>Hermia</h4><p>Lead intelligence concierge</p></div>
        </div>
        <button class="hermia-close" aria-label="Close">&#10005;</button>
      </div>
      <div class="hermia-messages" id="hermia-scroller"></div>
      <div class="hermia-footer">
        <div class="hermia-inputwrap">
          <input type="text" id="hermia-input" placeholder="Type a message…" autocomplete="off">
          <button class="hermia-send" aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0c0c0c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </div>
    </div>
  </div>`;

  /* ---------- INJECT STYLES ---------- */
  var css = `
  #hermia-widget { position: fixed; bottom: 28px; right: 28px; z-index: 999999; font-family: 'DM Sans', system-ui, sans-serif; }
  #hermia-trigger { width: 62px; height: 62px; border-radius: 50%; background: #0c0c0c; border: 1.5px solid #C9A35B; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(201,163,91,.28); position: relative; transition: transform .25s ease; }
  #hermia-trigger:hover { transform: scale(1.07); }
  .hermia-pulse { position: absolute; inset: -2px; border-radius: 50%; border: 1.5px solid #C9A35B; animation: hermiaRing 2.6s infinite; pointer-events: none; }
  @keyframes hermiaRing { 0% { transform: scale(1); opacity:.7 } 100% { transform: scale(1.35); opacity:0 } }
  #hermia-window { position: absolute; bottom: 78px; right: 0; width: 380px; height: 560px; max-height: 78vh; background: #0c0c0c; border: 1px solid rgba(201,163,91,.22); border-radius: 20px; box-shadow: 0 24px 60px rgba(0,0,0,.85); display: flex; flex-direction: column; overflow: hidden; opacity: 0; transform: translateY(16px) scale(.97); pointer-events: none; transition: all .3s cubic-bezier(.25,1,.5,1); }
  #hermia-window.open { opacity: 1; transform: none; pointer-events: auto; }
  .hermia-header { padding: 16px 18px; background: #060606; border-bottom: 1px solid rgba(201,163,91,.15); display: flex; align-items: center; justify-content: space-between; }
  .hermia-headmeta { display: flex; align-items: center; gap: 10px; }
  .hermia-live { width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 9px #10b981; }
  .hermia-header h4 { margin: 0; font-size: 14px; font-weight: 600; color: #fff; letter-spacing:.3px; }
  .hermia-header p { margin: 0; font-size: 11px; color: #777; }
  .hermia-close { background: transparent; border: none; color: #888; font-size: 15px; cursor: pointer; padding: 6px; line-height:1; border-radius:6px; }
  .hermia-close:hover { color: #fff; background: rgba(255,255,255,.06); }
  .hermia-messages { flex: 1; padding: 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
  .hermia-messages::-webkit-scrollbar { width: 6px; }
  .hermia-messages::-webkit-scrollbar-thumb { background: rgba(201,163,91,.25); border-radius: 3px; }
  .hermia-row { display: flex; width: 100%; }
  .hermia-row.bot { justify-content: flex-start; }
  .hermia-row.user { justify-content: flex-end; }
  .hermia-bubble { max-width: 86%; padding: 12px 16px; border-radius: 14px; font-size: 13.5px; line-height: 1.6; white-space: pre-wrap; }
  .bot .hermia-bubble { background: #161616; border: 1px solid rgba(201,163,91,.12); color: #efe9dc; border-top-left-radius: 4px; }
  .user .hermia-bubble { background: rgba(201,163,91,.1); border: 1px solid rgba(201,163,91,.3); color: #fff; border-top-right-radius: 4px; }
  .hermia-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .hermia-chip { background: #060606; border: 1px solid rgba(201,163,91,.2); color: #C9A35B; padding: 8px 12px; border-radius: 8px; font-size: 12px; cursor: pointer; transition: all .2s; font-family: inherit; }
  .hermia-chip:hover { border-color: #C9A35B; background: rgba(201,163,91,.08); }
  .hermia-footer { padding: 14px; background: #060606; border-top: 1px solid rgba(201,163,91,.1); }
  .hermia-inputwrap { display: flex; align-items: center; gap: 8px; background: #0d0d0d; border: 1px solid rgba(201,163,91,.18); border-radius: 12px; padding: 5px 5px 5px 14px; }
  .hermia-inputwrap input { flex: 1; background: transparent; border: none; color: #fff; font-size: 13.5px; font-family: inherit; }
  .hermia-inputwrap input:focus { outline: none; }
  .hermia-send { background: #C9A35B; border: none; width: 38px; height: 38px; border-radius: 9px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .2s; }
  .hermia-send:hover { background: #e0b96e; }
  .hermia-typing { display: flex; gap: 5px; padding: 4px 2px; }
  .hermia-dot { width: 6px; height: 6px; background: #C9A35B; border-radius: 50%; opacity: .4; animation: hermiaWave 1.3s infinite; }
  .hermia-dot:nth-child(2){ animation-delay:.15s } .hermia-dot:nth-child(3){ animation-delay:.3s }
  @keyframes hermiaWave { 0%,100%{ transform: translateY(0); opacity:.4 } 50%{ transform: translateY(-4px); opacity:1 } }
  @media(max-width:480px){ #hermia-window { width: calc(100vw - 32px); right: -6px; height: 70vh; } }`;

  var styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  var wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  /* ---------- LOGIC ---------- */
  var history = [];
  var greeted = false;
  var winEl = document.getElementById('hermia-window');
  var inputEl = document.getElementById('hermia-input');
  var scroller = document.getElementById('hermia-scroller');

  function toggle() {
    winEl.classList.toggle('open');
    if (winEl.classList.contains('open') && !greeted) {
      greeted = true;
      bot("Hey! I'm the Hermia assistant. Ask me anything — what we do, how it works, or whatever's on your mind.", true);
      inputEl.focus();
    }
  }
  function append(text, side) {
    var row = document.createElement('div'); row.className = 'hermia-row ' + side;
    var b = document.createElement('div'); b.className = 'hermia-bubble'; b.textContent = text;
    row.appendChild(b); scroller.appendChild(row); scroller.scrollTop = scroller.scrollHeight;
    return b;
  }
  function bot(text, withChips) {
    var b = append(text, 'bot');
    if (withChips) {
      var c = document.createElement('div'); c.className = 'hermia-chips';
      ['What does Hermia do?', 'How does it work?', 'Is this a bot?'].forEach(function (q) {
        var chip = document.createElement('button'); chip.className = 'hermia-chip'; chip.textContent = q;
        chip.onclick = function () { chip.parentElement.remove(); userSay(q); };
        c.appendChild(chip);
      });
      b.appendChild(c);
    }
  }
  function typing(show) {
    if (show) {
      var row = document.createElement('div'); row.className = 'hermia-row bot'; row.id = 'hermia-typing';
      row.innerHTML = '<div class="hermia-bubble"><div class="hermia-typing"><span class="hermia-dot"></span><span class="hermia-dot"></span><span class="hermia-dot"></span></div></div>';
      scroller.appendChild(row); scroller.scrollTop = scroller.scrollHeight;
    } else { var t = document.getElementById('hermia-typing'); if (t) t.remove(); }
  }
  function userSay(text) {
    append(text, 'user');
    history.push({ role: 'user', content: text });
    ask();
  }
  function send() {
    var t = inputEl.value.trim(); if (!t) return; inputEl.value = ''; userSay(t);
  }
  async function ask() {
    typing(true);
    try {
      var res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: HERMIA_SYSTEM, messages: history })
      });
      if (!res.ok) throw new Error('bad');
      var data = await res.json();
      var reply = data.reply || "Sorry, I didn't catch that — could you rephrase?";
      typing(false); bot(reply);
      history.push({ role: 'assistant', content: reply });
    } catch (e) {
      typing(false);
      bot("I'm having trouble connecting right now. Give it a moment and try again.");
    }
  }

  document.getElementById('hermia-trigger').onclick = toggle;
  document.querySelector('.hermia-close').onclick = toggle;
  document.querySelector('.hermia-send').onclick = send;
  inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
})();
