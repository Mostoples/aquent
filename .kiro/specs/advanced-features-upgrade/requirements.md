# Requirements Document

## Introduction

Dokumen ini mendefinisikan kebutuhan untuk peningkatan kemampuan AQUENT agar set fiturnya menjadi lebih komprehensif, canggih, dan terasa "lengkap" sebagai produk riset akademik IoT + Explainable AI (XAI) untuk kesehatan kulit. Peningkatan ini dibangun di atas arsitektur yang sudah ada (aplikasi web statis multi-halaman berbasis vanilla JS, Firebase Hosting + Realtime Database + Firestore) dan harus tetap berjalan dalam batasan Firebase Spark (tanpa wajib Cloud Functions / Blaze).

Fokus peningkatan mencakup sepuluh area kapabilitas baru/diperdalam:

1. **Analitik Prediktif & Peramalan Tren Kualitas Air** — memproyeksikan kualitas air ke depan dari data historis.
2. **Deteksi Anomali & Smart Alert** — mengenali pola sensor yang tidak wajar dan memberi peringatan kontekstual.
3. **AI Konsultan yang Lebih Mendalam** — sadar konteks sensor real-time dan sadar riwayat percakapan/sesi pengguna.
4. **Integrasi TDS + Klorin Bebas End-to-End** — melengkapi platform 5-parameter sesuai klaim novelty N02.
5. **Skin Diary & Laporan Kesehatan Kulit Longitudinal** — pelacakan progres kulit dari waktu ke waktu, tetap privacy-first lokal.
6. **Gamifikasi Lanjutan** — streak, tantangan (challenges), dan papan peringkat (leaderboard).
7. **Eco-Analytics yang Lebih Kaya** — estimasi biaya air dan jejak karbon (CO₂).
8. **Pusat Notifikasi (Notification Center)** — riwayat dan pengelolaan notifikasi terpusat.
9. **Ekspor Laporan PDF** — laporan kesehatan air & kulit yang dapat diunduh.
10. **Ekspor Data (Portabilitas/GDPR)** — pengguna mengunduh seluruh datanya.

Tema lintas-fitur yang dipertahankan sebagai inti produk: **transparansi XAI** (atribusi faktor + skor kepercayaan/confidence) yang berlandaskan temuan SLR, **dwibahasa ID/EN**, dan **privasi (machine learning lokal untuk pemindaian kulit)**.

### Batasan Arsitektur (berlaku untuk seluruh requirement)

- THE AQUENT_System SHALL menjalankan seluruh kapabilitas baru di sisi klien (browser) atau melalui Firebase Realtime Database dan Firestore tanpa mewajibkan Cloud Functions.
- THE AQUENT_System SHALL mempertahankan arsitektur vanilla JavaScript tanpa memperkenalkan framework build yang wajib.
- THE AQUENT_System SHALL menyediakan seluruh teks antarmuka baru dalam Bahasa Indonesia dan Bahasa Inggris melalui mekanisme i18n yang sudah ada.
- THE AQUENT_System SHALL memproses seluruh citra kulit untuk Skin Diary secara lokal di perangkat pengguna tanpa mengunggah citra mentah ke server.

## Glossary

