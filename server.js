const express = require("express");
const twilio = require("twilio");
const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve audio files publicly
app.use("/audio", express.static(path.join(__dirname, "audio")));
if (!fs.existsSync(path.join(__dirname, "audio"))) {
  fs.mkdirSync(path.join(__dirname, "audio"));
}

const TWILIO_ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN    = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER  = process.env.TWILIO_PHONE_NUMBER;
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY;
const BASE_URL             = process.env.BASE_URL;
const SLACK_WEBHOOK_URL    = process.env.SLACK_WEBHOOK_URL;
const ELEVENLABS_API_KEY   = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID  = process.env.ELEVENLABS_VOICE_ID || "56bWURjYFHyYyVf490Dp";
const ELEVENLABS_VOICE_AR  = process.env.ELEVENLABS_VOICE_AR || "56bWURjYFHyYyVf490Dp"; // swap for Arabic voice ID later

const twilioClient  = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const anthropic     = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const conversations = {};

// ─── ElevenLabs TTS ────────────────────────────────────────────────────
async function generateAudio(text, isArabic = false) {
  const voiceId = isArabic ? ELEVENLABS_VOICE_AR : ELEVENLABS_VOICE_ID;
  const fileName = `audio_${Date.now()}.mp3`;
  const filePath = path.join(__dirname, "audio", fileName);

  const body = JSON.stringify({
    text,
    model_id: "eleven_turbo_v2_5",
    voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true }
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.elevenlabs.io",
      path: `/v1/text-to-speech/${voiceId}`,
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let err = "";
        res.on("data", d => err += d);
        res.on("end", () => reject(new Error(`ElevenLabs ${res.statusCode}: ${err}`)));
        return;
      }
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        fs.writeFileSync(filePath, Buffer.concat(chunks));
        resolve(`${BASE_URL}/audio/${fileName}`);
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Clean up old audio files (older than 10 min)
function cleanupAudio() {
  const dir = path.join(__dirname, "audio");
  const now = Date.now();
  fs.readdirSync(dir).forEach(f => {
    const fp = path.join(dir, f);
    if (now - fs.statSync(fp).mtimeMs > 10 * 60 * 1000) fs.unlinkSync(fp);
  });
}
setInterval(cleanupAudio, 5 * 60 * 1000);

// ─── Helpers ───────────────────────────────────────────────────────────
function getDelayMs(timeSlot) {
  const slots = {
    "now": 0, "5min": 5*60*1000, "10min": 10*60*1000,
    "30min": 30*60*1000, "1hour": 60*60*1000, "2hours": 2*60*60*1000,
    "tomorrow_morning": 16*60*60*1000, "tomorrow_afternoon": 20*60*60*1000,
  };
  return slots[timeSlot] || 0;
}

async function sendSlack(message) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch (err) { console.error("Slack error:", err.message); }
}

function buildSystemPrompt(name, market) {
  return `You are Jared, a sales consultant at Hermia. You are on a live phone call with a real estate agent named ${name} from ${market}. You called them — they booked this call through the Hermia website.

YOU ARE A REAL HUMAN. Warm, natural, confident. NOT a robot.

RULES:
- Max 2 sentences per response. Never more.
- One question at a time. React to what they say first.
- Never say "Great question", "Absolutely", "Certainly", "I'd be happy to", "As an AI"
- Use natural filler: "yeah", "look", "honestly", "I get that"
- Never give free info without moving toward the close
- Always end with a question or a close

THE ONE THING YOU ARE SELLING:
Real estate agents waste hours chasing leads they don't understand. They have 50 inquiries and no idea which one is ready to buy today. Hermia fixes that — qualifies every lead within 30 seconds, scores them Hot/Warm/Cold. Agent wakes up and just calls the hot ones. No guessing. More deals.

HANDLING QUESTIONS:
- How it works: "The second an inquiry hits from REA or Domain, Hermia jumps on it — qualifies them, figures out timeline and budget, scores them hot warm or cold. You wake up knowing exactly who to call."
- CRM: "Yeah we sync into basically everything — Zoho, Rex, HubSpot, Pipedrive, Monday. It all lands in there automatically, no manual work."
- Founder: "Archie built the whole thing — he's a professional architect and software engineer who built the entire infrastructure through Octovera, which is the engine that powers Hermia. But honestly what matters is your leads are being qualified automatically, your CRM is updated without you touching it, and you never miss a hot buyer again."
- Pricing: "3-day free trial, no credit card. If it doesn't work, cancel, costs you nothing."
- Unsure: "Look, what's your biggest headache right now with leads?" — get them talking.

CORE PAIN TO UNCOVER:
Agents guess. They respond to 50 inquiries spending equal energy on a browser as someone ready to buy tomorrow. Once they say "yeah I don't know which ones are serious" — "That's exactly what Hermia solves."

CLOSE: "Try it free for 3 days at hermia.au — connects in 5 minutes, you'll see a difference in the first 24 hours."`;
}

