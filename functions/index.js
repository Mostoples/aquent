/* =====================================================
   AQUENT — Firebase Cloud Functions
   Gemini API Proxy (P4 AI Chat + P5 Skin Scanner)
   ===================================================== */

const { onRequest } = require('firebase-functions/v2/https');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { defineSecret } = require('firebase-functions/params');

const GEMINI_KEY = defineSecret('GEMINI_KEY');

// Rate limiting: max 20 req/mnt per IP
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now  = Date.now();
  const list = (rateLimitMap.get(ip) || []).filter(t => now - t < 60000);
  if (list.length >= 20) return false;
  list.push(now);
  rateLimitMap.set(ip, list);
  return true;
}

// Input sanitizer
function sanitize(str, maxLen = 1000) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, maxLen);
}

// CORS helper
function setCORS(res) {
  res.set('Access-Control-Allow-Origin', 'https://aquent-id.web.app');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

// =====================================================
// /ai-chat — AI Skin Consultant (P4)
// =====================================================
exports.aiChat = onRequest({ secrets:[GEMINI_KEY], cors:false }, async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error:'Method Not Allowed' }); return; }

  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  if (!checkRateLimit(ip)) { res.status(429).json({ error:'Rate limit exceeded. Coba lagi dalam 1 menit.' }); return; }

  const { message, sensorData, skinType, history } = req.body || {};
  if (!message) { res.status(400).json({ error:'Field "message" wajib diisi.' }); return; }

  const safeMsg    = sanitize(message, 500);
  const safeSkin   = sanitize(skinType || 'normal', 20);
  const safeHist   = (history || []).slice(-6).map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: sanitize(h.text, 300) }],
  }));

  const sensor = sensorData || {};
  const sensorCtx = `pH=${sensor.ph ?? '?'}, Suhu=${sensor.temperature ?? '?'}°C, Kekeruhan=${sensor.turbidity ?? '?'} NTU`;

  const systemPrompt = `Kamu adalah AQUENT AI, asisten kesehatan kulit dan kualitas air yang ramah. Jawab dalam Bahasa Indonesia yang natural dan mudah dipahami.

PENTING:
- Kamu BUKAN dokter dan TIDAK mendiagnosis penyakit
- Selalu sertakan elemen XAI: jelaskan MENGAPA kamu merekomendasikan sesuatu
- Sebutkan faktor-faktor (pH, suhu, turbidity, tipe kulit) yang mempengaruhi jawabanmu
- Berikan tingkat kepercayaan: Tinggi/Sedang/Rendah
- Rekomendasikan konsultasi dokter untuk masalah kulit serius

Data sensor shower saat ini: ${sensorCtx}
Tipe kulit pengguna: ${safeSkin}

Basis ilmiah:
- pH air optimal 6.5–7.5 (WHO 2022, Lambers et al. 2019)
- Suhu mandi optimal 36–38°C (Wollenberg et al. JEADV 2022)
- Turbidity ≤0.5 NTU optimal (WHO 2022, Parra et al. 2020)
- Air keras >300 ppm TDS meningkatkan risiko eksim (Jabbar-Lopez et al. 2021)`;

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY.value());
    const model = genAI.getGenerativeModel({ model:'gemini-2.0-flash' });
    const chat  = model.startChat({
      history: [
        { role:'user',  parts:[{ text:'Kamu adalah?' }] },
        { role:'model', parts:[{ text:systemPrompt }] },
        ...safeHist,
      ],
    });
    const result = await chat.sendMessage(safeMsg);
    const text   = result.response.text();
    res.json({ answer: text, source:'gemini' });
  } catch (e) {
    console.error('Gemini AI Chat error:', e.message);
    res.status(500).json({ error:'AI tidak tersedia saat ini. Coba lagi nanti.', details: e.message });
  }
});

// =====================================================
// /skin-scan — Skin Camera Scanner (P5)
// =====================================================
exports.skinScan = onRequest({ secrets:[GEMINI_KEY], cors:false }, async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error:'Method Not Allowed' }); return; }

  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  if (!checkRateLimit(ip)) { res.status(429).json({ error:'Rate limit exceeded.' }); return; }

  const { image, sensorData } = req.body || {};
  if (!image) { res.status(400).json({ error:'Field "image" (base64) wajib diisi.' }); return; }
  if (image.length > 2_000_000) { res.status(413).json({ error:'Ukuran gambar terlalu besar. Maks 1.5MB.' }); return; }

  const sensor = sensorData || {};
  const sensorCtx = `pH=${sensor.ph ?? '?'}, Suhu=${sensor.temperature ?? '?'}°C, Kekeruhan=${sensor.turbidity ?? '?'} NTU`;

  const prompt = `Kamu adalah dermatologist AI yang menganalisis kondisi kulit dari foto wajah. Analisis secara profesional dan sertakan XAI (Explainable AI).

Konteks data shower pengguna: ${sensorCtx}

PRIVASI: Foto ini tidak disimpan dan hanya diproses untuk analisis ini saja.

Berikan hasil analisis HANYA dalam format JSON ini (tanpa markdown, tanpa teks lain):
{
  "skinScore": <0-100>,
  "skinType": "<dry|oily|normal|combination|sensitive>",
  "hydrationLevel": <0-100>,
  "conditions": [
    {"name": "<nama kondisi>", "detected": <true|false>, "confidence": <0-100>}
  ],
  "factors": [
    {"name": "<faktor>", "value": "<nilai>", "contribution": <0-100>, "impact": "<positive|negative|neutral>"}
  ],
  "recommendations": ["<rekomendasi 1>", "<rekomendasi 2>", "<rekomendasi 3>"],
  "waterCompatibility": "<penjelasan kompatibilitas air shower dengan kondisi kulit>",
  "confidence": <0-100>,
  "disclaimer": "Ini bukan diagnosis medis. Konsultasikan dengan dokter kulit untuk penanganan lebih lanjut."
}

Faktor XAI yang WAJIB dianalisis:
- Hidrasi (moisture level dari tekstur kulit)
- Keseimbangan Minyak (sebum dari kilap/pori)
- Tekstur (kehalusan/kekasaran permukaan)
- Pori (ukuran dan kebersihan pori)`;

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY.value());
    const model = genAI.getGenerativeModel({ model:'gemini-1.5-flash' });
    const result = await model.generateContent([
      { inlineData: { mimeType:'image/jpeg', data:image } },
      { text: prompt },
    ]);
    const raw  = result.response.text().replace(/```json|```/g, '').trim();
    const data = JSON.parse(raw);
    res.json({ ...data, source:'gemini-vision' });
  } catch (e) {
    console.error('Gemini Skin Scan error:', e.message);
    res.status(500).json({ error:'Analisis kulit gagal. Pastikan foto jelas dan coba lagi.', details:e.message });
  }
});
