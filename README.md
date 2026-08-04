# ConstEra tikinti platforması

ConstEra Azərbaycan tikinti bazarı üçün material kataloqunu, xidmətləri, hazır paketləri, avadanlıq icarəsini, qiymət sorğularını və ilkin smetanı birləşdirən B2B platformadır. İctimai hissə sürətli statik sayt kimi `dist` qovluğuna ixrac olunur; istehsal məlumatları və giriş sistemi Vercel Functions + Neon PostgreSQL üzərində işləyir.

İctimai buraxılış rejimi **kataloq + RFQ** modelidir. Aktiv təchizatçı müqaviləsi, son 30 gündə təsdiqlənmiş AZN qiyməti, stok, HTTPS mənbə və hüquqlu media yoxlamasından keçməyən mövqe sorğu siyahısına əlavə edilir, lakin avtomatik rezerv, təchizatçı alt-sifarişi və satış `Offer` sxemi yaratmır.

## Hazırkı məlumat bazası

- 70 material kateqoriyası və Neon-da 702 subkateqoriya
- statik kataloqda 845, Neon production kataloqunda 827 aktiv məhsul kartı
- production bazasında 65 ilkin mənbəli təchizatçı təklifi və hər məhsul üçün çox təchizatçılı qiymət, stok, minimum sifariş müqayisəsi
- 12 xidmət kateqoriyası, 116 subkateqoriya və 125 xidmət
- 7 paket kateqoriyası və 80 hazır paket
- 15 icarə kateqoriyası və 115 avadanlıq mövqeyi
- yerli mənbələrdən 9 hazır tikinti-təmir paketi və 8 texnika icarəsi
- mənbəli qiymətlər və şəkillər üçün açıq məhsul keçidləri
- kataloq, ana səhifə, brend, paket və icarə bölmələrində mənbə keyfiyyətinə görə vahid prioritet sıralaması
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
- `tender.html` - rol əsaslı canlı tender, lot, dəvət və təchizatçı təklifi axını
- `ai-smeta.html` - qayda əsaslı ilkin material smetası və təsdiqli kataloq qiymətləri üzrə paket hesablaması
- `supplier-portal.html`, `price-import.html` - hesaba bağlı məhsul idarəetməsi və təhlükəsiz CSV/XLSX idxalı
- `customer-cabinet.html` - sorğu, smeta, seçilmiş və müqayisə məlumatları
- `checkout.html` - server qiymət yoxlaması, logistika tarifi və şirkətdaxili satınalma təsdiqi ilə səbət
- `admin.html` - məhsul, təchizatçı təklifi, logistika zonası, satınalma təsdiqi, sifariş və tender idarəetməsi
- `login.html` - HTTP-only sessiya ilə təhlükəsiz giriş və ilk administrator quraşdırması
- `contact.html` - CRM-də qeydə alınan açıq əlaqə və dəstək müraciəti
- `privacy.html`, `terms.html`, `delivery-returns.html` - məxfilik, istifadə və çatdırılma/qaytarma qaydaları

## Server imkanları

- `api/health.js` - API və PostgreSQL hazırlıq yoxlaması
- `api/auth.js` - ilk administrator, giriş, sessiya, təhlükəsiz şifrə bərpası və çıxış
- `api/catalog.js` - server axtarışı, facetlər və səhifələmə ilə ictimai kataloq API-si
- `api/admin.js?__route=orders` - müştəri və təchizatçı sərhədləri ilə sifariş axını
- `api/admin.js?__route=product-offers` - məhsul üzrə çox təchizatçılı qiymət, stok və təslimat təklifləri
- `api/admin.js?__route=logistics` - şəhər və zona üzrə serverdə hesablanan idarə olunan logistika tarifləri
- `api/admin.js?__route=procurement` - bir və ya çox qərarlı şirkətdaxili satınalma təsdiqi
- `api/products.js`, `api/suppliers.js` - təchizatçı mülkiyyəti ilə rolla qorunan CRUD əməliyyatları
- `api/rfqs.js`, `api/offers.js` - real qiymət sorğusu və təklif axını
- `api/admin.js?__route=tenders`, `api/admin.js?__route=tender-bids` - dəvətli və açıq tenderlər, lotlar və təkliflər
- `api/admin.js?__route=imports` - admin və təchizatçı sərhədləri ilə CSV/XLSX idxalı
- `api/admin.js?__route=cabinet` - layihə, smeta, seçilmişlər və müqayisə üçün server kabineti
- `api/admin.js?__route=inventory` - təchizatçı qiymət, stok və mənbə idarəetmə mərkəzi
- `api/admin.js?__route=fulfillments` - təchizatçı icrası, stok rezervi və çatdırılma mərhələləri
- `api/admin.js?__route=crm`, `api/admin.js?__route=rental-bookings` - CRM pipeline və tarix əsaslı icarə rezervasiyası
- `api/admin.js?__route=integrations` - kataloq qiymətli smeta, kart ödənişi, elektron qaimə və xarici AI adapterləri
- `api/admin.js?__route=backup` - şifrələri və həssas provider payload-larını daxil etməyən tam əməliyyat backup-u
- `api/admin.js?__route=contact` - spam limiti və versiyalanan hüquqi razılıqla CRM əlaqə müraciəti
- `api/sync.js` - statik kataloqun PostgreSQL bazasına kütləvi sinxronizasiyası
- `api/cron-price-freshness.js` - köhnə qiymətləri gündəlik işarələyən və sessiyaları təmizləyən cron
- `api/admin.js?__route=scheduled-backup` - gzip backup-ını qorunan HTTPS yaddaşa ötürən gündəlik cron
- `db/migrations/` - istifadəçi, şirkət, kataloq, qiymət tarixçəsi, RFQ, çox təchizatçılı təklif, logistika, satınalma və audit sxemi
- `service-worker.js` - API və şəxsi kabinetləri keşləməyən PWA tətbiq qabığı

