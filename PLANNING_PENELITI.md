# AQUENT — Rencana Kerja TAB PENELITI
**Versi:** 1.0 | **Tanggal:** 2026-04-29
**Peran:** Content & Knowledge Producer
**Berkolaborasi dengan:** TAB PROGRAMMER (lihat `PLANNING_PROGRAMMER.md`)

---

## Prinsip Peran Ini

Peneliti **tidak menyentuh kode** (`app.js`, `style.css`, `app.html`).
Semua output adalah **konten, data JSON, prompt AI, dan dokumentasi ilmiah** yang akan dikonsumsi oleh Programmer untuk membangun fitur.

> Output Peneliti = bahan bakar fitur.
> Semakin lengkap dan akurat output Peneliti, semakin baik fitur yang dibangun Programmer.

---

## File yang Menjadi Tanggung Jawab Peneliti

```
data/
  thresholds.json        ← nilai batas aman 5 parameter (WHO/SNI/literatur)
  encyclopedia.json      ← 40+ kondisi kulit + hubungan dengan kualitas air
  products.json          ← 20+ produk skincare + aturan pencocokan
  dermal-guide.json      ← panduan mandi per tipe kulit × kondisi air
  badges.json            ← 8 badge gamifikasi + kriteria ilmiah

prompts/
  ai-chat-system.md      ← system prompt Gemini AI Chat
  skin-scan-system.md    ← system prompt Gemini Vision (analisis kulit)
  xai-explanation.md     ← template kalimat penjelasan XAI bahasa Indonesia

RESEARCH.md              ← dokumen riset: basis ilmiah tiap fitur & threshold
slr.html                 ← perkaya halaman SLR (abstrak, tabel, narasi)
index.html               ← isi nama tim, perkaya deskripsi produk
```

**JANGAN sentuh:** `app.html`, `app.js`, `style.css`, `firebase.json`, `functions/`

---

## Daftar Tugas Peneliti

### R1 — `data/thresholds.json` ⚡ PRIORITAS TINGGI
> Programmer menunggu file ini untuk membangun Quality Score engine dan alert system.

Isi nilai batas aman untuk 5 parameter berdasarkan sumber ilmiah terverifikasi:

| Parameter | Satuan | Rentang Aman Awal | Sumber Awal |
|---|---|---|---|
| pH | pH | 6.5–8.5 | WHO 2022 |
| Suhu (temp) | °C | 35–42 | SNI 01-3553-2006 |
| Kekeruhan (turbidity) | NTU | 0–1 | WHO 2022 |
| TDS / Mineral Hardness | ppm | 0–300 | WHO 2022 |
| Klorin Bebas (chlorine) | mg/L | 0.2–0.5 | WHO 2022 |

**Yang harus dilengkapi:**
- Verifikasi nilai dari literatur SLR (21 paper yang sudah ada)
- Tambahkan field `skin_impact` — penjelasan singkat dampak ke kulit jika nilai di luar batas
- Tambahkan field `alert_message` — kalimat notifikasi bahasa Indonesia
- Justifikasi bobot XAI: mengapa pH 35%, Suhu 35%, Turbidity 30%?

**Format wajib:**
```json
{
  "ph": {
    "min": 6.5,
    "max": 8.5,
    "unit": "pH",
    "source": "WHO Guidelines for Drinking-water Quality, 2022",
    "weight_xai": 0.35,
    "skin_impact_low": "pH asam mengganggu skin barrier dan meningkatkan risiko iritasi",
    "skin_impact_high": "pH basa mengurangi kelembapan alami kulit",
    "alert_low": "pH air terlalu asam ({value}). Pertimbangkan filter alkali.",
    "alert_high": "pH air terlalu basa ({value}). Kurangi durasi mandi."
  }
}
```

---

### R2 — `prompts/ai-chat-system.md` ⚡ PRIORITAS TINGGI
> Programmer menunggu file ini untuk membangun Firebase Function `/ai-chat`.

Tulis system prompt lengkap untuk Gemini 2.0 Flash sebagai AI Konsultan Kulit AQUENT.