// ─── Make call ────────────────────────────────────────────────────────
async function makeCall(phone, name, callId) {
  try {
    const call = await twilioClient.calls.create({
      to: phone, from: TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/voice?callId=${callId}&name=${encodeURIComponent(name)}`,
    });
    console.log(`✅ Call placed to ${phone} — ${call.sid}`);
    const conv = conversations[callId] || {};
    await sendSlack(`📞 *Jared is calling ${name}*\n📱 ${phone}\n🌏 Market: ${conv.market || "N/A"}\n📅 Date: ${conv.date || "N/A"}\n⏰ Time Slot: ${conv.timeSlot || "N/A"}\n✅ Consent: Given`);
  } catch (err) {
    console.error(`❌ Call failed: ${err.message}`);
    await sendSlack(`❌ Call FAILED for ${name} (${phone}): ${err.message}`);
  }
}

// ─── Trigger call endpoint ────────────────────────────────────────────
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

  const delayMs = getDelayMs(timeSlot || "now");
  const delayMins = Math.round(delayMs / 60000);
  console.log(`📅 ${name} — timeSlot: "${timeSlot}" — calling in ${delayMins} min`);

  if (delayMs > 0) {
    await sendSlack(`🗓 *${name}* booked a call in *${delayMins} minutes*\n📱 ${digits}\n🌏 Market: ${market || "N/A"}\n⏰ Slot: ${timeSlot}\n📅 Date: ${date || "N/A"}\n✅ Consent: Given`);
  }

  setTimeout(() => makeCall(digits, name, callId), delayMs);
  res.json({ success: true, callId, message: delayMs === 0 ? "Calling now" : `Call scheduled in ${delayMins} minutes` });
});

// ─── Voice entry ──────────────────────────────────────────────────────
app.post("/voice", async (req, res) => {
  const { callId, name } = req.query;
  const twiml = new twilio.twiml.VoiceResponse();
  const conv = conversations[callId];
  const isUAE = conv?.market === "UAE";

  const recordingText = isUAE
    ? "مرحباً، هذه المكالمة قد تُسجَّل لأغراض التدريب. إذا كنت لا ترغب في التسجيل، اضغط 2 الآن."
    : "Just so you know, this call may be recorded for training purposes. Press 2 if you'd prefer not to be recorded.";

  const greetingText = isUAE
    ? `أهلاً ${name}، معك جاريد من هيرميا، شكراً لحجزك هذه المكالمة. كيف يمكنني مساعدتك اليوم؟`
    : `Hey ${name}! It's Jared from Hermia — thanks for booking a call with us. So what did you want to know?`;

  if (conv) {
    conv.messages.push({ role: "assistant", content: greetingText });
    conv.transcript.push(`Jared: ${greetingText}`);
  }

  try {
    // Generate both audio files
    const [recordingUrl, greetingUrl] = await Promise.all([
      generateAudio(recordingText, isUAE),
      generateAudio(greetingText, isUAE)
    ]);

    const gather = twiml.gather({
      numDigits: 1,
      action: `${BASE_URL}/recording-choice?callId=${callId}&name=${encodeURIComponent(name)}&greetingUrl=${encodeURIComponent(greetingUrl)}`,
      timeout: 4
    });
    gather.play(recordingUrl);

    // No key press — play greeting
    twiml.play(greetingUrl);
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: isUAE ? "ar-XA" : "en-AU", timeout: 10 });
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Hey, still there?");
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: isUAE ? "ar-XA" : "en-AU", timeout: 8 });
    twiml.hangup();

  } catch (err) {
    console.error("ElevenLabs error on voice entry:", err.message);
    // Fallback to Polly if ElevenLabs fails
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, `Hey ${name}, it's Jared from Hermia. Thanks for booking a call. What did you want to know?`);
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: "en-AU", timeout: 10 });
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

