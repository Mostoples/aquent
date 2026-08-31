# AQUENT — Custom Skin Classifier Training (Colab)

Train model klasifikasi kulit sendiri tanpa Gemini, tanpa Teachable Machine. Output: `model.json` + `weights.bin` + `metadata.json` siap di-deploy ke `models/skin-classifier/`.

## Karakteristik Model

- **Arsitektur:** EfficientNetB0 transfer learning (~5M params, lebih kecil dari ResNet50, lebih akurat dari MobileNetV2 untuk skin)
- **Input:** 224×224×3 RGB
- **Preprocessing:** `img / 127.5 - 1` → range `[-1, 1]`
- **Output:** 5 kelas (dry, normal, oily, combination, sensitive)
- **Augmentation:** rotation, flip, zoom, brightness, contrast
- **Training:** 2-fase (head freeze → fine-tune top 30 layers)
- **Target accuracy:** ≥ 85% validation

---

## Cell 1 — Setup environment

Buka [colab.research.google.com](https://colab.research.google.com) → New Notebook. Pilih **Runtime → Change runtime type → T4 GPU**.

```python
!pip install -q tensorflow==2.15.0 tensorflowjs==4.20.0 kagglehub matplotlib seaborn scikit-learn

import os, json, random, numpy as np, tensorflow as tf
from tensorflow.keras import layers, models, optimizers, callbacks, regularizers
from tensorflow.keras.applications import EfficientNetB0
from tensorflow.keras.applications.efficientnet import preprocess_input
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import classification_report, confusion_matrix

# Reproducibility
SEED = 42
random.seed(SEED); np.random.seed(SEED); tf.random.set_seed(SEED)

print("TensorFlow:", tf.__version__)
print("GPU available:", len(tf.config.list_physical_devices('GPU')))
```

---

## Cell 2 — Download Dataset (gabungan dari Kaggle)

Saran dataset (pilih satu, atau gabung):

| Dataset | Kelas | Url Kaggle |
|---|---|---|
| Oily-Dry-Normal Skin | 3 | `shakyadissanayake/oily-dry-and-normal-skin-types-dataset` |
| Skin Types Big | 3 | `gdjustice/skin-types-dataset` |
| Acne severity | 5 | `nayanchaure/acne-dataset` |

```python
import kagglehub

# Download primary dataset
dataset_path = kagglehub.dataset_download("shakyadissanayake/oily-dry-and-normal-skin-types-dataset")
print("Downloaded to:", dataset_path)

# Cek struktur folder
import subprocess
print(subprocess.check_output(['find', dataset_path, '-type', 'd', '-maxdepth', '3']).decode())
```

Catatan: kalau Kaggle minta API token, jalankan:
```python
from google.colab import files
files.upload()  # upload kaggle.json dari https://www.kaggle.com/settings → API
!mkdir -p ~/.kaggle && cp kaggle.json ~/.kaggle/ && chmod 600 ~/.kaggle/kaggle.json
```

---

## Cell 3 — Data Pipeline dengan Augmentasi

```python
IMG_SIZE = 224
BATCH    = 32

# Auto-detect data folder structure
import glob
candidate = glob.glob(f"{dataset_path}/**/dry", recursive=True)
DATA_DIR = os.path.dirname(candidate[0]) if candidate else dataset_path
print("Using DATA_DIR:", DATA_DIR)

# Build tf.data dataset dengan split otomatis
train_ds = tf.keras.utils.image_dataset_from_directory(
    DATA_DIR,
    validation_split=0.2, subset='training',
    seed=SEED, image_size=(IMG_SIZE, IMG_SIZE), batch_size=BATCH,
    label_mode='categorical', shuffle=True,
)
val_ds = tf.keras.utils.image_dataset_from_directory(
    DATA_DIR,
    validation_split=0.2, subset='validation',
    seed=SEED, image_size=(IMG_SIZE, IMG_SIZE), batch_size=BATCH,
    label_mode='categorical', shuffle=False,
)
LABELS = train_ds.class_names
print("Classes:", LABELS)
print("Num classes:", len(LABELS))

# Augmentation pipeline (di GPU lebih cepat dari ImageDataGenerator)
data_aug = tf.keras.Sequential([
    layers.RandomFlip('horizontal'),
    layers.RandomRotation(0.08),
    layers.RandomZoom(0.1),
    layers.RandomBrightness(0.15),
    layers.RandomContrast(0.1),
], name='augmentation')

# Preprocess: ke [-1, 1] (konsisten dengan app.js MODEL_PREPROCESS='tm')
def preprocess(x, y):
    x = tf.cast(x, tf.float32)
    x = (x / 127.5) - 1.0
    return x, y

AUTOTUNE = tf.data.AUTOTUNE
train_ds = train_ds.map(preprocess, num_parallel_calls=AUTOTUNE).prefetch(AUTOTUNE)
val_ds   = val_ds.map(preprocess, num_parallel_calls=AUTOTUNE).prefetch(AUTOTUNE)

# Visualize augmented samples
plt.figure(figsize=(10, 4))
for x, y in train_ds.take(1):
    augmented = data_aug(x, training=True)
    for i in range(8):
        plt.subplot(2, 4, i+1)
        plt.imshow((augmented[i].numpy() + 1) / 2)
        plt.title(LABELS[np.argmax(y[i])])
        plt.axis('off')
plt.tight_layout(); plt.show()
```

---

## Cell 4 — Build Model (EfficientNetB0 Transfer Learning)

```python
NUM_CLASSES = len(LABELS)

# Base model: EfficientNetB0 pretrained on ImageNet
base = EfficientNetB0(
    input_shape=(IMG_SIZE, IMG_SIZE, 3),
    include_top=False,
    weights='imagenet',
    pooling='avg',
)
base.trainable = False  # phase 1: freeze base

# Head with regularization
inputs = layers.Input(shape=(IMG_SIZE, IMG_SIZE, 3), name='image_input')
x = data_aug(inputs)
x = base(x, training=False)
x = layers.Dropout(0.3)(x)
x = layers.Dense(128, activation='relu',
                 kernel_regularizer=regularizers.l2(1e-4))(x)
x = layers.Dropout(0.2)(x)
outputs = layers.Dense(NUM_CLASSES, activation='softmax', name='predictions')(x)

model = models.Model(inputs, outputs, name='aquent_skin_classifier')
model.compile(
    optimizer=optimizers.Adam(1e-3),
    loss='categorical_crossentropy',
    metrics=['accuracy', tf.keras.metrics.TopKCategoricalAccuracy(k=2, name='top2')],
)
model.summary()
```

---

## Cell 5 — Training Phase 1 (head only, 20 epochs)

```python
ckpt_path = 'best_phase1.keras'
hist1 = model.fit(
    train_ds, validation_data=val_ds, epochs=20,
    callbacks=[
        callbacks.EarlyStopping(patience=5, restore_best_weights=True, monitor='val_loss'),
        callbacks.ReduceLROnPlateau(factor=0.5, patience=3, monitor='val_loss', min_lr=1e-6),
        callbacks.ModelCheckpoint(ckpt_path, save_best_only=True, monitor='val_accuracy'),
    ],
    verbose=1,
)
```

---

## Cell 6 — Training Phase 2 (fine-tune top layers, 15 epochs)

```python
# Unfreeze top 30 layers
base.trainable = True
for layer in base.layers[:-30]:
    layer.trainable = False

# Recompile dengan lr lebih kecil
model.compile(
    optimizer=optimizers.Adam(1e-5),  # 100x lebih kecil dari phase 1
    loss='categorical_crossentropy',
    metrics=['accuracy', tf.keras.metrics.TopKCategoricalAccuracy(k=2, name='top2')],
)

hist2 = model.fit(
    train_ds, validation_data=val_ds, epochs=15,
    callbacks=[
        callbacks.EarlyStopping(patience=4, restore_best_weights=True, monitor='val_loss'),
        callbacks.ReduceLROnPlateau(factor=0.3, patience=2, monitor='val_loss', min_lr=1e-7),
    ],
    verbose=1,
)
```

---

## Cell 7 — Evaluation & Visualization

```python
# Final metrics
final = model.evaluate(val_ds, verbose=0)
print(f"\n📊 Final Validation Accuracy: {final[1]*100:.2f}%")
print(f"📊 Final Top-2 Accuracy:      {final[2]*100:.2f}%")

# Plot history
fig, axes = plt.subplots(1, 2, figsize=(14, 4))
hist_full = {k: hist1.history.get(k, []) + hist2.history.get(k, []) for k in hist1.history}
for ax, metric in zip(axes, ['accuracy', 'loss']):
    ax.plot(hist_full[metric], label=f'train {metric}')
    ax.plot(hist_full[f'val_{metric}'], label=f'val {metric}')
    ax.axvline(x=len(hist1.history.get(metric, [])), color='gray', linestyle='--', label='fine-tune start')
    ax.set_title(metric.title()); ax.legend(); ax.grid(alpha=0.3)
plt.tight_layout(); plt.show()

# Confusion matrix
y_true = []
y_pred = []
for x, y in val_ds:
    pred = model.predict(x, verbose=0)
    y_true.extend(np.argmax(y.numpy(), axis=1))
    y_pred.extend(np.argmax(pred, axis=1))

cm = confusion_matrix(y_true, y_pred)
plt.figure(figsize=(7, 6))
sns.heatmap(cm, annot=True, fmt='d', xticklabels=LABELS, yticklabels=LABELS,
            cmap='Blues', cbar=False)
plt.title('Confusion Matrix'); plt.xlabel('Predicted'); plt.ylabel('Actual')
plt.tight_layout(); plt.show()

print("\n📋 Classification Report:")
print(classification_report(y_true, y_pred, target_names=LABELS, digits=3))
```

---

## Cell 8 — Export ke TFJS Format

```python
import tensorflowjs as tfjs

EXPORT_DIR = 'aquent_skin_model'
os.makedirs(EXPORT_DIR, exist_ok=True)

# Save Keras model dengan augmentation layer di-include atau tidak
# Untuk inference, augmentation tidak diperlukan
inference_model = tf.keras.Sequential([
    layers.Input(shape=(IMG_SIZE, IMG_SIZE, 3)),
    *[l for l in model.layers if l.name not in ('augmentation',)]
])
# Quick test
test_x, test_y = next(iter(val_ds.take(1)))
print("Inference test passed:", inference_model.predict(test_x[:1]).shape)

# Convert to TFJS
tfjs.converters.save_keras_model(
    inference_model, EXPORT_DIR,
    quantization_dtype_map={'*': 'uint8'},  # 4x smaller, sedikit lossy
)

# Buat metadata.json sesuai format AQUENT
metadata = {
    "name":            "AQUENT Skin Classifier",
    "version":         "1.0.0",
    "tfjsVersion":     tfjs.__version__,
    "tfVersion":       tf.__version__,
    "modelName":       "aquent-skin-classifier",
    "labels":          LABELS,
    "imageSize":       IMG_SIZE,
    "preprocess":      "tm",  # ← match dengan app.js tfjsPreprocess
    "architecture":    "EfficientNetB0 + custom head (transfer learning)",
    "trainingDate":    str(__import__('datetime').date.today()),
    "validationAcc":   float(final[1]),
    "validationTop2":  float(final[2]),
    "params":          int(model.count_params()),
    "datasets": [
        {"source": "kaggle", "id": "shakyadissanayake/oily-dry-and-normal-skin-types-dataset"}
    ],
    "preprocessing": {
        "resize": [IMG_SIZE, IMG_SIZE],
        "normalize": "img / 127.5 - 1.0",
    },
}
with open(f'{EXPORT_DIR}/metadata.json', 'w') as f:
    json.dump(metadata, f, indent=2)

print(f"\n✓ Model saved to {EXPORT_DIR}/")
print(f"  Files: {os.listdir(EXPORT_DIR)}")

# Zip & download
!zip -r aquent_skin_model.zip {EXPORT_DIR}
from google.colab import files
files.download('aquent_skin_model.zip')
```

---

## Cell 9 — Sanity Check dengan Foto Real

Test prediksi pada beberapa gambar val_ds untuk konfirmasi:

```python
plt.figure(figsize=(12, 6))
for x, y in val_ds.take(1):
    pred = inference_model.predict(x, verbose=0)
    for i in range(8):
        plt.subplot(2, 4, i+1)
        plt.imshow((x[i].numpy() + 1) / 2)
        true = LABELS[np.argmax(y[i])]
        pred_label = LABELS[np.argmax(pred[i])]
        conf = pred[i][np.argmax(pred[i])]
        color = 'green' if true == pred_label else 'red'
        plt.title(f"{true}\n→ {pred_label} ({conf:.0%})", color=color, fontsize=10)
        plt.axis('off')
plt.tight_layout(); plt.show()
```

---

## Setelah Download

1. Extract `aquent_skin_model.zip`
2. Pindah seluruh isinya (`model.json`, `metadata.json`, `*.bin`) ke `models/skin-classifier/`
3. Test pakai `models/skin-classifier/test.html` lokal (buka via file://)
4. Verifikasi:
   - Console log `[AQUENT] Local skin model loaded: 3 classes, tm preprocess`
   - Test prediksi dengan webcam atau upload foto
5. Deploy ke Firebase Hosting

---

## Troubleshooting

| Issue | Penyebab | Solusi |
|---|---|---|
| Val acc stuck ~33% | Class imbalance | Pakai `class_weight` di model.fit |
| Val acc fluctuates | Learning rate terlalu tinggi | Turun ke 5e-4, atau pakai cosine decay |
| Model.json error in browser | Format tidak match | Cek `tfjs.__version__` consistent dengan `app.js` CDN version |
| Inference time > 1s | Model terlalu besar | Pakai EfficientNetB0 (sudah dilakukan) atau quantize uint8 |
| Bias 1 ras kulit | Dataset bias | Tambah dataset diverse, augment lebih agresif |

---

## Untuk Paper Akademik

Bab Methodology bisa dideskripsikan:

> Klasifikasi tipe kulit menggunakan transfer learning dari **EfficientNetB0** (Tan & Le, 2019) yang di-pretrain pada ImageNet. Head model terdiri dari GlobalAveragePooling, Dropout(0.3), Dense(128, ReLU) dengan L2 regularization (1e-4), Dropout(0.2), dan Dense softmax untuk N kelas. Training dilakukan dalam 2 fase: (1) head-only training dengan Adam optimizer (lr=1e-3), 20 epochs, dan (2) fine-tuning 30 layer terakhir dengan lr=1e-5, 15 epochs. Augmentasi data meliputi horizontal flip, rotasi ±8°, zoom 10%, brightness ±15%, dan contrast ±10%, semuanya diaplikasikan via `tf.keras` augmentation layers. Dataset di-split 80/20 untuk training/validation dengan random seed 42.
>
> **Privacy by design**: model di-export ke TensorFlow.js format dan dijalankan sepenuhnya di browser pengguna, tanpa transmisi gambar ke server eksternal.

Citation key:
- Tan & Le (2019). EfficientNet: Rethinking Model Scaling for CNNs. ICML.
- Howard et al. (2017). MobileNets: Efficient CNNs for Mobile Vision Applications.
