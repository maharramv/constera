# CONSTERA Industrial Group

GitHub Pages və Vercel üçün hazırlanmış statik korporativ sayt konsepti.

## Struktur

- `index.html` - əsas səhifə
- `catalog.html` - ConstEra Korporativ v2 kataloqu
- `services.html` - tikinti, təmir, dizayn və usta xidmətləri
- `rental.html` - tikinti avadanlığı və alət icarəsi
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
- tikinti, təmir, dizayn, smeta və usta xidmətləri üçün ayrıca xidmət bazası
- ağır texnika, sahə avadanlığı və təmir alətləri üçün ayrıca icarə bazası
- təchizatçı və brend profilləri
- SKU, qablaşdırma, mənşə, vəziyyət və qiymət qeydləri olan məhsul kartları
- brauzerdə lokal seçilmişlər və müqayisə işarələri
- RFQ draft forması
- Vercel üçün statik-safe əlaqə draft forması
- gələcək CRUD və CSV/Excel idxalı üçün admin struktur önbaxışı

`Sorğu əsasında` kimi göstərilən qiymətlər ictimai istifadədən əvvəl təchizatçı tərəfindən təsdiqlənməlidir. İctimai kataloq səhifələri məhsul adı, qablaşdırma, texniki xüsusiyyət, mənbə linki və rəsmi məhsul şəkilləri üçün istifadə olunur. Rəsmi səhifədə qiymət yoxdursa, təchizatçı qiymət siyahısı admin/idxal axınına əlavə olunana qədər məhsul sorğu əsaslı qalır.