Admin və təchizatçı panellərində lokal ehtiyat rejimi qalır. Baza əlçatan olduqda dəyişikliklər Neon-a yazılır və rollara uyğun server məlumatı göstərilir.

## Kod strukturu

- `assets/css/styles.css` - bütün səhifələrin responsiv görünüşü
- `assets/js/catalog-data.js` - əsas kataloq məlumatları
- `assets/js/taxonomy-expansion.js` - geniş material, xidmət, paket və icarə taksonomiyası
- `assets/js/azerbaijan-real-products.js` - açıq mənbələrdən yoxlanmış Azərbaycan bazarı məhsulları və mənbə keyfiyyəti sıralaması
- `assets/js/marketplace.js` - göstərmə, filtr, sorğu, smeta və lokal idarəetmə məntiqinin build mənbəyi; təchizatçı kabineti production build-də ayrıca yüngül bundle-a ayrılır
- `assets/js/production.js` - API, giriş, bulud sinxronizasiyası və RFQ server ötürməsi
- `assets/js/script.js` - ümumi naviqasiya, SEO, əlçatanlıq və əlaqə forması
- `templates/` - bütün səhifələr üçün vahid header, giriş header-i və footer şablonları
- `scripts/site-shell.mjs` - şablonları səhifəyə tətbiq edən build və lokal server renderer-i
- `scripts/audit-site.mjs` - səhifə, keçid, SEO, məlumat və SKU bütövlüyü auditi
- `scripts/vercel-build.mjs` - statik Vercel ixracı
- `tests/layout/` - bütün səhifələrin mobile və desktop ölçülərində Playwright layout testləri
- `npm run verify:deploy` - hər Vercel deploy-unda bir dəfə işləyən məcburi audit, API və sayt quality gate-i
- `.github/workflows/quality.yml` - hər push və pull request üçün audit, build və responsiv test quality gate-i
- `.github/workflows/production-monitor.yml` - `constera.az` üçün altı saatlıq smoke monitoru və avtomatik incident issue axını
- `docs/launch-evidence-checklist.md` - təchizatçı, media, logistika və ilk pilot sifariş üçün sübut paketi
- `docs/launch-runbook.md` - ilk real təchizatçı və sifariş pilotunun təhlükəsiz buraxılış ardıcıllığı

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

Layout testi 25 səhifəni mobile, `1100/1101 px` menyu sərhədi və desktop ölçülərində yoxlayır. GitHub Actions uğursuz yoxlamada Playwright hesabatını və nəzarət şəkillərini artifact kimi saxlayır.

Canlı production müqaviləsini lokal yoxlamaq üçün:

```bash
npm run check:production -- https://constera.az
```

## PostgreSQL quraşdırılması

1. Vercel Marketplace-dən Neon inteqrasiyasını layihəyə qoş.
2. Vercel-in yaratdığı `DATABASE_URL` dəyişənini lokal mühitə çək və `.env.example` əsasında `.env.local` hazırla.
3. Ən azı 32 simvolluq `ADMIN_SETUP_TOKEN` və ən azı 24 simvolluq `CRON_SECRET` yarat, Vercel Environment Variables bölməsinə əlavə et.
4. Miqrasiyaları və ilkin kataloq idxalını işə sal:

```bash
npm run db:migrate
npm run db:seed
npm run db:audit
npm run db:scan-quality
npm run db:smoke
```

Miqrator tətbiq edilmiş faylları `constera_schema_migrations` reyestrində checksum ilə saxlayır və hər yeni faylı ayrıca transaction-da icra edir. Köhnə, artıq qurulmuş bazaya reyestr ilk dəfə əlavə edilirsə, əvvəlcə sxemi yoxla və son tətbiq edilmiş faylı açıq baseline et; bu əməliyyat köhnə SQL-i yenidən icra etmir:

