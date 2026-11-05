# XIPTV Play Android — Proje durumu / Tek Dal Birleştirme

**Resmî Android dalı:** `tek-dal-birlestirme-xiptvplay-android`  
**Yeni sürüm:** `v1.4.16 (versionCode 24)`  
**Depo:** https://github.com/Txgoood/xiptvplay  
**Derleme:** https://github.com/Txgoood/xiptvplay/actions/workflows/main.yml  
**Kontrol durumu:** Kaynak dosyaları incelendi ve regresyon testleri eklendi; GitHub Actions / fiziksel cihaz sonucu ayrıca doğrulanmalı.

## Kaynak karşılaştırması (4 Kasım 2026)
- Baz: `fix-series-on-build248-20261101`, Android v1.4.11 (19).
- Diğer kaynak: `fix-download-cancel-season-queue`, Android v1.4.9 (17).
- İncelenen Git ağaçlarında 177 dosya/her dal; **165 aynı içerikte, 12 farklı içerikte**; sadece bir dalda bulunan dosya yok.
- Ayrıca geçmişten farklı commit geçmişleri mevcuttu. Bu işlem bir Git merge commit değildir: ana dal tabanında kaynak bazlı kontrollü birleştirmedir.
- Eski kaynak dallar değiştirilmedi.

| İncelenen farklı dosya | Dizi dalındaki fark | İndirme dalındaki fark | Birleşim kararı |
|---|---|---|---|
| `.github/workflows/main.yml` | v1.4.11 (19) ve iki dal için push | v1.4.9 (17) | Sadece tek dal push, birleşim etiketli yeni sürüm |
| `android/app/build.gradle` | v1.4.11, aynı appId ve stableDebug | v1.4.9, aynı appId ve stableDebug | v1.4.13 / code 21, aynı paket ve imza şartı |
| `android/app/src/main/java/com/xiptvplay/app/DownloadFilesPlugin.java` | Dosya konumu açma | + gerçek Android disk StatFs ölçümü | İndirme dalından tamamı |
| `android/app/src/main/java/com/xiptvplay/app/NativeDownloadPlugin.java` | Native indirme akışı | Range istekleri ve tekrar deneyerek devam ettirme | İndirme dalından tamamı |
| `src/App.tsx` | Başlangıç/senkronizasyon | + disk ölçümünün Android köprüsünden okunması | İndirme dalından tamamı; mevcut fonksiyonlar aynı |
| `src/components/screens/DownloadsScreen.tsx` | İndirilen dosya miktarına göre hatalı boş alan | Gerçek cihaz kullanılan/boş alanı, diğer kullanım | İndirme dalından tamamı |
| `src/components/screens/SeriesDetailModal.tsx` | Dizi başlığı, poster ve sezon etiketlerinde güncel yapı | Mod açılırken state sıfırlama ve yüklenirken eski bölümleri gizleme | Dizi dalının tasarımı + state sıfırlama |
| `src/components/screens/SettingsScreen.tsx` | Gradle'dan dinamik sürüm + engine sürümü | Gradle'dan dinamik sürüm, engine satırı yok | Dizi dalı (engine sürümü korunur) |
| `src/data/mockData.ts` | Sabit 128 GB toplam disk | Gerçek ölçüme kadar toplam ve boş 0 | İndirme dalı |
| `src/services/iptvService.ts` | Güvenli dizi kimliği, M3U sezon/bölüm çıkarımı, süre iletimi | Genel Xtream detay + önceki tek bölüm fallback | Dizi dalı; yanlış ID ve katalog kaybını önler |
| `src/services/xtreamClient.ts` | Tüm dizileri kapsayan tarama, bölüm sayıları, daha fazla süre alanı | Sınırlı dizi kategorisi taraması / az süre alanı | Dizi dalı |
| `tests/episode-duration.test.ts` | Genel bölüm süresi fallback testleri dâhil | Temel süre format testleri | Dizi dalı |

**İki dalda zaten birebir aynıydı:** `NativePlayerActivity.java` içinde 1×–3× iki parmakla yakınlaştırma ve oynatıcı; `episodeDuration.ts`; Vite sürüm enjeksiyonu ve diğer ortak dosyalar. Özellikle altyazı, ses, profiller, favoriler, playlist, ebeveyn kontrolü, yedekleme, diğer indirmeler ve UI ortak dosyalarının Git blob SHA'ları eşitti.

## Korunan kritik fonksiyonlar
- **Oynatıcı:** Media3 native oynatıcı, iki parmakla yakınlaştırma, kontroller, ses/altyazı seçenekleri.
- **İndirmeler:** Arka plan servisleri, durdurma/devam, kuyruk, Range ile kesintiden devam etme, bildirimler.
- **Depolama:** Telefonun gerçek iç depolama kapasitesi/boş alanı, indirmelerin uygulama listesinde ayrılması.
- **Dizi:** Xtream global arama, kategori içerikleri, sezon ve bölüm sayıları, M3U'dan doğru dizi kimliğiyle sezon/bölüm oluşturma, alternatif süre alanları.
- **Aile/katalog:** Profil/PIN, çocuk kısıtları, playlist yönetimi, katalog, favoriler ve izleme geçmişi (ortak dosyalar aynen korunmuştur).
- **Sürüm / güncelleme:** Gradle sürümü ayarlarda otomatik görünür; tek APK paketi `com.xiptvplay.app`, sabit sertifika zorunluluğu.