// ─── Recording choice ─────────────────────────────────────────────────
app.post("/recording-choice", async (req, res) => {
  const { callId, name, greetingUrl } = req.query;
  const digit = req.body.Digits;
  const twiml = new twilio.twiml.VoiceResponse();
  const conv = conversations[callId];
  const isUAE = conv?.market === "UAE";

  if (digit === "2") {
    try {
      const notedUrl = await generateAudio(isUAE ? "حسناً، لن يتم التسجيل. لنبدأ." : "No worries, noted.", isUAE);
      twiml.play(notedUrl);
    } catch {
      twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "No worries, noted.");
    }
  }

  if (greetingUrl) {
    twiml.play(decodeURIComponent(greetingUrl));
  }
  twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: isUAE ? "ar-XA" : "en-AU", timeout: 10 });
  twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: isUAE ? "ar-XA" : "en-AU", timeout: 8 });
  twiml.hangup();

  res.type("text/xml").send(twiml.toString());
});

// ─── Respond ──────────────────────────────────────────────────────────
app.post("/respond", async (req, res) => {
  const { callId } = req.query;
  const userSpeech = req.body.SpeechResult || "";
  const twiml = new twilio.twiml.VoiceResponse();
  const conv = conversations[callId] || { messages: [], transcript: [], leadName: "", market: "Australia" };
  const isUAE = conv.market === "UAE";

  console.log(`🎤 Lead: "${userSpeech}"`);

  const hangupWords = ["goodbye", "bye", "no thanks", "not interested", "hang up", "gotta go", "وداعاً", "إلى اللقاء", "لا شكراً"];
  if (hangupWords.some(w => userSpeech.toLowerCase().includes(w))) {
    const farewell = isUAE
      ? "لا بأس — تفضل بزيارة hermia.au لتجربة مجانية في أي وقت. يوم سعيد!"
      : "No worries at all — jump onto hermia.au for the free trial anytime. Have a great day!";
    try {
      const farewellUrl = await generateAudio(farewell, isUAE);
      twiml.play(farewellUrl);
    } catch {
      twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, farewell);
    }
    twiml.hangup();
    conv.transcript.push(`Lead: ${userSpeech}`, `Jared: ${farewell}`);
    await sendSlack(`📋 *Call ended — ${conv.leadName}*\n\`\`\`${conv.transcript.join("\n").slice(0, 2800)}\`\`\``);
    return res.type("text/xml").send(twiml.toString());
  }

  if (!userSpeech.trim()) {
    try {
      const retryUrl = await generateAudio(isUAE ? "عذراً، لم أسمع ذلك — هل يمكنك التكرار؟" : "Sorry, didn't catch that — could you say that again?", isUAE);
      twiml.play(retryUrl);
    } catch {
      twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Sorry, didn't catch that — could you say that again?");
    }
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: isUAE ? "ar-XA" : "en-AU", timeout: 10 });
    return res.type("text/xml").send(twiml.toString());
  }

  conv.messages.push({ role: "user", content: userSpeech });
  conv.transcript.push(`Lead: ${userSpeech}`);

  try {
    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 120,
      system: buildSystemPrompt(conv.leadName, conv.market),
      messages: conv.messages,
    });

    const reply = aiResponse.content[0]?.text || (isUAE ? "هل يمكنك التكرار؟" : "Could you say that again?");
    console.log(`🤖 Jared: "${reply}"`);

    conv.messages.push({ role: "assistant", content: reply });
    conv.transcript.push(`Jared: ${reply}`);
    conversations[callId] = conv;

    // Generate ElevenLabs audio for reply
    const replyUrl = await generateAudio(reply, isUAE);
    twiml.play(replyUrl);
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", language: isUAE ? "ar-XA" : "en-AU", timeout: 12 });
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Still there?");
    twiml.gather({ input: "speech", action: `${BASE_URL}/respond?callId=${callId}`, speechTimeout: "auto", timeout: 8 });
    twiml.hangup();

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    twiml.say({ voice: "Polly.Matthew-Neural", language: "en-AU" }, "Quick tech hiccup — head to hermia.au for the free trial. Thanks!");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

// ─── Call complete ────────────────────────────────────────────────────
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