```bash
npm run db:migrate -- --baseline-through=026_supplier_launch_controls.sql --confirm-existing-schema --only=027_launch_operations.sql
```

AI Mərhələ 1 miqrasiyası yeni və artıq işləyən bazaya ayrıca tətbiq edilə bilər:

```bash
npm run db:migrate -- --only=028_ai_foundation.sql
```

Planı bazanı dəyişmədən görmək üçün eyni əmrə `--dry-run` əlavə et.

5. `login.html` səhifəsində “İlk super administratoru yarat” bölməsini bir dəfə doldur. İlk istifadəçi yarandıqdan sonra quraşdırma endpoint-i avtomatik bağlanır.

Şifrə bərpası məktubları üçün `EMAIL_WEBHOOK_URL` qurulmalıdır. Sistem bərpa açarını bazada yalnız heşlənmiş formada saxlayır, 30 dəqiqə sonra etibarsız edir və uğurlu dəyişiklikdən sonra bütün əvvəlki sessiyaları bağlayır. AI smeta üçün `OPENAI_API_KEY` yalnız server mühitində saxlanılır. `OPENAI_MODEL`, gündəlik/aylıq sorğu limitləri, token büdcəsi və saxlanma müddəti `.env.example` daxilində idarə olunur; xam sorğu bazaya yazılmır və hər AI nəticəsi istifadədən əvvəl insan təsdiqi gözləyir.

Gündəlik bulud backup-ı üçün `BACKUP_WEBHOOK_URL` və `BACKUP_WEBHOOK_SECRET` birlikdə qurulmalıdır. Endpoint gzip edilmiş JSON qəbul etməli və faylı özəl yaddaşda saxlamalıdır. Hər yoxlama backup-ı gzip round-trip, kolleksiya tipi, təkrarlanan ID və əsas referensial əlaqələr üzrə bərpa məşqindən keçirir. `MONITOR_ALERT_WEBHOOK_URL` və ən azı 24 simvolluq `MONITOR_ALERT_WEBHOOK_SECRET` qurulduqda gündəlik production monitor xətanı həmin kanala `production_monitor_failed` JSON hadisəsi kimi göndərir və yenə HTTP 500 qaytararaq Vercel cron-u uğursuz işarələyir. GitHub monitoru əlavə olaraq altı saatdan bir ictimai müqaviləni yoxlayır və nasazlıqda incident issue açır. Kart ödənişi, elektron qaimə və xarici AI smeta yalnız müvafiq HTTPS webhook və gizli açar cütü olduqda interfeysdə aktivləşir.

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

## Məlumat və məxfilik siyasəti

Təsdiqli qiymət yalnız mənbə URL-i və mənbə adı olan məhsulda göstərilir. Mənbə, hüquqlu foto, təsdiqli qiymət, yoxlama tarixi və rəsmi provayder statusu birlikdə məlumat keyfiyyəti balını yaradır; daha yüksək balı olan məhsul, paket və icarə mövqeləri standart olaraq əvvəl göstərilir. Xarici məhsul şəkli yalnız media kitabxanasında `own`, `supplier`, `official` və ya `licensed` hüququ ilə qeydə alındıqda ictimai API-yə çıxır.

Qiymət və stok sifarişdən əvvəl təchizatçı tərəfindən yenidən təsdiqlənməlidir. Mənbə fotosu brauzerdə açılmadıqda interfeys qırıq şəkil əvəzinə lokal əlçatan əvəzedici göstərir. Mənbəsiz mövqelər silinmir: gələcək təchizatçı məlumatı üçün taksonomiya strukturu kimi mənbəli nəticələrdən sonra saxlanılır.

Birinci tərəf istifadə analitikası yalnız ziyarətçi `Analitikaya icazə ver` seçdikdən sonra visitor/session identifikatoru yaradır. `Yalnız zəruri` rejimində giriş, səbət, təhlükəsizlik və məxfilik seçimi işləyir, analitika sorğusu göndərilmir. `GOOGLE_ANALYTICS_MEASUREMENT_ID` və `GOOGLE_ANALYTICS_API_SECRET` qurulduqda razılıqlı hadisələr şəxsi açarları brauzerə çıxarmadan GA4 Measurement Protocol-a ötürülür. `GOOGLE_SEARCH_CONSOLE_VERIFICATION` production build zamanı yalnız ana səhifəyə təhlükəsiz təsdiq meta-teqi əlavə edir; Merchant Center üçün mənbə `/api/merchant-feed`, sitemap isə `/sitemap.xml` ünvanındadır.

Onlayn kart ödənişi provayder müqaviləsi və açarları olmadan imitasiya edilmir. Adapter hazırdır, lakin kart seçimi yalnız `PAYMENT_WEBHOOK_URL` və `PAYMENT_WEBHOOK_SECRET` production mühitində düzgün qurulduqda aktiv olur.
