# Template Penjelasan XAI per Kondisi Sensor
**Digunakan oleh:** `app.js` — XAI explanation renderer
**Disusun oleh:** TAB PENELITI — AQUENT Research Team
**Tanggal:** 2026-04-29
**Prinsip:** Bahasa Indonesia awam, hangat, tidak menghakimi, akurat secara ilmiah

> Gunakan `{value}` sebagai placeholder nilai aktual sensor.
> Gunakan `{skin_type}` sebagai placeholder tipe kulit pengguna.

---

## pH AIR

### pH Rendah — Asam (< 6.5)
**Kalimat pendek (untuk bar chart tooltip):**
> "Air asam dapat mengiritasi kulit sensitif."

**Penjelasan lengkap (untuk expandable panel):**
> "pH air {value} bersifat sedikit asam. Kulit kita punya lapisan pelindung alami yang sedikit asam (pH 4.5–5.5), jadi air yang terlalu asam sebenarnya bisa 'bersaing' dengan keseimbangan kulit dan mengikis minyak alaminya. Untuk kulit normal ini biasanya tidak masalah, tapi untuk kulit sensitif atau yang sudah kering, bisa memicu rasa gatal atau kemerahan ringan setelah mandi."

**Saran tindakan:**
> "Coba persingkat waktu mandi dan gunakan sabun pH-balanced untuk menyeimbangkan kondisi ini."

**Referensi:** Lambers et al., Int J Cosmetic Sci, 2019 (doi:10.1111/ics.12562)

---

### pH Tinggi — Basa (> 8.5)
**Kalimat pendek:**
> "Air basa merusak lapisan pelindung kulit."

**Penjelasan lengkap:**
> "pH air {value} cukup basa. Air basa adalah salah satu penyebab utama kulit kering setelah mandi — ia melarutkan ceramide, yaitu 'semen' alami yang menjaga sel kulit tetap rapat dan kulit tetap lembab. Riset menunjukkan air dengan pH di atas 8.5 bisa memperburuk kondisi eksim dan psoriasis, terutama jika digunakan setiap hari."

**Saran tindakan:**
> "Pertimbangkan memasang filter shower pH netral. Sementara itu, oleskan moisturizer ceramide segera setelah mandi."

**Referensi:** Lambers et al., 2019; Wollenberg et al., JEADV, 2022 (doi:10.1111/jdv.17927)

---

### pH Normal (6.5–8.5)
**Kalimat pendek:**
> "pH air dalam batas aman untuk kulit."

**Penjelasan lengkap:**
> "pH air {value} berada dalam rentang yang direkomendasikan WHO (6.5–8.5). Artinya air ini tidak terlalu asam atau basa, sehingga aman untuk kontak kulit dalam durasi mandi normal. Faktor ini tidak berkontribusi negatif terhadap skor kualitas air saat ini."

---

## SUHU AIR

### Suhu Terlalu Dingin (< 33°C)
**Kalimat pendek:**
> "Air terlalu dingin, kurang efektif membersihkan kulit."

**Penjelasan lengkap:**
> "Suhu air {value}°C terasa cukup dingin. Air dingin menyebabkan pembuluh darah kulit menyempit (vasokonstriksi), yang berarti sirkulasi darah ke kulit berkurang. Ini membuat pembersihan kulit kurang efektif dan sabun sulit berbusa dengan baik. Untuk iklim tropis seperti Indonesia, mandi dengan air dingin sesekali tidak masalah, tapi tidak ideal untuk pembersihan menyeluruh."

**Saran tindakan:**
> "Naikkan suhu ke 36–38°C untuk pembersihan optimal dan kenyamanan kulit."

---

### Suhu Terlalu Panas (> 40°C)
**Kalimat pendek:**
> "Air terlalu panas, bisa merusak lapisan pelindung kulit."

**Penjelasan lengkap:**
> "Suhu air {value}°C cukup panas. Air panas menyebabkan tubuh kehilangan kelembapan kulit lebih cepat — para ahli menyebutnya transepidermal water loss (TEWL). Selain itu, air panas melarutkan minyak alami kulit yang berfungsi sebagai pelindung. Bagi penderita eksim atau kulit sensitif, mandi dengan air sepanas ini bisa memicu munculnya atau memperburuk ruam dan rasa gatal."

