# ConstEra buraxılış sübut paketi

Bu paket ilk real təchizatçı və ilk nəzarət sifarişi üçün sahib tərəfdən
toplanmalı məlumatları vahid siyahıda saxlayır. Boş sahə, şifahi razılıq və
ictimai mənbədən fərziyyə production təsdiqi hesab edilmir.

## 1. Administrator təhlükəsizliyi

- Super administrator authenticator tətbiqində 2FA qeydiyyatını tamamlayıb.
- Bərpa kodları repozitoriyadan kənar parol menecerində saxlanılıb.
- Yeni sessiyada kritik əməliyyat üçün TOTP yoxlanılıb.
- Müvəqqəti şifrə dəyişdirilib və heç bir açar sənədə yazılmayıb.

## 2. Təchizatçı

`supplier-onboarding.csv` faylında bir real şirkət üçün bütün sahələri doldur.

- hüquqi şirkət adı və 10 rəqəmli VÖEN;
- korporativ əlaqə, HTTPS sayt və məsul şəxs;
- bank və hesablaşma şərtləri;
- imzalanmış müqavilənin qorunan HTTPS sənəd ünvanı;
- müqavilə başlanğıcı, bitmə tarixi və hüquqi yoxlama qeydi;
- təchizatçı roluna bağlı aktiv istifadəçi hesabı.

## 3. Məhsul və media

`media-urls.csv` yalnız idxal formatıdır. Hər şəkil üçün ayrıca hüquq sübutu
admin panelində qeydə alınmalı və iki mərhələli girişlə təsdiqlənməlidir.

- son 30 gündə təsdiqlənmiş AZN qiyməti və HTTPS qiymət mənbəyi;
- real stok, minimum sifariş və təslimat müddəti;
- öz, təchizatçı, rəsmi və ya lisenziyalı media hüququ;
- icazə məktubu, müqavilə və ya rəsmi media kitabxanası istinadı;
- hüququn son tarixi və əsas şəkil seçimi.

## 4. Logistika

`logistics-tariffs.csv` faylında yalnız daşıyıcının yazılı təklifi və ya
müqaviləsi əsasında real zona daxil et.

- şəhərlər və xidmət sərhədi;
- baza, təchizatçı və vahid üzrə tarif;
- minimum məbləğ, pulsuz hədd və təslimat müddəti;
- HTTPS tarif sənədi, yoxlama qeydi və etibarlılıq son tarixi.

## 5. İlk pilot sifariş

`pilot-order-checklist.csv` nəzarət aktıdır. Sifariş yalnız məhsul, təchizatçı,
media, logistika və ödəniş sətirlərinin hamısı faktiki sübutla tamamlandıqdan
sonra icraya keçir.

Pilot axını:

1. real müştəri RFQ yaradır;
2. real təchizatçı qiymətli və stoklu təklif verir;
3. kommersiya təklifi təsdiqlənir;
4. aşağı riskli nəzarət sifarişi yaradılır;
5. bank sənədi və ya production ödənişi faktiki əməliyyata bağlanır;
6. rezerv, alt-sifariş, göndəriş və təhvil tarixçəsi tamamlanır;
7. proforma/qaimə, təhvil aktı və audit jurnalı yoxlanılır.

## 6. Xarici provayderlər

Provider production açarları yalnız Vercel Environment Variables daxilində
saxlanılır. Endpoint və sirr cütü olmadan funksiya aktiv sayılmır.

- bank rekvizitləri və ya kart ödənişi;
- elektron qaimə;
- e-poçt və ya WhatsApp bildirişi;
- logistika göndərişi;
- GA4 Measurement Protocol və Search Console təsdiqi;
- ayrıca özəl backup kanalı.