**Yang harus ada dalam prompt:**
1. **Identitas AI** — nama, peran, batasan (bukan dokter)
2. **Konteks sensor** — variabel yang akan disisipkan: `{ph}`, `{temp}`, `{turbidity}`, `{tds}`, `{chlorine}`, `{skinType}`, `{score}`
3. **Format response JSON wajib:**
   ```json
   {
     "answer": "jawaban bahasa Indonesia",
     "factors": [
       {"name": "pH Air", "contribution": 82, "detail": "pH 6.1 bersifat asam..."}
     ],
     "confidence": 88,
     "disclaimer": "Ini bukan diagnosis medis."
   }
   ```
4. **Few-shot examples** — minimal 3 contoh pertanyaan & jawaban lengkap dengan factors[]
5. **Referensi ilmiah** — sebutkan 2–3 literatur SLR sebagai basis jawaban
6. **Batasan topik** — AI hanya menjawab soal kualitas air & kesehatan kulit

**Contoh few-shot yang dibutuhkan:**
- "Apakah aman mandi sekarang?" (dengan kondisi sensor tertentu)
- "Kulit saya terasa kering setelah mandi, kenapa?"
- "Rekomendasi sabun untuk kondisi air ini?"

---

### R3 — `prompts/skin-scan-system.md` ⚡ PRIORITAS TINGGI
> Programmer menunggu file ini untuk Firebase Function `/skin-scan`.

Tulis system prompt untuk Gemini 1.5 Pro Vision menganalisis kondisi kulit dari foto.

**Yang harus ada:**
1. Instruksi analisis foto kulit wajah secara profesional
2. Konteks sensor yang disisipkan: `{ph}`, `{temp}`, `{tds}`, `{chlorine}`
3. Format response JSON wajib (lengkapi semua field):
   ```json
   {
     "skinScore": 75,
     "skinType": "dry",
     "hydrationLevel": 45,
     "conditions": [
       {"name": "Kulit Kering", "detected": true, "confidence": 88, "location": "pipi"}
     ],
     "factors": [
       {"name": "pH Air", "value": "6.1", "contribution": 70, "impact": "negative"}
     ],
     "recommendations": ["Gunakan moisturizer ceramide", "Persingkat durasi mandi"],
     "waterCompatibility": "Air saat ini kurang cocok untuk kulit kering Anda karena...",
     "confidence": 82,
     "disclaimer": "Ini bukan diagnosis medis. Konsultasikan dengan dokter kulit."
   }
   ```
4. Batasan etis: privasi, tidak menyimpan gambar, bukan diagnosis
5. Instruksi kualitas foto yang diterima (cahaya, jarak, orientasi)

---

### R4 — `data/encyclopedia.json` 📚 PRIORITAS SEDANG
> Digunakan Programmer untuk fitur Ensiklopedia Dermatologi (F03).

Isi **minimal 20 kondisi kulit** (target 40+) yang relevan dengan kualitas air mandi.

**Kondisi yang wajib ada (berdasarkan SLR):**
- Dermatitis Atopik (Eksim) — ref: Jabbar-Lopez 2021
- Psoriasis — ref: Thyssen 2021
- Dermatitis Kontak
- Kulit Kering (Xerosis)
- Kulit Sensitif
- Rosacea
- Folikulitis (dari air terkontaminasi)
- Dermatitis Seboroik
- Urtikaria (biduran)
- Ichthyosis

**Format wajib tiap entri:**
```json
{
  "id": "atopic-dermatitis",
  "name": "Dermatitis Atopik (Eksim)",
  "tags": ["kulit kering", "alergi", "inflamasi"],
  "description": "Kondisi kulit kronis yang ditandai dengan...",
  "causes": "Kombinasi faktor genetik dan lingkungan...",
  "water_triggers": {
    "ph_low": true,
    "ph_high": false,
    "tds_high": true,
    "chlorine_high": true,
    "temp_high": true
  },
  "water_triggers_explanation": "Air keras (TDS tinggi) dapat mengikis ceramide...",
  "recommendations": [
    "Gunakan air hangat (36-38°C), bukan air panas",
    "Segera oleskan moisturizer dalam 3 menit setelah mandi"
  ],
  "when_to_see_doctor": "Jika gejala tidak membaik dalam 2 minggu...",
  "sources": ["doi:10.1111/bjd.19862", "doi:10.1111/jdv.17098"]
}
```

