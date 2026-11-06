# Kenar Notu

Samsung Galaxy Tab S11 tabletimde her gün kullandığım, S Pen ile PDF'lerin kenarına not aldığım uygulama.
PDF'i açıyorum, üzerine kalemle yazıyorum; el yazımı düzgün metne çevirip düzeltiyor, bilmediğim kelimeyi
basılı tutunca İngiliz aksanıyla okuyor, seçtiğim paragrafı açıklıyor ya da çeviriyor ve notlu PDF'i
OneDrive'daki aynı dosyaya geri kaydediyor. Böylece bilgisayarda da aynı notları görüyorum.

Uygulama bir web uygulaması (PWA) ve onu saran küçük bir Android kabuğundan oluşuyor. Tablette APK olarak kurulu;
aynı APK telefonda kalemsiz bir okuma ve not görünümüyle açılıyor.

![Kitaplık](docs/ekran/kitaplik.jpg)

---

## Ne için kullanıyorum

- **Makale okumak.** Akademik makaleleri tablette okuyorum. Bir paragrafın etrafını kalemle çevirip
  "Açıkla" ya da "Çevir" diyorum; yanıtı o paragrafın üzerine yapışkan not olarak yapıştırıyorum.
  Önemli İngilizce terimler çeviride parantez içinde kalıyor, böylece kaynaktaki kavramı kaybetmiyorum.
- **İngilizce çalışmak.** *English Grammar in Use* ve *English Vocabulary in Use* alıştırmalarını PDF'in
  üzerinde S Pen ile çözüyorum. Yazdığım cevaplar düzgün metne dönüşüyor ve yazım hataları düzeltiliyor.
  Bilmediğim kelimeye basılı tutunca İngiliz kadın sesiyle telaffuzunu dinliyorum, sözlük penceresinde anlamına bakıyorum.
- **Kelime ve ders notu tutmak.** Hazır kalem stilleriyle (Terim · Anlamı · İngilizce örnek · Türkçe çeviri ·
  İpucu · Hatalı/Doğru) her not aynı düzende ve renklerde oluyor.
- **Kitap ile defteri yan yana açmak.** Solda PDF, sağda boş kareli sayfa; tek araç çubuğu iki tarafta da çalışıyor,
  sayfa düzeltme de sağdaki defterde çalışıyor. Tableti dik tutunca defter alta geçiyor.
- **Ekrandan parça almak.** Bir tablonun ya da şeklin ekran görüntüsünü alıp not sayfama yapıştırıyorum.
- **Bilgisayarla eşitlemek.** Dosyalar OneDrive'da; tablette notladığım PDF bilgisayarımdaki aynı dosyada güncelleniyor.
- **Telefonda okumak.** Aynı PDF'i telefonda açıp okuyorum, açılır-kapanır notları görüyor, düzeltiyor ya da yenisini
  ekliyorum. Tablete döndüğümde notlar birleşiyor; kimse kimsenin üzerine yazmıyor.

---

## Ekran görüntüleri

| El yazısını düzelt | Kalem stilleri |
|---|---|
| ![El yazısını düzelt](docs/ekran/el-yazisi-duzeltme.jpg) | ![Kalem stilleri](docs/ekran/kalem-stilleri.jpg) |
| **Yapay zekâ ile çeviri ve kalemle soru** | **Yapışkan not** |
| ![Çeviri](docs/ekran/yapay-zeka-ceviri.jpg) | ![Yapışkan not](docs/ekran/yapiskan-not.jpg) |
| **Yan yana belge** | **Basılı tutunca sesli okuma** |
| ![Yan yana](docs/ekran/yan-yana.jpg) | ![Sesli okuma](docs/ekran/sesli-okuma.jpg) |
| **Tüm sayfalar** | **El yazısı ayarları** |
| ![Tüm sayfalar](docs/ekran/tum-sayfalar.jpg) | ![El yazısı ayarları](docs/ekran/el-yazisi-ayarlari.jpg) |

