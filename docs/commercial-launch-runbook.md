# ConstEra kommersiya buraxılışı

Bu sənəd qapalı B2B pilotundan kommersiya buraxılışına keçid üçün vahid əməliyyat qaydasıdır.

## Buraxılış hədəfi

- 3 tam qoşulmuş təchizatçı
- 100 satışa tam hazır məhsul
- Son 90 gündə real RFQ və ya sifariş fəaliyyəti olan 10 pilot müştəri
- 1 uğurla tamamlanmış pilot sifarişi

## Dəyişməz qaydalar

- Qiymət yalnız mənbə və yoxlama tarixi ilə təsdiqlənir.
- Stok yalnız təchizatçı və ya anbar məlumatı ilə satışa açılır.
- Məhsul şəkli yalnız təsdiqlənmiş istifadə hüququ ilə yayımlanır.
- Aktiv hüquqi müqaviləsi olmayan təchizatçı üçün rezerv və alt-sifariş yaradılmır.
- Hazır olmayan məhsul “sorğu əsasında” rejimində qalır.
- İdarəetmə hesablarında 2FA tamamlanmadan kritik yazma əməliyyatı aparılmır.

## Mərhələlər

### 1. Təməl

- Administrator 2FA nəzarətini tamamla.
- Son 7 günə aid backup və bərpa yoxlamasını təsdiqlə.
- Production monitorunun xarici xəbərdarlıq kanalını yoxla.
- Açıq yüksək riskli təhlükəsizlik hadisələrini bağla.

### 2. Təchizatçı pilotu

Hər təchizatçı üçün şirkət və VÖEN, rəsmi əlaqə, aktiv supplier hesabı, hüquqi müqavilə, aktual təklif və media hüququ tamamlanmalıdır.

### 3. Assortiment

100 məhsulun hər birində aktiv təklif, 30 gündən yeni qiymət, AZN valyutası, müsbət stok, HTTPS mənbə və hüququ təsdiqli əsas şəkil olmalıdır.

### 4. Müştəri pilotu

Pilot müştərilər `pilot-customers.csv` şablonu ilə qeyd olunur. Müştərinin əlaqə razılığı və real layihə ehtiyacı təsdiqlənmədən kommersiya mesajı göndərilmir.

### 5. İlk sifariş

RFQ, kommersiya təklifi, təsdiq, sifariş, ödəniş statusu, logistika, qaimə və təhvil sübutu eyni audit zəncirində saxlanmalıdır.

## GO qərarı

`GO-LIVE` yalnız bütün dörd hədəf və bütün məcburi nəzarətlər tamamlandıqda verilir. `PILOT` statusu məhdud real sınağa icazə verir. `NO-GO` zamanı ictimai RFQ işləyə bilər, lakin sistem hazır olmayan təklif üçün stok rezervi və təchizatçı alt-sifarişi yaratmır.

## Gündəlik nəzarət

1. Buraxılış Mərkəzində gündəlik yoxlamaları işə sal.
2. Köhnələn qiymətləri və stokları təchizatçı ilə təsdiqlə.
3. Media hüququ və müqavilə növbəsini yoxla.
4. Pilot müştəri RFQ-lərinə cavab müddətini ölç.
5. Sonda plan və assortiment CSV hesabatlarını arxivlə.
