# ConstEra istehsala buraxılış runbook-u

Bu sənəd ilk real sifarişi təhlükəsiz qəbul etmək üçün texniki və biznes
addımlarını bir ardıcıllıqda saxlayır. Heç bir müqavilə, media hüququ, stok və
ödəniş nəticəsi təsdiq olmadan sistemdə hazır kimi işarələnməməlidir.

## 1. Buraxılış sərhədi

İctimai sayt dərhal **kataloq + RFQ** rejimində açıla bilər. Kommersiya yoxlamasından
keçməyən məhsul qiymət sorğusuna düşür və stok rezervi, təchizatçı alt-sifarişi
və ödəniş yaratmır.

İlk real ödənişli əməliyyatda yalnız aşağıdakı axın açılır:

- Azərbaycan daxilində bir təchizatçı;
- 5-10 stoklu və son 30 gündə qiyməti yoxlanmış məhsul;
- Bakı üzrə mövcud logistika zonaları;
- hesab-faktura və ya bank köçürməsi;
- bir aşağı məbləğli nəzarət sifarişi;
- təchizatçı, müştəri və super administrator tərəfindən mərhələli qəbul.

Kart ödənişi, avtomatik e-qaimə və xarici logistika yalnız müvafiq provayder
müqaviləsi və production açarları qurulduqdan sonra aktivləşdirilir.

## 2. OMID pilotu

Buraxılış mərkəzində OMID-in stoklu və mənbəli təklifləri pilot seçimi kimi
göstərilir. İstehsala açmazdan əvvəl:

1. `https://omid.az/pages/contact` üzərindən korporativ satışla əlaqə saxla.
2. Məhsulların ConstEra-da göstərilməsi, qiymət/stok yenilənməsi və şəkillərin
   istifadəsi üçün yazılı icazə al.
3. İmzalanmış müqavilə faylını özəl sənəd yaddaşına yerləşdir və yalnız qorunan
   URL-i admin panelində müqaviləyə bağla.
4. Təchizatçı şirkət hesabını yarat və OMID nümayəndəsini həmin hesaba dəvət et.
5. Admin panelinin `Media` bölməsində yalnız icazə verilən şəkilləri
   `supplier`, `official`, `own` və ya `licensed` hüquq növü ilə qeydə al.
6. `Buraxılış mərkəzi` bölməsində pilot yoxlamasını yenidən işə sal.

## 3. Təchizatçıya göndəriləcək mətn

Mövzu: ConstEra pilot təchizatçı əməkdaşlığı

> Salam. ConstEra Azərbaycan tikinti bazarı üçün B2B material platformasıdır.
> İlk pilot mərhələdə seçilmiş məhsullarınızın adı, aktual qiyməti, stok
> vəziyyəti və rəsmi şəkillərini platformada təqdim etmək istəyirik. Məhsul
> məlumatlarının yenilənməsi, sifarişin təsdiqi, çatdırılma və media istifadə
> hüquqları üçün məsul şəxsi və əməkdaşlıq şərtlərini paylaşmağınızı xahiş
> edirik. Heç bir məhsul yazılı razılıq və sifarişdən əvvəl stok təsdiqi olmadan
> satışa hazır kimi göstərilməyəcək.

Təsdiqdə ən azı bunlar olmalıdır:

- hüquqi şirkət adı və VÖEN;
- məsul şəxsin adı, korporativ e-poçtu və telefonu;
- qiymət və stok yenilənmə tezliyi;
- minimum sifariş və təslimat müddəti;
- qaytarma və zəmanət şərtləri;
- istifadə edilə bilən şəkil URL-ləri və hüququn əhatəsi;
- müqavilənin başlanğıc və bitmə tarixləri.

## 4. Administrator təhlükəsizliyi

