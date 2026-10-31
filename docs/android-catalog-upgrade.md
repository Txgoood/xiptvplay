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

## 1.1.1 — TMDB ve üst menü düzeltmesi

- Uygulama / PM Analiz düğmeleri üst menüden kaldırıldı.
- Canlı hata kaydında başarısız çağrının İngilizce bilgi isteği olduğu görüldü (`server.ts:844`, TMDB HTTP 400). Dil parametresi iki kez ekleniyordu; yeni sunucu istemcisi URLSearchParams ile tek dil gönderir. İsteğe bağlı ek bilginin hatası başarılı ana film bilgisini bozmaz.
- TR/kalite etiketleri ve sezon-bölüm son ekleri temizlenir; Türkçe ve orijinal adlar ayrı, paralel aranır. Yanlış sağlayıcı yılı birebir ad eşleşmesini engellemez.
- Sağlayıcı TMDB / IMDb kimliği bildirirse ada dayalı aramadan önce kullanılır. Belirsiz sonuçta kullanıcı seçim yapar; ilk rastgele sonuç seçilmez.
- Bilgi ekranında adla arama, eşleşmeyi düzeltme ve yeniden deneme eklendi. Seçilen TMDB kaydı oynatma adresini değiştirmez.
- Başarılı bilgiler cihazda 7 gün (en çok 120 kayıt), sunucuda 24 saat (en çok 1500 kayıt) saklanır. Aynı anda gelen aynı istekler birleştirilir. Geçici bağlantı/anahtar hataları bulunamadı diye önbelleğe alınmaz.
- Kontroller: 16 birim testi; tarayıcıda belirsiz eşleşme seçimi, elle düzeltme, kapat/aç ve sayfa yenilemesinden sonra önbellek; mevcut katalog kontrolleri. Gerçek sağlayıcı eşleşmesi ayrıca canlı API üzerinde kontrol edilir.

## 1.2.0 — Film serileri ve afiş rozeti

- TMDB koleksiyonuna ait filmlerin katalog, keşif, izleme devamı ve favori afişlerinde küçük turkuaz katman / SERİ rozeti bulunur. Sırf adında 2/3 geçtiği için rozet verilmez.
- İlk karşılaşmada yalnızca görünür afişler arka planda en fazla iki eşzamanlı bilgi isteğiyle doğrulanır. Sonuçlar cihazda saklanır; doğrulama tamamlanana kadar rozet gösterilmez. Bağlantı hatası film seri değilmiş gibi kaydedilmez.
- Film bilgi ekranında **Bu Serinin Filmleri** bölümü, çıkış sırasına göre afişler ve **Sıradaki film** kısayolu eklendi.
- Devam filmleri yalnızca yerel katalogdaki gerçek yayın kayıtlarıyla eşleştirilerek oynatılır. TMDB kimliği / elle düzeltilmiş eşleşme önceliklidir; Türkçe ve orijinal ad + yıl eşleşmesi ikinci yoldur. Katalogda yoksa oynatma düğmesi verilmez.
- Çocuk profilinde yalnızca izinli katalog kayıtları eşleşir. İzin verilmeyen devam filmlerinin afişi, adı ve oynatma kısayolu gösterilmez.
- Koleksiyon isteği ana film bilgisi açıldıktan sonra bağımsız yüklenir. Önceki TMDB v2 önbelleği yeni koleksiyon alanını almak için temizlenir; eşleşme düzeltmeleri korunur.
- Kontroller: 23 birim testi; telefon / geniş ekran; filme girmeden rozet, hatalı sayısal rozetin engellenmesi, devam filmi bilgisine geçiş, eksik film, yeniden açılışta ağ isteği olmadan rozet, çocuk izinleri, iki istek eşzamanlılık sınırı. Canlı TMDB kontrolü Demir Adam film / koleksiyonu üzerinden yapılır.

## 1.3.0 — Keşif, takip, akıcılık ve gerçek TV bağlantısı

