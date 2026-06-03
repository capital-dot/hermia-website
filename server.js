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

function buildSystemPrompt(name, market) {
  return `You are Jared, a sales consultant at Hermia. You are on a live phone call with a real estate agent named ${name} from ${market}. You called them — they booked this call through the Hermia website to learn more.

YOU ARE A REAL HUMAN. You are warm, natural, confident, and conversational. You do NOT sound like a robot or a script.

YOUR PERSONALITY:
- Talk like a real person. Use natural filler like "yeah", "look", "honestly", "I get that"
- Actually LISTEN to what they say and respond to it directly first
- Never jump ahead. Never recite a pitch. React to them.
- You are confident but not pushy. You let the sale come naturally.
- Short responses. Max 2 sentences. One question at a time.
- Never say "Great question", "Absolutely", "Certainly", "I'd be happy to", "As an AI"

THE ONE THING YOU ARE SELLING:
Real estate agents waste hours every day chasing leads they don't understand. They have 50 inquiries and no idea which one is ready to buy today. Hermia fixes that. It qualifies every lead automatically — within 30 seconds of the inquiry coming in — and tells the agent exactly who to call first. Hot, warm, cold. No guessing. The agent just calls the hot ones and closes deals.

That's it. That's the whole thing. Everything else (CRM sync, WhatsApp, booking inspections, reports) is just detail that comes up naturally if they ask.

HOW TO HANDLE THEIR QUESTIONS:
- If they ask how it works: "Basically the second an inquiry comes in from REA or Domain, Hermia jumps on it — qualifies them, figures out their timeline and budget, then scores them hot warm or cold. You just wake up and know exactly who to call."
- If they ask about CRM: "Yeah we sync into basically everything — Zoho, Rex, HubSpot, Pipedrive, Monday, most of them. It all lands in there automatically."
- If they ask about the founder: "Archie built the whole thing — he's an architect and software engineer, built the entire infrastructure through Octovera which powers Hermia. But honestly the tech side is less interesting than what it does for your pipeline."
- If they ask about pricing: "We do a 3-day free trial, no credit card, nothing to lose. If it doesn't work you cancel and it costs you zero."
- If they seem unsure: "Look, what's your biggest headache right now with leads?" — get them talking about their pain.

THE CORE PAIN TO UNCOVER (naturally, not as a script):
Agents are guessing. They respond to 50 inquiries and spend equal energy on someone browsing as someone ready to buy tomorrow. That's the problem. Once they admit that — "yeah I don't really know which ones are serious" — that's when you say: "That's exactly what Hermia solves."

ALWAYS BE MOVING TOWARD THE CLOSE:
The close is: "Try it free for 3 days at hermia.au — connects in 5 minutes and you'll see a difference in the first 24 hours."
Weave it in naturally. Don't dump it. When they've understood the value, close.

RECORDING NOTICE: The call is being recorded for training. This was already announced at the start. Do not repeat it.

Remember: you called ${name}. They booked this. They want to know more. Your job is to have a real conversation, understand their situation, and show them that Hermia solves their exact problem.`;
}

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

  let digits = phone.replace(/\s+/g, "");
  if (!digits.startsWith("+")) {
    digits = digits.replace(/\D/g, "");
    if (digits.startsWith("61") && !digits.startsWith("610")) digits = "+" + digits;
    else if (digits.startsWith("971") && !digits.startsWith("9710")) digits = "+" + digits;
    else if (digits.startsWith("0")) digits = (market === "UAE" ? "+971" : "+61") + digits.slice(1);
    else digits = (market === "UAE" ? "+971" : "+61") + digits;
  }
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
  res.json({ success: true, callId, message: delayMs === 0 ? "Calling now" : `Call scheduled in ${delayMins} minutes` });
});

app.post("/voice", (req, res) => {
  const { callId, name } = req.query;
  const twiml = new twilio.twiml.VoiceResponse();
  const conv = conversations[callId];
  const market = conv?.market || "Australia";
  const isUAE = market === "UAE";
  const voice = isUAE ? "Polly.Zeina" : "Polly.Matthew-Neural";
  const language = isUAE ? "ar-XA" : "en-AU";

  // Recording notice
  const recordingNotice = isUAE
    ? `مرحباً، هذه المكالمة قد تُسجَّل لأغراض التدريب وضمان الجودة. إذا كنت لا ترغب في التسجيل، اضغط 2 الآن.`
    : `Just so you know, this call may be recorded for training and quality purposes. If you'd prefer not to be recorded, press 2 now.`;

  const greeting = isUAE
    ? `أهلاً ${name}، معك جاريد من هيرميا — شكراً لحجزك هذه المكالمة. كيف يمكنني مساعدتك اليوم؟`
    : `Hey ${name}! It's Jared from Hermia — thanks for booking a call with us. So what did you want to know?`;

  if (conv) {
    conv.messages.push({ role: "assistant", content: greeting });
    conv.transcript.push(`Jared: ${greeting}`);
  }

  const gather = twiml.gather({
    numDigits: 1,
    action: `${BASE_URL}/recording-choice?callId=${callId}&name=${encodeURIComponent(name)}`,
    timeout: 4
  });
  gather.say({ voice, language }, recordingNotice);

  // No key press — go straight to greeting
  twiml.say({ voice, language }, greeting);
  twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: isUAE ? "ar-XA" : "en-AU", timeout: 10 });
  twiml.say({ voice, language }, isUAE ? "هل أنت هناك؟" : "Hey, still there?");
  twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: isUAE ? "ar-XA" : "en-AU", timeout: 8 });
  twiml.hangup();

  res.type("text/xml").send(twiml.toString());
});