- **AQUENT_System**: Keseluruhan aplikasi web AQUENT (pengguna + admin) yang berjalan di Firebase Hosting.
- **Forecasting_Engine**: Komponen sisi klien yang menghasilkan proyeksi nilai sensor dan skor kualitas air masa depan dari data historis.
- **Anomaly_Detector**: Komponen sisi klien yang mengevaluasi pembacaan sensor terhadap baseline statistik untuk mengidentifikasi pembacaan tidak wajar.
- **Alert_Manager**: Komponen yang membuat, memprioritaskan, dan menyalurkan peringatan (alert) ke pengguna.
- **AI_Consultant**: Fitur "AI Konsultan" berbasis Gemini (kunci API disuplai pengguna) yang menjawab pertanyaan kesehatan kulit & air.
- **Sensor_Integration_Module**: Lapisan yang membaca, memvalidasi, dan menyajikan lima parameter sensor (pH, suhu, turbidity, TDS, klorin).
- **Water_Quality_Score**: Skor 0–100 dengan grade A–F yang merepresentasikan kualitas air per sesi.
- **XAI_Engine**: Komponen yang menghasilkan atribusi faktor (kontribusi tiap parameter) dan skor kepercayaan (confidence) untuk skor/rekomendasi.
- **Skin_Diary**: Catatan kronologis pemindaian kulit pengguna beserta metrik turunannya.
- **Progress_Tracker**: Komponen yang menghitung dan memvisualisasikan perubahan metrik kulit antar-waktu.
- **Gamification_Engine**: Komponen yang mengelola poin, level, streak, tantangan, dan papan peringkat.
- **Eco_Analytics_Engine**: Komponen yang menghitung penggunaan air, penghematan, estimasi biaya, dan estimasi emisi CO₂.
- **Notification_Center**: Antarmuka terpusat yang menampilkan riwayat dan status notifikasi.
- **Report_Exporter**: Komponen yang menyusun dan mengekspor laporan dalam format PDF di sisi klien.
- **Data_Exporter**: Komponen yang mengumpulkan seluruh data pengguna dan mengekspornya sebagai berkas yang dapat diunduh.
- **Active_Profile**: Profil pengguna yang sedang dipilih dalam fitur Multi-Profile.
- **Sensor_Reading**: Satu set nilai sensor (pH, suhu, turbidity, TDS, klorin) pada satu titik waktu.
- **Historical_Window**: Rentang data Sensor_Reading masa lalu yang digunakan untuk analitik (mis. 24 jam, 7 hari, 30 hari).
- **Confidence_Score**: Nilai 0–100% yang menyatakan tingkat keyakinan sistem terhadap suatu output analitik/AI.
- **Baseline**: Statistik rujukan (mis. rata-rata bergerak dan deviasi standar) yang dihitung dari Historical_Window.

---

## Requirements

### Requirement 1: Analitik Prediktif & Peramalan Tren Kualitas Air

**User Story:** Sebagai pengguna AQUENT, saya ingin melihat proyeksi tren kualitas air saya untuk jam/hari ke depan, sehingga saya dapat merencanakan waktu mandi yang paling sehat.

#### Acceptance Criteria

1. THE Forecasting_Engine SHALL menghitung proyeksi Water_Quality_Score untuk horizon 24 jam ke depan menggunakan data Historical_Window minimal 7 hari.
2. WHEN pengguna membuka panel peramalan, THE Forecasting_Engine SHALL menampilkan nilai proyeksi untuk pH, suhu, turbidity, TDS, dan klorin pada horizon yang dipilih.
3. IF Historical_Window berisi kurang dari 7 hari data atau kurang dari 24 Sensor_Reading, THEN THE Forecasting_Engine SHALL menahan perhitungan proyeksi dan menampilkan status "data tidak cukup untuk peramalan".
4. THE Forecasting_Engine SHALL memperlakukan nilai sensor bernilai nol sebagai pengukuran yang valid dalam perhitungan proyeksi.
5. THE Forecasting_Engine SHALL menampilkan Confidence_Score untuk setiap proyeksi yang dihasilkan.
6. WHEN proyeksi Water_Quality_Score untuk horizon 24 jam berada di bawah 60, THE Forecasting_Engine SHALL menandai periode tersebut sebagai "tidak direkomendasikan untuk mandi".
7. THE Forecasting_Engine SHALL menyajikan tren historis dan proyeksi dalam satu grafik garis menggunakan pustaka charting yang sudah digunakan aplikasi.
8. WHEN pengguna mengganti bahasa antarmuka, THE Forecasting_Engine SHALL menampilkan seluruh label dan keterangan peramalan dalam bahasa yang dipilih.
9. THE Forecasting_Engine SHALL menyelesaikan perhitungan proyeksi di sisi klien dalam waktu paling lama 2 detik untuk Historical_Window 30 hari.

