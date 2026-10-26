# XIPTV Play – çoklu profil ve kişisel Google Drive yol haritası

## Tamamlanan kaynak kodu

- Eski `parent` ve `child` kimlikleri korunarak yeni yetişkin/çocuk profilleri.
- Çocuk yaş sınırı, manuel ve TMDB kontrollü kategori izinleri her çocuk profilinde ayrı.
- Profil kimliğine göre favori ve izleme geçmişi.
- Yetişkin profillerinde isteğe bağlı PIN; PIN belirlenmezse ebeveyn/yönetici PIN'i istenir.
- Android Google Identity Services yetkilendirmesi: Drive `drive.appdata` ve hesap kimliği kapsamı.
- Her OAuth oturumunun `sub` hesabını ayırt eden kimlik doğrulaması; başka hesaba bağlı yerel verilerin yanlış Drive'a yüklenmesi engellenir.
- AES-256-GCM / PBKDF2 ile şifreli anlık görüntü, Drive `appDataFolder` içinde.
- Elle yedekleme, kontrol ve onaylı geri yükleme.
- İndirilen medya dosyaları / native indirme kuyrukları asla Drive'a yüklenmez.

## Gerçek Google hesaplarıyla test edebilmek için gerekli kurulum

1. Google Cloud Console'da XIPTV Play'e ait ayrı bir proje oluştur.
2. Google Drive API'yi etkinleştir.
3. OAuth consent screen / Google Auth Platform branding yapılandır: uygulama adı, destek e-postası ve gizlilik politikası.
4. Android OAuth istemcisi oluştur: package ID `com.xiptvplay.app` ve **APK'nın imzalandığı anahtarın SHA-1 sertifika izi**. GitHub Actions debug APK ile Play App Signing release APK farklı imza kullanabilir; her imza için doğru OAuth istemcisini kaydet.
5. Test aşamasında Google izin ekranı test kullanıcıları belirlemeyi gerektirebilir.
6. Yetki yalnızca `drive.appdata` + oturum kimliğidir; tam Drive dosyalarına erişim verilmemelidir.
7. Google hesabı değişimi, yedekleme, geri yükleme, yanlış parola, internet kesintisi ve temiz kurulum senaryolarını gerçek Android cihazda test et.
8. Asla OAuth gizli anahtarını, kullanıcının Google parolasını veya erişim jetonlarını GitHub deposuna yazma.

## Sıradaki güvenli otomatik senkronizasyon aşaması (henüz devrede değil)

- Her Google hesabı için Drive klasörü ve kayıt kimliği ayrı.
- Birden fazla cihaz aynı anda kayıt güncellediğinde otomatik üzerine yazmak yerine cihazlar arası değişiklikleri uzlaştır:
  - İzleme geçmişi: profil + içerik + bölüm kimliği bazında, zaman damgası ve ilerleme.
  - Favoriler: ekleme/çıkarma olayları; silmeler için tombstone kayıtları.
  - Profil değişiklikleri: kimlik ve sürüm; PIN/izin çatışmalarında yönetici onayı.
  - Playlist kimliği eşleştirmesi: farklı cihazdaki yerel ID ve URL farklılıklarını dikkatle ele al.
- Eşitleme sırasında `revision` / `version` kontrolü, yeniden deneme, çevrimdışı işlem günlüğü.
- Kullanıcının onayıyla otomatik yedekleme, geri yükleme önizlemesi ve son birkaç şifreli sürüm.
- Android KeyStore destekli, cihazda güvenli anahtar yönetimi; cihaz değişince kurtarma parolası.
- Play Store: veri güvenliği formu, gizlilik politikası, hesap bağlantısını kaldırma ve veri silme akışları.

**Not:** Bu belge bir yapılacaklar listesi; son bölümdeki senkronizasyon henüz uygulanmış değildir.
