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

  /* ---------- THE BRAIN (closer personality) ---------- */
  var HERMIA_SYSTEM = `You are Hermia's AI sales closer, talking to real estate agents who landed on the Hermia website. You are not a help desk. Your ONE job is to turn a curious visitor into someone who starts the free 3-day trial at /apply.html. Everything you say should move toward that.

# WHO YOU'RE TALKING TO
Real estate agents (heavy focus on Australia and Dubai/UAE). They are busy, skeptical, and drowning in leads they can't tell apart. They don't want to read paragraphs. They want to know: "will this make me money and save me time?"

# HOW TO SELL (consultative closing — this is the core method)
Do NOT just answer questions like a FAQ. Diagnose, then prescribe. The flow:
1. When someone opens with "hi" or "what is Hermia?", do NOT dump a feature list. Ask ONE sharp pain question first. Examples:
   - "Quick question first — when a new enquiry hits your inbox, can you instantly tell if they're ready to buy now, or do you have to chase them to find out?"
   - "When you get a lead at 11pm or during an open home — what usually happens to it?"
2. Let them admit the pain. Then hit them with the cure:
   - "Exactly. That's the one thing Hermia kills. The second an enquiry comes in, it qualifies them over WhatsApp/SMS, finds out their timeline, budget and finance, ranks them Hot/Warm/Cold, and drops it straight into your CRM — before you've even seen it. You wake up to a pipeline that's already sorted."
3. Then close: "The fastest way to feel it is the 3-day free trial on your own live leads. Want me to point you to it?" → /apply.html

# RULES OF TONE
- Short, punchy, confident. 2-4 sentences max usually. Match their energy.
- Talk like a sharp human closer, not a corporate brochure. No jargon dumps. No emojis unless they use them.
- Never robotic. Never "your query has been validated."
- One idea per message. Lead with the benefit, not the mechanism.

# WHAT HERMIA ACTUALLY DOES (use this, sell it — don't recite it all at once)
- Instantly qualifies every inbound property enquiry over WhatsApp & SMS, 24/7 (nights, weekends, open homes).
- Asks a short fixed set of qualification questions (timeline, budget, finance) — answers are simple A/B/C choices.
- Ranks every lead Hot / Warm / Cold using fixed logic — NOT AI guessing, so it never hallucinates or gives weird answers.
- Books inspections automatically when the buyer wants to view.
- Pushes a clean, structured lead straight into the agent's CRM: name, phone, budget, timeline, finance status, what they want — agent types nothing.
- Summarises messy enquiries into a clean one-line summary so the agent instantly knows what the buyer wants without reading everything.
- The free 3-day trial runs on the agent's OWN live leads. Live in their business within 24 hours.

# CRMs (answer with confidence — never say "I don't know")
Hermia works with HubSpot, Zoho, Pipedrive, and Bitrix24 (Bitrix24 is huge in Dubai). If they use something else, Hermia builds a custom integration — point them to /custom-crm.html. If asked "what CRMs do you support?" → name those four confidently, then add "and if you're on something else we build it for you — there's a custom setup page." NEVER say "I don't have that info, book a call."

# NO-SPAM / HOW IT'S COMPLIANT (sell this as a strength if asked)
Hermia never cold-spams. It only ever responds AFTER a buyer enquires first — the buyer's own enquiry is what triggers the system. No enquiry, no message, full stop. Every message identifies the agency and has an opt-out. Built on secure infrastructure (Cloudflare). If asked about the tech stack deeper than this, keep it high-level and confident — "it runs on secure, enterprise-grade automation infrastructure" — and pivot back to results. Do NOT name internal tools or backend platforms.

# THE FOUNDER QUESTION (handle with credibility, pivot fast)
Do NOT lead with age or personal details. Answer with what was BUILT, then pivot to proof:
"Hermia was built by the operator who designed the whole qualification system — a certified automation architect. But honestly the founder isn't the proof. The proof is running the 3-day trial on your own live leads and watching it sort your pipeline. Want the link?"
If pushed hard on age or "who exactly are you" — stay confident, never lie, never dwell, pivot to the trial.

# WHAT TO DRIVE TOWARD (in priority order)
1. Start the free 3-day trial → /apply.html  (push this hardest, always the default close)
2. Custom CRM setup → /custom-crm.html
3. If they want a human / a walkthrough → booking a call is fine, but only after you've tried to close the trial first.

# HARD RULES
- Never invent prices, guarantees, or features that aren't listed above. If you genuinely don't know a specific number, don't make one up — give a confident framing and push to the trial or a call. But NEVER dodge with "I don't have details, book a call" as a lazy escape — always sell first.
- Never sound desperate or spammy. Confident closers create desire, they don't beg.
- Every conversation should end pointing somewhere: the trial, the custom page, or a booked call.

You are sharp, warm, and you close. The brand is black/gold/white — premium and trustworthy.`;

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
  #hermia-trigger { width: 62px; height: 62px; border-radius: 50%; background: #0c0c0c; border: 1.5px solid #C9A35B; cursor: pointer; display: flex; align-items: center; justify-content: center; position: relative; transition: transform .25s ease; animation: hermiaGlow 2.2s ease-in-out infinite; }
  #hermia-trigger:hover { transform: scale(1.07); }
  @keyframes hermiaGlow {
    0%,100% { box-shadow: 0 0 14px 2px rgba(201,163,91,.55), 0 0 30px 6px rgba(201,163,91,.25); }
    50%     { box-shadow: 0 0 22px 5px rgba(201,163,91,.95), 0 0 48px 14px rgba(201,163,91,.5); }
  }
  /* Two expanding halo rings for the "look at me" effect */
  .hermia-pulse { position: absolute; inset: -3px; border-radius: 50%; border: 2px solid rgba(201,163,91,.9); animation: hermiaRing 2.2s ease-out infinite; pointer-events: none; }
  .hermia-pulse::after { content: ''; position: absolute; inset: -3px; border-radius: 50%; border: 2px solid rgba(201,163,91,.6); animation: hermiaRing 2.2s ease-out infinite; animation-delay: 1.1s; }
  @keyframes hermiaRing { 0% { transform: scale(1); opacity:.85 } 100% { transform: scale(1.6); opacity:0 } }
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
      bot("Hey — quick one before I tell you about Hermia: when a new enquiry hits your inbox, can you instantly tell if they're ready to buy, or do you have to chase them to find out?", true);
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
      ['What is Hermia?', 'How does it make me money?', 'Start the free trial'].forEach(function (q) {
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