- Katalogda `Karar veremiyorum`: film/dizi, kategori/tür, süre, minimum puan ve izlenenleri eleme; katalogdaki üç seçenek, başka üç öner. Eksik süre/puan filtreyi geçmez.
- Film/dizi bilgileri altında `Benzerlerini keşfet`: ortak mevcut tür/tema veya aynı sağlayıcı kategorisi gerekçesi; yalnızca verilen izinli katalogdan seçim.
- Profil başına en fazla 50 dizi takibi. İlk doğrulanmış bölüm listesi başlangıçtır. Sonraki katalog/açılış kontrollerinde (15 dakika bekleme, en fazla iki eşzamanlı sağlayıcı isteği) yeni sezon/bölüm farkı gösterilir. Elle `Kontrol et` beklemeyi atlar. Fallback M3U bölüm listesi doğrulanmış kabul edilmez. Uyarılar uygulama içindedir; kapalı uygulamada zamanlanmış bildirim değildir.
- İzleme geçmişi, favoriler, manuel TMDB seçimleri ve yayın adresleri korunur. Çocuk önerileri/takip rafı yalnızca izinli içeriklerle çalışır. Çocuk profiline geçerken yetişkinin TV oturumu kapatılır.
- Katalog görünür satırlara göre sanallaştırılır; kaydırma ve filtreler profil/playlist oturumunda korunur. Arama metni önceden normalleştirilir ve ertelenerek işlenir. Favori işaretleri Set ile bir kez hazırlanır; indirme ilerlemesi her seferinde dev kataloğu yeniden oluşturmaz.
- TMDB disk önbelleği bir kez belleğe alınır; yazılar toplulaştırılır. Afiş taraması iki eşzamanlı istek ve en fazla 32 bekleyen iş ile sınırlanır. Sıralamada tarih/puan ayıklaması kayıt başına yapılır.
- Oynatıcı ihtiyaç anında yüklenir. Ana JS üretim paketi yaklaşık 1185 kB → 576 kB (minify edilmiş ham boyut); telefon açılış süresi/FPS iddiası değildir.
- Boş haftalık kutu kaldırıldı, canlı logoları kırpılmadan gösterilir, Favoriler'e görünüm seçimi eklendi, Geçmiş başlığı düzeltildi.
- Örnek TV listesi kaldırıldı. NativeCast: gerçek SSDP MediaRenderer keşfi, yerel AVTransport doğrulaması, SetAVTransportURI/Play/Pause/Stop, durum okuma; Google Cast SDK'nın gerçek cihaz seçicisi ve Default Media Receiver. DLNA XML dış varlıkları kapalı, cihaz denetim adresleri yalnızca LAN, yanıt boyutları ve zaman aşımları sınırlı. Yayın URL'leri loglanmaz.
- TV bağlantısı doğrulanınca katalogdan film/canlı yayın veya dizi bölümü TV'ye yüklenir. Yerel oynatıcı önce durdurulur. İndirilen yerel dosyaları HTTP sunucusu olmadan TV'ye göndermek desteklenmez; açık hata gösterilir. Aynı ağ / TV codec ve sağlayıcı bağlantı sınırları geçerlidir. Bu ortamda fiziksel TV / Chromecast uçtan uca testi yapılamaz.

Doğrulama: TypeScript, 32 Node birim/regresyon testi, üretim derlemesi; Playwright ile 430px/1440px, 65001 kayıt, başlangıçta 16 / geniş ekranda 12 çizilen katalog kartı, 500000px kaydırıp geri dönüş, son kayda arama, üçlü önerileri değiştirme, süre/puan filtreleri, benzer içerik, dizi takibi/yeni bölüm/yeni sezon/hedef bölüm navigasyonu ve örnek cihazların kaldırılması kontrol edildi. Android CI ayrıca dört saf Java DLNA testini ve APK kurulum/açılış emülatör kontrolünü çalıştırır. Fiziksel yayın hızı veya gerçek TV oynatımı test edilmiş sayılmaz.

## 1.3.1 — Dizi sıralaması düzeltmesi

Sağlayıcı yalnızca `last_modified` verip `added` vermediğinde Yeni/Eski eklenenler aynı sırayı koruyordu. Dizi sekmesinde ve alt kategorilerde bu durumda doğrulanmış son güncellenme tarihine geçilir; seçenek ve etkin sıra açıklaması bunu açıkça belirtir. Güncellenme tarihi içerikte eklenme tarihi olarak kaydedilmez. Gerçek eklenme tarihi varsa önceki davranış korunur. Yıl/puan/ad sıralaması ve profil tercihi korunur. Sıra değişince sanallaştırılmış kataloğun başlangıcına dönülür; öneri raflarından ayrı bir Katalog sıra başlığı gösterilir.

Ek regresyonlar: eksik eklenme tarihi + farklı güncellenme tarihleri, iki yön ve eksik değerlerin sonda kalması; gerçek eklenme tarihinin korunması ve dizi güncelleme sırasının filme taşınmaması. 34 Node testi / TypeScript / üretim derlemesi başarılı.

## 1.3.2 — Katalog üst alanı

Katalogdaki geri düğmesi, aktif playlist adı, içerik/eşleşen sayıları ve PRO rozetinin bulunduğu üst şerit kaldırıldı. Arama alanı doğrudan uygulama başlığının altına taşındı. Alt Playlists sekmesi kullanılır. TypeScript/üretim derlemesi ve 390/1440px arayüz kontrolünde kaldırılan şerit, arama konumu, alt sekmeden playlist geçişi ve sıralama kontrol edildi.
