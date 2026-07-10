# CONSTERA Industrial Group

GitHub Pages və Vercel üçün hazırlanmış statik korporativ sayt konsepti.

## Struktur

- `index.html` - əsas səhifə
- `catalog.html` - ConstEra Korporativ v2 kataloqu
- `category.html` - kateqoriya landing səhifəsi
- `subcategory.html` - subkateqoriya landing səhifəsi
- `product-detail.html` - məhsul detal səhifəsi
- `services.html` - tikinti, təmir, dizayn və usta xidmətləri
- `service-detail.html` - xidmət detal səhifəsi
- `packages.html` - hazır təmir, tikinti və full paket kataloqu
- `package-detail.html` - hazır paket detal səhifəsi
- `rental.html` - tikinti avadanlığı və alət icarəsi
- `rental-detail.html` - icarə avadanlığı detal səhifəsi
- `brands.html` - brend mərkəzi
- `suppliers.html` - təchizatçı mərkəzi
- `rfq.html` - lokal RFQ draft axını
- `rfq-dashboard.html` - lokal RFQ dashboard və status paneli
- `admin.html` - kataloq və admin struktur önbaxışı
- `assets/css/` - stillər
- `assets/js/` - skriptlər
- `assets/js/catalog-data.js` - başlanğıc bazar platforması məlumatları
- `assets/js/taxonomy-expansion.js` - geniş kateqoriya/subkateqoriya xəritəsi və RFQ-ready seed məlumatları
- `assets/js/marketplace.js` - kataloq, RFQ və admin render məntiqi
- `assets/images/` - kontent şəkilləri və logo
- `assets/icons/` - favicon dəsti və manifest

## Lokal işə salma

`index.html` faylını brauzerdə açın və ya qovluğu istənilən statik serverlə servis edin.

## Vercel deploy

Bu statik saytdır. Vercel aşağıdakı əmri işə sala bilər:

```bash
npm run vercel-build
```

Əmr tələb olunan statik səhifə və asset fayllarını yoxlayır, sonra deploy üçün hazır saytı `dist` qovluğuna köçürür.

## ConstEra Korporativ v2

Hazırkı mərhələ layihəni statik və asılılıqsız saxlayır, eyni zamanda ilk B2B bazar platforması qatını əlavə edir:

- 35 material kateqoriyası və 360 material subkateqoriyası olan geniş tikinti taksonomiyası
- material qrupları üzrə bölünmüş katalog: konstruksiya, quru qarışıqlar, kimya, fasad, elektrik, HVAC, santexnika, interyer, enerji, anbar və ərazi sistemləri
- RFQ-ready məhsul qrupları: canlı təchizatçı qiyməti təsdiqlənənə qədər `Sorğu əsasında` saxlanılır
- qrup, kateqoriya, subkateqoriya, brend, mənşə, qiymət statusu və mövcudluq üzrə ağıllı filtr paneli
- material, xidmət, paket və icarə üçün parametrli kateqoriya/subkateqoriya landing səhifələri
- tikinti, təmir, dizayn, mühəndis sistemləri, tamamlama, fasad və audit üçün kateqoriya/subkateqoriya xidmət bazası
- 12 xidmət kateqoriyası və 116 xidmət subkateqoriyası
- hazır təmir, hazır tikinti, full tikinti+təmir, mühəndis və servis paketləri üçün 66 paketlik baza
- ağır texnika, ölçmə cihazları, söküntü, metal emalı, sahə təhlükəsizliyi və təmir alətləri üzrə 100 icarə kartı
- məhsul, paket, xidmət və icarə üçün parametrli detal səhifələri
- paket, xidmət həcmi və icarə müddəti üçün ilkin hesablayıcı panellər
- tarix, büdcə, çatdırılma/operator və istifadə məqsədi sahələri ilə genişləndirilmiş RFQ draftı
- RFQ draftlarının lokal dashboard-u və status axını: Yeni, Cavab gözləyir, Təklif gəldi, Bağlandı
- təchizatçı və brend profilləri
- SKU, qablaşdırma, mənşə, vəziyyət və qiymət qeydləri olan məhsul kartları
- brauzerdə lokal seçilmişlər və müqayisə işarələri
- RFQ draft forması
- Vercel üçün statik-safe əlaqə draft forması
- gələcək CRUD və CSV/Excel idxalı üçün admin struktur önbaxışı

`Sorğu əsasında` kimi göstərilən qiymətlər ictimai istifadədən əvvəl təchizatçı tərəfindən təsdiqlənməlidir. İctimai kataloq səhifələri məhsul adı, qablaşdırma, texniki xüsusiyyət, mənbə linki və rəsmi məhsul şəkilləri üçün istifadə olunur. Rəsmi səhifədə qiymət yoxdursa, təchizatçı qiymət siyahısı admin/idxal axınına əlavə olunana qədər məhsul sorğu əsaslı qalır.
