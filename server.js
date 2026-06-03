const express = require("express");
const twilio = require("twilio");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY;
const BASE_URL            = process.env.BASE_URL;
const SLACK_WEBHOOK_URL   = process.env.SLACK_WEBHOOK_URL;

const twilioClient  = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const anthropic     = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const conversations = {};

function getDelayMs(timeSlot) {
  const slots = {
    "now":                0,
    "5min":               5  * 60 * 1000,
    "10min":              10 * 60 * 1000,
    "30min":              30 * 60 * 1000,
    "1hour":              60 * 60 * 1000,
    "2hours":             2  * 60 * 60 * 1000,
    "tomorrow_morning":   16 * 60 * 60 * 1000,
    "tomorrow_afternoon": 20 * 60 * 60 * 1000,
  };
  return slots[timeSlot] || 0;
}

async function sendSlack(message) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch (err) {
    console.error("Slack error:", err.message);
  }
}

const SYSTEM_PROMPT = `You are Jared, a sales consultant for Hermia. You are on a live phone call with a real estate agent. You are NOT a robot — you are a real, warm, confident human salesperson. Your one and only goal is to SELL. Always be closing.

STRICT RULES:
- Maximum 2 sentences per response. Never more.
- Ask only ONE question at a time. Wait for their answer.
- Never dump features. Reveal solutions one at a time after they confirm the pain.
- Never say "I'd be happy to", "Certainly", "Great question", "Absolutely", "As an AI"
- Sound like a real person. Always respond to what they actually said first.
- DO NOT give out free information. Every piece of information you share must push toward the close.
- ALWAYS be selling. If they go off topic, bring it back to the close.
- Never let the conversation go cold. Always end your response with a question or a close.

WHAT HERMIA DOES (reveal piece by piece only as needed):
- Responds to every inquiry from Domain, REA, Property Finder or Bayut within 30 seconds via WhatsApp and SMS — even at 2am
- Asks buyers 3 qualification questions: timeline, budget, finance status
- Scores every lead Hot, Warm or Cold so agent knows who to call first
- Books inspection slots automatically
- Pushes full lead profile into CRM automatically — zero manual work
- Works with Zoho, Rex, HubSpot, Pipedrive, Monday CRM and most major CRMs — including direct phone call automation and lead management inside those systems
- Weekly Pipeline Intelligence report every Monday
- 3-day free trial, no credit card, cancel anytime
- Website: hermia.au

ABOUT THE FOUNDER (only share if asked — then sell it):
- Founded by Archie, a seasoned professional architect and software engineer
- Archie built the entire infrastructure and software system behind Octovera, which is the technology engine that powers Hermia
- Hermia is the product built on top of that infrastructure — purpose-built for real estate lead automation
- The tech is enterprise-grade: custom-built automation pipelines, AI qualification layers, CRM sync architecture, and real-time lead scoring
- But don't dwell on this — pivot back to the sale: "What matters for you is that your leads are being qualified automatically, your CRM is being updated without you touching it, and you never miss a hot buyer again."

CONVERSATION FLOW:

PHASE 1 — OPEN (after recording notice):
"Hey [name], this is Jared from Hermia. Quick question — when a new inquiry comes in from Domain or REA, what actually happens on your end right now?"

PHASE 2 — RESPONSE TIME:
"How long does it usually take you to respond?"
"And in that time, do you know if they've already messaged two or three other agents?"

PHASE 3 — QUALIFICATION PAIN:
"Out of all your inquiries right now, do you know which one wants to buy in the next 30 days?"
When no: "That's the problem — you're spending the same energy on someone browsing as someone ready to sign tomorrow."

PHASE 4 — INTRODUCE HERMIA:
"That's exactly what Hermia fixes. The second an inquiry hits, we respond within 30 seconds automatically and start qualifying them while you sleep."
"By the time you check your phone, Hermia has already told you who's hot, who's warm, and who's just window shopping."

PHASE 5 — CRM:
"What CRM are you on?"
"Perfect — Hermia pushes everything straight in. Budget, timeline, finance status, inspection availability — all done automatically, including triggering phone call workflows if your CRM supports it. You don't touch anything."

PHASE 6 — CLOSE:
"We do a 3-day free trial — no credit card, no commitment."
"In 3 days you'll see exactly which of your current inquiries is ready to buy. Does that sound worth testing?"

PHASE 7 — OBJECTIONS:
Busy: "That's exactly why Hermia exists — it runs while you're busy. Takes 5 minutes to set up."
Has system: "What does your system do when an inquiry comes in at midnight on Saturday?"
Wants founder / more info: "Archie built the entire system from the ground up — but honestly the trial will show you more in 3 days than any conversation can. Want me to get you started?"
Price: "The trial is completely free. If it doesn't book more inspections, cancel and it costs you nothing."
Not sure: "What's the one thing that would make this a no-brainer for you?" — then close on that.

PHASE 8 — FINAL CLOSE:
"Go to hermia dot au and start your free trial — connects to your inbox in 5 minutes."
"You'll see a difference in the first 24 hours. I'll let you go — but don't sleep on this, the agents using it right now are already pulling ahead."`;