**Saran tindakan:**
> "Turunkan suhu ke 36–38°C. Perbedaan kecil ini sangat berarti bagi kesehatan kulit jangka panjang."

**Referensi:** Wollenberg et al., JEADV, 2022; AAD Guidelines for Eczema Management

---

### Suhu Optimal (36–38°C)
**Kalimat pendek:**
> "Suhu air ideal untuk kesehatan kulit."

**Penjelasan lengkap:**
> "Suhu air {value}°C tepat di zona optimal yang direkomendasikan oleh European Academy of Dermatology. Suhu ini cukup hangat untuk membuka pori-pori dan membersihkan kulit dengan efektif, namun tidak terlalu panas sehingga tidak merusak lapisan pelindung alami kulit."

---

## KEKERUHAN (TURBIDITY)

### Turbidity Tinggi (> 1 NTU)
**Kalimat pendek:**
> "Air keruh — ada partikel yang perlu diwaspadai."

**Penjelasan lengkap:**
> "Tingkat kekeruhan air saat ini {value} NTU, di atas batas aman WHO (1 NTU). Air keruh berarti ada partikel kecil yang melayang di air — bisa berupa sedimen, partikel tanah, atau dalam kasus lebih serius, indikasi kontaminasi. Partikel ini bisa menyumbat pori-pori kulit, mengiritasi mata, dan dalam kondisi ekstrem bisa membawa bakteri yang menyebabkan folikulitis (infeksi pada folikel rambut)."

**Saran tindakan:**
> "Tunda mandi jika memungkinkan. Aktifkan filter sedimen atau tunggu hingga kejernihan air kembali normal."

**Referensi:** WHO 2022; Parra et al., Sensors, 2020 (doi:10.3390/s20030756)

---

### Turbidity Normal (≤ 1 NTU)
**Kalimat pendek:**
> "Air jernih, bebas partikel berbahaya."

**Penjelasan lengkap:**
> "Kejernihan air {value} NTU — air jernih dan bebas dari partikel tersuspensi yang berpotensi berbahaya. Faktor ini tidak berkontribusi negatif terhadap kondisi kulit."

---

## TDS / KESADAHAN AIR

### TDS Tinggi — Air Sangat Keras (> 300 ppm)
**Kalimat pendek:**
> "Air keras dapat memperburuk kulit kering dan eksim."

**Penjelasan lengkap:**
> "Tingkat TDS air {value} ppm menunjukkan air yang cukup keras, artinya banyak mengandung mineral terlarut seperti kalsium dan magnesium. Riset ilmiah menunjukkan anak-anak yang tinggal di daerah dengan air keras memiliki risiko 87% lebih tinggi terkena eksim (Jabbar-Lopez et al., 2021). Mekanismenya: mineral ini bereaksi dengan sabun membentuk residu yang sulit dibilas, menggores permukaan kulit secara mikro, dan mengurangi efektivitas pelembab yang kamu pakai."

**Saran tindakan:**
> "Pertimbangkan water softener atau filter TDS. Sementara itu, bilas lebih lama dan oleskan moisturizer segera setelah mandi."

**Referensi:** Jabbar-Lopez et al., Br J Dermatol, 2021 (doi:10.1111/bjd.19862); Perkin et al., J Invest Dermatol, 2021 (doi:10.1016/j.jid.2020.11.027)

---

### TDS Normal (< 300 ppm)
**Kalimat pendek:**
> "Kesadahan air dalam batas aman."

**Penjelasan lengkap:**
> "TDS air {value} ppm — kesadahan dalam batas yang direkomendasikan WHO. Tidak ada risiko signifikan dari kandungan mineral air terhadap kondisi kulit."

---

## KLORIN BEBAS

### Klorin Tinggi (> 0.5 mg/L)
**Kalimat pendek:**
> "Klorin tinggi, bisa mengeringkan dan mengiritasi kulit."

