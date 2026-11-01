# Kenar Notu

Samsung Galaxy Tab ve S Pen için PDF not alma uygulaması. PDF açın, üzerine S Pen ile yazın, metin ve görsel ekleyin, ekranın bir bölümünü yakalayın ve notlu PDF'i doğrudan OneDrive'daki dosyanıza kaydedin.

Uygulama bir **PWA**'dır (ana ekrana eklenebilen web uygulaması). Kurulduktan sonra tablette tam ekran, kendi simgesiyle ve internet olmadan da çalışır.

---

## Özellikler

**S Pen**
- Basınç: kalem ucuna bastıkça çizgi kalınlaşır (duyarlılık ayarlanabilir).
- Eğim: kurşun kalemi yatırınca çizgi genişler, gölgeleme yapılır.
- Yan tuş: basılı tutarak yazınca geçici silgi (seçim, fosforlu ya da kapalı da seçilebilir).
- Havada imleç: kalem ekrana yaklaşınca uç boyutunu gösteren halka.
- Avuç içi reddi: kalem kullanılırken ele ait dokunuşlar çizmez.
- Şekle dönüştürme: çizginin sonunda kalemi bekletince düz çizgi, daire/elips, üçgen ya da dörtgene dönüşür.
- Titremeyi azaltma (çizgi yumuşatma) ve düşük gecikmeli çizim.

**Kalemler ve araçlar**
- Dolma, tükenmez, kurşun, kaligrafi, fırça ve fosforlu kalem; her birinin ayrı kalınlık, opaklık ve rengi.
- 18 renkli palet, özel renk seçici, son kullanılan renkler, favori kalemler.
- Silgi: alan silgisi (çizgiyi böler) ve çizgi silgisi; "yalnızca fosforlu" seçeneği.
- Kement: serbest ya da dikdörtgen seçim; taşıma, boyutlandırma, döndürme, çoğaltma, renk değiştirme, silme. Bir görsele ya da metne dokunarak da seçebilirsiniz.
- Metin kutuları: üç yazı tipi (Yalın, Tırnaklı, El yazısı), boyut, renk, kalın.
- Görsel ekleme.
- Sayfa paneli: boş/çizgili/kareli/noktalı sayfa ekleme, taşıma, silme.
- Geri al / yinele (iki parmakla dokun: geri al, üç parmak: yinele).

**Bölge ekran görüntüsü**
- Araç çubuğundaki yakalama düğmesi (ya da klavyede `S`) ile dikdörtgen veya serbest bir alan çizin.
- Seçimi panoya kopyalayın, nota görsel olarak yapıştırın, paylaşın, indirin ya da uygulamanın **Ekran görüntüleri** bölümüne kaydedin.

**OneDrive**
- OneDrive klasörlerinizde gezinin, arayın, PDF'leri açın.
- Notlu PDF aynı dosyanın üzerine ya da yanına "(notlu)" kopya olarak yazılır.
- Otomatik eşitleme: değişiklikten birkaç saniye sonra ve not kapatılırken.
- Çakışma koruması: dosya başka bir cihazda değiştiyse üzerine sormadan yazılmaz.
- Tabletteki bir notu OneDrive'da istediğiniz klasöre yükleyebilirsiniz.

**Diğer**
- Notlu PDF'i cihaza indirme ve paylaşma (notlar vektör olarak işlenir, yakınlaştırınca bulanıklaşmaz).
- Açık, koyu ve sistem teması.
- Klavye kısayolları: `P` kalem, `H` fosforlu, `E` silgi, `L` kement, `T` metin, `S` yakalama, `Ctrl+Z` / `Ctrl+Y`, `Ctrl+S` kaydet.

---

## Klasör yapısı

```
index.html            Uygulamanın sayfası
config.js             OneDrive uygulama kimliği (isteğe bağlı)
manifest.webmanifest  Ana ekran uygulaması bilgileri
sw.js                 Çevrimdışı çalışma (hizmet çalışanı)
css/                  Stiller ve yazı tipi tanımları
js/                   Uygulama kodu
  util.js             Yardımcılar, depolama, ayarlar
  ink.js              Kalem dinamiği, çizim, şekil tanıma
  pdfio.js            PDF okuma ve notlu PDF üretme
  onedrive.js         OneDrive bağlantısı ve dosya penceresi
  library.js          Kitaplık ekranı
  editor.js           Düzenleyici ve S Pen girdisi
  capture.js          Bölge ekran görüntüsü
  main.js             Başlangıç
fonts/                Onest, Literata, Caveat (çevrimdışı)
icons/                Uygulama simgeleri
vendor/               PDF.js, pdf-lib, MSAL (Microsoft giriş kitaplığı)
```

Derleme adımı yoktur; dosyalar olduğu gibi yayınlanır.

---

## 1. Bilgisayarda deneme

Klasörde bir komut satırı açıp şunlardan birini çalıştırın, sonra tarayıcıda `http://localhost:8080` adresine gidin:

```
npx serve -l 8080 .
```
ya da
```
python -m http.server 8080
```