### Requirement 2: Deteksi Anomali & Smart Alert

**User Story:** Sebagai pengguna AQUENT, saya ingin diberi tahu ketika pembacaan sensor menyimpang tidak wajar dari pola biasanya, sehingga saya dapat menghindari mandi pada kondisi air berisiko.

#### Acceptance Criteria

1. THE Anomaly_Detector SHALL menghitung Baseline dengan menjadikan rata-rata bergerak parameter sebagai nilai Baseline dan menghitung deviasi standar dari Historical_Window 7 hari.
2. WHERE seluruh nilai dalam Historical_Window untuk satu parameter identik, THE Anomaly_Detector SHALL menggunakan deviasi standar minimum positif yang terkonfigurasi alih-alih nol.
3. WHEN sebuah Sensor_Reading untuk satu parameter menyimpang lebih dari 3 deviasi standar dari Baseline, THE Anomaly_Detector SHALL menandai pembacaan tersebut sebagai anomali.
4. WHEN sebuah anomali terdeteksi, THE Alert_Manager SHALL membuat peringatan yang memuat nama parameter, nilai terukur, nilai Baseline, dan tingkat keparahan.
5. THE Alert_Manager SHALL mengklasifikasikan setiap peringatan ke dalam salah satu tingkat: kritis, peringatan, atau informasi.
6. IF sebuah parameter sensor mengirim nilai di luar rentang fisik yang valid sesuai `thresholds.json`, THEN THE Anomaly_Detector SHALL menandai pembacaan tersebut sebagai tidak valid dan mengeluarkannya dari perhitungan Baseline.
7. WHEN sebuah anomali kritis terdeteksi, THE Alert_Manager SHALL menampilkan peringatan visual di Dashboard dalam waktu paling lama 3 detik sejak pembacaan diterima.
8. THE Alert_Manager SHALL mencatat setiap peringatan yang dihasilkan ke Notification_Center.
9. WHERE pengguna telah menonaktifkan kategori peringatan tertentu pada pengaturan, THE Alert_Manager SHALL menahan tampilan peringatan untuk kategori tersebut.

### Requirement 3: AI Konsultan Sadar-Konteks dan Sadar-Riwayat

**User Story:** Sebagai pengguna AQUENT, saya ingin AI Konsultan memahami kondisi air saya saat ini dan riwayat saya, sehingga jawabannya lebih personal dan relevan.

#### Acceptance Criteria

1. WHEN pengguna mengirim pertanyaan ke AI_Consultant, THE AI_Consultant SHALL menyertakan Sensor_Reading terkini dan tipe kulit Active_Profile sebagai konteks pada permintaan.
2. THE AI_Consultant SHALL menyertakan ringkasan riwayat sesi terbaru pengguna sebagai konteks tambahan pada setiap permintaan.
3. THE AI_Consultant SHALL mempertahankan riwayat percakapan dalam satu sesi obrolan sehingga jawaban berikutnya konsisten dengan pertanyaan sebelumnya.
4. WHEN AI_Consultant memberikan rekomendasi terkait parameter air, THE AI_Consultant SHALL menyebutkan parameter spesifik dan nilainya yang menjadi dasar rekomendasi.
5. IF kunci API Gemini belum dikonfigurasi oleh pengguna, THEN THE AI_Consultant SHALL menampilkan instruksi konfigurasi dan SHALL menahan pengiriman permintaan.
6. IF permintaan ke layanan AI gagal atau melebihi 30 detik, THEN THE AI_Consultant SHALL menampilkan pesan kesalahan yang menjelaskan penyebab dan menyarankan tindakan lanjutan.
7. THE AI_Consultant SHALL menampilkan disclaimer bahwa keluaran bukan nasihat medis profesional pada setiap sesi obrolan.
8. WHEN pengguna mengganti bahasa antarmuka, THE AI_Consultant SHALL meminta jawaban dalam bahasa yang dipilih sebagai preferensi utama, namun MAY menghasilkan jawaban dalam bahasa lain bila konteks pertanyaan menuntut demikian.
9. THE AI_Consultant SHALL membatasi panjang konteks riwayat yang dikirim agar tidak melebihi ambang token yang dikonfigurasi.