**Penjelasan lengkap:**
> "Kadar klorin bebas {value} mg/L melebihi batas aman WHO (0.5 mg/L). Klorin ditambahkan ke air PAM untuk membunuh bakteri — ini penting untuk keamanan air minum. Namun dalam konsentrasi tinggi, klorin juga 'membunuh' minyak pelindung alami kulit kita. Studi pada penderita atopic dermatitis menunjukkan paparan klorin berulang secara signifikan meningkatkan kehilangan kelembapan kulit (TEWL) dan menurunkan kadar ceramide — protein kunci yang menjaga kulit tetap lembab dan terlindungi."

**Saran tindakan:**
> "Pasang shower filter karbon aktif — sangat efektif mengurangi klorin dan harganya terjangkau. Oleskan moisturizer segera setelah mandi."

**Referensi:** Bates et al., Dermatitis, 2020 (PMID: 32195872); Perkin et al., 2021

---

### Klorin Sangat Rendah (< 0.1 mg/L)
**Kalimat pendek:**
> "Klorin sangat rendah — waspadai kontaminasi bakteri."

**Penjelasan lengkap:**
> "Kadar klorin {value} mg/L sangat rendah. Meskipun rendahnya klorin baik untuk kulit, ini bisa mengindikasikan air kurang terlindungi dari kontaminasi bakteri — terutama jika sumbernya PAM. Air dengan klorin sangat rendah berpotensi mengandung bakteri seperti Legionella atau Pseudomonas yang bisa menyebabkan infeksi kulit."

**Saran tindakan:**
> "Periksa sumber air dan hubungi PDAM jika ini air PAM. Hindari berendam lama dengan kondisi ini."

---

### Klorin Normal (0.2–0.5 mg/L)
**Kalimat pendek:**
> "Klorin dalam batas disinfeksi yang aman."

**Penjelasan lengkap:**
> "Kadar klorin {value} mg/L berada dalam rentang optimal WHO untuk air distribusi. Jumlah ini cukup untuk melindungi dari kontaminasi bakteri namun tidak berlebihan untuk kontak kulit dalam durasi mandi normal."

---

## KOMBINASI PARAMETER

### pH Rendah + TDS Tinggi (Air Asam & Keras)
**Kalimat pendek:**
> "Kombinasi air asam dan keras — risiko iritasi tinggi untuk kulit sensitif."

**Penjelasan lengkap:**
> "Kondisi air saat ini memiliki dua faktor yang bekerja bersamaan: pH asam ({ph}) dan kesadahan tinggi ({tds} ppm). Air asam mengikis lapisan pelindung kulit, sementara mineral keras meninggalkan residu yang memperparah iritasi. Untuk pemilik kulit {skin_type}, kombinasi ini sebaiknya dihindari dengan mempersingkat durasi mandi dan menggunakan sabun yang sangat lembut."

---

### Klorin Tinggi + Kulit Sensitif / Kering
**Kalimat pendek:**
> "Klorin tinggi berbahaya untuk tipe kulitmu."

**Penjelasan lengkap:**
> "Kadar klorin {chlorine} mg/L cukup tinggi, dan ini terutama berisiko untuk kulit {skin_type} seperti milikmu. Kulit sensitif dan kering memiliki skin barrier yang lebih tipis, sehingga lebih rentan terhadap efek oksidatif klorin. Riset menunjukkan penderita eksim yang terpapar klorin >0.5 mg/L secara rutin mengalami peningkatan frekuensi flare-up yang signifikan."

---

### Semua Parameter Normal
**Kalimat pendek:**
> "Kondisi air optimal untuk mandi sehat."

**Penjelasan lengkap:**
> "Semua parameter air saat ini berada dalam rentang optimal. pH {ph}, suhu {temp}°C, kejernihan {turbidity} NTU, kesadahan {tds} ppm, dan klorin {chlorine} mg/L semuanya dalam batas yang direkomendasikan untuk kesehatan kulit. Ini waktu yang baik untuk mandi dengan tenang!"

---

## VARIAN PER TIPE KULIT