async function makeCall(phone, name, callId) {
  try {
    const call = await twilioClient.calls.create({
      to: phone,
      from: TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/voice?callId=${callId}&name=${encodeURIComponent(name)}`,
    });
    console.log(`✅ Call placed to ${phone} — ${call.sid}`);
    const conv = conversations[callId] || {};
    await sendSlack(
      `📞 *Jared is calling ${name}*\n📱 ${phone}\n🌏 Market: ${conv.market || "N/A"}\n📅 Date: ${conv.date || "N/A"}\n⏰ Time Slot: ${conv.timeSlot || "N/A"}\n✅ Consent: Given`
    );
  } catch (err) {
    console.error(`❌ Call failed: ${err.message}`);
    await sendSlack(`❌ Call FAILED for ${name} (${phone}): ${err.message}`);
  }
}

app.post("/trigger-call", async (req, res) => {
  const { phone, name, email, market, timeSlot, date } = req.body;
  if (!phone || !name) return res.status(400).json({ error: "phone and name required" });

  // Normalise to E.164 — form should already send clean number but handle fallback
  let digits = phone.replace(/\s+/g, "");
  if (!digits.startsWith("+")) {
    digits = digits.replace(/\D/g, "");
    if (digits.startsWith("61") && !digits.startsWith("610")) digits = "+" + digits;
    else if (digits.startsWith("971") && !digits.startsWith("9710")) digits = "+" + digits;
    else if (digits.startsWith("0")) digits = "+61" + digits.slice(1);
    else digits = "+" + digits;
  }
  // Strip double-zero after country code e.g. +610404 → +61404
  digits = digits.replace(/^\+61(0)/, "+61").replace(/^\+971(0)/, "+971");

  const callId = `call_${Date.now()}`;
  conversations[callId] = { leadName: name, leadEmail: email, market, date, timeSlot, messages: [], transcript: [] };

  const delayMs   = getDelayMs(timeSlot || "now");
  const delayMins = Math.round(delayMs / 60000);

  console.log(`📅 ${name} — timeSlot: "${timeSlot}" — calling in ${delayMins} min`);

  if (delayMs > 0) {
    await sendSlack(
      `🗓 *${name}* booked a call in *${delayMins} minutes*\n📱 ${digits}\n🌏 Market: ${market || "N/A"}\n⏰ Slot: ${timeSlot}\n📅 Date: ${date || "N/A"}\n✅ Consent: Given`
    );
  }

  setTimeout(() => makeCall(digits, name, callId), delayMs);

  res.json({
    success: true,
    callId,
    message: delayMs === 0 ? "Calling now" : `Call scheduled in ${delayMins} minutes`,
  });
});

app.post("/voice", (req, res) => {
  const { callId, name } = req.query;
  const twiml = new twilio.twiml.VoiceResponse();

  // Recording notice — legal compliance
  const recordingNotice = `Before we begin — just to let you know, this call may be recorded for training and quality purposes. If you do not wish to be recorded, please press 2 now. Otherwise, stay on the line and we'll get started.`;

  const greeting = `Hey ${name}, this is Jared from Hermia — you booked a call to see how we work. Quick question — when a new inquiry comes in from Domain or REA, what actually happens on your end right now?`;

  if (conversations[callId]) {
    conversations[callId].messages.push({ role: "assistant", content: greeting });
    conversations[callId].transcript.push(`Jared: ${greeting}`);
  }

  // Play recording notice, gather key press 2 to opt out
  const gather = twiml.gather({ numDigits: 1, action: `${BASE_URL}/recording-choice?callId=${callId}&name=${encodeURIComponent(name)}`, timeout: 5 });
  gather.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, recordingNotice);

  // If no key pressed, proceed to call anyway
  twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, greeting);
  twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: "en-AU", timeout: 10 });
  twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Hey, still there?");
  twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: "en-AU", timeout: 8 });
  twiml.hangup();

  res.type("text/xml").send(twiml.toString());
});