---

## Özellikler

**S Pen ile yazma**
- Basınç ve eğim duyarlı dolma, tükenmez, kurşun, kaligrafi, fırça ve fosforlu kalem.
- Yan tuşla geçici silgi, havada imleç, avuç içi reddi, titremeyi azaltma.
- Bekletince şekle dönüştürme (çizgi, daire, üçgen, dörtgen).
- **Karalayarak sil:** yazının üzerini zikzakla karalayınca altındaki yazı silinir.
- Kement ile seç, taşı, büyüt/küçült, döndür, rengini değiştir. Metne ya da görsele basılı tutunca da seçilir.
- **Kaydırma düğmeleri** (üst çubukta → ve ↓; istenirse dört yön): yazarken diğer elle dokununca sayfa kayar,
  basılı tutunca kaymaya devam eder. Kalemle yazarken parmakla sürüklemek avuç içi sayıldığı için düğmeler daha rahat.

**El yazısını düzelt**
- Yazdığın satır metne çevrilir ve yazım hataları düzeltilir. Türkçe ve İngilizce karışık yazılabilir.
- Android'de tamamen cihazda çalışır (Google ML Kit el yazısı tanıma + Samsung Klavye'nin yazım denetleyicisi).
  Web'de bağlı yapay zekâ ile çalışır.
- Kapalı / Düğmeyle / Otomatik modları; Düzelt düğmesinin çıkma süresi ayarlanabilir (0,5–8 sn); TR/EN düğmesiyle diğer dilde yeniden okuma; A− / A+; Geri al.
  Düzelt düğmesinin köşesindeki ✕ düğmeyi kapatır; düğmenin ana belgede mi, yan belgede mi, ikisinde mi
  çalışacağı kalem panelinden seçilir.
- Alt satıra geçen yazı aynı paragrafta kalır; düzeltilmiş bir metnin yanına ya da altına yazılan devam, o metnin
  hemen arkasına eklenir ve hizalı kalır (Ayarlar → El yazısı → "Metnin devamına ekle" ile kapatılabilir).
- Daha önce yazılanlar için: kement ile seç → "Yazıya dök". Ayrı düşmüş parçalar için: kement ile seç →
  **Hizala ve düzelt** (parçalar okuma sırasıyla tek, sola hizalı metinde birleşir ve yeniden düzeltilir).
- **Kelime kelime okuma:** Düzelt'e bir kez basınca satır aradaki boşluklardan kelimelere bölünür, her kelime öncesindeki
  kelimeler bağlam olarak verilerek sırayla okunur ve birleştirilir (ML Kit tek kelimede çok daha iyi). Noktalama önceki
  kelimeye eklenir, satır sonu tiresiyle bölünmüş kelime birleşir. İstenirse 3–4 kelimelik parçalar ya da tüm satır.
- **Gelişmiş okuma, tablette** (Yalnız cihaz / Uzun yazılarda / Her zaman): cihazdaki sonuç hemen yazılır, aynı anda
  **Gemma 4 E2B** (Google, Apache 2.0) el yazısının görüntüsünü baştan okur ve o parçayı günceller. Model bir kez
  Hugging Face'ten indirilir (≈2,6 GB), sonra internetsiz çalışır; yazı tabletten çıkmaz (LiteRT-LM ile cihazda).
  İstenirse bulut (Gemini / Claude) da seçilebilir; kendiliğinden kullanılmaz.
- **Karşılaştır:** bir cümle yazıp cihazdaki tanıma (tüm satır / kelime kelime / kelime kelime paralel) ile Gemma'nın sonucunu
  ve süresini alt alta görürüm; kelimelerin nereden ayrıldığı yazma alanında çerçeveyle gösterilir.

