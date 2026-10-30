# Android katalog güncellemesi — 1.1.0

Android geliştirme dalı: `fix-download-cancel-season-queue`.

## Kullanım

- Film veya Dizi sekmesini aç. Alt kategori filtresinin **yanındaki** çift ok düğmesi içerikleri sıralar.
- Yeni/eski eklenenler, yeni/eski yapım yılı, yüksek/düşük puan, A–Z ve Z–A seçenekleri bulunur.
- Görünüm düğmesi: büyük (2 sütun), orta (dar ekranda 2, geniş ekranda 3), küçük (4), liste ve ayrıntılı liste.
- Tercihler cihazda profil kimliğine göre saklanır; uygulama yeniden açıldığında ve alt kategori değiştiğinde korunur.
- Eski önbellekte tarih alanları yoktur. Kurulumdan sonra playlist kataloğunu bir kez yenile.

## Keşif ve veri doğruluğu

Keşif rafları Tümü / Film / Dizi içinde, tür sekmeleri ile kategori şeridi arasındadır. Arama veya alt kategori seçimi sırasında gizlenerek sonuçlara alan bırakır.

- **Bu hafta çıkanlar:** sağlayıcı tam ilk yayın / vizyon tarihi veriyorsa, cihazın yerel takviminde pazartesiden bugüne çıkanlar. Tek başına yapım yılı yeterli değildir.
- **Bu hafta eklenenler:** sağlayıcının `added` alanına göre son 7 gün; ilk yayın tarihiyle karıştırılmaz. Dizinin `last_modified` alanı eklenme tarihi olarak kullanılmaz.
- **Senin için seçtiklerimiz:** aktif profilin izleme geçmişi ve favori kategorilerine dayalı yerel sıralama. İzlenmiş ve zaten favori içerikler öneriden çıkarılır. Geçmiş yoksa sağlayıcı puanına göre keşif sunulur.
- Raflar sadece mevcut filtrelerden ve çocuk izinlerinden geçmiş katalogdan üretilir. Katalog dışında oynatılamayan içerik eklenmez.
- Puanlar sağlayıcı puanıdır; IMDb kaynağı iddia edilmez. 5 üzerinden verilen puan 10 ölçeğine çevrilir; eksik / sıfır puan sonda tutulur.
- Tarih yoksa sahte tarih üretilmez; sağlayıcının sırası korunur ve eksiklik gösterilir.

## Simge

`public/brand/xiptvplay-icon.svg` düzenlenebilir ana çizimdir. Turkuaz / mavi X ve oynat işareti uygulama içindeki marka ile ilişkilidir. PNG, eski Android launcher yoğunlukları ve Android 8+ adaptive icon kaynakları da güncellendi. Uygulama kimliği ve imza değiştirilmedi.

## İndirme

İndirme aktarım motoruna değişiklik yapılmadı. Sunucu / cihaz üzerinde karşılaştırmalı hız ve kesinti testi yapılamadığı için doğrulanmamış paralel indirme veya bağlantı değişikliği eklenmedi. Katalog resimleri tembel yüklenir; tüm arşivi tek seferde DOM'a döken düğme kaldırıldı.

## Doğrulama

- `npm run lint`
- `node --import tsx --test tests/catalog-discovery.test.ts`
- `npm run build`
- Tarayıcıda 1440 ve 390 piksel: sıralama, alt kategori, yeniden yükleme, beş görünüm, taşma ve konsol hatası kontrolü.
- Android XML ve PNG kaynak kontrolü.
- GitHub Actions: sabit sertifikayla APK derlemesi ve mevcut Android emülatör açılış testi.

Gerçek telefonda son kontrol: mevcut APK üzerine güncelle, kataloğu yenile, sıralama seç, uygulamayı kapatıp aç; Film/Dizi ve alt kategorilerde seçimin korunduğunu doğrula. Dört sütun / liste görünümünü ve yeni launcher simgesini kontrol et. Önerilerde tarih ve puan bulunması IPTV sağlayıcısının verilerine bağlıdır.
