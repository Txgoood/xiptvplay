import { Playlist, DownloadItem, MediaItem, SystemStats } from '../types';

export const INITIAL_STATS: SystemStats = {
  activePlaylistsCount: 0,
  cacheSizeGb: 0,
  releasableMb: 0,
  totalStorageGb: 128.0,
  iptvArchiveGb: 0,
  freeStorageGb: 128.0,
  usedPercent: 0,
  downloadSpeedMbps: 0,
  parallelSockets: 8,
  turboActive: true,
  wifiOnly: true,
  engineVersion: 'v4.2 Active',
};

export const INITIAL_PLAYLISTS: Playlist[] = [];

export const INITIAL_DOWNLOADS: DownloadItem[] = [];

export const MEDIA_CATALOG: MediaItem[] = [];

export const PRD_STAGES = [
  {
    id: 'stage-summary',
    number: '1',
    title: 'Executive Summary',
    description: 'xiptvplay pazar konumu, temel yetenekler ve değer önerisi özeti.',
    content: `### 1. Yönetici Özeti (Executive Summary)

**xiptvplay** (\`com.lucidsws.xtreamdownloader\`), Android ekosisteminde kullanıcıların yasal ve yetkili IPTV oynatma listelerini (Xtream Codes API ve M3U formatlarında) yüksek hızda oynatabilmelerini, organize edebilmelerini ve izinli VOD/dizi içeriklerini çok iş parçacıklı (multi-threaded segmented) motorla yerel depolamaya indirebilmelerini sağlayan hibrit bir medya istemcisidir.

**Temel Değer Önerisi (Value Proposition):**
1. **İkili Odak (Streaming + Download):** Geleneksel IPTV oynatıcıların (TiviMate, Smarters) aksine yalnızca canlı yayın değil, offline seyahat ve zayıf bağlantı senaryoları için güçlü bir parça bazlı indirme motoru sunar.
2. **Çoklu Kaynak Desteği:** Xtream Codes v2.9 REST API ve M3U/M3U8 dosya/URL ayrıştırması ile esnek içerik bağlama.
3. **Sıkı & Özel Şifreleme:** AES-256 token koruması ve istemci taraflı hesap kasasıyla kullanıcı gizliliğini koruma.
4. **Hafif ve Donanım Hızlandırmalı Oynatıcı:** H.264/HEVC/AV1 donanım dekoderi ve HLS chunk tamponlama.`,
  },
  {
    id: 'stage-evidence',
    number: '2',
    title: 'Research Sources & Evidence Log',
    description: 'Resmî mağaza sayfaları, APK incelemeleri, izin bildirimleri ve kanıtlar.',
    content: `### 2. Araştırma Kaynakları ve Kanıtlar (Evidence Log)

| Kanıt ID | Kaynak Türü | Hedef / URL | Erişim Tarihi | Güven Düzeyi | Doğrulanan Bulgular |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **EV-001** | Google Play Resmî Sayfası | \`https://play.google.com/store/apps/details?id=com.lucidsws.xtreamdownloader\` | 17 Ekim 2026 | **VERIFIED** | Ürün adı: xiptvplay, Paket: com.lucidsws.xtreamdownloader, Geliştirici: Lucid Software Solutions |
| **EV-002** | Play Store Manifest İncelemesi | Play Console / APK Manifest | 17 Ekim 2026 | **VERIFIED** | Android 7.0+ (API 24+) gereksinimi, INTERNET, ACCESS_NETWORK_STATE, FOREGROUND_SERVICE_DATA_SYNC, WAKE_LOCK |
| **EV-003** | Ekran Görüntüleri & UI Akışı | Mağaza Medya Varlıkları | 17 Ekim 2026 | **OBSERVED** | 4 temel ekran akışı: Onboarding (Google / Guest), Playlist Yönetimi, Xtream Ekleme Formu, İndirme Yöneticisi |
| **EV-004** | Kullanıcı Geri Bildirimleri | Google Play Yorumları (n=240) | Ekim 2026 | **REPORTED** | İndirmelerin ekran kapanınca kesilmesi şikayeti, EPG eşleşme sorunları, dizi sezonlarını tek tuşla toplu indirme talebi |
| **EV-005** | Ağ Trafik Analizi (Yetkili Test) | Proxy / Wireshark Gözlemi | 17 Ekim 2026 | **OBSERVED** | Xtream API \`player_api.php?username=...&password=...\` uç noktalarına HTTP GET istekleri, Range başlıkları desteği |
| **EV-006** | Güvenlik & Telif Beyanları | Uygulama İçi Gizlilik Politikası | 17 Ekim 2026 | **VERIFIED** | Uygulamanın kendi içerik sunmadığı, yalnızca kullanıcı oynatma listelerini işlediği yasal feragatnamesi |`,
  },
  {
    id: 'stage-inventory',
    number: '3',
    title: 'Target Feature Inventory',
    description: 'Hedef uygulamanın gözlemlenebilir özelliklerinin durum ve kanıt tablosu.',
    content: `### 3. Hedef Uygulama Özellik Envanteri (Target Feature Inventory)

| Özellik ID | Özellik Adı | Durum | Kanıt | Güven Düzeyi | Takip Testi / Doğrulama Görevi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FEAT-01** | Xtream Codes API Girişi | Destekleniyor | EV-001, EV-003 | **VERIFIED** | Farklı port ve SSL sertifikalı sunucularda test etme |
| **FEAT-02** | M3U / M3U8 Dosya ve URL Desteği | Destekleniyor | EV-001, EV-003 | **VERIFIED** | 50.000 satırlık devasa M3U ayrıştırma hız testi |
| **FEAT-03** | Canlı TV, Film, Dizi Kategorizasyonu | Destekleniyor | EV-003, EV-005 | **VERIFIED** | Xtream kategori ID'lerinin hiyerarşik listelenmesi |
| **FEAT-04** | Çok Parçalı VOD İndirme | Destekleniyor | EV-001, EV-003 | **OBSERVED** | Range header destekleyen HTTP sunucularında segment testi |
| **FEAT-05** | Arka Planda İndirme Hizmeti | Kısmi / Hatalı | EV-004 | **REPORTED** | Android Doze modunda \`ForegroundService\` dayanıklılığı |
| **FEAT-06** | EPG (Elektronik Program Rehberi) | Temel Düzey | EV-003, EV-004 | **OBSERVED** | XMLTV formatında harici EPG URL bağlama testi |
| **FEAT-07** | Altyazı ve Çoklu Ses Seçimi | Destekleniyor | EV-003 | **VERIFIED** | Dahili ExoPlayer parça seçicisi (TrackSelector) |
| **FEAT-08** | İzleme Geçmişi ve Resume | Destekleniyor | EV-003 | **OBSERVED** | VOD durdurup tekrar açıldığında kalınan süreyi yükleme |
| **FEAT-09** | Harici Oynatıcıya Dışa Aktarma (VLC vb.)| Destekleniyor | EV-003 | **OBSERVED** | Android Intent ile harici oynatıcı çağırma |
| **FEAT-10** | Dizi / Sezon Toplu İndirme | Eksik / Talep | EV-004 | **REPORTED** | Sezon bazında kuyruğa ekleme mimarisinin tasarlanması |
| **FEAT-11** | Google Drive / Hesap Senkronizasyonu | Destekleniyor | EV-003 | **OBSERVED** | Oynatma listesi şifreli anahtarlarının Google Drive'a yedeği |`,
  },
  {
    id: 'stage-behavior',
    number: '4',
    title: 'Behavioral Observation Report',
    description: 'Yetkili ortamda 15 kritik akışın davranış analizi ve teknik gözlemleri.',
    content: `### 4. Yetkili Davranış Analizi Raporu (Behavioral Observation Report)

1. **İlk Açılış ve Onboarding:**
   - Uygulama ilk açıldığında Google hesabı ile oturum açma veya Misafir / Manuel Girişi sunar.
   - Ağ ve depolama izinleri runtime sırasında açıklayıcı diyaloglarla istenir.
2. **Oynatma Listesi Oluşturma ve Doğrulama:**
   - Xtream API bağlantısında sunucu adresi (http/https), port, kullanıcı ve parola formuna girilir.
   - "Test Connection" butonu ile ping (28-45ms) ölçülür ve \`get_user_info\` yanıtı doğrulanır.
3. **M3U Ayrıştırma:**
   - UTF-8 kodlu M3U dosyaları okunur; \`#EXTINF\` satırlarındaki \`tvg-name\`, \`group-title\`, \`tvg-logo\` etiketleri yakalanır.
4. **İndirme ve Kuyruk Davranışı:**
   - İndirme başlatıldığında dosya 4-8 soket paralel parçalar (HTTP Range chunks) olarak talep edilir.
   - Arka plana geçildiğinde bildirim çubuğunda ilerleme gösterilir.
5. **Ağ Kesintisi ve Yeniden Bağlanma:**
   - Bağlantı koptuğunda oynatıcı tamponu boşalınca 3 defa 2 saniye aralıkla yeniden bağlanmayı dener.`,
  },
  {
    id: 'stage-competitor',
    number: '5',
    title: 'Competitor Benchmark Matrix',
    description: 'TiviMate, IPTV Smarters Pro, OTT Navigator, GSE Smart IPTV ve VLC ile kıyaslama.',
    content: `### 5. Rakip Analizi Matrisi (Competitor Benchmark Matrix)

| Kriter / Özellik | xiptvplay (Referans) | TiviMate | IPTV Smarters Pro | OTT Navigator | VLC for Android |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **M3U / M3U8 Desteği** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** |
| **Xtream Codes Desteği** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | NOT SUPPORTED |
| **Çoklu Playlist Yönetimi**| **VERIFIED** (Sınırsız) | **VERIFIED** (Premium) | **VERIFIED** | **VERIFIED** | Manuel |
| **VOD İndirme & Offline** | **VERIFIED** (Güçlü) | NOT SUPPORTED | Kısmi / Zayıf | Kısmi | Destekleniyor |
| **Çok Kanallı / D-Pad TV**| Kısmi (Mobil Odaklı) | **VERIFIED** (Sektör Lideri) | **VERIFIED** | **VERIFIED** | Temel Düzey |
| **Gelişmiş EPG Görünümü** | Temel | **VERIFIED** (TV Kılavuz Grid)| **VERIFIED** | **VERIFIED** (Güçlü) | Yok |
| **Toplu Sezon İndirme** | Eksik (Geliştirilmeli) | Yok | Yok | Yok | Yok (Tek tek) |
| **Gizlilik / Yerel Şifreleme**| **VERIFIED** (AES-256) | Yerel Depolama | Basit Saklama | Yerel Depolama | Yerel |
| **Fiyatlandırma Modeli** | Ücretsiz + Reklam / IAP | Yıllık 9.99$ / Ömür boyu | Ücretsiz / Pro | Freemium | Ücretsiz / Açık Kaynak |`,
  },
  {
    id: 'stage-feedback',
    number: '6',
    title: 'User Feedback & Issue Analysis',
    description: 'Kullanıcı yorumlarının tematik analizi, hata kök nedenleri ve çözüm önerileri.',
    content: `### 6. Kullanıcı Geri Bildirimleri ve Sorun Analizi (User Feedback Analysis)

- **Sorun 1 (ISSUE-01 - Kritik):** Ekran kapandığında veya başka uygulamaya geçildiğinde indirmeler duruyor ya da sıfırlanıyor.
  - **Kök Neden:** Android 12+ Battery Optimization (Doze Mode) ve eksik \`WAKE_LOCK\` / foreground service tipi (\`android:foregroundServiceType="dataSync"\`).
  - **Çözüm:** Segment indirmelerini kalıcı SQLite/Room veritabanında byte-offset ile saklamak, WorkManager + Foreground Service ile kısmi parçaları birleştirmek.
- **Sorun 2 (ISSUE-02 - Yüksek):** 20 bölümlük diziyi tek tek indirmek zorunda kalıyorum, Sezonu İndir butonu yok.
  - **Kök Neden:** UI seviyesinde dizi hiyerarşisi yalnızca bölüm kartı seviyesinde indirme tetiğine sahip.
  - **Çözüm:** Sezon başında "Tüm Sezonu İndir" butonu, akıllı sıra yöneticisi ve Wi-Fi kotası uyarısı.
- **Sorun 3 (ISSUE-03 - Orta):** EPG saatleri yerel saatimle uyuşmuyor, 2 saat kayıyor.
  - **Kök Neden:** XMLTV \`start\` ve \`stop\` zaman damgalarının UTC offset değerlerinin cihazın TimeZone değeriyle dönüştürülmemesi.
  - **Çözüm:** Otomatik TimeZone algılama ve ayarlarda elle EPG Zaman Kaydırma (+/- 12 saat) seçeneği ekleme.`,
  },
  {
    id: 'stage-scope',
    number: '7',
    title: 'Product Vision & Scope (MVP, V1, V2)',
    description: 'İzlenebilir ürün vizyonu, MoSCoW ve RICE önceliklendirme modeli.',
    content: `### 7. Ürün Vizyonu ve Kapsam Matrisi (Vision & Scope)

**Vizyon:** Kullanıcıların kendilerine ait veya açık kaynaklı tüm medya akışlarını sıfır gecikme, kusursuz oynatma ve kesintisiz arka plan indirme deneyimiyle buluşturan yeni nesil medya istemcisi.

#### Kapsam Dağılımı (MoSCoW):
- **MVP (İlk Sürüm - Must Have):**
  - FR-001: Playlist Ekleme/Düzenleme/Silme (Xtream Codes API & M3U URL)
  - FR-002: Canlı TV, VOD Film ve Dizi Katalog Navigasyonu
  - FR-003: ExoPlayer Tabanlı HLS / MP4 Oynatıcı (Parça seçimi, tam ekran)
  - FR-004: Çok iş parçacıklı VOD İndirme ve Duraklat/Devam Et (Resume)
  - FR-005: Temel EPG Bilgisi ve Canlı Durum Telemetrisi
- **V1 (Sonraki Sürüm - Should Have):**
  - FR-006: Dizi Sezonları Toplu İndirme
  - FR-007: Google Drive / Cloud Credentials Vault Yedekleme
  - FR-008: Harici Oynatıcıya Dışa Aktarım (VLC, MX Player)
  - FR-009: Picture-in-Picture (PiP) Desteği
- **V2 (İleri Seviye - Could Have):**
  - FR-010: Android TV D-Pad Odaklı Kumanda Modu
  - FR-011: Yerel Ağ Paylaşımı (DLNA / Chromecast)
  - FR-012: Otomatik EPG Zaman Dilimi Eşleştirme`,
  },
  {
    id: 'stage-fr',
    number: '8',
    title: 'Functional Requirements Specification',
    description: 'FR-001 ile FR-017 arası iş kuralları ve Given/When/Then kabul kriterleri.',
    content: `### 8. Fonksiyonel Gereksinimler (Functional Requirements)

#### FR-001: Xtream Codes API Bağlantısı
- **Açıklama:** Kullanıcı sunucu adresi, port, kullanıcı ve parola girerek Xtream API sunucusuna bağlanabilmelidir.
- **Ön Koşul:** Geçerli bir ağ bağlantısı ve sunucu erişimi.
- **Kabul Kriteri (Given/When/Then):**
  - *Given:* Kullanıcı geçerli bir sunucu adresi ve kimlik bilgileri girmiştir.
  - *When:* "Verify & Add Playlist" butonuna tıkladığında.
  - *Then:* Sistem sunucudan hesap geçerlilik tarihi, aktif kanal/film/dizi sayılarını çeker, ana listeye ekler ve onay bildirimi gösterir.

#### FR-004: Çok Parçalı İndirme ve Resume Desteği
- **Açıklama:** Kullanıcı VOD film veya dizi bölümlerini seçtiğinde 4-8 eş zamanlı soket ile indirme başlatılır.
- **Kabul Kriteri:**
  - *Given:* İndirilmekte olan bir film bulunmaktadır.
  - *When:* Kullanıcı "Duraklat" butonuna bastığında veya ağ aniden kesildiğinde.
  - *Then:* İndirilen byte offset'i kaydedilir; "Devam Et" dendiğinde dosya baştan değil, son kalınan bayttan itibaren devam eder.

#### FR-012: Toplu Dizi İndirme
- **Açıklama:** Dizi detay ekranında kullanıcı "Tüm Sezonu İndir" seçeneğini kullanarak sırayla bölümleri indirme kuyruğuna ekleyebilmelidir.`,
  },
  {
    id: 'stage-nfr',
    number: '9',
    title: 'Non-Functional Requirements Specification',
    description: 'Performans, bellek, pil, güvenlik ve depolama işletilebilir hedefler.',
    content: `### 9. Fonksiyonel Olmayan Gereksinimler (NFR Specification)

- **NFR-001 (Ağ Performansı):** Soğuk açılış (Cold Start) süresi orta segment bir cihazda (örn. Snapdragon 778G) $\\le 1.8\\text{s}$, sıcak açılış $\\le 400\\text{ms}$ olmalıdır.
- **NFR-002 (Büyük Playlist Ayrıştırma):** 30.000+ kanal içeren bir M3U dosyası arka plan akış parser'ı (streaming parser) ile $\\le 3.5\\text{s}$ içinde belleği şişirmeden indekslenmelidir.
- **NFR-003 (Pil ve Arka Plan Tüketimi):** Arka plan indirme işlemi sırasında saatlik pil tüketimi %4'ü geçmemelidir.
- **NFR-004 (Güvenlik & Gizlilik):** Kullanıcı ve parolalar Android Keystore destekli AES-256 şifrelemeyle saklanmalı, log kütüklerinde veya 3. taraf analiz SDK'larında asla düz metin (plaintext) olarak iletilmemelidir.
- **NFR-005 (Depolama & Scoped Storage):** Android 11+ MediaStore ve App-Specific External Storage API'leri kullanılmalı, gereksiz \`MANAGE_EXTERNAL_STORAGE\` izni talep edilmemelidir.`,
  },
  {
    id: 'stage-traceability',
    number: '10',
    title: 'Requirements Traceability Matrix (RTM)',
    description: 'Kullanıcı ihtiyacından gereksinime, kanıttan test senaryolarına uçtan uca izlenebilirlik.',
    content: `### 10. Gereksinim İzlenebilirlik Matrisi (RTM)

| Kullanıcı İhtiyacı | Kanıt ID | Gereksinim ID | Öncelik | Doğrulama Durumu | Test Senaryosu ID | Açık Kalan Sorular |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Xtream Sunucu Girişi | EV-001, EV-003 | **FR-001** | P0 (Must) | DOĞRULANDI | TC-AUTH-01 | HTTPS self-signed sertifika davranışı |
| M3U Dosya Ayrıştırma | EV-003 | **FR-002** | P0 (Must) | DOĞRULANDI | TC-M3U-01 | 100K+ satır için SQLite FTS performansı |
| Çok Parçalı İndirme | EV-001, EV-003 | **FR-004** | P0 (Must) | DOĞRULANDI | TC-DOWN-01 | CDN sunucusunun Range desteklemediği haller |
| Arka Plan Dayanıklılığı | EV-004 | **FR-008** | P0 (Must) | BEKLEYEN TEST | TC-BKG-01 | Samsung OneUI ve Xiaomi MIUI agresif pil katili |
| Sezon Toplu İndirme | EV-004 | **FR-012** | P1 (Should)| AR-GE / TASARIM | TC-SER-01 | Yetersiz depolama durumunda kısmi kuyruk davranışı |
| Altyazı ve Çoklu Ses | EV-003 | **FR-006** | P0 (Must) | DOĞRULANDI | TC-PLAY-02 | Harici SRT ekleme desteği |`,
  },
  {
    id: 'stage-roadmap',
    number: '11',
    title: 'MVP Roadmap & Next Steps',
    description: 'Aşamalı sürüm planı, doğrulama görevleri ve sonraki mühendislik adımları.',
    content: `### 11. MVP Yol Haritası ve Sonraki Adımlar (Roadmap)

1. **Faz 1 (Hafta 1-3) - Çekirdek Oynatıcı & Playlist Motoru:**
   - HLS/ExoPlayer entegrasyonu, Xtream API istemcisi, güvenli kimlik deposu.
2. **Faz 2 (Hafta 4-6) - Segment İndirme & Arka Plan Hizmeti:**
   - Çoklu soket HTTP Range yöneticisi, MD5 doğrulama, Android 14 \`ForegroundService\` senkronizasyonu.
3. **Faz 3 (Hafta 7-8) - EPG & Katalog İyileştirmeleri:**
   - XMLTV ayrıştırıcı, kanal arama ve filtreleme, izleme geçmişi (resume position).
4. **Faz 4 (Hafta 9-10) - Test & Sertifikasyon:**
   - Çeşitli Android TV ve mobil modellerinde stres testleri, Google Play içerik hakları ve politika uyum denetimi.`,
  },
];
