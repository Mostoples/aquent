# AQUENT Skin Classifier — Custom ML Model

Klasifikasi tipe kulit dijalankan **100% lokal di browser** menggunakan **TensorFlow.js + analisis pixel deterministik**. Tidak ada Gemini, tidak ada cloud API.

## Arsitektur Pipeline

```
Foto wajah (camera/upload)
    │
    ├─→ ML Model (EfficientNetB0 transfer learning)
    │     └─ Klasifikasi: dry / normal / oily / combination / sensitive
    │
    └─→ Pixel Analysis (deterministik)
          ├─ Hidrasi proxy (saturation channel)
          ├─ Indeks kemerahan (R/(R+G+B))
          ├─ Oiliness proxy (luminance variance + bright pixels)
          ├─ Tekstur permukaan (Sobel-like edge density)
          ├─ Ketajaman foto (variance of Laplacian)
          └─ Skin tone average (RGB)
    │
    ▼
buildLocalScanResult()
    └─ Gabung ML + pixel + sensor air → hasil XAI lengkap
```

## File yang Diharapkan

```
models/skin-classifier/
├── model.json           ← Arsitektur Keras
├── weights.bin          ← Bobot model (atau group1-shard1of1.bin dst)
├── metadata.json        ← Konfigurasi: labels, imageSize, preprocess
└── (file dokumentasi)
```

### Format `metadata.json`

```json
{
  "name":            "AQUENT Skin Classifier",
  "version":         "1.0.0",
  "modelName":       "aquent-skin-classifier",
  "labels":          ["dry", "normal", "oily"],
  "imageSize":       224,
  "preprocess":      "tm",
  "architecture":    "EfficientNetB0 + custom head",
  "trainingDate":    "2026-05-30",
  "validationAcc":   0.87
}
```

**`preprocess` values:**
- `"tm"` — Teachable Machine convention: `img / 127.5 - 1` → `[-1, 1]` ← default
- `"imagenet"` — Subtract ImageNet mean RGB
- `"rescale"` — `img / 255` → `[0, 1]`

## Cara Training

### Opsi 1: Google Colab dengan EfficientNetB0 (rekomendasi)

Buka **`TRAIN_COLAB.md`** untuk notebook lengkap. Workflow:
1. Setup environment (~2 mnt)
2. Download dataset Kaggle (~3 mnt, butuh kaggle API token)
3. Train phase 1 (head only, ~10-15 mnt di T4 GPU)
4. Train phase 2 (fine-tune, ~10-15 mnt)
5. Export ke TFJS + download zip
6. Drop ke folder ini

**Total waktu:** ~45 menit. **Akurasi target:** ≥ 85%.

### Opsi 2: Teachable Machine (cara cepat, akurasi lebih rendah)

1. Buka https://teachablemachine.withgoogle.com/train/image
2. New Image Project → Standard model
3. Buat 3-5 kelas (dry, normal, oily, dst)
4. Upload 50-200 foto per kelas
5. Train (default settings)
6. Export → TensorFlow.js → Download
7. Extract zip ke folder ini

**Total waktu:** ~15-30 menit (tergantung dataset). **Akurasi target:** ~70-80%.

## Cara Verify Model

Buka **`test.html`** langsung di browser (double-click atau `file://`). Halaman ini berdiri sendiri dan akan:
1. Load model + metadata
2. Jalankan ML prediction + pixel analysis paralel
3. Tampilkan hasil gabungan dalam tabel
4. Test pakai webcam, upload foto, atau demo image

Klik **"Pakai Demo Image"** untuk test pixel analysis tanpa butuh foto real.

## Yang Terjadi Tanpa Model File

Aplikasi tetap jalan. Console log:
```
[AQUENT] Local skin model unavailable — pakai analisis heuristik
```

Pipeline akan:
1. Skip ML model (karena `model.json` 404)
2. **Pixel analysis tetap jalan** (deterministik, tidak butuh model)
3. Fallback rule-based classifier dari pixel features
4. Hasil tetap valid, hanya dengan confidence lebih rendah

## Dataset yang Direkomendasikan

| Source | Kelas | Size | Url |
|---|---|---|---|
| Kaggle | dry, normal, oily | ~1k | `shakyadissanayake/oily-dry-and-normal-skin-types-dataset` |
| Kaggle | acne severity 0-4 | ~1.5k | `nayanchaure/acne-dataset` |
| Kaggle | 5 skin types | ~3k | `gdjustice/skin-types-dataset` |
| HAM10000 | 7 lesion classes | ~10k | `kmader/skin-cancer-mnist-ham10000` |

Untuk research production, kombinasikan multiple datasets dengan augmentasi yang sesuai.

## Citation untuk Paper

```
Klasifikasi tipe kulit menggunakan transfer learning dari EfficientNetB0
(Tan & Le, 2019) yang di-pretrain pada ImageNet, di-fine-tune untuk 5-class
skin type classification dengan dataset publik [nama dataset]. Pipeline juga
mencakup analisis pixel deterministik (saturation, redness index, luminance
variance) sebagai supplementary metric untuk Explainable AI (XAI).

Privacy-by-design: seluruh inferensi dijalankan client-side via TensorFlow.js
tanpa transmisi gambar ke server eksternal.
```

## Privacy & Compliance

- ✅ Foto **tidak pernah meninggalkan device** pengguna
- ✅ Bisa diaudit (model weights deterministik, pixel analysis explicit math)
- ✅ Compatible dengan PDPR Indonesia & GDPR Pasal 22 (automated decision-making)
- ✅ Reproducible (seed=42, dataset+notebook tersedia di repo)
- ✅ No vendor lock-in (TFJS open-source, bisa pindah ke ONNX/CoreML)
