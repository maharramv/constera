# ConstEra tikinti platforması

ConstEra Azərbaycan tikinti bazarı üçün material kataloqunu, xidmətləri, hazır paketləri, avadanlıq icarəsini, qiymət sorğularını və ilkin smetanı birləşdirən statik B2B platformadır. Layihə asılılıqsız işləyir və Vercel üçün `dist` qovluğuna ixrac olunur.

## Hazırkı məlumat bazası

- 70 material kateqoriyası və 695 subkateqoriya
- 788 məhsul kartı
- 12 xidmət kateqoriyası, 116 subkateqoriya və 118 xidmət
- 7 paket kateqoriyası və 66 hazır paket
- 15 icarə kateqoriyası və 100 avadanlıq mövqeyi
- mənbəli qiymətlər və şəkillər üçün açıq məhsul keçidləri
- qiyməti təsdiqlənməyən mövqelər üçün `Sorğu əsasında` vəziyyəti

## Əsas səhifələr

- `index.html` - platformanın ana səhifəsi
- `catalog.html` - axtarış, filtr və mərhələli yükləmə ilə məhsul kataloqu
- `category.html`, `subcategory.html`, `product-detail.html` - material ağacı və məhsul detalları
- `services.html`, `service-detail.html` - tikinti, təmir, dizayn və mühəndis xidmətləri
- `packages.html`, `package-detail.html` - təmir, tikinti və tam açar təslim paketləri
- `rental.html`, `rental-detail.html` - ağır texnika və alət icarəsi
- `brands.html`, `suppliers.html` - brend və təchizatçı mərkəzləri
- `rfq.html`, `rfq-dashboard.html` - qiymət sorğusu və təklif axını
- `tender.html` - lokal tender və lot idarəetməsi
- `ai-smeta.html` - qayda əsaslı ilkin material smetası
- `supplier-portal.html`, `price-import.html` - təchizatçı məlumatı və CSV qiymət idxalı
- `customer-cabinet.html` - sorğu, smeta, seçilmiş və müqayisə məlumatları
- `admin.html` - kataloq və platforma məlumatlarının lokal idarəetməsi

## Kod strukturu

- `assets/css/styles.css` - bütün səhifələrin responsiv görünüşü
- `assets/js/catalog-data.js` - əsas kataloq məlumatları
- `assets/js/taxonomy-expansion.js` - geniş material, xidmət, paket və icarə taksonomiyası
- `assets/js/azerbaijan-real-products.js` - açıq mənbələrdən yoxlanmış Azərbaycan bazarı məhsulları
- `assets/js/marketplace.js` - göstərmə, filtr, sorğu, smeta və lokal idarəetmə məntiqi
- `assets/js/script.js` - ümumi naviqasiya, SEO, əlçatanlıq və əlaqə forması
- `scripts/audit-site.mjs` - səhifə, keçid, SEO, məlumat və SKU bütövlüyü auditi
- `scripts/vercel-build.mjs` - statik Vercel ixracı

## Lokal yoxlama

Tam audit, JavaScript sintaksis yoxlaması və build üçün:

```bash
npm run check
```

Yalnız build üçün:

```bash
npm run vercel-build
```

Hazır nəticə `dist` qovluğunda yaradılır.

## Vercel ayarları

- Framework Preset: `Other`
- Install Command: boş
- Build Command: `npm run vercel-build`
- Output Directory: `dist`

Bu ayarlar `vercel.json` daxilində də saxlanılır. `routes-manifest.json` tələb olunmur, çünki layihə Next.js deyil və statik ixrac kimi yerləşdirilir.

## Məlumat siyasəti

Təsdiqli qiymət yalnız mənbə URL-i və mənbə adı olan məhsulda göstərilir. Qiymət və stok sifarişdən əvvəl təchizatçı tərəfindən yenidən təsdiqlənməlidir. Mənbə fotosu brauzerdə açılmadıqda interfeys qırıq şəkil əvəzinə lokal əlçatan əvəzedici göstərir.