---

### R5 — `data/products.json` 🛍️ PRIORITAS SEDANG
> Digunakan Programmer untuk Product Recommender (B3.3).

Isi **minimal 20 produk skincare** mencakup kategori: sabun, moisturizer, toner, serum, sunscreen.

**Kriteria produk:**
- Relevan untuk kondisi air mandi (pH, TDS, klorin)
- Ada rekomendasi berbasis tipe kulit
- Tidak menyebutkan harga (ini knowledge base, bukan e-commerce)

**Format wajib:**
```json
{
  "id": "cerave-moisturizing-cream",
  "name": "CeraVe Moisturizing Cream",
  "brand": "CeraVe",
  "category": "moisturizer",
  "for_skin_types": ["dry", "sensitive", "normal"],
  "active_ingredients": ["ceramide", "hyaluronic acid", "niacinamide"],
  "best_when_water": {
    "ph_low": true,
    "tds_high": true,
    "chlorine_high": true,
    "temp_high": false
  },
  "avoid_when": "Kulit berminyak atau berjerawat aktif",
  "how_to_use": "Oleskan segera setelah mandi saat kulit masih sedikit lembab",
  "scientific_basis": "Ceramide membantu memulihkan skin barrier yang rusak akibat...",
  "sources": ["doi:10.1111/bjd.19862"]
}
```

---

### R6 — `data/dermal-guide.json` 💡 PRIORITAS SEDANG
> Digunakan Programmer untuk fitur Dermal-Guide (F06).

Buat matriks panduan mandi untuk **5 tipe kulit × 6 kondisi air**:

**Tipe kulit:** `dry`, `oily`, `normal`, `combination`, `sensitive`

**Kondisi air:** `normal`, `ph_low`, `ph_high`, `tds_high`, `chlorine_high`, `temp_high`

**Format:**
```json
{
  "dry_ph_low": {
    "label": "Kulit Kering + Air Asam",
    "risk_level": "high",
    "duration_max_min": 10,
    "water_temp_rec": "36-38°C",
    "steps": [
      "Basuh kulit dengan air hangat selama 2-3 menit",
      "Gunakan sabun pH-balanced (pH 5.5-6.5), bukan sabun alkali",
      "Hindari menggosok kulit — tepuk-tepuk hingga lembab",
      "Segera oleskan moisturizer dalam 3 menit"
    ],
    "products_rec": ["sabun pH-balanced", "moisturizer ceramide"],
    "warning": "Air asam + kulit kering meningkatkan risiko dermatitis. Pertimbangkan filter pH.",
    "sources": ["doi:10.1111/ics.12562"]
  }
}
```

---

### R7 — `data/badges.json` 🏅 PRIORITAS RENDAH
> Digunakan Programmer untuk sistem gamifikasi (B3.2).

Isi **8 badge** dengan kriteria berbasis data ilmiah:

| Badge | Konsep Ilmiah | Kriteria Trigger |
|---|---|---|
| Eco Warrior | Konservasi air — WHO target 50L/hari | Hemat >30% air, 7 hari berturut |
| Skin Guardian | Konsistensi perawatan kulit | Skor kualitas air >80, 5 hari berturut |
| pH Master | pH optimal 6.5–8.5 untuk skin barrier | pH dalam batas normal, 10 sesi |
| Early Bird | Ritme sirkadian dan kesehatan kulit | Mandi sebelum 09.00, 5 hari berturut |
| Streak King | Kebiasaan mandi teratur | 30 hari berturut-turut |
| Filter Pro | Manajemen kualitas air proaktif | Aktifkan filter 10x saat kualitas buruk |
| Scanner Pro | Monitoring kulit aktif | Lakukan skin scan 5 kali |
| Water Wise | Literasi kualitas air | Baca ensiklopedia 10 entri |