## Doğrulama sınırları ve kalan riskler
- Kaynak dosyalarının karşılaştırılması işlevsel cihaz testinin yerine geçmez.
- Depolama istatistikleri `StatFs` Android user-data partition ölçümüdür; cihaz üreticisinin depolama ekranındaki yuvarlama farklı olabilir.
- `episode_run_time` bölüm bazında kesin süre yerine dizi genel ortalama süresi olabilir.
- Mevcut telefon APK'sı farklı sertifikayla imzalanmışsa yalnızca yeni versionCode kurulum uyuşmazlığını gidermez; eski uygulamayı silmeden imzayı doğrula.
- CI başarılı olmadan yeni APK çalışıyor denilmez.
- Daha önceki iki dalda çalışıp yeni birleşimde başarısız olan bir özellik tespit edilirse önce Git dosyası farkı ve test logu incelenir; eski dallar korunur.

## 4 Kasım 2026 — İndirilenlerde izleme ilerlemesi
- v1.4.13 (21): tamamlanmış film ve dizi indirmelerinde mevcut profilin izleme geçmişinden kalan süre, yüzde çubuğu ve `İzlendi` etiketi gösterilir.
- Kaynaklar: `src/services/downloadWatchProgress.ts`, `src/components/screens/DownloadsScreen.tsx`, `src/App.tsx`, `src/services/watchHistory.ts`.
- `tests/download-watch-progress.test.ts` yeni regresyon testi eklendi.
- Yalnızca tamamlanmış indirmeler için görüntülenir; dosyanın indirme yüzdesi izleme ilerlemesi sanılmaz.
- Android yerel oynatıcısında mevcut son oynatma konumu, oyuncu kapanıp uygulamaya dönüldüğünde izleme geçmişine yazılır. Fiziksel cihaz testi bekleniyor.

## 5 Kasım 2026 — Katalog yenileme ve süreler
- Xtream film/dizi kategori istekleri ikişer yürütülür. Hata halinde tek istekle devam edilir; dizi genel taraması ve önceki katalog koruması sürer.
- Film ve dizi kartlarında süre gösterilir. Bölüm listesi, bölüm süresi eksik olduğunda varsa dizi genel süresini yaklaşık olarak işaretler.
- Sağlayıcı süreleri önceliklidir. TMDB yedeği, katalogda görünen kartlarla sınırlı mevcut iş kuyruğunu kullanır.
- Başarılı önceki APK: [v1.4.13 · GitHub Actions #315](https://github.com/Txgoood/xiptvplay/actions/runs/41779831292).
- Değişiklik commit'i: `f663380`. Tür denetimi, katalog testleri, web derlemesi, Gradle ve APK imza doğrulaması geçti. Fiziksel cihazda yenileme süresi henüz ölçülmedi.
- [v1.4.14 (22) · GitHub Actions #316](https://github.com/Txgoood/xiptvplay/actions/runs/42073808321) · [app-debug APK paketi](https://github.com/Txgoood/xiptvplay/actions/runs/42073808321/artifacts/13435834795).

## 5 Kasım 2026 — Sağlayıcı detayından süre okuma
- Android, toplu katalogda süre yoksa görünür film ve dizi kartları için Xtream detay uçlarını sırayla sorgular. Video akışı açılmaz.
- Film ve bölüm için sağlayıcının saniye ve iç medya üstverisi alanları okunur. Dizide genel süre eksikse mevcut bölüm sürelerinin medyanı yaklaşık süre olarak kullanılır.
- v1.4.15 (23), commit `e60f970`. Tür denetimi, süre testleri, web derlemesi, Gradle ve APK imza doğrulaması geçti. Euroturk ile fiziksel cihaz testi henüz yapılmadı. [Derleme #317](https://github.com/Txgoood/xiptvplay/actions/runs/42076360446) · [APK paketi](https://github.com/Txgoood/xiptvplay/actions/runs/42076360446/artifacts/13437404833).

## 5 Kasım 2026 — Android oynatıcı hareketleri
- Zaman çubuğunun sağında +10 sn düğmesi. Görüntünün sağ ve sol yarısına çift dokunma sırasıyla +10 ve −10 saniye sarar.
- Sağda dikey hareket medya sesini, solda dikey hareket oynatıcı penceresinin parlaklığını ayarlar. İki parmakla yakınlaştırma ve kontrol katmanı ayrı kalır.
- v1.4.16 (24) APK doğrulaması bekleniyor.