Gunakan blok ini saat `skin_type` diketahui dari profil pengguna dan kondisi air memerlukan nuansa personalisasi.
Format: `skintype_condition` — gunakan sebagai suffix setelah template utama atau sebagai pengganti `penjelasan lengkap`.

---

### KULIT KERING (dry)

**dry + pH Tinggi (> 8.5):**
> "Kombinasi berbahaya untuk kulitmu. Kulit kering sudah memiliki ceramide yang kurang dari normal, dan air basa seperti ini langsung memperburuk kekurangannya. Ini seperti mengelap lantai yang sudah kering dengan kain yang melarutkan lapisan pelindungnya. Oleskan moisturizer ceramide dalam 2 menit setelah mandi — jangan tunggu lebih lama."

**dry + Klorin Tinggi (> 0.5 mg/L):**
> "Untuk kulit kering seperti milikmu, klorin tinggi adalah iritan ganda — ia mengoksidasi sisa ceramide yang sudah sedikit. Riset menunjukkan penderita xerosis (kulit kering klinis) mengalami peningkatan TEWL 40% lebih tinggi dibanding kulit normal saat terpapar klorin tinggi. Pertimbangkan shower filter karbon aktif — harganya terjangkau dan efektif."

**dry + TDS Tinggi (> 300 ppm):**
> "Air sadah adalah musuh besar kulit kering. Mineral Ca²⁺ dan Mg²⁺ dalam air keras menghambat kerja filaggrin — protein yang memproduksi NMF (Natural Moisturizing Factor), pelembap alami kulitmu. Efeknya bersifat kumulatif: semakin sering, semakin parah kekeringan. Setelah mandi hari ini, segera aplikasikan body butter atau cream petrolatum-based."

**dry + Suhu Panas (> 40°C):**
> "Ini kondisi yang paling perlu dihindari untuk kulit kering. Air panas melarutkan sebum dan ceramide jauh lebih efisien dari air hangat — kulitmu kehilangan pelindung alaminya lebih cepat dari yang bisa dipulihkan. Turunkan suhu ke 36–38°C sekarang dan batasi mandi maksimal 8 menit."

---

### KULIT BERMINYAK (oily)

**oily + pH Rendah (< 6.5):**
> "Air asam tidak terlalu berbahaya untuk kulitmu karena kulit berminyak memiliki acid mantle yang lebih kuat. Namun pH rendah bisa memicu produksi sebum tambahan sebagai respons kompensasi — paradoksnya membuat kulit lebih berminyak. Gunakan cleanser pH-balanced (5.5) untuk menetralisir efek ini."

**oily + pH Tinggi (> 8.5):**
> "Air basa mendisrupsi acid mantle kulitmu yang sebenarnya sudah cukup baik menjaga keseimbangan. Kulit berminyak yang terpapar air basa sering bereaksi dengan memproduksi lebih banyak sebum sebagai kompensasi — efek 'bersih sesaat, berminyak lebih cepat' setelahnya. Bilas wajah dengan air bersih terakhir jika memungkinkan."

**oily + Suhu Panas (> 40°C):**
> "Meski air panas terasa membersihkan kulit berminyak dengan lebih efektif, ini bukan strategi tepat. Air panas memang melarutkan sebum lebih baik, tapi juga memicu sebaceous gland untuk memproduksi lebih banyak sebum sebagai respons — minyak kembali lebih cepat. Suhu 36–38°C tetap optimal bahkan untuk kulitmu."

---

### KULIT SENSITIF (sensitive)

**sensitive + pH Tinggi (> 8.5):**
> "Kulit sensitif memiliki threshold toleransi yang jauh lebih rendah terhadap gangguan pH. Bahkan perubahan kecil dari pH optimal sudah bisa memicu kemerahan, rasa terbakar, atau urtikaria kontak. Air dengan pH {value} ini signifikan untuk kulitmu. Persingkat mandi menjadi maksimal 5 menit dan segera oleskan moisturizer hypoallergenic."