**Sayfayı düzelt (yapay zekâ)**
- Önce düzeltilecek sayfaları seçiyorum (açık sayfa hazır seçili; "Yazılı sayfalar" hepsini seçer, en çok 20 sayfa).
- Her sayfanın görüntüsü yapay zekâya gidiyor. Yazılar okunup düzeltiliyor ve sırayla, yazı yazı geri geliyor; her
  yazının görevi de geliyor: sayfa başlığı · bölüm başlığı · **terim** : anlamı · örnek cümle · çeviri · ipucu ·
  açıklama · metin. Yakın yazılmış satırlar tek cümle sayılmıyor; görev belirlenirken mürekkep rengine de bakılıyor.
- Uygulama her görevi kalem stillerimden birine eşleyip yazıları nota sırayla diziyor (kelime defteri düzeni:
  sarı vurgulu bölüm başlığı · girintili örnek · ↳ çeviri · ★ ipucu). Eşleme: Ayarlar → Sayfayı düzelt.
- Nereye: **Yazının yerine** (el yazısı kalkar, art arda seçilen sayfalar birlikte akar; PDF sayfalarında ardından
  yeni sayfaya yazılır) ya da **Yeni sayfalara** (seçilen sayfalar olduğu gibi kalır).
- **Geliştir** (isteğe bağlı, seçicideki düğmeler): yapay zekâ yazdıklarıma **örnek cümle** ve çevirisini ekliyor,
  **kelimeleri anlatıyor** (sözcük türü, okunuş, kullanım, eş/zıt anlam, sık yapılan hata) ya da **kendi isteğimi**
  uyguluyor. Eklenen satırlar notta kenarda mor çizgiyle işaretleniyor; önizlemede tek tek ya da hepsi birden çıkarılabiliyor.
- **Çalışma kağıdı**: okunan yazılardan alıştırmalar (boşluk doldurma, eşleştirme, çeviri, cümle kurma, çoktan seçmeli)
  düzenlenen sayfalardan sonra yeni sayfalara yazılıyor; kalemle cevap yazacak yer kalıyor, cevap anahtarı ayrı sayfada.
  "Yalnız çalışma kağıdı" seçilirse sayfalara dokunulmuyor.
- Bulunan hatalar sonuna "Kırmızı kalem · düzeltmeler" olarak yazılıyor (✗ yazdığım · ✓ doğrusu · açıklama).
- Yanda önizleme ve satır satır düzenleme (görevi değiştir, metni düzelt, satırı çıkar); okunamayan sayfa için
  "Yeniden dene"; sığmayan kısım sonraki sayfaya geçiyor.
- Önce **Gemini**; anahtar yoksa, günlük sınır dolduysa ya da hata verirse **Claude Sonnet**. Sıra, modeller ve
  "sayfadan çıkınca kendiliğinden hazırla" seçeneği Ayarlar'dan değiştirilir.

**Harcama (Ayarlar)**
- Yapay zekâ isteklerinin tahmini maliyeti: bugün / bu ay / toplam, son 7 gün · 30 gün · 12 ay sütun grafiği
  (dokununca değer, tablo görünümü), işleve ve modele göre dağılım, düşünme payı. Token sayıları yanıtlardan gelen
  gerçek sayılar, tutar liste fiyatıyla; kayıt yalnızca cihazda. Sayfayı düzelt önizlemesinde işlemin maliyeti yazar.

**Boşlukları kapat (not sayfalarını birleştir)**
- Düzeltilen yazı el yazısından küçük olduğu için sayfada boşluk kalırsa: satırlar yukarı toplanır, büyük boşluklar
  daraltılır ve sonraki not sayfasının yazıları bu sayfadan devam eder. Boş kalan sayfalar tek dokunuşla silinir.
- "Sayfayı düzelt" sonrasında yer açıldıysa "Sonraki sayfa buradan devam etsin" önerisi kendiliğinden çıkar.