### Requirement 4: Integrasi TDS & Klorin Bebas End-to-End

**User Story:** Sebagai pengguna AQUENT, saya ingin parameter TDS dan klorin bebas terintegrasi penuh di seluruh aplikasi, sehingga platform benar-benar memantau lima parameter sesuai klaim risetnya.

#### Acceptance Criteria

1. THE Sensor_Integration_Module SHALL membaca nilai TDS dan klorin bebas dari Realtime Database bersama pH, suhu, dan turbidity.
2. WHERE nilai TDS atau klorin tidak tersedia pada sumber data, THE Sensor_Integration_Module SHALL menampilkan status "tidak tersedia" untuk parameter tersebut alih-alih nilai placeholder.
3. THE Dashboard SHALL menampilkan kartu sensor untuk TDS dan klorin bebas lengkap dengan nilai, satuan, dan status (rendah/normal/tinggi) berdasarkan `thresholds.json`.
4. WHEN nilai TDS atau klorin berada di luar rentang aman, THE XAI_Engine SHALL menghasilkan penjelasan faktor dan saran tindakan untuk parameter tersebut menggunakan template XAI yang ada.
5. THE XAI_Engine SHALL menyajikan TDS dan klorin sebagai faktor informasi/alert terpisah dari komponen skor utama, dengan menyatakan secara eksplisit bahwa keduanya tidak mengubah Water_Quality_Score (bobot 0%).
6. WHEN TDS melebihi 300 ppm, THE Anomaly_Detector SHALL memicu peringatan air sadah melalui Alert_Manager.
7. WHEN klorin bebas melebihi 0.5 mg/L, THE Alert_Manager SHALL membuat peringatan klorin tinggi; WHEN klorin bebas berada di bawah 0.1 mg/L, THE Alert_Manager SHALL membuat peringatan klorin rendah.
8. THE Encyclopedia SHALL menandai entri terkait kesadahan air dan klorin sebagai "relevan sekarang" ketika nilai sensor terkait berada di luar rentang aman.
9. THE Sensor_Integration_Module SHALL menyertakan TDS dan klorin pada data sesi yang disimpan ke riwayat.

### Requirement 5: Skin Diary & Laporan Kesehatan Kulit Longitudinal

**User Story:** Sebagai pengguna AQUENT, saya ingin mencatat hasil pemindaian kulit dari waktu ke waktu dan melihat perkembangannya, sehingga saya dapat menilai dampak kualitas air terhadap kulit saya.

#### Acceptance Criteria

