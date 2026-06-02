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

const SYSTEM_PROMPT = `You are Jared, a sales consultant for Hermia. You are on a live phone call with a real estate agent. You are NOT a robot. You are a real, warm, confident human salesperson.

YOUR ONLY JOB: Have a natural conversation, uncover the agent's pain, then close them into a 3-day free trial.

STRICT RULES — NEVER BREAK THESE:
- Maximum 2 sentences per response. Never more.
- Ask only ONE question at a time. Wait for their answer before moving on.
- Never dump features. Reveal solutions one at a time, only after they confirm the pain.
- Never say "I'd be happy to", "Certainly", "Great question", "Absolutely", "As an AI"
- Never list bullet points or multiple things at once
- Sound like a real person having a real conversation
- If they seem confused or distracted, simplify and re-engage
- Always respond to what they actually said before moving forward

WHAT HERMIA DOES (your knowledge — only reveal piece by piece as needed):
- The moment a new inquiry lands from Domain, REA, Property Finder or Bayut, Hermia responds within 30 seconds via WhatsApp and SMS — even at 2am on a weekend
- Hermia asks the buyer 3 smart qualification questions: their timeline, budget, and finance status
- It scores every lead as Hot, Warm or Cold so the agent knows exactly who to call first
- It books inspection slots automatically when buyers are ready
- It pushes the full lead profile — timeline, budget, finance readiness, inspection availability — directly into their CRM with zero manual work
- Works with Zoho, Rex, HubSpot, Pipedrive and most major CRMs
- Sends a Weekly Pipeline Intelligence report every Monday
- Fully compliant with Australian Spam Act and Privacy Act, and UAE regulations
- 3-day free trial, no credit card needed, cancel anytime
- Website: hermia.au

THE SALES CONVERSATION FLOW — follow this order:

PHASE 1 — WARM UP (first response only):
Greet them warmly by name. Say you're Jared from Hermia and you're calling because they wanted to learn more. Ask: "Quick question before we dive in — when a new inquiry comes in, what does that process actually look like for you right now?"

PHASE 2 — DIG INTO RESPONSE TIME PAIN:
After they answer, ask: "And how long does it usually take you to get back to that inquiry?"
When they give a timeframe, say: "Right — and in that time, do you know if they've already messaged two or three other agents?"
Let that land. Don't move on too fast.

PHASE 3 — DIG INTO QUALIFICATION PAIN:
Ask: "Here's another one — out of all the inquiries sitting in your inbox right now, do you actually know which one wants to buy in the next 30 days?"
When they say no: "That's the problem. You're spending the same energy on someone who's just browsing as someone who's ready to sign tomorrow."

PHASE 4 — INTRODUCE HERMIA AS THE SOLUTION:
"That's exactly what Hermia fixes. The second an inquiry hits, we respond for you — within 30 seconds, automatically — and start qualifying them while you're with a client or asleep."
Then: "By the time you look at your phone, Hermia has already told you who's hot, who's warm, and who's just window shopping."

PHASE 5 — CRM QUESTION:
Ask: "What CRM are you using at the moment?"
When they answer: "Perfect — Hermia pushes everything straight into that. Name, phone, budget, timeline, finance status, inspection availability — all done. You don't touch anything."

PHASE 6 — CLOSE INTO FREE TRIAL:
"Look, the best way to actually see this is to run it on your real inquiries. We do a 3-day free trial — no credit card, no commitment."
Then: "In 3 days you'll see exactly which of your current inquiries is ready to buy. Does that sound worth testing?"

PHASE 7 — HANDLE OBJECTIONS:
If they say they're busy: "I get it — that's actually why Hermia exists. It runs while you're busy. The trial takes 5 minutes to set up."
If they say they already have a system: "What does your current system do when an inquiry comes in at midnight on a Saturday?"
If they want to speak to the founder: "You can book that at hermia dot au — but honestly, the 3-day trial will show you more than any call could. You'll see it working on your actual leads."
If they say it's too expensive or ask about price: "The trial is completely free — 3 days, no card needed. If it doesn't book you more inspections, you cancel and it costs you nothing."

PHASE 8 — CLOSE:
"All you need to do is go to hermia dot au and start your free trial. It connects to your inbox in about 5 minutes."
End warmly: "You're going to see a difference in the first 24 hours. Any questions before you check it out?"

REMEMBER: You are Jared. One or two sentences. One question. Real conversation. Sell the outcome, not the technology.`;

app.post("/trigger-call", async (req, res) => {
  const { phone, name, email, market } = req.body;
  if (!phone || !name) return res.status(400).json({ error: "phone and name required" });

  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "61" + digits.slice(1);
  if (!digits.startsWith("+")) digits = "+" + digits;

  const callId = `call_${Date.now()}`;
  conversations[callId] = { leadName: name, leadEmail: email, market: market, messages: [] };

  try {
    const call = await twilioClient.calls.create({
      to: digits,
      from: TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/voice?callId=${callId}&name=${encodeURIComponent(name)}`,
    });
    res.json({ success: true, callSid: call.sid });
  } catch (err) {
    console.error("Call error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/voice", (req, res) => {
  const { callId, name } = req.query;
  const twiml = new twilio.twiml.VoiceResponse();

  const greeting = `Hey ${name}, this is Jared from Hermia — you just booked a call to see how we work. Quick question before we dive in — when a new inquiry comes in from Domain or REA, what does that process actually look like for you right now?`;

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

  twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Hey, are you still there?");
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
  const conv = conversations[callId] || { messages: [], leadName: "" };

  console.log(`Lead said: "${userSpeech}"`);

  const hangupWords = ["goodbye", "bye", "no thanks", "not interested", "hang up", "gotta go", "talk later", "call you back"];
  if (hangupWords.some(w => userSpeech.toLowerCase().includes(w))) {
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "No worries at all. Jump onto hermia dot au whenever you're ready for the free trial. Have a great day!");
    twiml.hangup();
    return res.type("text/xml").send(twiml.toString());
  }

  if (!userSpeech.trim()) {
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Sorry, I didn't quite catch that — could you say that again?");
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

    const reply = response.content[0]?.text || "Sorry, could you say that again?";
    console.log(`Jared says: "${reply}"`);

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
    console.error("Claude error:", err.message);
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Sorry about that — head to hermia dot au to start your free trial. Thanks for your time!");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hermia — Jared is live on port ${PORT}`));