---

### R8 — `prompts/xai-explanation.md` 📝 PRIORITAS TINGGI
> Digunakan Programmer sebagai template teks XAI di `app.js`.

Tulis kalimat penjelasan **bahasa Indonesia awam** untuk setiap kondisi sensor. Hindari jargon ilmiah. Target pembaca: ibu rumah tangga, bukan dokter.

**Yang harus diisi:**
- pH rendah/tinggi/normal
- Suhu rendah/tinggi/normal
- Turbidity tinggi/normal
- TDS tinggi/normal
- Klorin tinggi/rendah/normal
- Kombinasi: pH rendah + TDS tinggi, Klorin tinggi + kulit sensitif

**Contoh tone yang diinginkan:**
> ❌ "pH rendah mengindikasikan kondisi asam yang dapat mendisrupsi keseimbangan lipid stratum korneum"
> ✅ "Air ini sedikit asam (pH {value}). Air asam bisa membuat kulit terasa kering dan gatal, terutama bagi yang kulitnya sensitif."

---

### R9 — `RESEARCH.md` 📖 PRIORITAS SEDANG

Isi dokumen riset dengan:
1. Justifikasi ilmiah tiap bobot XAI (pH 35%, Suhu 35%, Turbidity 30%) — kutip literatur
2. Basis dermatologis untuk setiap kondisi di ensiklopedia
3. Penguatan 3 novelty claim dengan argumen vs. paper existing
4. Daftar kondisi kulit + parameter air yang berkorelasi (dari 21 paper SLR)

---

### R10 — `slr.html` & `index.html` 🌐 PRIORITAS RENDAH

**`slr.html`:**
- Tambahkan kolom "Methodology" di Literature Matrix
- Perkaya narasi gap analysis dengan kutipan langsung dari paper
- Tambahkan abstrak singkat (1 kalimat) per paper di bibliografi

**`index.html`:**
- Isi placeholder `[NAMA KETUA TIM]`, `[NAMA ANGGOTA 1-3]`, `[NAMA PEMBIMBING]`
- Perkaya paragraf "Tentang AQUENT" dengan temuan SLR
- Tambahkan 1–2 kutipan statistik dari RESEARCH.md di hero section

---

## Urutan Prioritas Pengerjaan

```
MINGGU 1 (fondasi — Programmer menunggu ini):
  R1 thresholds.json    → selesaikan PERTAMA
  R2 ai-chat-system.md  → selesaikan KEDUA
  R3 skin-scan-system.md → selesaikan KETIGA
  R8 xai-explanation.md → selesaikan KEEMPAT

MINGGU 2 (konten fitur):
  R4 encyclopedia.json  → 20 entri dulu, tambah bertahap
  R5 products.json      → 20 produk
  R6 dermal-guide.json  → 5 tipe kulit × 6 kondisi = 30 kombinasi
  R9 RESEARCH.md

MINGGU 3 (pelengkap):
  R7 badges.json
  R10 slr.html + index.html
```

---

## Koordinasi dengan Tab Programmer

Saat file data selesai, **beritahu Programmer** file mana yang sudah siap agar mereka bisa langsung mengimplementasikan fitur terkait. Urutan handoff yang direkomendasikan:

1. `thresholds.json` → Programmer bisa mulai P2 (Quality Score)
2. `ai-chat-system.md` → Programmer bisa mulai P4 (AI Chat)
3. `skin-scan-system.md` → Programmer bisa mulai P5 (Skin Scanner)
4. `xai-explanation.md` → Programmer integrasikan ke P4 & P5
5. `encyclopedia.json` → Programmer bisa mulai P9 (Ensiklopedia)
6. `products.json` → Programmer bisa mulai P8 (Recommender)
7. `dermal-guide.json` → Programmer bisa mulai P10 (Dermal-Guide)
8. `badges.json` → Programmer bisa mulai P7 (Gamifikasi)
