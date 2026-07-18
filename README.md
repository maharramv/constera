# ConstEra tikinti platforması

ConstEra Azərbaycan tikinti bazarı üçün material kataloqunu, xidmətləri, hazır paketləri, avadanlıq icarəsini, qiymət sorğularını və ilkin smetanı birləşdirən B2B platformadır. İctimai hissə sürətli statik sayt kimi `dist` qovluğuna ixrac olunur; istehsal məlumatları və giriş sistemi Vercel Functions + Neon PostgreSQL üzərində işləyir.

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
- `login.html` - HTTP-only sessiya ilə təhlükəsiz giriş və ilk administrator quraşdırması

## Server imkanları

- `api/health.js` - API və PostgreSQL hazırlıq yoxlaması
- `api/auth.js` - ilk administrator, giriş, sessiya və çıxış
- `api/catalog.js` - vahid ictimai kataloq oxuma API-si
- `api/products.js`, `api/suppliers.js` - rolla qorunan CRUD əməliyyatları
- `api/rfqs.js`, `api/offers.js` - real qiymət sorğusu və təklif axını
- `api/sync.js` - statik kataloqun PostgreSQL bazasına kütləvi sinxronizasiyası
- `api/cron-price-freshness.js` - köhnə qiymətləri gündəlik işarələyən və sessiyaları təmizləyən cron
- `db/migrations/` - istifadəçi, şirkət, kataloq, qiymət tarixçəsi, RFQ və audit sxemi

Admin panelində lokal ehtiyat rejimi qalır. Baza əlçatan olduqda “Bazaya yaz” və “Bazadan oxu” düymələri ilə bütün kataloq sinxronlaşdırılır.

## Kod strukturu

- `assets/css/styles.css` - bütün səhifələrin responsiv görünüşü
- `assets/js/catalog-data.js` - əsas kataloq məlumatları
- `assets/js/taxonomy-expansion.js` - geniş material, xidmət, paket və icarə taksonomiyası
- `assets/js/azerbaijan-real-products.js` - açıq mənbələrdən yoxlanmış Azərbaycan bazarı məhsulları
- `assets/js/marketplace.js` - göstərmə, filtr, sorğu, smeta və lokal idarəetmə məntiqi
- `assets/js/production.js` - API, giriş, bulud sinxronizasiyası və RFQ server ötürməsi
- `assets/js/script.js` - ümumi naviqasiya, SEO, əlçatanlıq və əlaqə forması
- `templates/` - bütün səhifələr üçün vahid header, giriş header-i və footer şablonları
- `scripts/site-shell.mjs` - şablonları səhifəyə tətbiq edən build və lokal server renderer-i
- `scripts/audit-site.mjs` - səhifə, keçid, SEO, məlumat və SKU bütövlüyü auditi
- `scripts/vercel-build.mjs` - statik Vercel ixracı
- `tests/layout/` - bütün səhifələrin mobile və desktop ölçülərində Playwright layout testləri
- `docs/quality-workflow.yml` - GitHub tokeninə `workflow` icazəsi verildikdən sonra `.github/workflows/quality.yml` yoluna köçürüləcək hazır CI audit və brauzer yoxlaması

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

Header və footer dəyişiklikləri ayrı-ayrı HTML fayllarında deyil, `templates/` qovluğunda edilməlidir. Lokal server və production build həmin şablonları avtomatik bütün səhifələrə tətbiq edir.

İlk browser yoxlamasından əvvəl Chromium-u quraşdır:

```bash
npx playwright install chromium
```

Sonra bütün audit, build və layout testlərini bir əmrlə işə sal:

```bash
npm run check:full
```

Layout testi 22 səhifəni mobile, `1100/1101 px` menyu sərhədi və desktop ölçülərində yoxlayır. `docs/quality-workflow.yml` şablonu `.github/workflows/quality.yml` yoluna qoşulduqda GitHub Actions nəticəyə Playwright hesabatı və nəzarət şəkilləri əlavə edir.

## PostgreSQL quraşdırılması

1. Vercel Marketplace-dən Neon inteqrasiyasını layihəyə qoş.
2. Vercel-in yaratdığı `DATABASE_URL` dəyişənini lokal mühitə çək və `.env.example` əsasında `.env.local` hazırla.
3. Ən azı 32 simvolluq `ADMIN_SETUP_TOKEN` və ən azı 24 simvolluq `CRON_SECRET` yarat, Vercel Environment Variables bölməsinə əlavə et.
4. Miqrasiyaları və ilkin kataloq idxalını işə sal:

```bash
npm run db:migrate
npm run db:seed
```

5. `login.html` səhifəsində “İlk super administratoru yarat” bölməsini bir dəfə doldur. İlk istifadəçi yarandıqdan sonra quraşdırma endpoint-i avtomatik bağlanır.

Alternativ olaraq lokal terminaldan administrator yaratmaq olar:

```bash
ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="cox-guclu-sifre-2026" npm run db:create-admin
```

Şifrə ən azı 12 simvol olmalıdır. Real şifrə və tokenlər repozitoriyaya əlavə edilməməlidir.

## Vercel ayarları

- Framework Preset: `Other`
- Install Command: `npm ci`
- Build Command: `npm run vercel-build`
- Output Directory: `dist`

Bu ayarlar `vercel.json` daxilində də saxlanılır. `routes-manifest.json` tələb olunmur, çünki layihə Next.js deyil. Statik fayllar `dist` qovluğundan, server endpoint-ləri isə kök `api/` qovluğundan yerləşdirilir.

## Məlumat siyasəti

Təsdiqli qiymət yalnız mənbə URL-i və mənbə adı olan məhsulda göstərilir. Qiymət və stok sifarişdən əvvəl təchizatçı tərəfindən yenidən təsdiqlənməlidir. Mənbə fotosu brauzerdə açılmadıqda interfeys qırıq şəkil əvəzinə lokal əlçatan əvəzedici göstərir.