1. WHEN pengguna menyelesaikan pemindaian kulit, THE Skin_Diary SHALL menyimpan metrik hasil (mis. saturation, redness, oiliness, texture, sharpness), skor, tipe kulit terdeteksi, Confidence_Score, dan stempel waktu untuk Active_Profile.
2. THE Skin_Diary SHALL memproses dan menyimpan seluruh data pemindaian secara lokal tanpa mengunggah citra kulit mentah ke server.
3. WHERE pengguna memilih menyinkronkan metrik kulit, THE Skin_Diary SHALL menyimpan hanya metrik numerik turunan (tanpa citra) ke Firestore untuk Active_Profile.
4. IF sinkronisasi metrik kulit ke Firestore gagal karena gangguan jaringan atau server, THEN THE Skin_Diary SHALL menandai status sinkronisasi sebagai "tertunda", menampilkan status tersebut kepada pengguna, dan mencoba ulang di latar belakang hingga berhasil.
5. THE Progress_Tracker SHALL menampilkan grafik tren tiap metrik kulit untuk rentang yang dipilih pengguna (7, 30, atau 90 hari).
6. WHEN terdapat minimal dua entri pemindaian, THE Progress_Tracker SHALL menghitung dan menampilkan perubahan tiap metrik antara entri terbaru dan entri sebelumnya.
7. THE Progress_Tracker SHALL menampilkan korelasi visual antara tren metrik kulit dan tren Water_Quality_Score pada rentang waktu yang sama.
8. WHEN pengguna menghapus sebuah entri Skin_Diary, THE Skin_Diary SHALL menghapus data turunan entri tersebut dari penyimpanan lokal dan Firestore sebagai satu operasi yang harus berhasil seluruhnya; IF salah satu penghapusan gagal, THEN THE Skin_Diary SHALL menganggap operasi gagal dan mempertahankan kedua salinan data dalam keadaan konsisten.
9. THE Skin_Diary SHALL menampilkan seluruh label, metrik, dan keterangan dalam bahasa antarmuka yang dipilih.
10. WHERE entri pemindaian terbaru pengguna berusia lebih dari 14 hari, THE Skin_Diary SHALL menampilkan pengingat untuk melakukan pemindaian berkala.

### Requirement 6: Gamifikasi Lanjutan (Streak, Tantangan, Leaderboard)

**User Story:** Sebagai pengguna AQUENT, saya ingin streak, tantangan, dan papan peringkat, sehingga saya termotivasi menjaga kebiasaan mandi sehat secara konsisten.

#### Acceptance Criteria

1. WHEN pengguna mencatat sesi mandi pada hari kalender baru secara berurutan, THE Gamification_Engine SHALL menambah nilai streak harian sebanyak satu.
2. IF pengguna tidak mencatat sesi mandi dalam satu hari kalender penuh, THEN THE Gamification_Engine SHALL mengatur ulang streak harian ke nol.
3. WHEN streak harian mencapai salah satu tonggak (7, 14, 21, 30, 60, atau 100 hari), THE Gamification_Engine SHALL memberikan penghargaan tonggak dan mencatat notifikasi ke Notification_Center.
4. THE Gamification_Engine SHALL menyediakan minimal tiga tantangan terstruktur dengan kriteria penyelesaian yang terukur (mis. "5 sesi dengan Grade A dalam 7 hari").
5. WHEN seluruh kriteria sebuah tantangan terpenuhi, THE Gamification_Engine SHALL menandai tantangan tersebut selesai dan menambahkan poin yang ditentukan ke total poin pengguna.
6. IF kriteria sebuah tantangan belum terpenuhi, THEN THE Gamification_Engine SHALL menahan penandaan selesai dan menahan penambahan poin untuk tantangan tersebut.
7. THE Gamification_Engine SHALL menghitung level pengguna dari total poin menggunakan ambang level yang terdefinisi.
8. THE Gamification_Engine SHALL menampilkan papan peringkat yang memuat peringkat berbasis poin dari pengguna yang memilih ikut serta (opt-in).
9. WHERE pengguna tidak memilih ikut serta papan peringkat, THE Gamification_Engine SHALL mengecualikan data pengguna tersebut dari papan peringkat publik.
10. THE Gamification_Engine SHALL menampilkan identitas pada papan peringkat menggunakan nama tampilan pilihan pengguna tanpa menampilkan alamat email.

### Requirement 7: Eco-Analytics dengan Estimasi Biaya & Jejak Karbon

**User Story:** Sebagai pengguna AQUENT, saya ingin melihat estimasi biaya air dan jejak karbon dari kebiasaan mandi saya, sehingga saya memahami dampak finansial dan lingkungannya.

#### Acceptance Criteria

