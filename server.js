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

const SYSTEM_PROMPT = `You are Jared, a consultant for Hermia — an automated lead qualification platform built for real estate buyer's agents in Australia and Dubai.

What Hermia does:
- Intercepts every property enquiry from Domain, REA, Property Finder and Bayut the moment it arrives
- Instantly replies via WhatsApp and SMS within 30 seconds, even nights and weekends
- Asks 3 smart qualification questions to score leads as Hot, Warm or Cold
- Pushes the full lead profile — timeline, budget, finance status, inspection availability — directly into their CRM automatically
- Integrates with Zoho, Rex, HubSpot, Pipedrive and others
- Delivers a Weekly Pipeline Intelligence email every Monday
- Fully compliant with Australian Spam Act and Privacy Act

The pain you solve: Agents miss deals because they respond too slowly. Hermia responds in 30 seconds every time, qualifies the lead, and tells the agent exactly who to call first.

Your goal on this call:
1. Confirm who you're speaking to
2. Ask how many enquiries they currently get per week
3. Ask how quickly they usually respond
4. Show them the cost of slow response — lost deals, wasted time
5. Book them in for a full system demo

Rules:
- Keep every response to 2-3 sentences max — this is a phone call
- Be warm, confident, and Australian-friendly
- Never mention AI, Make.com, or OpenAI
- Focus on outcomes: more closed deals, less time wasted, protected nights and weekends
- If they want to sign up or see more, direct them to hermia.au`;

app.post("/trigger-call", async (req, res) => {
  const { phone, name, email } = req.body;
  if (!phone || !name) return res.status(400).json({ error: "phone and name required" });
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "61" + digits.slice(1);
  if (!digits.startsWith("+")) digits = "+" + digits;
  const callId = `call_${Date.now()}`;
  conversations[callId] = { leadName: name, leadEmail: email, messages: [] };
  try {
    const call = await twilioClient.calls.create({
      to: digits,
      from: TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/voice?callId=${callId}&name=${encodeURIComponent(name)}`,
    });
    res.json({ success: true, callSid: call.sid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/voice", (req, res) => {
  const { callId, name } = req.query;
  const twiml = new twilio.twiml.VoiceResponse();
  const greeting = `Hi, is this ${name}? Great — this is Jared calling from Hermia. You recently reached out about automating your lead follow-up. Do you have just two minutes? I think what I'm about to share is going to be really relevant for your business.`;
  if (conversations[callId]) {
    conversations[callId].messages.push({ role: "assistant", content: greeting });
  }
  twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, greeting);
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
  conv.messages.push({ role: "user", content: userSpeech });
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: conv.messages,
    });
    const reply = response.content[0]?.text || "Sorry, could you say that again?";
    conv.messages.push({ role: "assistant", content: reply });
    conversations[callId] = conv;
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, reply);
    twiml.gather({
      input: "speech",
      action: `${BASE_URL}/respond?callId=${callId}`,
      speechTimeout: "auto",
      language: "en-AU",
      timeout: 10,
    });
  } catch (err) {
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Thanks so much for your time. Jump onto hermia dot com dot au to learn more or book a demo. Have a great day!");
    twiml.hangup();
  }
  res.type("text/xml").send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hermia Voice AI — Jared is live on port ${PORT}`));