1. Super administrator `admin.html` daxilində 2FA quraşdırmasını başladır.
2. QR/TOTP açarı şəxsi authenticator tətbiqinə əlavə edilir.
3. Bərpa kodları parol menecerində saxlanılır.
4. 2FA təsdiqləndikdən sonra yeni sessiya açılır.
5. Müqavilə aktivləşdirmə, kütləvi kataloq düzəlişi və digər kritik əməliyyatlar
   yalnız həmin 2FA sessiyasından icra edilir.

TOTP açarı, bərpa kodu, admin şifrəsi və provider sirrləri repozitoriyaya,
CSV-yə və ya ictimai sənədə yazılmır.

## 5. İlk nəzarət sifarişi

1. Buraxılış mərkəzində bütün blokları keçən məhsulu seç.
2. Miqdarı minimum sifarişdən aşağı olmayacaq şəkildə `1` və ya aşağı riskli
   nəzarət miqdarı kimi saxla.
3. Bakı daxilində real çatdırılma ünvanı və əlaqə nömrəsi daxil et.
4. Pilot yoxlamasının qiymət, stok, mənbə, media, müqavilə və logistika
   yoxlamalarının hamısını keçdiyini təsdiqlə.
5. Müştəri kabinetindən real sifariş yarat.
6. Təchizatçı stok rezervini və sifarişi qəbul etsin.
7. Bank köçürməsi seçilibsə, yalnız faktiki ödəniş sənədi əsasında statusu
   `paid` et.
8. Qaiməni və göndərişi faktiki əməliyyatdan sonra qeyd et.
9. Təhvil zamanı sifarişi `completed` et və audit jurnalını yoxla.

## 6. Buraxılışdan əvvəl yoxlama

```bash
npm ci
npm run check:full
npm run db:audit
npm run check:production -- https://constera.az
```

Admin panelində əlavə olaraq:

- `Buraxılış mərkəzi` hesabatını CSV kimi endir;
- açıq yüksək riskli kataloq problemlərini sıfırla;
- backup bütövlük yoxlamasının son 7 gündə uğurlu olduğunu təsdiqlə;
- səlahiyyətli hesabların hamısında 2FA-nın aktiv olduğunu yoxla;
- monitor nasazlığı üçün xarici xəbərdarlıq kanalını qur;
- pilot məhsulda müqavilə və media bloklarının qalmadığını yoxla.

## 7. Monitorinq və geri dönüş

- `/api/health`, kataloq, giriş, checkout və admin müqavilələri production
  monitoru ilə gündəlik yoxlanılır.
- `MONITOR_ALERT_WEBHOOK_URL` və `MONITOR_ALERT_WEBHOOK_SECRET` qurulduqda
  monitor xətası xarici kanala göndərilir.
- Kritik nasazlıqda yeni sifariş qəbulunu dayandır, son sağlam Vercel
  deployment-ına rollback et və Neon məlumatını birbaşa silmə.
- Məlumat problemi olduqda məhsulu arxivlə və ya təklifi deaktiv et; sifariş və
  audit tarixçəsini qoruyub saxla.

## 8. Sahib tərəfdən tələb olunan məlumat

Kodla avtomatik yaradıla bilməyən və launch üçün sahib tərəfindən tamamlanmalı
olanlar:

- imzalanmış təchizatçı müqaviləsi;
- məhsul şəkillərinin istifadə icazəsi;
- hüquqi şirkət və bank rekvizitləri;
- super administratorun şəxsi 2FA qeydiyyatı;
- ödəniş, e-qaimə, e-poçt/WhatsApp və logistika provider müqavilələri;
- xarici monitor və özəl backup webhook ünvanları;
- ilk real sifariş üçün tərəflərin faktiki təsdiqi.

Hüquqi şirkət adı, VÖEN, ünvan və satıcı əlaqəsi ödəniş qəbulundan əvvəl
istifadəçiyə verilən müqavilə, proforma və ya hesab-fakturada görünməlidir.
Bu rekvizitlər daxil edilməyənədək public checkout yalnız sifariş sorğusu kimi
işlədilməlidir.