1. THE Eco_Analytics_Engine SHALL menghitung total konsumsi air per periode (harian, mingguan, bulanan) dari data sesi yang tercatat.
2. WHERE tidak terdapat sesi mandi yang tercatat dalam suatu periode, THE Eco_Analytics_Engine SHALL memperlakukan total konsumsi air nol sebagai nilai yang valid.
3. THE Eco_Analytics_Engine SHALL menghitung estimasi biaya air dengan mengalikan konsumsi air dengan tarif per satuan volume yang dapat dikonfigurasi pengguna.
4. THE Eco_Analytics_Engine SHALL menghitung estimasi emisi CO₂ dari energi pemanas air menggunakan faktor emisi yang dapat dikonfigurasi.
5. WHERE tarif air atau faktor emisi belum diatur pengguna, THE Eco_Analytics_Engine SHALL menggunakan nilai default yang terdokumentasi untuk nilai yang belum diatur dan menandai hasilnya sebagai estimasi.
6. THE Eco_Analytics_Engine SHALL menampilkan air yang dihemat dibandingkan dengan baseline penggunaan yang dapat dikonfigurasi.
7. THE Eco_Analytics_Engine SHALL menyajikan biaya dan emisi dalam grafik tren untuk periode yang dipilih.
8. WHEN pengguna mengganti bahasa antarmuka, THE Eco_Analytics_Engine SHALL menampilkan satuan, mata uang, dan label dalam format bahasa yang dipilih.
9. THE Eco_Analytics_Engine SHALL menampilkan keterangan bahwa nilai biaya dan emisi merupakan estimasi, beserta asumsi yang digunakan.

### Requirement 8: Pusat Notifikasi (Notification Center)

**User Story:** Sebagai pengguna AQUENT, saya ingin satu tempat untuk melihat semua notifikasi yang pernah muncul, sehingga saya tidak kehilangan informasi penting.

#### Acceptance Criteria

1. THE Notification_Center SHALL menampilkan daftar notifikasi yang diterima diurutkan dari yang terbaru.
2. WHEN sebuah notifikasi baru dibuat oleh Alert_Manager, Gamification_Engine, atau penjadwal, THE Notification_Center SHALL menambahkan notifikasi tersebut ke daftar.
3. THE Notification_Center SHALL menampilkan jumlah notifikasi yang belum dibaca pada indikator ikon notifikasi.
4. WHEN pengguna membuka sebuah notifikasi, THE Notification_Center SHALL menandai notifikasi tersebut sebagai telah dibaca.
5. WHEN pengguna memilih "tandai semua telah dibaca", THE Notification_Center SHALL mengatur seluruh notifikasi menjadi telah dibaca.
6. THE Notification_Center SHALL memungkinkan pengguna menyaring notifikasi berdasarkan kategori (kualitas air, gamifikasi, pengingat, edukasi).
7. WHEN pengguna menghapus sebuah notifikasi, THE Notification_Center SHALL menghapus notifikasi tersebut dari daftar dan penyimpanan.
8. THE Notification_Center SHALL menyimpan notifikasi per Active_Profile sehingga setiap profil melihat notifikasinya sendiri.
9. THE Notification_Center SHALL menampilkan seluruh teks notifikasi dalam bahasa antarmuka yang dipilih bila template tersedia dalam bahasa tersebut.

### Requirement 9: Ekspor Laporan PDF

**User Story:** Sebagai pengguna AQUENT, saya ingin mengunduh laporan kesehatan air dan kulit dalam format PDF, sehingga saya dapat menyimpannya atau membagikannya ke tenaga kesehatan.

#### Acceptance Criteria

