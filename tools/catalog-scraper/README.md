# ConstEra Kataloq Toplayıcısı v4

Bu alət ELEM, TVIM, OMID və INSAAT.AZ səhifələrindən açıq kataloq
məlumatlarını yoxlama üçün vahid formata gətirir. Toplama nəticəsi heç vaxt
avtomatik olaraq canlı kataloqda yayımlanmır.

## Təhlükəsizlik prinsipləri

- yalnız `config/sources.json` daxilindəki HTTPS domenləri oxunur;
- hər sorğudan əvvəl `robots.txt` yoxlanılır;
- qiymət yalnız strukturlaşdırılmış məhsul qiyməti və ya AZN/₼ işarəli
  qiymət sahəsindən götürülür;
- mənbə URL-i və yoxlama vaxtı hər qeyddə saxlanılır;
- nəticələr əvvəlcə Neon yoxlama cədvəllərinə yazılır;
- şəkillər standart olaraq endirilmir və xarici şəkil avtomatik yayımlanmır.

## İşə salma

Konfiqurasiyanı və adapterləri şəbəkəyə çıxmadan yoxlamaq:

```bash
./run.sh --validate-config
```

Hər aktiv mənbədən ən çox 5 qeydlik təhlükəsiz smoke crawl:

```bash
./run.sh --max-items 5
```

Yalnız bir mənbəni toplamaq:

```bash
./run.sh --source omid --max-items 50
```

Tam limitlər `config/sources.json` faylında saxlanılır. Nəticələr
`data/output/`, xəta jurnalları isə `logs/` altında yaradılır.

## ConstEra-nın yoxlama sahəsinə idxal

Repo kökündən:

```bash
npm run db:import-scraper -- --file tools/catalog-scraper/data/output/constera-master-catalog.json
```

Bu əmr qeydləri `catalog_import_items` cədvəlinə `pending` statusu ilə yazır.
Admin təsdiqi olmadan `products` və `marketplace_entities` dəyişmir.

## Çıxışlar

- `constera-master-catalog.json`
- `constera-master-catalog.csv`
- `constera-master-catalog.xlsx`
- `products.json`, `services.json`, `rentals.json`, `packages.json`
- `manifest.json`
- `logs/errors.json`

Saytların istifadə şərtləri, müəllif hüquqları və şəkil istifadəsi hüquqları
ayrıca yoxlanmalıdır. Qiymət və stok sifarişdən əvvəl təchizatçı ilə yenidən
təsdiqlənməlidir.
