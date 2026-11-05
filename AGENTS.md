# XIPTV Play — Android geliştirme talimatı

## Tek resmî Android geliştirme dalı
- **Branch:** `tek-dal-birlestirme-xiptvplay-android` (görünür adı: **tek dal birleştirme**).
- **Repo:** `Txgoood/xiptvplay`.
- **Referans sürüm:** `v1.4.17`, Android `versionCode=25`.
- **Geçmiş kaynak dallar:** `fix-series-on-build248-20261101` (dizi/katalog temeli) ve `fix-download-cancel-season-queue` (indirme/depolama/oynatıcı çalışmaları). Bunlar geçmiş referans olarak saklanır; yeni özellik geliştirme veya APK derlemesi bu dallarda yapılmaz.
- **LG webOS:** ayrı repo, `Txgoood/xiptvplaywebosnew`; Android dalındaki kaynaklarla karıştırma.
- Yeni sohbette önce bu dosyayı, `PROJECT_STATUS.md` dosyasını ve güncel branch durumunu oku. Ardından istenen değişikliğe başla.

## Değişiklik öncesi ve sonrası
1. GitHub üzerinden ilgili kaynakları incele, çalışan davranışı koru; gerekirse eski iki dala bak.
2. Tek dalda değişiklik yap. Özellikle iki parmakla yakınlaştırma, download Range retry, native depolama istatistikleri, M3U sezon/bölüm toparlama, Xtream global dizi taraması, bölüm süreleri ve profillerin çalışmasını koru.
3. `npm run lint`, `node --import tsx --test tests/*.test.ts`, web build, Android Gradle ve GitHub Actions kontrollerinin sonuçlarını gerçek durumuyla bildir; doğrulanmamışı başarılı olarak sunma.
4. Her APK sürümünde monoton artan Android `versionCode` ve `versionName` kullan; uygulamanın `applicationId` değeri `com.xiptvplay.app` kalmalı.
5. Yalnızca onaylanmış mevcut sabit imza sertifikası ile APK yayınla. **Anahtarı koda koyma; `ANDROID_DEBUG_KEYSTORE_BASE64` secret'ı korunmalı.** İmza farklıysa APK'yı güncelleme olarak sunma.
6. Son yapılan gerçek değişiklikleri, commit ve doğrulanmış APK bağlantısını `PROJECT_STATUS.md` içinde güncelle. Başarılı derleme doğrulanamıyorsa bunu açıkça yaz.

## GitHub Actions
`.github/workflows/main.yml` yalnızca tek birleşik dalın push olaylarında APK üretmek üzere yapılandırılmıştır. Dosyalar ile var olan çalışan özelliklerin kaynak karşılaştırması `PROJECT_STATUS.md` altındadır. Eski dalları silmeyin.