1. WHEN pengguna meminta ekspor laporan, THE Report_Exporter SHALL menghasilkan dokumen PDF di sisi klien tanpa mengirim data ke server pihak ketiga.
2. THE Report_Exporter SHALL menyertakan ringkasan Water_Quality_Score, nilai lima parameter sensor, atribusi faktor XAI, dan rentang waktu laporan.
3. WHERE pengguna menyertakan data kulit, THE Report_Exporter SHALL menyertakan tren metrik Skin_Diary dan ringkasan progres pada laporan.
4. THE Report_Exporter SHALL menyertakan stempel waktu pembuatan dan nama Active_Profile pada setiap laporan.
5. THE Report_Exporter SHALL menghasilkan laporan dalam bahasa antarmuka yang sedang dipilih pengguna saat ekspor, meskipun berbeda dari bahasa saat data dikumpulkan.
6. IF data tidak cukup untuk sebagian rentang yang diminta, THEN THE Report_Exporter SHALL tetap menghasilkan PDF dengan data yang tersedia dan menyertakan keterangan mengenai data yang hilang.
7. THE Report_Exporter SHALL menyertakan disclaimer bahwa laporan bukan diagnosis medis pada dokumen yang dihasilkan.
8. THE Report_Exporter SHALL menyelesaikan pembuatan PDF dalam waktu paling lama 5 detik untuk rentang laporan 30 hari.

### Requirement 10: Ekspor Data Pengguna (Portabilitas Data)

**User Story:** Sebagai pengguna AQUENT, saya ingin mengunduh seluruh data milik saya, sehingga saya memiliki kendali dan portabilitas atas data pribadi saya.

#### Acceptance Criteria

1. WHEN pengguna meminta ekspor data, THE Data_Exporter SHALL mengumpulkan data sesi, profil, hasil survei, badge, entri Skin_Diary, dan notifikasi milik pengguna.
2. THE Data_Exporter SHALL menghasilkan berkas ekspor dalam format JSON yang dapat dibaca mesin.
3. THE Data_Exporter SHALL mengecualikan citra kulit mentah dari ekspor karena citra tidak disimpan di server.
4. THE Data_Exporter SHALL menyertakan stempel waktu ekspor dan pengenal pengguna pada berkas ekspor.
5. IF proses pengumpulan data gagal sebagian, THEN THE Data_Exporter SHALL menampilkan kesalahan yang menyebutkan bagian data yang gagal diambil dan tetap menghasilkan berkas ekspor berisi data yang berhasil dikumpulkan.
6. IF proses pengumpulan data gagal seluruhnya sebelum ada data yang berhasil dikumpulkan, THEN THE Data_Exporter SHALL menampilkan pesan kesalahan dan menahan pembuatan berkas ekspor.
7. THE Data_Exporter SHALL menjalankan seluruh proses ekspor di sisi klien tanpa mengirim data ke server pihak ketiga.
8. THE Data_Exporter SHALL menyediakan akses fungsi ekspor dari halaman akun pengguna.

### Requirement 11: Transparansi XAI Lintas-Fitur (Atribusi Faktor + Confidence)

**User Story:** Sebagai pengguna dan peneliti AQUENT, saya ingin setiap keluaran cerdas disertai atribusi faktor dan skor kepercayaan, sehingga sistem tetap transparan dan dapat dipertanggungjawabkan secara akademik.

#### Acceptance Criteria

1. WHEN XAI_Engine menampilkan Water_Quality_Score, THE XAI_Engine SHALL menampilkan kontribusi persentase tiap parameter terhadap skor.
2. THE XAI_Engine SHALL menampilkan Confidence_Score pada keluaran peramalan, deteksi anomali, dan pemindaian kulit.
3. WHEN pengguna membuka penjelasan sebuah faktor, THE XAI_Engine SHALL menampilkan penjelasan naratif beserta rujukan ilmiah yang relevan dari basis data referensi.
4. THE XAI_Engine SHALL menyatakan secara eksplisit parameter mana yang tidak berkontribusi pada Water_Quality_Score (TDS dan klorin, bobot 0%) beserta alasannya.
5. WHERE Confidence_Score suatu keluaran berada di bawah 50%, THE XAI_Engine SHALL menampilkan peringatan bahwa keluaran memiliki ketidakpastian tinggi.
6. THE XAI_Engine SHALL menampilkan seluruh penjelasan XAI dalam bahasa antarmuka yang dipilih.
7. THE XAI_Engine SHALL menghasilkan atribusi faktor yang konsisten untuk Sensor_Reading yang identik (keluaran deterministik untuk masukan yang sama).
