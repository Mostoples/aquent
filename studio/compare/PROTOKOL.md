# Komparasi: Claude penuh (A) vs Claude orkestrator + DeepSeek pekerja (B)

## Aturan
- Empat tugas, masing-masing dikerjakan dua kali dari titik awal yang sama dengan **brief yang sama** (di bawah).
- Urutan A/B diacak per tugas untuk mengurangi kontaminasi: video B→A, one-pager A→B, PPT B→A, landing EN B→A.
- **A:** Claude membaca, menulis, dan memeriksa semuanya sendiri.
- **B:** DeepSeek (`tools/ds.py`, deepseek-flash, thinking mati) mengerjakan bagian teks/kode yang boros token. Claude memberi brief, memeriksa, memperbaiki, merakit, dan melakukan QA visual.
- Infrastruktur yang dipakai bersama (misalnya dukungan bahasa di `team_video.py`, renderer) dibuat sekali sebelum kedua jalur dan dicatat terpisah sebagai "bersama".
- Hasil diberi label acak **X/Y** di `compare/blind/`. Pemetaannya ada di `compare/.mapping.json`; jangan dibuka sebelum selesai menilai.

## Metrik (dicatat di `compare/log.csv`)
| Metrik | Cara ukur |
|---|---|
| Biaya DeepSeek | Tepat, dari `tools/ds_usage.csv` |
| Beban token Claude | Proksi: byte yang dibaca + ditulis Claude per jalur ÷ 4 ≈ token. Angka pastinya: lihat `/cost` di Claude Code |
| Waktu | Jam mulai–selesai per jalur |
| Kualitas | Penilaian buta oleh user (1–5): akurasi isi, kualitas bahasa, kualitas visual, kelengkapan, dan jumlah revisi yang dibutuhkan |
| Koreksi Claude atas DeepSeek | Jumlah perbaikan yang harus Claude lakukan pada draf DeepSeek (jalur B) |

## Brief (identik untuk A dan B)

### 1. Video "Meet AQUENT" versi subtitle Indonesia
Terjemahkan **semua** teks di video ke bahasa Indonesia yang natural dan ringkas, cocok dibaca cepat:
- subtitle ucapan;
- callout data;
- kartu babak;
- tagline intro;
- teks solusi/app;
- caption perjalanan;
- outro.

Nama orang, nama jabatan bahasa Inggris (CEO, CTO, …), dan nama event tetap. Angka harus sama persis dengan versi Inggris. Subtitle maksimal 2 baris dan tidak boleh lebih panjang dari aslinya. Hasilnya: `compare/<arm>/AQUENT_Team_Intro_ID.mp4`.

### 2. One-pager produk (dwibahasa)
Satu halaman A4 (docx + PDF) untuk juri atau sponsor, berisi:
- judul;
- masalah (2–3 data);
- solusi dan cara kerja (6 langkah);
- fitur app;
- dampak/SDGs;
- tim (5 nama + jabatan);
- harga (Rp 2 juta ≈ USD 125);
- alamat web aquent-id.web.app.

Bahasa Indonesia sebagai utama, dengan ringkasan bahasa Inggris. Gaya brand neumorph biru, dan semua isi muat dalam 1 halaman. Hasilnya: `compare/<arm>/AQUENT_OnePager.docx` dan `.pdf`.

### 3. PPT: 3 slide baru
Tambahkan tiga slide ke deck neumorph dengan gaya yang sama (header chip + judul dua warna, kartu beraura, animasi FX):
- (a) **Tim AQUENT:** 5 potret, nama, jabatan.
- (b) **Perjalanan ke INNOPA IID Jakarta 2026:** foto kolaborasi.
- (c) **Landing page & aplikasi:** screenshot web dan URL.

Hasilnya: `compare/<arm>/AQUENT_Deck_3slides.pptx` dan PNG ketiga slide.

### 4. Landing page bahasa Inggris (`/en`)
Versi bahasa Inggris dari `app/index.html`, dengan tata letak dan aset yang sama. Copywriting-nya natural (bukan terjemahan kaku), dan semua angka sama. Sediakan tombol ganti bahasa ID/EN di kedua halaman. Hasilnya: `compare/<arm>/en.html` beserta screenshot desktop dan ponsel.