**Kalem stilleri**
| Stil | Renk | Yazı tipi |
|---|---|---|
| Sayfa başlığı / Bölüm başlığı | Lacivert `#1F2F5C` | Kalam Bold 30 / 19 pt |
| Terim | Yeşil `#1B6E3C` | Kalam Bold 13,5 pt |
| Anlamı | Turkuaz `#167A7A` | Kalam 13,5 pt |
| İngilizce örnek | Koyu mavi `#1F2F5C` | Kalam 12,5 pt |
| ↳ Türkçe çeviri | Gri-yeşil `#4F6B5A` | Kalam Light 11,5 pt |
| ★ İpucu | Mor `#6B3FA0` | Kalam 11,5 pt |
| ✗ Hatalı / ✓ Doğru | Kırmızı `#C0392B` / Yeşil `#1B6E3C` | Kalam 12 pt |
| Düzeltme açıklaması | Koyu kırmızı `#8E2A20` | Kalam Light 11,5 pt |

Stil seçilince kalem o renge geçer, düzeltilen yazı o yazı tipi ve boyutla yazılır. Sayfa birimi PDF noktası
olduğu için (A4 = 595 × 842 pt) boyutlar birebir aynıdır.

**Okuma ve yapay zekâ**
- PDF metninde kelimeye basılı tut: seç, kopyala, fosforla, paylaş, **Dinle**, **Anlamı**, **Çevir**.
- **Alanı çevrele:** bir paragrafın ya da tablonun etrafını çiz → Açıkla / Çevir / Not yapıştır.
  Taranmış sayfalarda alanın görüntüsü gönderilir.
- Sözlük ve sohbet penceresi: taşınabilir, boyutlandırılabilir; kalemle soru yazılabilir.
- Gemini (ücretsiz katman) ya da Claude. API anahtarı yalnızca tablette saklanır.
- Sesli okuma: Android metin okuma motoru, varsayılan İngiliz İngilizcesi kadın sesi; hız ve ses seçilebilir.

**Belge ve sayfalar**
- Sayfa paneli (küçük resimler, içindekiler, yer imleri, belgede arama), tüm sayfalar ızgarası,
  sürükleyerek sıralama, sayfa ekleme/çoğaltma/silme.
