# Hasil komparasi — A (Claude penuh) vs B (Claude + DeepSeek pekerja)

> **Kesimpulan:** setelah diperiksa Claude, kualitas jalur B **setara** dengan Claude penuh. User tidak bisa membedakannya di keempat tugas, sementara beban I/O Claude turun ±39% dan biaya DeepSeek di bawah 1 sen. Syaratnya: setiap output DeepSeek wajib di-review.

## Metrik objektif (4 tugas)

| Tugas | Jalur | Beban token Claude (proksi I/O) | Biaya DeepSeek | Koreksi oleh Claude | Catatan |
|---|---|---|---|---|---|
| Video subtitle ID | A | ~2.600 | – | 0 | |
| | B | ~1.420 | $0,0011 | 6 | Gaya bahasa, 1 istilah kurang tepat ("sanitasi layak") |
| One-pager | A | ~1.950 | – | 0 | |
| | B | ~1.700 | $0,0032 | 5 | **1 klaim salah** ("hemat 60–80 L"), halaman kosong 1/3, tanpa logo |
| 3 slide PPT | A | ~2.770 | – | 1 | Claude sempat mengarang fokus CTO, lalu dikoreksi sendiri |
| | B | ~1.820 | $0,0021 | 4 | Pagar kode, path foto salah, tata letak |
| Landing EN | A | ~2.670 | – | 0 | |
| | B | ~1.180 | $0,0025 | 4 | **1 makna terbalik** ("showers waste the most"), headline kaku |
| **Total** | **A** | **~10.000** | **$0** | **1** | |
| | **B** | **~6.100 (−39%)** | **$0,0089** | **19** | |

Total semua panggilan DeepSeek hari ini, termasuk tes: 7 panggilan, ≈ USD 0,016.

## Cara membaca angka ini (penting)
- **Proksi token Claude** hanya menghitung byte yang dibaca dan ditulis Claude untuk tugas itu sendiri. Angka ini **tidak** mencakup konteks percakapan yang ikut diproses di setiap langkah. Di sesi panjang seperti ini, konteks itulah yang paling mahal, dan jalur B memerlukan lebih banyak langkah (menulis prompt, memeriksa, memperbaiki). Jadi penghematan nyata bisa lebih kecil dari 39%, bahkan bisa negatif. Angka pastinya bisa dilihat dengan `/cost` di Claude Code.
- **Waktu** tidak dilaporkan sebagai metrik. Waktu penulisan oleh Claude tidak tercatat dengan cara yang sama di kedua jalur, sehingga perbandingannya tidak adil.
- **Kontaminasi:** kedua jalur dikerjakan oleh Claude yang sama. Jalur yang dikerjakan kedua bisa terbantu oleh jalur pertama. Urutannya sudah diacak per tugas untuk mengurangi efek ini.

## Temuan sementara
1. **DeepSeek sangat murah dan cepat:** seluruh pekerjaannya di 4 tugas kurang dari 1 sen dolar, dan kodenya langsung jalan di 3 dari 4 tugas.
2. **DeepSeek tetap harus diperiksa:**
   - Ada 2 kesalahan makna/fakta yang lolos dari DeepSeek. Keduanya akan merugikan jika sampai ke juri.
   - Ada 2 bug kecil (pagar kode, path foto).
   - Total ada 19 koreksi, dibanding 1 koreksi di jalur A.
3. **Kapan B paling menguntungkan:** saat input besar dan berisiko rendah. Contohnya membaca file/log panjang (di tugas PPT, DeepSeek yang membaca 20 KB helper deck), terjemahan massal, dan pengecekan konsistensi.
4. **Kapan A lebih efisien:** untuk tugas kecil yang kreatif atau visual. Claude sudah memegang konteksnya, jadi menulis sendiri sekali jadi lebih cepat daripada menulis brief, memeriksa, lalu memperbaiki.

## Penilaian kualitas user (buta, 2026-10-05)
| Tugas | X | Y | Skor (akurasi · bahasa · visual · kelengkapan) | Preferensi |
|---|---|---|---|---|
| Video subtitle ID | B | A | X: 5·5·5·5 — Y: 5·5·5·5 | **Sama** |
| One-pager | A | B | (hanya preferensi) | **Sama** |
| 3 slide PPT | B | A | (hanya preferensi) | **Sama** |
| Landing EN | A | B | (hanya preferensi) | **Sama** |

Artinya: kualitas akhir yang diterima user tidak turun. Kualitas itu didapat karena Claude tetap memeriksa dan memperbaiki 19 hal pada draf DeepSeek. Tanpa review, 2 kesalahan makna/fakta akan lolos.