**sensitive + Klorin Tinggi (> 0.5 mg/L):**
> "Kulit sensitif adalah yang paling rentan terhadap klorin. Studi Bates et al. (2020) menemukan bahwa penderita kulit sensitif mengalami peningkatan reaktivitas kutaneus (kemerahan, gatal) bahkan pada klorin 0.4 mg/L — di bawah batas WHO yang berlaku untuk kulit 'normal'. Shower filter karbon aktif sangat direkomendasikan untuk profil kulitmu."

**sensitive + TDS Tinggi (> 300 ppm):**
> "Air sadah dan kulit sensitif adalah kombinasi yang telah terdokumentasi dalam penelitian dermatologi. Ion mineral tidak hanya bereaksi dengan sabun, tapi juga secara langsung mengaktivasi reseptor TRPV1 (reseptor rasa panas/nyeri di kulit) — menyebabkan sensasi terbakar atau gatal yang terasa 'tanpa sebab'. Bilas panjang dan gunakan sabun syndet Sebamed atau Avène."

**sensitive + pH Rendah (< 6.5):**
> "Air asam memang mendekati pH alami kulit (4.5–5.5), tapi kulit sensitif bereaksi berbeda. Perubahan cepat dari pH normal ke asam bisa memicu flush reaction dan meningkatkan reaktivitas. Jika kulitmu reaktif, bahkan pH sedikit di luar optimal sudah terasa perbedaannya."

---

### KULIT NORMAL (normal)

**normal + Semua Parameter Normal:**
> "Untuk kulit normal seperti milikmu, kondisi air saat ini ideal. Tidak ada parameter yang menjadi faktor risiko. Tetap jaga rutinitas mandi 10–15 menit dengan suhu {temp}°C dan moisturizer ringan setelahnya untuk mempertahankan keseimbangan kulitmu."

**normal + pH Tinggi (> 8.5):**
> "Meskipun kulitmu normal dan toleran, air basa konsisten bisa secara bertahap menggeser keseimbangan microbiome-mu. Tidak ada risiko akut, tapi paparan jangka panjang berpotensi menggeser kulitmu menjadi lebih kering dari baseline. Gunakan moisturizer ringan setelah mandi untuk buffer."

**normal + TDS Tinggi (> 300 ppm):**
> "Kulit normal memiliki toleransi yang lebih baik terhadap air keras dibanding kulit kering atau sensitif. Namun TDS {value} ppm ini tetap meninggalkan residu mineral yang mengurangi efektivitas sabun dan moisturizer. Bilas lebih lama dari biasanya hari ini."

---

### KULIT KOMBINASI (combination)

**combination + pH Tinggi (> 8.5):**
> "Kulitmu yang kombinasi menghadapi dilema: zona T (dahi, hidung, dagu) yang berminyak relatif lebih tahan, tapi area pipi yang lebih kering akan merespons air basa ini lebih negatif. Fokuskan moisturizer di area pipi dan hindari over-cleansing zona T — air basa sudah 'membersihkan berlebihan' untuk kamu."

**combination + TDS Tinggi (> 300 ppm):**
> "Air sadah mempengaruhi zona kering dan berminyak kulitmu secara berbeda. Di area pipi (lebih kering): mineral meningkatkan kekeringan dan residu iritan. Di zona T (lebih berminyak): mineral bereaksi dengan sebum menghasilkan 'plug' yang menyumbat pori. Pertimbangkan double cleanse dengan micellar water pertama sebelum sabun untuk meminimalkan waktu kontak air keras."

---

## Catatan Penggunaan di app.js

```js
// Cara menggunakan template ini:
// 1. Load file ini sebagai string atau konversi ke JSON lookup object
// 2. Deteksi kondisi tiap sensor berdasarkan thresholds.json
// 3. Pilih template yang sesuai
// 4. Replace {value}, {ph}, {temp}, dst. dengan nilai aktual

// Contoh:
const getXAIText = (param, condition, values) => {
  // param: 'ph', 'temp', 'turbidity', 'tds', 'chlorine'
  // condition: 'low', 'high', 'normal'
  // values: { ph, temp, turbidity, tds, chlorine, skin_type }
  // return: { short, long, action }
}
```
