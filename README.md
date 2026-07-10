# CONSTERA Industrial Group

GitHub Pages və Vercel üçün hazırlanmış statik korporativ sayt konsepti.

## Struktur

- `index.html` - əsas səhifə
- `catalog.html` - ConstEra Korporativ v2 kataloqu
- `product-detail.html` - məhsul detal səhifəsi
- `services.html` - tikinti, təmir, dizayn və usta xidmətləri
- `service-detail.html` - xidmət detal səhifəsi
- `rental.html` - tikinti avadanlığı və alət icarəsi
- `rental-detail.html` - icarə avadanlığı detal səhifəsi
- `brands.html` - brend mərkəzi
- `suppliers.html` - təchizatçı mərkəzi
- `rfq.html` - lokal RFQ draft axını
- `admin.html` - kataloq və admin struktur önbaxışı
- `assets/css/` - stillər
- `assets/js/` - skriptlər
- `assets/js/catalog-data.js` - başlanğıc bazar platforması məlumatları
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

- tikinti kateqoriyaları və subkateqoriyaları
- tikinti, təmir, dizayn, mühəndis sistemləri, tamamlama, fasad və audit üçün kateqoriya/subkateqoriya xidmət bazası
- ağır texnika, torpaq/yol texnikası, beton avadanlığı, hündürlük sistemləri, sahə avadanlığı və təmir alətləri üçün kateqoriya/subkateqoriya icarə bazası
- məhsul, xidmət və icarə üçün parametrli detal səhifələri
- xidmət həcmi və icarə müddəti üçün ilkin hesablayıcı panellər
- tarix, büdcə, çatdırılma/operator və istifadə məqsədi sahələri ilə genişləndirilmiş RFQ draftı
- təchizatçı və brend profilləri
- SKU, qablaşdırma, mənşə, vəziyyət və qiymət qeydləri olan məhsul kartları
- brauzerdə lokal seçilmişlər və müqayisə işarələri
- RFQ draft forması
- Vercel üçün statik-safe əlaqə draft forması
- gələcək CRUD və CSV/Excel idxalı üçün admin struktur önbaxışı

`Sorğu əsasında` kimi göstərilən qiymətlər ictimai istifadədən əvvəl təchizatçı tərəfindən təsdiqlənməlidir. İctimai kataloq səhifələri məhsul adı, qablaşdırma, texniki xüsusiyyət, mənbə linki və rəsmi məhsul şəkilləri üçün istifadə olunur. Rəsmi səhifədə qiymət yoxdursa, təchizatçı qiymət siyahısı admin/idxal axınına əlavə olunana qədər məhsul sorğu əsaslı qalır.