`index.html` dosyasını doğrudan çift tıklayarak da açabilirsiniz; bu durumda OneDrive ve çevrimdışı çalışma kapalı olur.

## 2. Tablete kurma (yayınlama)

Tablette ana ekran uygulaması ve OneDrive girişi için uygulamanın **https** adresinden açılması gerekir. En kolay iki yol:

**A) Netlify Drop (hesap açmadan, 1 dakika)**
1. Bilgisayarda https://app.netlify.com/drop adresini açın.
2. `TabApp` klasörünü sayfaya sürükleyip bırakın.
3. Verilen `https://....netlify.app` adresini not alın. (Kalıcı olması için ücretsiz hesap açıp siteyi sahiplenin.)

**B) GitHub Pages**
1. GitHub'da yeni bir depo açın ve bu klasörün içeriğini yükleyin.
2. Depo → Settings → Pages → "Deploy from a branch" → `main` / `(root)` seçin.
3. Birkaç dakika sonra adres `https://KULLANICI.github.io/DEPO/` olur.

**Tablette:**
1. Adresi Chrome ya da Samsung Internet'te açın.
2. Menüden **Uygulamayı yükle** / **Ana ekrana ekle**'yi seçin.
3. Ana ekrandaki Kenar Notu simgesiyle açın. Uygulama tam ekran ve çevrimdışı çalışır.

Güncellemek için dosyaları aynı yere yeniden yükleyin. Yeni sürümün tablete gelmesi için `sw.js` içindeki `VERSION` değerini artırın (ör. `v2.0.1`).

## 3. OneDrive bağlantısı

Microsoft, OneDrive'a erişen her uygulamanın bir kez kaydedilmesini ister. Ücretsizdir ve yaklaşık 3 dakika sürer.

1. https://entra.microsoft.com adresine Microsoft hesabınızla girin (kişisel Outlook/Hotmail hesabı da olur).
2. **Uygulamalar → Uygulama kayıtları → Yeni kayıt**'ı açın.
3. Ad: `Kenar Notu`. Desteklenen hesap türleri: **Herhangi bir kuruluş dizinindeki hesaplar ve kişisel Microsoft hesapları**.
4. Yönlendirme URI'si: platform olarak **Tek sayfalı uygulama (SPA)** seçin ve uygulamanın tam adresini yazın, örneğin `https://kenar-notu.netlify.app/`. (Uygulama içindeki OneDrive penceresi bu adresi size gösterir ve kopyalamanızı sağlar. Bilgisayarda denemek için `http://localhost:8080/` adresini de ekleyebilirsiniz.)
5. **Kaydet**'e basın. Açılan sayfadaki **Uygulama (istemci) kimliği** değerini kopyalayın.
6. Bu değeri ya `config.js` dosyasındaki `oneDriveClientId` alanına yazıp yeniden yayınlayın ya da uygulamada **OneDrive** penceresine yapıştırın.
7. **Microsoft hesabıyla giriş yap**'a dokunun ve izinleri onaylayın. Uygulama yalnızca `Files.ReadWrite` (dosyalarınızı okuma/yazma) ve `User.Read` (adınızı gösterme) izni ister.

### Eşitleme nasıl çalışır?

- OneDrive'dan açılan PDF tablete indirilir; notlarınız ayrı, düzenlenebilir katmanlarda tutulur.
- Kaydederken notlar PDF'e işlenir ve dosya OneDrive'a yazılır. **Dosyanın üzerine yaz** seçiliyse asıl PDF güncellenir; **Notlu kopya oluştur** seçiliyse yanına `ad (notlu).pdf` yazılır ve asıl dosyaya dokunulmaz.
- Aynı dosyayı bu tablette yeniden açtığınızda notlar düzenlenebilir hâlde gelir. Başka bir cihazda (ya da başka bir uygulamada) açtığınızda notlar PDF'in parçası olarak görünür.
- Dosya siz açtıktan sonra başka bir yerde değiştiyse uygulama üzerine yazmaz; **Üzerine yaz**, **Notlu kopya kaydet** ya da **Vazgeç** seçeneklerini sunar.
- İnternet yokken notlar tablette kaydedilir; bağlantı gelince eşitlenir.
- Tek seferde yüklenebilecek dosya boyutu 250 MB'dir.

---

## Bilinen sınırlar

- S Pen'in Bluetooth uzaktan kumanda hareketlerine (Air Actions) web uygulamaları erişemez.
- Yan tuşun algılanması tarayıcıya bağlıdır. **⋯ → S Pen testi** alanında basınç, eğim ve yan tuşun algılanıp algılanmadığını görebilirsiniz.
- Notlar tarayıcının deposunda tutulur. Tarayıcı verilerini temizlerseniz silinir; önemli notları OneDrive'a bağlayın ya da PDF olarak indirin.
- Kurşun kalemin doku görünümü dışa aktarılan PDF'te düz gri olarak çıkar.
- Parola korumalı PDF'ler açılmaz.

## Lisanslar

- PDF.js — Apache 2.0 (Mozilla)
- pdf-lib — MIT
- MSAL.js — MIT (Microsoft)
- Onest, Literata, Caveat yazı tipleri — SIL Open Font License 1.1
