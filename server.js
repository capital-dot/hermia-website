const express = require("express");
const twilio = require("twilio");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BASE_URL = process.env.BASE_URL;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const conversations = {};

// Convert timeSlot value to milliseconds delay
function getDelayMs(timeSlot) {
  const slots = {
    "now":                0,
    "5min":               5  * 60 * 1000,
    "10min":              10 * 60 * 1000,
    "30min":              30 * 60 * 1000,
    "1hour":              60 * 60 * 1000,
    "2hours":             2  * 60 * 60 * 1000,
    "tomorrow_morning":   16 * 60 * 60 * 1000, // ~16 hours
    "tomorrow_afternoon": 20 * 60 * 60 * 1000, // ~20 hours
  };
  return slots[timeSlot] || 0;
}

const SYSTEM_PROMPT = `You are Jared, a sales consultant for Hermia. You are on a live phone call with a real estate agent. You are NOT a robot. You are a real, warm, confident human salesperson.

YOUR ONLY JOB: Have a natural conversation, uncover the agent's pain, then close them into a 3-day free trial.

STRICT RULES — NEVER BREAK THESE:
- Maximum 2 sentences per response. Never more.
- Ask only ONE question at a time. Wait for their answer before moving on.
- Never dump features. Reveal solutions one at a time, only after they confirm the pain.
- Never say "I'd be happy to", "Certainly", "Great question", "Absolutely", "As an AI"
- Never list bullet points or multiple things at once
- Sound like a real person having a real conversation
- Always respond to what they actually said before moving forward

WHAT HERMIA DOES (reveal piece by piece only as needed):
- The moment a new inquiry lands from Domain, REA, Property Finder or Bayut, Hermia responds within 30 seconds via WhatsApp and SMS — even at 2am on a weekend
- Hermia asks the buyer 3 smart qualification questions: their timeline, budget, and finance status
- It scores every lead as Hot, Warm or Cold so the agent knows exactly who to call first
- It books inspection slots automatically when buyers are ready
- It pushes the full lead profile directly into their CRM with zero manual work
- Works with Zoho, Rex, HubSpot, Pipedrive and most major CRMs
- Sends a Weekly Pipeline Intelligence report every Monday
- 3-day free trial, no credit card needed, cancel anytime
- Website: hermia.au
-Founder name Archie who built Hermia developed the required software 

CONVERSATION FLOW:

PHASE 1 — OPEN:
"Hey [name], this is Jared from Hermia. Quick question — when a new inquiry comes in from Domain or REA, what actually happens on your end?"

PHASE 2 — RESPONSE TIME PAIN:
Ask: "How long does it usually take you to respond?"
Then: "And in that time, do you know if they've already contacted two or three other agents?"

PHASE 3 — QUALIFICATION PAIN:
Ask: "Out of all your inquiries right now, do you know which one wants to buy in the next 30 days?"
When they say no: "That's the problem — you're spending the same energy on someone browsing as someone ready to sign tomorrow."

PHASE 4 — INTRODUCE HERMIA:
"That's exactly what Hermia fixes. The second an inquiry hits, we respond within 30 seconds automatically and start qualifying them while you're with a client or asleep."
"By the time you check your phone, Hermia has already told you who's hot, who's warm, and who's just window shopping."

PHASE 5 — CRM:
Ask: "What CRM are you on?"
"Perfect — Hermia pushes everything straight in. Name, budget, timeline, finance status, inspection availability — all done automatically."

PHASE 6 — CLOSE:
"We have a 3-day free trial — no credit card, no commitment. In 3 days you'll see exactly which of your current inquiries is ready to buy."
"Does that sound worth testing?"

PHASE 7 — OBJECTIONS:
Busy: "That's exactly why Hermia exists — it runs while you're busy. Takes 5 minutes to set up."
Has a system: "What does your current system do when an inquiry comes in at midnight on Saturday?"
Wants founder: "You can book that at hermia dot au — but the trial will show you more in 3 days than any demo call."
Price: "The trial is completely free. If it doesn't book you more inspections, cancel and it costs you nothing."

PHASE 8 — FINAL CLOSE:
"Go to hermia dot au and start your free trial — connects to your inbox in 5 minutes."
"You'll see a difference in the first 24 hours."`;

