# XIPTV Play

IPTV (Xtream Codes / M3U) Oynatıcısı.

## Kurulum ve Çalıştırma

### 1) PC (Web Geliştirme)
Bilgisayarda Node.js kurulu iken:
```bash
npm install
npm run dev
```
Tarayıcıda [http://localhost:3000](http://localhost:3000) adresinden erişebilirsiniz. (Proxy kullanıcının kendi IP'siyle çıkar.)

### 2) APK (Android)
```bash
npm install
npx cap add android
npm run cap:sync
```
*   `android/app/src/main/AndroidManifest.xml` içerisindeki `<application>` etiketine `android:usesCleartextTraffic="true"` ekleyin.
*   `npx cap open android` ile Android Studio'da açıp Build > Build APK seçeneği ile kurulum dosyasını oluşturun.

## Android indirme notları
- İndirme süresi artık tek bir anlık hız ölçümüne göre değil, yumuşatılmış hız ortalamasına göre hesaplanır; kaynak sunucu toplam boyutu bildirmiyorsa ETA kesin olmayabilir.
- Tamamlanan indirme kartındaki **Dosyayı Aç / Paylaş** düğmesi Android paylaşım penceresini açar. Android'in uygulama özelindeki `Directory.Data` klasörü dosya yöneticisinde doğrudan açılabilir bir genel klasör değildir; bu nedenle paylaşım penceresinden VLC gibi bir oynatıcı seçilebilir.
- MKV kapsayıcısı veya içindeki kodekler Android WebView tarafından desteklenmeyebilir. Böyle dosyalar için harici oynatıcı kullanın.
- `@capacitor/share` eklentisi eklendi. Bağımlılıkları yükledikten sonra `npx cap sync android` çalıştırıp APK'yi yeniden oluşturun.
- Bir indirme akışının hızını yalnızca arayüzden artırmak mümkün değildir; hız sunucu, ağ ve yayın sağlayıcısının sınırlarına bağlıdır. Bu sürüm sahte bir “hızlandır” kontrolü göstermez.