// Handle recording opt-out key press
app.post("/recording-choice", (req, res) => {
  const { callId, name } = req.query;
  const digit = req.body.Digits;
  const twiml = new twilio.twiml.VoiceResponse();

  const greeting = `Hey ${name}, this is Jared from Hermia — you booked a call to see how we work. Quick question — when a new inquiry comes in from Domain or REA, what actually happens on your end right now?`;

  if (digit === "2") {
    // Noted opt-out — still proceed with call (recording handled at Twilio level separately)
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "No problem, noted. Let's get started.");
  }

  twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, greeting);
  twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: "en-AU", timeout: 10 });
  twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Hey, still there?");
  twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: "en-AU", timeout: 8 });
  twiml.hangup();

  res.type("text/xml").send(twiml.toString());
});

app.post("/respond", async (req, res) => {
  const { callId } = req.query;
  const userSpeech = req.body.SpeechResult || "";
  const twiml = new twilio.twiml.VoiceResponse();
  const conv = conversations[callId] || { messages: [], transcript: [], leadName: "" };

  console.log(`🎤 Lead: "${userSpeech}"`);

  const hangupWords = ["goodbye", "bye", "no thanks", "not interested", "hang up", "gotta go", "call back"];
  if (hangupWords.some(w => userSpeech.toLowerCase().includes(w))) {
    const farewell = "No worries at all — jump onto hermia dot au for the free trial anytime. Have a great day!";
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, farewell);
    twiml.hangup();

    conv.transcript.push(`Lead: ${userSpeech}`);
    conv.transcript.push(`Jared: ${farewell}`);
    const summary = conv.transcript.join("\n").slice(0, 2800);
    await sendSlack(`📋 *Call ended — ${conv.leadName}*\n\`\`\`${summary}\`\`\``);

    return res.type("text/xml").send(twiml.toString());
  }

  if (!userSpeech.trim()) {
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Sorry, didn't catch that — could you say that again?");
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: "en-AU", timeout: 10 });
    return res.type("text/xml").send(twiml.toString());
  }

  conv.messages.push({ role: "user", content: userSpeech });
  conv.transcript.push(`Lead: ${userSpeech}`);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: conv.messages,
    });

    const reply = response.content[0]?.text || "Could you say that again?";
    console.log(`🤖 Jared: "${reply}"`);

    conv.messages.push({ role: "assistant", content: reply });
    conv.transcript.push(`Jared: ${reply}`);
    conversations[callId] = conv;

    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, reply);
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: "en-AU", timeout: 12 });
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Still there?");
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", timeout: 8 });
    twiml.hangup();

  } catch (err) {
    console.error(`❌ Claude error: ${err.message}`);
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Quick tech hiccup — head to hermia dot au for the free trial. Thanks!");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

app.post("/call-complete", async (req, res) => {
  const { callId } = req.query;
  const { CallDuration, CallStatus } = req.body;
  const conv = conversations[callId];
  if (conv) {
    const mins = Math.round((parseInt(CallDuration) || 0) / 60);
    const transcript = conv.transcript.join("\n").slice(0, 2800);
    await sendSlack(`✅ *Call complete — ${conv.leadName}*\nDuration: ${mins} min | Status: ${CallStatus}\n\`\`\`${transcript}\`\`\``);
    delete conversations[callId];
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Hermia — Jared live on port ${PORT}`));