async function makeCall(phone, name, callId) {
  try {
    const call = await twilioClient.calls.create({
      to: phone,
      from: TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/voice?callId=${callId}&name=${encodeURIComponent(name)}`,
    });
    console.log(`✅ Call placed to ${phone} — SID: ${call.sid}`);
  } catch (err) {
    console.error(`❌ Call failed: ${err.message}`);
  }
}

// Webhook from Make.com / calendar form
app.post("/trigger-call", async (req, res) => {
  const { phone, name, email, market, timeSlot } = req.body;
  if (!phone || !name) return res.status(400).json({ error: "phone and name required" });

  // Normalise Australian number
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "61" + digits.slice(1);
  if (!digits.startsWith("+")) digits = "+" + digits;

  const callId = `call_${Date.now()}`;
  conversations[callId] = { leadName: name, leadEmail: email, market, messages: [] };

  const delayMs = getDelayMs(timeSlot || "now");
  const delayMins = Math.round(delayMs / 60000);

  console.log(`📅 ${name} (${digits}) — timeSlot: "${timeSlot}" — calling in ${delayMins} min`);

  // Schedule the call after the delay
  setTimeout(() => makeCall(digits, name, callId), delayMs);

  // Respond immediately to the webhook
  res.json({
    success: true,
    callId,
    message: delayMs === 0
      ? "Calling now"
      : `Call scheduled in ${delayMins} minute${delayMins === 1 ? "" : "s"}`,
  });
});

app.post("/voice", (req, res) => {
  const { callId, name } = req.query;
  const twiml = new twilio.twiml.VoiceResponse();

  const greeting = `Hey ${name}, this is Jared from Hermia — you booked a call to see how we work. Quick question — when a new inquiry comes in from Domain or REA, what actually happens on your end right now?`;

  if (conversations[callId]) {
    conversations[callId].messages.push({ role: "assistant", content: greeting });
  }

  twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, greeting);
  twiml.gather({
    input: "speech",
    action: `${BASE_URL}/respond?callId=${callId}`,
    speechTimeout: "auto",
    language: "en-AU",
    timeout: 10,
  });

  twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Hey, still there?");
  twiml.gather({
    input: "speech",
    action: `${BASE_URL}/respond?callId=${callId}`,
    speechTimeout: "auto",
    language: "en-AU",
    timeout: 8,
  });

  res.type("text/xml").send(twiml.toString());
});

app.post("/respond", async (req, res) => {
  const { callId } = req.query;
  const userSpeech = req.body.SpeechResult || "";
  const twiml = new twilio.twiml.VoiceResponse();
  const conv = conversations[callId] || { messages: [] };

  console.log(`🎤 Lead: "${userSpeech}"`);

  const hangupWords = ["goodbye", "bye", "no thanks", "not interested", "hang up", "gotta go", "call you back"];
  if (hangupWords.some(w => userSpeech.toLowerCase().includes(w))) {
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "No worries at all. Jump onto hermia dot au for the free trial anytime. Have a great day!");
    twiml.hangup();
    return res.type("text/xml").send(twiml.toString());
  }

  if (!userSpeech.trim()) {
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Sorry, didn't catch that — could you say that again?");
    twiml.gather({
      input: "speech",
      action: `${BASE_URL}/respond?callId=${callId}`,
      speechTimeout: "auto",
      language: "en-AU",
      timeout: 10,
    });
    return res.type("text/xml").send(twiml.toString());
  }

  conv.messages.push({ role: "user", content: userSpeech });

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
    conversations[callId] = conv;

    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, reply);
    twiml.gather({
      input: "speech",
      action: `${BASE_URL}/respond?callId=${callId}`,
      speechTimeout: "auto",
      language: "en-AU",
      timeout: 12,
    });

    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Still there?");
    twiml.gather({
      input: "speech",
      action: `${BASE_URL}/respond?callId=${callId}`,
      speechTimeout: "auto",
      timeout: 8,
    });
    twiml.hangup();

  } catch (err) {
    console.error(`❌ Claude error: ${err.message}`);
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Quick tech hiccup — head to hermia dot au for the free trial. Thanks!");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Hermia — Jared live on port ${PORT}`));

