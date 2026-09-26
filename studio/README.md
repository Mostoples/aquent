# AQUENT studio — asset & media pipeline

Skrip untuk membuat ulang aset 3D, showreel, dan deck presentasi untuk app di `web/`.
Skrip mengharapkan susunan workspace berikut (seperti di folder kerja `AQUENT/`):

```
app/        <- isi folder web/ (app + assets/3d + assets/brand)
blender/    <- blender/assets.py
showreel/   <- record.py, compose.py, capcut_draft.py, shots.py (+ fonts/PlusJakartaSans.ttf)
deck/       <- build_deck.py, shots_deck.py (+ src/ berisi media dari PPT asli)
output/     <- hasil: AQUENT_Showreel.mp4, AQUENT_Deck_Neumorph.pptx
```

| Langkah | Perintah |
|---|---|
| Aset 3D (Blender 5.x, GPU OptiX) | `blender -b --factory-startup -P blender/assets.py -- app/assets/3d` |
| Animasi turntable | `blender -b --factory-startup -P blender/assets.py -- showreel/build anim` |
| Rekam demo app (Playwright) | `python showreel/record.py` |
| Susun showreel (FFmpeg) | `python showreel/compose.py` |
| Draft CapCut (capcut-cli) | `python showreel/capcut_draft.py` |
| Deck PPTX | `python deck/shots_deck.py && python deck/build_deck.py` |