app.post("/recording-choice", (req, res) => {
  const { callId, name } = req.query;
  const digit = req.body.Digits;
  const twiml = new twilio.twiml.VoiceResponse();
  const conv = conversations[callId];
  const isUAE = conv?.market === "UAE";
  const voice = isUAE ? "Polly.Zeina" : "Polly.Matthew-Neural";
  const language = isUAE ? "ar-XA" : "en-AU";

  const greeting = isUAE
    ? `أهلاً ${name}، معك جاريد من هيرميا — شكراً لحجزك هذه المكالمة. كيف يمكنني مساعدتك اليوم؟`
    : `Hey ${name}! It's Jared from Hermia — thanks for booking a call with us. So what did you want to know?`;

  if (digit === "2") {
    twiml.say({ voice, language }, isUAE ? "حسناً، لن يتم التسجيل. لنبدأ." : "No worries, noted.");
  }

  twiml.say({ voice, language }, greeting);
  twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language, timeout: 10 });
  twiml.say({ voice, language }, isUAE ? "هل أنت هناك؟" : "Hey, still there?");
  twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language, timeout: 8 });
  twiml.hangup();

  res.type("text/xml").send(twiml.toString());
});

app.post("/respond", async (req, res) => {
  const { callId } = req.query;
  const userSpeech = req.body.SpeechResult || "";
  const twiml = new twilio.twiml.VoiceResponse();
  const conv = conversations[callId] || { messages: [], transcript: [], leadName: "", market: "Australia" };
  const isUAE = conv.market === "UAE";
  const voice = isUAE ? "Polly.Zeina" : "Polly.Matthew-Neural";
  const language = isUAE ? "ar-XA" : "en-AU";

  console.log(`🎤 Lead: "${userSpeech}"`);

  const hangupWords = ["goodbye", "bye", "no thanks", "not interested", "hang up", "gotta go", "وداعاً", "إلى اللقاء", "لا شكراً"];
  if (hangupWords.some(w => userSpeech.toLowerCase().includes(w))) {
    const farewell = isUAE
      ? "لا بأس على الإطلاق — تفضل بزيارة hermia.au لتجربة مجانية في أي وقت. يوم سعيد!"
      : "No worries at all — jump onto hermia.au for the free trial anytime. Have a great day!";
    twiml.say({ voice, language }, farewell);
    twiml.hangup();
    conv.transcript.push(`Lead: ${userSpeech}`, `Jared: ${farewell}`);
    await sendSlack(`📋 *Call ended — ${conv.leadName}*\n\`\`\`${conv.transcript.join("\n").slice(0, 2800)}\`\`\``);
    return res.type("text/xml").send(twiml.toString());
  }

  if (!userSpeech.trim()) {
    twiml.say({ voice, language }, isUAE ? "عذراً، لم أسمع ذلك — هل يمكنك التكرار؟" : "Sorry, didn't catch that — could you say that again?");
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language, timeout: 10 });
    return res.type("text/xml").send(twiml.toString());
  }

  conv.messages.push({ role: "user", content: userSpeech });
  conv.transcript.push(`Lead: ${userSpeech}`);

  try {
    const systemPrompt = buildSystemPrompt(conv.leadName, conv.market);
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 120,
      system: systemPrompt,
      messages: conv.messages,
    });

    const reply = response.content[0]?.text || (isUAE ? "هل يمكنك التكرار؟" : "Could you say that again?");
    console.log(`🤖 Jared: "${reply}"`);

    conv.messages.push({ role: "assistant", content: reply });
    conv.transcript.push(`Jared: ${reply}`);
    conversations[callId] = conv;

    twiml.say({ voice, language }, reply);
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language, timeout: 12 });
    twiml.say({ voice, language }, isUAE ? "هل أنت هناك؟" : "Still there?");
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language, timeout: 8 });
    twiml.hangup();

  } catch (err) {
    console.error(`❌ Claude error: ${err.message}`);
    twiml.say({ voice, language }, isUAE ? "عذراً، حدث خطأ تقني — تفضل بزيارة hermia.au" : "Quick tech hiccup — head to hermia.au for the free trial. Thanks!");
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