- Yapışkan notlar (PDF'e gerçek, açılır-kapanır not olarak yazılır; diğer okuyucularda da görünür), metin kutuları,
  görsel ekleme, bölge ekran görüntüsü.
- Kitaplıkta klasörler, favoriler, son açılanlar, çoklu seçim.
- Yan yana iki belge (dik tutunca alt alta); açık/koyu tema; okuma modu; PDF renklerini ters çevirme.
- Bölümlere ayrılmış Ayarlar ekranı (Görünüm, S Pen, El yazısı, Sayfayı düzelt, Sesli okuma, Yapay zekâ, OneDrive).
- Şifreli (düzenleme kısıtlı) ya da hasarlı PDF'ler kaydederken onarılır (qpdf).

**OneDrive**
- Android'de: dosya OneDrive uygulaması üzerinden açılır, notlu PDF aynı dosyaya yazılır. Microsoft kaydı gerekmez.
- Üzerine yazmayan eşitleme: dosya başka cihazda değiştiyse yapışkan notlar üç yönlü birleştirilir (iki yerde
  birden değişen notun ikisi de tutulur), tabletteki kalem yazıları korunur. Notlar dışında da değişmişse sorar.
  Not açılınca dosyanın içeriği okunup son yazılanla karşılaştırılır (OneDrive'ın tarih bilgisi gecikebilir).
- OneDrive önceki yüklemeyi bitirmeden aynı dosyaya yeniden yazılmaz
  (bu, OneDrive'ın "Dosya 1.pdf" gibi kopyalar oluşturmasını önler); değişmeyen not yeniden yüklenmez.
- Web'de: Microsoft Graph ile bağlanılır (bkz. [web ve OneDrive kurulumu](docs/web-ve-onedrive-kurulumu.md)).

---

## Yapı

```
index.html, sw.js, manifest.webmanifest, config.js   Web uygulaması (derleme adımı yok)
css/                 Stiller, yazı tipi tanımları
js/                  Uygulama kodu
  util.js            Ayarlar, simgeler, ortak bileşenler
  ink.js             Kalem dinamiği, çizim, metin kutuları
  editor.js          Düzenleyici: araçlar, seçim, silgi, karalayarak silme
  pages.js           Sayfa paneli, tüm sayfalar, arama
  pdfio.js           PDF okuma ve notlu PDF üretme (pdf-lib, qpdf)
  hand.js            El yazısını düzelt
  settings.js        Ayarlar ekranı
  usage.js           Harcama: token kaydı, fiyatlar, grafik
  pagefix.js         Sayfayı düzelt: sayfa seçici, Geliştir seçenekleri, sağlayıcılar (Gemini → Claude)
  pagelayout.js      Sayfaları okuma, geliştirme, çalışma kağıdı, görev → kalem stili, yerleşim, önizleme
  flow.js            Boşlukları kapat, sayfaları birleştir
  speak.js           Sesli okuma
  ai.js              Sözlük, çeviri, sohbet (Gemini / Claude)
  sticky.js          Yapışkan notlar, alanı çevrele
  textsel.js         PDF metni seçme
  split.js           Yan yana belge
  onedrive.js        OneDrive (Graph) ve eşitleme
  native.js          Android köprüsü (dosyaya yazma, paylaşma, OneDrive SAF)
fonts/               Onest, Literata, Caveat, Kalam (çevrimdışı)
vendor/              PDF.js, pdf-lib, MSAL, qpdf (wasm)
android-uygulama/    Android kabuğu (WebView)
  app/src/main/java/com/kenarnotu/app/
    MainActivity.java          WebView, KenarNative köprüsü, OneDrive'a yazma
    HandwritingCorrector.java  ML Kit el yazısı tanıma + yazım düzeltme
    LocalReader.java           Tabletteki gelişmiş okuma: Gemma 4 E2B (LiteRT-LM), model indirme
    Speaker.java               Metin okuma (en-GB kadın sesi)
  APK-OLUSTUR.bat              Windows'ta tek tıkla APK
  KURULUM.txt                  Kurulum ve sürüm notları
docs/                Ekran görüntüleri, web ve OneDrive kurulumu
```

Android kabuğu web uygulamasını paketin içinden `https://localhost/` adresiyle sunar; S Pen olayları doğrudan
sayfaya gelir. Sayfa, kabuğa `window.KenarNative` üzerinden ulaşır.

---

## Kurulum

### Android (Galaxy Tab)

1. Windows'ta `android-uygulama/APK-OLUSTUR.bat` dosyasını çift tıklayın. Java ve Android SDK yoksa kendisi indirir,
   web dosyaları eksikse üst klasörden uygulamaya kopyalar ve APK'yı oluşturur.
2. APK'yı tablete kopyalayıp kurun. Ayrıntılar: [`android-uygulama/KURULUM.txt`](android-uygulama/KURULUM.txt).

> İmzalama anahtarı (`kenar-notu.keystore`, `keystore.properties`) depoda **yoktur**. Kendi anahtarınızla derlemek için
> `android-uygulama/` içine bir keystore ve `storeFile`, `storePassword`, `keyAlias`, `keyPassword` alanlarını içeren
> `keystore.properties` dosyası koyun.

### Markdown ve tuval

Markdown dosyaları (tek tek ya da Android'de Obsidian kasası klasöründen) okunur, aranır, sesli okunur; dosyaya yazılmaz.
Notlar belgenin yanındaki `Ad.canvas` tuvaline (Obsidian Canvas / JSON Canvas biçimi) kart ve ok olarak yazılır; satıra ya da
PDF sayfasına bağlı kartlar belgede işaretlenir. Tuval sayfanın üzerinde kayan, boyutlanan bir pencerede açılır. Yazmadan önce
dosya okunur ve kart kart birleştirilir. İkinci belge de istenirse aynı kayan pencerede açılır.

### Sayfa kaydırma ve kenar düğmeleri

Sayfa ekrana sığsa da parmakla yana sürüklenir ya da alttaki konum şeridiyle sağa-sola kaydırılır (yön kilidi sayesinde
yukarı-aşağı kaydırırken yana kaçmaz; bırakılan konum hatırlanır). Üst çubuk ortadaki küçük dille gizlenir; seçilen düğmeler
(ör. silgi) o sırada sayfanın köşesinde ya da kenarında kalır. Düğmeye basılı tutunca yeri seçilir.

### Telefon

Aynı APK telefona kurulur. Kısa kenarı 600 dp'den küçük ekranlarda telefon görünümü açılır: kalem araçları yok,
parmak sayfayı kaydırır; notlar alttan açılan pencerede okunur ve düzenlenir. Yan çevrilince üst çubuk saklanır;
ortadaki küçük dille açılıp kapanır. Web'de `?phone=1` ile denenebilir.

### Web (PWA)

Klasörü herhangi bir statik sunucuyla yayınlayın (`python -m http.server 8080`), tablette tarayıcıdan açıp
"Ana ekrana ekle"yi seçin. HTTPS ve OneDrive kaydı için: [web ve OneDrive kurulumu](docs/web-ve-onedrive-kurulumu.md).

### Yapay zekâ

Sözlük penceresi → ⚙ → Gemini (aistudio.google.com → "Get API key") ya da Claude anahtarı. Anahtar yalnızca
cihazda saklanır, depoya girmez.

---

## Gizlilik

Notlar tabletin kendi deposunda tutulur. Dosyalar yalnızca seçtiğiniz OneDrive dosyasına yazılır. Yapay zekâ
özellikleri yalnızca siz kullandığınızda seçilen metni ya da alanı seçtiğiniz sağlayıcıya gönderir. El yazısı tanıma
(ML Kit ve tabletteki Gemma 4) ve sesli okuma Android'de cihazda çalışır; el yazısı yalnızca Ayarlar → El yazısı →
Okuyan model'de açıkça "Bulut" seçilirse yapay zekâ sağlayıcısına gönderilir.

## Bilinen sınırlar

- S Pen'in Air Actions hareketleri desteklenmez.
- Başka PDF okuyucularda eklenen notlar Kenar Notu'na alınmaz; Kenar Notu'nun notları orada simge olarak görünür.
- Eşitleme birleştirmesi Android'deki OneDrive bağlantısında çalışır; web (Graph) sürümü değişiklikte sorar.
- Parola ile açılan (açılış şifreli) PDF'ler açılmaz.
- Kurşun kalemin doku görünümü dışa aktarılan PDF'te düz gri çıkar.
- Tabletteki Gemma modelinin Türkçe el yazısındaki başarısı ve hızı cihaza göre değişir; Ayarlar → El yazısı → Karşılaştır ile denenebilir.

## Lisanslar (üçüncü taraf)

- PDF.js — Apache 2.0 (Mozilla) · pdf-lib — MIT · MSAL.js — MIT (Microsoft) · qpdf — Apache 2.0
- Google ML Kit Digital Ink Recognition — Google API Hizmet Şartları
- LiteRT-LM (Google) — Apache 2.0 · Gemma 4 E2B modeli (Google, Hugging Face litert-community) — Apache 2.0; uygulamayla dağıtılmaz, ilk kullanımda indirilir
- Onest, Literata, Caveat, Kalam yazı tipleri — SIL Open Font License 1.1

---

Kişisel kullanım için geliştirildi; Claude (Anthropic) ile birlikte yazıldı.
