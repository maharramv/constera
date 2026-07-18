(function enrichConsteraAzerbaijanMarketData() {
  const data = window.CONSTERA_MARKETPLACE;
  if (!data) return;

  const slugify = (value) => String(value || "")
    .toLowerCase()
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const mergeCategories = (key, additions) => {
    data[key] = data[key] || [];
    additions.forEach((addition) => {
      const existing = data[key].find((item) => item.id === addition.id);
      if (existing) {
        existing.group = addition.group || existing.group || "Ümumi";
        existing.title = addition.title || existing.title;
        existing.subtitle = addition.subtitle || existing.subtitle;
        existing.subcategories = [
          ...new Set([...(existing.subcategories || []), ...(addition.subcategories || [])])
        ];
        return;
      }
      data[key].push({ ...addition, group: addition.group || "Ümumi" });
    });
  };

  const appendUnique = (key, additions, idKey = "id") => {
    data[key] = data[key] || [];
    const existingIds = new Set(data[key].map((item) => item[idKey]));
    additions.forEach((item) => {
      if (!existingIds.has(item[idKey])) {
        data[key].push(item);
        existingIds.add(item[idKey]);
      }
    });
  };

  const marketCategories = [
    { id: "drywall-ceilings", group: "Tamamlama və dekor", subcategories: ["Sement əsaslı lövhə"] },
    { id: "facade-systems", group: "Dam və fasad", subcategories: ["Fasad lövhəsi", "Fibrosement lövhə"] },
    { id: "tools", group: "Alətlər və sərfiyyat", subcategories: ["Drel və şurupbağlayan", "Perforator", "Elektrik mişarı", "Lobzik", "Cilalama maşını", "Kafel kəsici", "Boya püskürdücü", "İnşaat feni", "Neyler və stepler", "Qayka açan", "Açar dəsti", "Lehim aparatı", "Qaynaq avadanlığı", "Renovator"] },
    { id: "electrical", group: "Elektrik və zəif axın", subcategories: ["Rozetka və açarlar", "Uzadıcı və baraban", "Elektrik çəngəl", "Montaj kabeli", "CCTV kabel", "Şəbəkə kabeli", "Paylama bloku", "Rele və avtomatika", "Multimetr", "Gərginlik göstəricisi", "Elektrik qutusu", "Xamut və qövs"] },
    { id: "lighting", group: "Elektrik və zəif axın", subcategories: ["LED lampa", "LED lent", "LED projektor", "Spot işıq", "Trek işıq", "Divar lampası", "Günəş lampası", "Küçə çırağı", "Tavan paneli", "Fasad işığı"] },
    { id: "sanitary-ware", group: "Santexnika və su sistemləri", subcategories: ["Mətbəx çanağı", "Suqarışdırıcı", "Duş qarnituru", "Unitaz", "Lavabo və çanaq", "Hamam mebeli", "Vanna", "Sifon və drenaj", "Duş şlanqı", "Gigiyenik duş", "Asma çən", "Lyuk qapağı"] },
    { id: "paints", group: "Tamamlama və dekor", subcategories: ["Sprey astar", "Sprey lak", "Taxta lakı", "Boya təmizləyici", "Boya bərpa emalı", "Interyer boya", "Eksteryer boya", "Metal boya"] },
    { id: "flooring", group: "Döşəmə və üzlük", subcategories: ["Keramoqranit", "Kafel", "Mozaika", "Laminat yapışqanı", "Linoleum", "Döşəmə yaşmağı", "Kompozit döşəmə", "Divar paneli"] },
    { id: "wall-decor", group: "Tamamlama və dekor", title: "Oboy və divar dekoru", subtitle: "Oboy, foto oboy, divar paneli, maye oboy və dekor plyonkaları", subcategories: ["Flizelin oboy", "Vinil oboy", "Foto oboy", "Maye oboy", "Dekorativ divar paneli", "Yapışqan plyonka", "Oboy yapışqanı", "Mərmər effektli panel"] },
    { id: "professional-lighting", group: "Elektrik və zəif axın", title: "Peşəkar işıqlandırma", subtitle: "Obyekt, fasad, bağ və kommersiya işıqlandırması", subcategories: ["Magistral trek", "COB spot", "Neon lent", "Sənaye projektoru", "Sensorlu LED", "Avariyalı işıq", "Bağ işığı", "Günəş enerjili küçə çırağı"] },
    { id: "measuring-surveying", group: "Alətlər və sərfiyyat", title: "Ölçmə və geodeziya", subtitle: "Lazer səviyyə, ölçü cihazları və obyekt nəzarət avadanlığı", subcategories: ["Lazer nivelir", "4D lazer", "Məsafəölçən", "Nəm ölçən", "Termal kamera", "Multimetr", "Kabel tester", "İndikator vintaçan"] },
    { id: "welding-cutting", group: "Metal və konstruksiya", title: "Qaynaq və kəsmə", subtitle: "Qaynaq, metal kəsmə, boru emalı və montaj avadanlığı", subcategories: ["MIG/MMA qaynaq", "TIG qaynaq", "Plazma kəsmə", "Maqnit drel", "Profil kəsən", "Boru bükən", "Qaynaq maskası", "Elektrod və tel"] },
    { id: "formwork-scaffolding", group: "Konstruksiya və daşıyıcı sistem", title: "Qəlib və iskele sistemləri", subtitle: "Monolit işlər, iskele, dayaq və təhlükəsiz iş platformaları", subcategories: ["Panel qəlib", "Kolon qəlibi", "Tavan qəlibi", "Teleskopik dayaq", "H tip iskele", "Mobil iskele", "Qəlib faneri", "Qəlib yağı"] },
    { id: "site-infrastructure", group: "Sahə və infrastruktur", title: "Tikinti sahəsi infrastrukturu", subtitle: "Müvəqqəti ofis, sahə elektrik, su və təhlükəsizlik infrastrukturu", subcategories: ["Sahə konteyneri", "Müvəqqəti elektrik", "Sahə işıqlandırması", "Su xətti", "Mühafizə hasarı", "Sahə lövhəsi", "Tullantı konteyneri", "Sahə interneti"] },
    { id: "fire-protection", group: "Təhlükəsizlik və mühafizə", title: "Yanğın təhlükəsizliyi", subtitle: "Aktiv və passiv yanğın mühafizəsi materialları", subcategories: ["Yanğınsöndürən", "Yanğın şkafı", "Sprinkler", "Hidrant", "Yanğın detektoru", "Yanğın kabeli", "Yanğın mastiki", "Tüstü çıxarma"] },
    { id: "glass-aluminium", group: "Qapı, pəncərə və şüşə", title: "Şüşə və alüminium sistemləri", subtitle: "Vitraj, fasad, ofis arakəsməsi və aksesuarlar", subcategories: ["Alüminium profil", "Vitraj sistem", "Temperli şüşə", "Laminə şüşə", "Şüşə arakəsmə", "Sürüşmə qapı", "Şüşə furnitura", "Silikon və fitil"] },
    { id: "industrial-consumables", group: "Alətlər və sərfiyyat", title: "Sənaye sərfiyyatları", subtitle: "Usta və obyekt üçün gündəlik sərfiyyat materialları", subcategories: ["Disk və daşlama", "Burğu", "Mişar ucu", "Silikon başlığı", "Maskalama lenti", "Qoruyucu örtük", "Süpürgə və mop", "Tullantı torbası"] },
    { id: "building-hardware", group: "Bərkidici və furnitura", title: "Furnitura və xırda aksesuar", subtitle: "Qapı, mebel, dolab və obyekt aksesuarları", subcategories: ["Qıfıl", "Silindr", "Tutacaq", "Mebel kilidi", "Maqnit tutucu", "Kronşteyn", "Asma kilid", "Çəkməcə mexanizmi"] },
    { id: "ventilation-accessories", group: "HVAC və iqlim", title: "Ventilyasiya aksesuarları", subtitle: "Hava kanalı, diffuzor və obyekt iqlim aksesuarları", subcategories: ["Spiral kanal", "Fleks kanal", "Diffuzor", "Anemostat", "Səsboğucu", "Filtr", "Klapana", "Kanal fanı"] },
    { id: "site-safety-ppe", group: "Təhlükəsizlik və mühafizə", title: "PPE və sahə təhlükəsizliyi", subtitle: "Usta və sahə komandaları üçün fərdi mühafizə", subcategories: ["Kaska", "Eynək", "Əlcək", "Respirator", "Jilet", "İş ayaqqabısı", "Düşmə kəməri", "Təhlükəsizlik toru"] },
    { id: "garden-irrigation", group: "Ərazi və landşaft", title: "Bağ və suvarma", subtitle: "Həyət, bağ, landşaft və avtomatik suvarma materialları", subcategories: ["Damcı suvarma", "Çiləyici", "Bağ nasosu", "Bağ işığı", "Günəş enerjili bağ lampası", "Drenaj borusu", "Süni ot", "Bordür"] },
    { id: "bath-kitchen-accessories", group: "Santexnika və su sistemləri", title: "Hamam və mətbəx aksesuarları", subtitle: "Kran, şlanq, sifon, güzgü və mətbəx aksesuarları", subcategories: ["Aerator", "Duş başlığı", "Duş şlanqı", "Mətbəx quruducu", "Hamam güzgüsü", "Bide kranı", "Sifon", "Tros"] },
    { id: "repair-retail-items", group: "Tamamlama və dekor", title: "Təmir üçün pərakəndə məhsullar", subtitle: "Kiçik təmir, ev ustası və obyekt tamamlaması üçün hazır məhsullar", subcategories: ["Kiçik boya", "Aerozol astar", "Oboy yapışqanı", "Divar paneli", "Yapışqan plyonka", "LED lampa", "Rozetka", "Kran aksesuarı"] },
    { id: "concrete-equipment", group: "Konstruksiya və daşıyıcı sistem", title: "Beton avadanlığı və sərfiyyatı", subtitle: "Beton tökmə, sıxlaşdırma, kəsmə və səth emalı avadanlığı", subcategories: ["Beton vibratoru", "Beton nasosu aksesuarı", "Beton kəsici", "Beton cilalayıcı", "Helikopter mala", "Beton qəlib sərfiyyatı", "Səth möhkəmləndirici", "Kür materialı"] },
    { id: "tile-stone-systems", group: "Döşəmə və üzlük", title: "Kafel, daş və üzlük sistemləri", subtitle: "Kafel, keramoqranit, təbii daş, profil və üzlük aksesuarları", subcategories: ["Kafel profil", "Künc profil", "Plitə daşıyıcı klips", "Təbii daş", "Mərmər yapışdırıcı", "Daş qoruyucu", "Kafel səviyyələyici", "Mozaika profili"] },
    { id: "roof-drainage", group: "Dam və fasad", title: "Dam drenajı və yağış sistemi", subtitle: "Oluk, boru, süzgəc, dam keçidi və drenaj elementləri", subcategories: ["Oluk", "Yağış borusu", "Dam süzgəci", "Baca keçidi", "Dam ventilyasiyası", "Karniz aksesuarı", "Qar tutucu", "Dam təhlükəsizlik xətti"] },
    { id: "facade-fastening", group: "Dam və fasad", title: "Fasad bərkidici və aksesuarları", subtitle: "Ventfasad, termo fasad və daş fasad üçün bərkidici sistemlər", subcategories: ["Fasad kronşteyni", "Fasad ankəri", "Termo dübel", "Fasad setkası", "Start profil", "Damlalı profil", "Kompozit kaset", "Fasad membranı"] },
    { id: "mep-consumables", group: "MEP və mühəndis sistemləri", title: "MEP sərfiyyatları", subtitle: "Elektrik, santexnika, HVAC və zəif axın montaj sərfiyyatları", subcategories: ["Kabel bağı", "Boru qısqacı", "Kanal asqısı", "İzolyasiya lentləri", "Sızdırmazlıq halqası", "Konnektor", "Montaj relsi", "Etiket və marker"] },
    { id: "water-treatment", group: "Santexnika və su sistemləri", title: "Su təmizləmə və filtrasiya", subtitle: "Məişət və obyektlər üçün filtrasiya, yumşaltma və təmiz su sistemləri", subcategories: ["Mexaniki filtr", "Karbon filtr", "Su yumşaldıcı", "RO sistem", "UV sterilizator", "Filtr kartuşu", "Manometr", "Filtr korpusu"] },
    { id: "drainage-sewer", group: "Santexnika və su sistemləri", title: "Kanalizasiya və drenaj", subtitle: "Kanalizasiya, drenaj xətti, trap və yağış suyu sistemləri", subcategories: ["Kanalizasiya borusu", "Drenaj borusu", "Trap", "Reviziya qapağı", "Yağ tutucu", "Septik aksesuarı", "Drenaj quyusu", "Kollektor quyusu"] },
    { id: "industrial-flooring", group: "Döşəmə və üzlük", title: "Sənaye döşəmə sistemləri", subtitle: "Epoksi, poliuretan, beton və anbar döşəmə həlləri", subcategories: ["Epoksi primer", "Epoksi boya", "PU örtük", "Antistatik döşəmə", "Döşəmə cilası", "Dilatasiya profili", "Sənaye süpürgəliyi", "Forklift izi qoruyucu"] },
    { id: "acoustic-systems", group: "İzolyasiya və membran", title: "Akustik sistemlər", subtitle: "Səs izolyasiyası, akustik panel və texniki otaq həlləri", subcategories: ["Akustik panel", "Səs baryeri", "Akustik tavan", "Akustik keçə", "Vibrasiya yastığı", "Texniki otaq izolyasiyası", "Studiya paneli", "Səs udan membran"] },
    { id: "heavy-equipment-parts", group: "Ağır texnika və avadanlıq", title: "Ağır texnika ehtiyat hissələri", subtitle: "Ekskavator, yükləyici, generator və kompressor üçün sərfiyyat və hissələr", subcategories: ["Hidravlik şlanq", "Kova dişi", "Filtr dəsti", "Yağ və sürtkü", "Təkər və palet", "Generator filtri", "Kompressor yağı", "Operator aksesuarı"] },
    { id: "site-office", group: "Sahə və infrastruktur", title: "Sahə ofisi və mobil modul", subtitle: "Tikinti sahəsi üçün mobil ofis, sanitar və yaşayış modulları", subcategories: ["Ofis konteyneri", "Sanitar konteyner", "Mühafizə köşkü", "Yeməkxana modulu", "Soyunma otağı", "Mobil anbar", "Kondisioner modulu", "Mebel dəsti"] },
    { id: "warehouse-racking", group: "Anbar və logistika avadanlığı", title: "Anbar rəfləri və saxlanma", subtitle: "Palet rəfi, konsol rəfi, arxiv və material saxlanma sistemləri", subcategories: ["Palet rəfi", "Konsol rəfi", "Arxiv rəfi", "Ağır yük rəfi", "Rəf qoruyucu", "Palet arabası", "Transpalet", "Anbar nişanlama"] },
    { id: "packaging-site-logistics", group: "Anbar və logistika avadanlığı", title: "Qablaşdırma və sahə logistikası", subtitle: "Material daşınması, qablaşdırma və obyekt içi logistika məhsulları", subcategories: ["Stretch film", "Bağlama lenti", "Karton künclük", "Palet", "Material arabası", "Yük qayışı", "Etiket", "Konteyner plombu"] },
    { id: "certified-materials", group: "Sertifikat və keyfiyyət", title: "Sertifikatlı materiallar", subtitle: "CE, ISO, yanğın və gigiyena sənədi tələb olunan məhsul qrupları", subcategories: ["CE sertifikatlı", "ISO sənədli", "MSDS tələbli", "Yanğın sertifikatlı", "Gigiyena sertifikatı", "Test protokolu", "Texniki pasport", "Zəmanət sənədi"] },
    { id: "green-building", group: "Yaşıl tikinti", title: "Yaşıl tikinti materialları", subtitle: "Enerji səmərəliliyi, ekoloji material və dayanıqlı tikinti həlləri", subcategories: ["Aşağı VOC tərkibli boya", "Enerji səmərəli izolyasiya", "Su qənaətli kran", "LED qənaət", "Təkrar material", "Günəş enerjisi aksesuarı", "Yaşıl dam", "Ekoloji sertifikat"] },
    { id: "smart-building", group: "Elektrik və zəif axın", title: "Ağıllı bina sistemləri", subtitle: "BMS, sensor, monitorinq və avtomatlaşdırma üçün məhsullar", subcategories: ["BMS sensor", "Enerji sayğacı", "Ağıllı termostat", "CO2 sensoru", "Su sızma sensoru", "KNX modulu", "IoT şlüzü", "Monitorinq paneli"] },
    { id: "security-access", group: "Təhlükəsizlik və mühafizə", title: "Mühafizə və giriş nəzarəti", subtitle: "CCTV, girişə nəzarət, turniket və obyekt təhlükəsizliyi", subcategories: ["IP kamera", "NVR", "Giriş nəzarəti idarəedicisi", "Kart oxuyucu", "Elektromaqnit kilid", "Turniket", "Mühafizə dirəyi", "Həyəcan sensoru"] },
    { id: "cleanroom-medical-fitout", group: "Xüsusi obyektlər", title: "Klinika və təmiz otaq tamamlanması", subtitle: "Tibbi, laboratoriya və təmiz otaq materialları", subcategories: ["Antibakterial panel", "Təmiz otaq qapısı", "Vinil tibbi döşəmə", "HEPA filtr", "Laboratoriya mebeli", "Hermetik lampa", "Antistatik örtük", "Tibbi qaz aksesuarı"] },
    { id: "hospitality-fitout", group: "Xüsusi obyektlər", title: "Hotel və restoran tamamlanması", subtitle: "Hotel və restoran obyektləri üçün tamamlama, mebel və mühəndis materialları", subcategories: ["Peşəkar mətbəx", "Bar paneli", "Yanğına davamlı qapı", "Akustik tavan", "Nəmə davamlı boya", "Dekorativ işıq", "Mebel furniturası", "Sanitar aksesuar"] },
    { id: "education-public-buildings", group: "Xüsusi obyektlər", title: "Təhsil və ictimai bina materialları", subtitle: "Məktəb, bağça, ofis və ictimai obyektlər üçün davamlı materiallar", subcategories: ["Sürüşməyə qarşı döşəmə", "Zərbəyə davamlı panel", "Sinif mebeli", "Sanitar kabin", "Avariyalı işıq", "Evakuasiya nişanı", "Akustik panel", "Uşaq təhlükəsizliyi"] }
  ];

  mergeCategories("categories", marketCategories);

  const birmarketRows = [
  [
    "1471534",
    "Drel-şrupbağlayan 0002332, 36 V",
    "Brendsiz",
    99,
    "https://strgimgr.umico.az/img/product/280/9e2d4aa6-cd5b-4aeb-bd1f-ce70f65eb682.jpeg",
    "https://birmarket.az/product/1471534-drel-shrupbaglayan-dewalt-36v-ez00002332",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1038002",
    "Avtomobil üçün alətlər dəsti New Tools, 46 parça",
    "Brendsiz",
    5.99,
    "https://strgimgr.umico.az/img/product/280/97aa658f-2b87-4f12-8a1c-a52d8095bcad.jpeg",
    "https://birmarket.az/product/1038002-avtomobil-uchun-aletler-desti-46-1-keysde",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1227626",
    "Avtomobil üçün açar dəsti HE00058, 46 parça",
    "Brendsiz",
    6.25,
    "https://strgimgr.umico.az/img/product/280/8279eeb5-1f19-48aa-a8ae-3853bcd1e2e6.jpeg",
    "https://birmarket.az/product/1227626-avtomobil-uchun-achar-desti-46-parcha-he00058",
    "Birmarket Tikinti alətləri"
  ],
  [
    "2469592",
    "Açarlar dəsti No brand 216 ədəd",
    "Brendsiz",
    189,
    "https://strgimgr.umico.az/img/product/280/f8a04c5e-04bd-4bc3-85ce-171a8af5ac39.jpeg",
    "https://birmarket.az/product/2469592-acharlar-desti-no-brand-professional-avtomobilin-alt-hissesinin-yoxlanilmasi-uchun-216-eded",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1389350",
    "Lazer nivelir Bosch 16 xətt D 0005005",
    "Brendsiz",
    63.26,
    "https://strgimgr.umico.az/img/product/280/26009c74-bece-488d-8a9d-6fa689a75f12.jpeg",
    "https://birmarket.az/product/1389350-lazer-nivelir-bosch-16-xett-d-ez00005005",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1338820",
    "Alət dəsti DeWalt 48V, (kabelsiz drel - şurup bağlayan və aksesuarlar)",
    "Brendsiz",
    39.98,
    "https://strgimgr.umico.az/img/product/280/ac5702eb-3112-4c57-9f04-282f97f3ac6e.jpeg",
    "https://birmarket.az/product/1338820-drel-shurup-baglayan-dewalt-48v",
    "Birmarket Tikinti alətləri"
  ],
  [
    "2279267",
    "Açar dəsti ABCY 24377 8-24 mm , 12 ədəd",
    "ABCY",
    39.89,
    "https://strgimgr.umico.az/img/product/280/70674776-bd0e-4a2b-918d-e88a10acfe3c.jpeg",
    "https://birmarket.az/product/2279267-qayka-achar-desti-abcy-24377-8-24-mm-12-ed",
    "Birmarket Tikinti alətləri"
  ],
  [
    "2014746",
    "Perforator, 2-26 mm",
    "Brendsiz",
    52.71,
    "https://strgimgr.umico.az/img/product/280/2939eefe-1a56-427a-ad23-c0b87a008810.jpeg",
    "https://birmarket.az/product/2014746-perforator-bosch-2-26-mm",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1525308",
    "Alət dəsti Socket2, 108 əşya",
    "Brendsiz",
    53.95,
    "https://strgimgr.umico.az/img/product/280/e55df0d7-88b4-4d04-be1c-446df6ae98d2.jpeg",
    "https://birmarket.az/product/1525308-socket2-108-pcs-alet-desti",
    "Birmarket Tikinti alətləri"
  ],
  [
    "565875",
    "Elektrik lobzik Ingco JS57028",
    "Ingco",
    52,
    "https://strgimgr.umico.az/sized/280/565875-ccb56ad1e6a06a9fb0391acbeeb55eae.jpg",
    "https://birmarket.az/product/565875-elektrik-lobzik-ingco-js57028",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1250220",
    "Drel-şurup bağlayan, 24 V",
    "Brendsiz",
    36.95,
    "https://strgimgr.umico.az/img/product/280/956a0b3b-db62-4f99-a952-c55893ac5ecf.jpeg",
    "https://birmarket.az/product/1250220-drel-shurup-baglayan-makita-24-v-80-nanometr-2-akkumulyator-6-0-amper-saatda-makita_drel_asd",
    "Birmarket Tikinti alətləri"
  ],
  [
    "2326938",
    "Elektrik alətlər dəsti Dewalt - cilalama maşını, perforator, drel-şurup bağlayan və elektrik lobzik, 88V",
    "Brendsiz",
    308.98,
    "https://strgimgr.umico.az/img/product/280/177ad13d-9a91-409d-9782-7705856ffcc3.jpeg",
    "https://birmarket.az/product/2326938-elektrik-aletler-destleri-dewalt-88v-kombo",
    "Birmarket Tikinti alətləri"
  ],
  [
    "2186831",
    "Lehim avadanığı dəsti",
    "Brendsiz",
    38,
    "https://strgimgr.umico.az/img/product/280/1eaf1b8b-8b0c-40c5-b547-f9c28e2129db.jpeg",
    "https://birmarket.az/product/2186831-lehim-avadanigi-desti",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1665521",
    "Cilalama maşını divar və tavan üçün Shturm S700",
    "Shturm",
    250.4,
    "https://strgimgr.umico.az/img/product/280/a60617ee-58bd-4abf-b0f0-78c1b8922984.jpeg",
    "https://birmarket.az/product/1665521-divar-tavan-cilalayici-shturm-s700-ez011",
    "Birmarket Tikinti alətləri"
  ],
  [
    "2217469",
    "Elektrik mişarı Karpat KCP-185-1800, 1800 Vt",
    "Karpat",
    45.06,
    "https://strgimgr.umico.az/img/product/280/e3cc1e31-18af-4733-a58c-33a25d48a48f.jpeg",
    "https://birmarket.az/product/2217469-dairevi-mishar-karpat-kcp-185-1800-1800-vt",
    "Birmarket Tikinti alətləri"
  ],
  [
    "808784",
    "Şalbanbaşlı mişar Makute MS121",
    "Makute",
    169.43,
    "https://strgimgr.umico.az/sized/280/808784-0754eb5eaa36c3c3c350f9ad0fdb4c2f.jpg",
    "https://birmarket.az/product/808784-shalbanbashli-mishar-makute-ms121",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1393869",
    "Renovator Emtop ELMF16222 16V - ELMF16222",
    "EMTOP",
    135,
    "https://strgimgr.umico.az/img/product/280/66023b2e-01dc-440f-97cc-cfc602ce42bb.jpeg",
    "https://birmarket.az/product/1393869-renovator-emtop-elmf16222-16v-elmf16222",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1520647",
    "Boyaçəkən TEH TSG4009, qara/qırmızı",
    "TEH",
    109.99,
    "https://strgimgr.umico.az/img/product/280/3aff744e-d33c-48fd-8ad4-7a08181d73b0.jpeg",
    "https://birmarket.az/product/1520647-kraskoraspylitel-teh-tsg4009",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1358749",
    "Pnevmatik neyler Fixtec FCST50LFX 20V",
    "Fixtec",
    358.73,
    "https://strgimgr.umico.az/img/product/280/326b308f-23fa-4e31-b370-8fae09e23a78.jpeg",
    "https://birmarket.az/product/1358749-akkumulyatorlu-pnevmatik-mismar-pistoleti-fixtec-fcst50lfx-20v-fcst50lfx",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1371520",
    "İnşaat feni Karpat KTF-2000 2000W - KTF-2000",
    "Karpat",
    19.4,
    "https://strgimgr.umico.az/img/product/280/81179c14-4406-4c63-aa8d-09e009ca3f42.jpeg",
    "https://birmarket.az/product/1371520-inshaat-feni-karpat-ktf-2000-2000w-ktf-2000",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1974968",
    "Əl ilə kafel kəsicisi Uralmaş, 1200 mm",
    "Uralmaş",
    265.46,
    "https://strgimgr.umico.az/img/product/280/99b32243-9214-46eb-aea6-b57e118d4851.jpeg",
    "https://birmarket.az/product/1974968-uralmash-1200mm-el-kafel-kesici-sabit-govde",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1340639",
    "Pnevmatik stepler",
    "Brendsiz",
    7.44,
    "https://strgimgr.umico.az/img/product/280/d9a7fc1d-3ac6-4586-aa50-8f08713d6436.jpeg",
    "https://birmarket.az/product/1340639-pnevmatik-mismar-vurucu",
    "Birmarket Tikinti alətləri"
  ],
  [
    "1319786",
    "Lazerli tikinti dərəcəsi 4D, 360°",
    "Brendsiz",
    62.95,
    "https://strgimgr.umico.az/img/product/280/7c114f08-ae2f-4f38-9771-e18990737377.jpeg",
    "https://birmarket.az/product/1319786-lazerli-tikinti-derecesi-makita-4d-360-makita-4d-360",
    "Birmarket Tikinti alətləri"
  ],
  [
    "2402407",
    "Qayka açan Makita 1000 NM, 88V",
    "Brendsiz",
    239.99,
    "https://strgimgr.umico.az/img/product/280/ff83f31e-2393-415e-b1cd-0ab2792ba16c.jpeg",
    "https://birmarket.az/product/2402407-qayka-achan-makita-1000-nm-88v",
    "Birmarket Tikinti alətləri"
  ],
  [
    "326376",
    "Rozetka Clipsal N2 Simple, ağ",
    "Clipsal",
    2.22,
    "https://strgimgr.umico.az/sized/280/326376-7ee43f352cb7f0dbd0539daa0aa02535.jpg",
    "https://birmarket.az/product/326376-rozetka-clipsal-n2-simple-ag",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "326382",
    "Rozetka-söndürən Clipsal 2, ağ",
    "Clipsal",
    2.5,
    "https://strgimgr.umico.az/sized/280/326382-4ea296d2e5331d1b42aa41326e01ac82.jpg",
    "https://birmarket.az/product/326382-rozetka-sonduren-clipsal-2-ag",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "1466894",
    "Uzadıcı Hoco AC28 USB-C/USB-A, 45W PD",
    "Hoco",
    49.97,
    "https://strgimgr.umico.az/img/product/280/8d384fac-b79c-48af-bce6-950122fb5147.jpeg",
    "https://birmarket.az/product/1466894-hoco-ac28-agilli-shtepsel-2-soket-usb-c-usb-a-45w-pd",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "2466301",
    "Gərginlik stabilizatoru Eurolux 20000 Vt EUROLUX 20000VA 110/220 BI-S049",
    "Eurolux",
    999,
    "https://strgimgr.umico.az/img/product/280/7536c45c-4523-4ff4-9f9a-06fe9956ee3e.jpeg",
    "https://birmarket.az/product/2466301-gerginlik-stabilizatoru-eurolux-20000-vt-eurolux-20000va-110-220-bi-s049",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "1208702",
    "Kabel CCTV 4/1, 100 m",
    "Brendsiz",
    40,
    "https://strgimgr.umico.az/img/product/280/b7fdb04e-c180-44e0-b423-8a6d5fda95f4.jpeg",
    "https://birmarket.az/product/1208702-eurocable-cctv-4-1-kabel-100m",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "2402188",
    "Elektrik montaj alət dəsti",
    "Brendsiz",
    16.24,
    "https://strgimgr.umico.az/img/product/280/bd42236d-6820-445f-b2e4-0fbd036d2443.jpeg",
    "https://birmarket.az/product/2402188-elektrik-montaj-alet-desti",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "1770050",
    "Rəqəmsal multimetr Uni-t UT139C",
    "Uni-t",
    120,
    "https://strgimgr.umico.az/img/product/280/19b2a2e2-637c-4b55-aadb-94087609104e.jpeg",
    "https://birmarket.az/product/1770050-multimetr-uni-t-ut139c-reqemsal",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "1196866",
    "Gərginlik göstəricisi Uni-t AC/DC 1000A - EDMR7610002",
    "Emtop",
    100,
    "https://strgimgr.umico.az/img/product/280/1d8cdaad-524e-4a8e-bbb1-5a5da9c6df32.jpeg",
    "https://birmarket.az/product/1196866-gerginlik-gostericisi-uni-t-ac-dc-1000a-edmr7610002",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "2397490",
    "Rele IEK RNT-d 36 mm 63A",
    "IEK",
    64,
    "https://strgimgr.umico.az/img/product/280/e1c51a4e-445b-4bcb-88c5-f97119aa8e8f.jpeg",
    "https://birmarket.az/product/2397490-rele-napryazheniya-i-toka-rnt-d-odnofaznoe-36mm-63a-iek",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "586262",
    "Şəbəkə kabeli CAT6e FTP, 100 m, boz/qara",
    "CAT",
    196.54,
    "https://strgimgr.umico.az/sized/280/586262-f4227ebba396b86622ed99ee19c2daba.jpg",
    "https://birmarket.az/product/586262-shebeke-kabeli-cat6e-ftp-100-m-boz-qara",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "2102226",
    "Uzadıcı baraban Hiva HV315, 35 m",
    "Hiva",
    50,
    "https://strgimgr.umico.az/img/product/280/50f47472-7295-45a3-bcb0-f849196a21ee.jpeg",
    "https://birmarket.az/product/2102226-baraban-35-metre",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "837658",
    "Taxıc Merkan 16A",
    "Merkan",
    0.78,
    "https://strgimgr.umico.az/sized/280/837658-b89be9a9a1f40f122ee8fcc1233cfc7f.jpg",
    "https://birmarket.az/product/837658-taxic-merkan-16a",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "176055",
    "Paylama bloku Navigator NBB-DB-80, 16mm, 1 əd.",
    "Navigator",
    9.6,
    "https://strgimgr.umico.az/sized/280/176055-48b32004d11c70404237ee66581a87f7.jpg",
    "https://birmarket.az/product/176055-paylama-bloku-navigator-nbb-db-80-16mm-1-ed",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "2081557",
    "Zaman relesi DRV09 Samwha",
    "Brendsiz",
    19,
    "https://strgimgr.umico.az/img/product/280/866d7caf-a2ea-483a-ba10-ac72ee176a68.jpeg",
    "https://birmarket.az/product/2081557-zaman-relesi-drv09-samwha",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "2088230",
    "Germetik plastik qutu 16539098, 22x30x15 sm",
    "Brendsiz",
    16,
    "https://strgimgr.umico.az/img/product/280/411fe871-44b5-49b3-ba06-5168a72ad687.jpeg",
    "https://birmarket.az/product/2088230-ishildar-abs-pano-germetik-plastik-qutu-22x30x15",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "1394711",
    "İndikator vintaçanı Emtop 12V-300V - ETPL33001",
    "EMTOP",
    18,
    "https://strgimgr.umico.az/img/product/280/a76f8a50-46f1-4adb-8867-d34e0954abe2.jpeg",
    "https://birmarket.az/product/1394711-indikator-vintachani-emtop-12v-300v-etpl33001",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "2348576",
    "Telefon uzatma kabeli RJ11 , 20 m, qara, İL-1332",
    "Brendsiz",
    3.45,
    "https://strgimgr.umico.az/img/product/280/2e85737b-dde0-4ff7-a435-8e108dff4f84.jpeg",
    "https://birmarket.az/product/2348576-20metr-qara-rengli-rj11-telefon-uzatma-kabeli-il-1332",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "2087931",
    "Elektrik çəngəl Legrand 050196, 16A, 230V, 3680W",
    "Legrand",
    10.99,
    "https://strgimgr.umico.az/img/product/280/3b70a8de-3ce1-4bd9-bd6f-ff23f5aa6e46.jpeg",
    "https://birmarket.az/product/2087931-vilka-elektricheskaya-legrand-050196-16a-230v-3680w",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "2065650",
    "Blok YAWEITAI 6 yuva, IL - 1470",
    "Brendsiz",
    7.2,
    "https://strgimgr.umico.az/img/product/280/baff1a4b-d0a7-46d2-809a-e1623e5f5e4e.jpeg",
    "https://birmarket.az/product/2065650-yaweitai-professional-6-li-elektrik-uzadicisi-sade-il-1470",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "177503",
    "Istilik büzücü borusu Navigator NST-4/2-10-18, 18 əd.",
    "Navigator",
    0.96,
    "https://strgimgr.umico.az/sized/280/177503-598fb856c9534f847ac012bb148e94e2.jpg",
    "https://birmarket.az/product/177503-istilik-buzucu-borusu-navigator-nst-4-2-10-18-18-ed",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "2118257",
    "Knookali rozetka",
    "Brendsiz",
    2.96,
    "https://strgimgr.umico.az/img/product/280/c2de7f5b-3ff8-45f4-b3b6-0ebcd2b6de74.jpeg",
    "https://birmarket.az/product/2118257-knookali-rozetka",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "2068048",
    "Plastik xamut 10x1000mm Ağ, İL - 2865",
    "Brendsiz",
    0.95,
    "https://strgimgr.umico.az/img/product/280/94e56fa7-6323-42c1-80f5-0bdc372b09f4.jpeg",
    "https://birmarket.az/product/2068048-plastik-xamut-10x1000mm-ag-zajim-il-2865",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "586225",
    "Montaj kabeli Neotek H07V-K 1x4.0 mm2, 100 m, göy",
    "Neotek",
    178.61,
    "https://strgimgr.umico.az/sized/280/586225-5f574c0417575f62db5df12ccec96e5b.jpg",
    "https://birmarket.az/product/586225-montaj-kabeli-neotek-h07v-k-1x4-0-mm2-100-m-goy",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "176048",
    "Qövs Navigator NCS-08-20 plastik, 20mm, 20 əd.",
    "Navigator",
    0.32,
    "https://strgimgr.umico.az/sized/280/176048-577783353e50686206121a28989ca805.jpg",
    "https://birmarket.az/product/176048-qovs-navigator-ncs-08-20-plastik-20mm-20-ed",
    "Birmarket Elektrik ləvazimatları"
  ],
  [
    "1541954",
    "Qarışdırıcı kran mətbəx çanağı üçün, gümüşü",
    "Brendsiz",
    23.98,
    "https://strgimgr.umico.az/img/product/280/eb5c5fc2-c3a1-479b-9ee4-74aade308b21.jpeg",
    "https://birmarket.az/product/1541954-qarishdirici-kran-metbex-uchun-gumushu",
    "Birmarket Məişət santexnika"
  ],
  [
    "942243",
    "Mətbəx çanağı 7545",
    "Brendsiz",
    195,
    "https://strgimgr.umico.az/sized/280/942243-077f3eb57037662f3a75078f8bb7b3c9.jpg",
    "https://birmarket.az/product/942243-metbex-chanagi-7545",
    "Birmarket Məişət santexnika"
  ],
  [
    "2328771",
    "Duş qarnituru Alev, paslanmayan polad, boz",
    "Alev",
    73.5,
    "https://strgimgr.umico.az/img/product/280/7fe49029-1c7e-46ba-a850-2b390e6e9f6a.jpeg",
    "https://birmarket.az/product/2328771-dush-pianino-dest-yeni",
    "Birmarket Məişət santexnika"
  ],
  [
    "1647161",
    "Suqarışdırıcı Grohe BauEdge - GH23605000",
    "Grohe",
    162.4,
    "https://strgimgr.umico.az/img/product/280/a61d84be-ef1a-4fbc-af2c-0248cb3c363d.jpeg",
    "https://birmarket.az/product/1647161-suqarishdirici-grohe-bauedge-gh23605000",
    "Birmarket Məişət santexnika"
  ],
  [
    "2015785",
    "Hamam otağı üçün mebel dəsti Seval Banyo 0011",
    "Brendsiz",
    310,
    "https://strgimgr.umico.az/img/product/280/f976c50b-4293-4f3f-9e92-51b0e8c36330.jpeg",
    "https://birmarket.az/product/2015785-seval-banyo-moydadir-0011",
    "Birmarket Məişət santexnika"
  ],
  [
    "894694",
    "Unitaz Classo CL-002B, keramika, ağ",
    "Classo",
    248.99,
    "https://strgimgr.umico.az/sized/280/894694-1b31d9804a379df9687160efe488c21a.jpg",
    "https://birmarket.az/product/894694-unitaz-classo-cl-002b-keramika-ag",
    "Birmarket Məişət santexnika"
  ],
  [
    "1052774",
    "Hamam otağı üçün şkaf 3563_M3StiralkaOpenWh, ağ, 64x25x170 sm",
    "Brendsiz",
    209,
    "https://strgimgr.umico.az/img/product/280/ecd1eacd-4554-4a63-bc21-b9c50a0223b8.jpeg",
    "https://birmarket.az/product/1052774-hamam-otagi-uchun-shkaf-3563_m3stiralkaopenwh-ag-64h25h170-sm",
    "Birmarket Məişət santexnika"
  ],
  [
    "1727019",
    "Çanaq, keramika, ağ, 60x14x40 sm",
    "Brendsiz",
    100,
    "https://strgimgr.umico.az/img/product/280/b6867a21-0bd4-4fad-b074-cd9146c1753a.jpeg",
    "https://birmarket.az/product/1727019-chanaq-tb-08-keramika-ag",
    "Birmarket Məişət santexnika"
  ],
  [
    "1938101",
    "Çanaq Tulpan Ayaqlı SUPRIME IPBSS2317, istehsalçı ölkə: Hindistan - A_G Tulpan 11",
    "Brendsiz",
    109,
    "https://strgimgr.umico.az/img/product/280/01790db1-95a1-489f-b626-74a3a30de399.jpeg",
    "https://birmarket.az/product/1938101-chanaq-tulpan-ayaqli-suprime-ipbss2317-istehsalchi-olke-hindistan-a_g-tulpan-11",
    "Birmarket Məişət santexnika"
  ],
  [
    "1349004",
    "Mətbəx çanağı Davaline J33G31BJ 775x495x205 mm - GAO33G033",
    "Davaline",
    99,
    "https://strgimgr.umico.az/img/product/280/079f6027-614b-4338-a0d2-a74254aee837.jpeg",
    "https://birmarket.az/product/1349004-metbex-chanagi-davaline-j33g31bj-775x495x205-mm-gao33g033",
    "Birmarket Məişət santexnika"
  ],
  [
    "1971316",
    "Qarışdırıcı kran üçün aerator 2253, plastik, gümüşü",
    "Brendsiz",
    3.48,
    "https://strgimgr.umico.az/img/product/280/1c047ffe-a983-49fa-af8d-3bc678c30022.jpeg",
    "https://birmarket.az/product/1971316-metbex-krani-uchun-360-firlanan-uzadilan-su-filtri-bashligi-spiral-elastik-shlanqli-kran-nasadkasi-3-rejimli-su-puskurducu-metal-korpus-su-qenaetli-aerator-filtr-metbex-ve-hamam-uchun-universal-kran-adapteri",
    "Birmarket Məişət santexnika"
  ],
  [
    "1755027",
    "Hamam üçün güzgü c0026",
    "Brendsiz",
    69.99,
    "https://strgimgr.umico.az/img/product/280/533fca46-8b6a-4da1-b000-1aaf4b831586.jpeg",
    "https://birmarket.az/product/1755027-hamam-uchun-guzgu-c0026",
    "Birmarket Məişət santexnika"
  ],
  [
    "2404052",
    "Bacok ici unitaz iki knopqalı",
    "Brendsiz",
    16.23,
    "https://strgimgr.umico.az/img/product/280/4c9a27bc-a310-4e1a-9b6e-cf7188d6cc97.jpeg",
    "https://birmarket.az/product/2404052-bacok-ici-unitaz-iki-knopqali",
    "Birmarket Məişət santexnika"
  ],
  [
    "2049223",
    "Duş şlanqı, Gümüşü, İL-1324, 1.5m",
    "Brendsiz",
    3.89,
    "https://strgimgr.umico.az/img/product/280/26676c46-cbe3-4d9e-8e74-33310846b68a.jpeg",
    "https://birmarket.az/product/2049223-dush-shlanqi-gumushu-il-1324-1-5m",
    "Birmarket Məişət santexnika"
  ],
  [
    "1402146",
    "Unitaz Plastik sağlamlıq imkanları məhdud şəxslər üçün - tor_0080",
    "Brendsiz",
    49.99,
    "https://strgimgr.umico.az/img/product/280/ae360689-d92b-4bfe-a333-534264f61e8f.jpeg",
    "https://birmarket.az/product/1402146-unitaz-plastik-saglamliq-imkanlari-mehdud-shexsler-uchun-tor_0080",
    "Birmarket Məişət santexnika"
  ],
  [
    "1857231",
    "Unitaz üçün asma çən, ağ, plastik, 10 l",
    "Brendsiz",
    33,
    "https://strgimgr.umico.az/img/product/280/5f9a57f6-4c3b-4eaf-b56e-d56c82f5ce64.jpeg",
    "https://birmarket.az/product/1857231-unitaz-asma-bachok-10l",
    "Birmarket Məişət santexnika"
  ],
  [
    "2227485",
    "Çanaq üçün qara qarışdırıcı kran",
    "Brendsiz",
    29.5,
    "https://strgimgr.umico.az/img/product/280/a870a951-243a-4ba2-bcd3-1f7b81c9d56a.jpeg",
    "https://birmarket.az/product/2227485-moydadir-krant-qara",
    "Birmarket Məişət santexnika"
  ],
  [
    "2196656",
    "Gigiyenik duş c014, paslanmayan polad",
    "Brendsiz",
    28.9,
    "https://strgimgr.umico.az/img/product/280/9d0189d0-5c22-4007-9ebf-7ac7053c2e64.jpeg",
    "https://birmarket.az/product/2196656-bide-krani-c014",
    "Birmarket Məişət santexnika"
  ],
  [
    "2205946",
    "Sifon çanaq üçün, paslanmayan polad, gümüşü, 90 sm",
    "Brendsiz",
    22.99,
    "https://strgimgr.umico.az/img/product/280/6510664b-1ad0-438d-8fc9-640036d1a53c.jpeg",
    "https://birmarket.az/product/2205946-sifon-chanaq-uchun-paslanmayan-polad-gumushu-90-sm",
    "Birmarket Məişət santexnika"
  ],
  [
    "2394351",
    "Kanalizasiya təmizləmə trosu MU_3551, 10 m",
    "Brendsiz",
    22,
    "https://strgimgr.umico.az/img/product/280/bb8f76dd-4954-4348-acaf-b140a98ef293.jpeg",
    "https://birmarket.az/product/2394351-kanalizasiya-temizleme-trosu-10m-mu_3551",
    "Birmarket Məişət santexnika"
  ],
  [
    "1400715",
    "Əl duşu səpələyici",
    "Brendsiz",
    2.26,
    "https://strgimgr.umico.az/img/product/280/b8acdaf2-a022-4ef6-a3f1-3610b4fac475.jpeg",
    "https://birmarket.az/product/1400715-el-dushu-bashligi",
    "Birmarket Məişət santexnika"
  ],
  [
    "528171",
    "Lyuk qapağı LuxWares, 400x400 mm, plastik",
    "LuxWares",
    35.73,
    "https://strgimgr.umico.az/sized/280/528171-4222561cdbdd184c4e67762d216ff8e1.jpg",
    "https://birmarket.az/product/528171-lyuk-qapagi-luxwares-400x400-mm-plastik",
    "Birmarket Məişət santexnika"
  ],
  [
    "2152844",
    "Arko kran GPD TMS01-2 1/2",
    "GPD",
    14.5,
    "https://strgimgr.umico.az/img/product/280/c582426d-f79b-47c7-a524-894c3459c5cd.jpeg",
    "https://birmarket.az/product/2152844-su-krani-arko-kran-gpd-tms01-2-1-2",
    "Birmarket Məişət santexnika"
  ],
  [
    "1344901",
    "Mətbəx çanağı üçün quruducu, metal, ağ",
    "Brendsiz",
    14.49,
    "https://strgimgr.umico.az/img/product/280/aa612593-94c4-4d20-82af-8da306b38d0f.jpeg",
    "https://birmarket.az/product/1344901-moyka-uchun-ref-yigilan-metal",
    "Birmarket Məişət santexnika"
  ],
  [
    "2198369",
    "Boya Forelli, qırmızı, 2.5 kq",
    "Brendsiz",
    24.99,
    "https://strgimgr.umico.az/img/product/280/e8cd53e8-18f2-4db2-bfc1-3779b1d1c385.jpeg",
    "https://birmarket.az/product/2198369-kraska-boya-qirmizi-2-5kq",
    "Birmarket Dekor materialları"
  ],
  [
    "896045",
    "Astar Kudo KU-2104, ağ, 520 ml",
    "Kudo",
    9,
    "https://strgimgr.umico.az/sized/280/896045-e9364b1910e3c2738335afd19d8e2e5e.jpg",
    "https://birmarket.az/product/896045-astar-kudo-ku-2104-ag-520-ml",
    "Birmarket Dekor materialları"
  ],
  [
    "894793",
    "Taxta üçün tonlayıcı lak Kudo KU-9045, Palisandr, 520 ml",
    "Kudo",
    10,
    "https://strgimgr.umico.az/sized/280/894793-59eb031284352ccc7cf6cd3c5ff3417c.jpg",
    "https://birmarket.az/product/894793-taxta-uchun-tonlayici-lak-kudo-ku-9045-palisandr-520-ml",
    "Birmarket Dekor materialları"
  ],
  [
    "1089036",
    "Minalanmış vannaların və keramikanın bərpası üçün Kudo KU-1311, 520ml, ağ",
    "Kudo",
    10,
    "https://strgimgr.umico.az/img/product/280/a7116e8f-30ae-4946-bb80-d6ce0dea8ce1.jpeg",
    "https://birmarket.az/product/1089036-vanna-ve-keramika-uchun-berpa-emali-kudo-ku-1311-520ml-ag",
    "Birmarket Dekor materialları"
  ],
  [
    "1779998",
    "Flizelin divar kağızı Mister Decor Zəfər 385005, 1.06 m x 10 m - misterdecor_385005",
    "Mister Decor",
    28,
    "https://strgimgr.umico.az/img/product/280/1791fc8d-ce90-49f8-a09e-82a5a800c181.jpeg",
    "https://birmarket.az/product/1779998-flizelin-divar-kagizi-mister-decor-zefer-385005-1-06-m-x-10-m-misterdecor_385005",
    "Birmarket Dekor materialları"
  ],
  [
    "1406878",
    "Vinil oboylar Monza Rio 505103 Dekor 1.06x10 m İsti basma qeydiyyatlı çap Müasir üslub - misterdecor_505103",
    "Mister Decor",
    28,
    "https://strgimgr.umico.az/img/product/280/cbe688af-c04d-47e9-bff3-d669601084f9.jpeg",
    "https://birmarket.az/product/1406878-vinil-oboylar-monza-rio-505103-dekor-1-06x10-m-isti-basma-qeydiyyatli-chap-muasir-uslub-misterdecor_505103",
    "Birmarket Dekor materialları"
  ],
  [
    "2065196",
    "Dekorativ divar paneli 466m5, boz, 280x120 sm",
    "Brendsiz",
    24.5,
    "https://strgimgr.umico.az/img/product/280/1cb0aa79-a7d3-4ff7-be67-6cf0952afbea.jpeg",
    "https://birmarket.az/product/2065196-mermer-effektli-dekorativ-divar-paneli-466m5-280x120-sm",
    "Birmarket Dekor materialları"
  ],
  [
    "2199504",
    "Linoleum 10, bej, 2x1 m",
    "Brendsiz",
    18.99,
    "https://strgimgr.umico.az/img/product/280/d323bcb3-1712-4dc8-9b87-e031d1ee1266.jpeg",
    "https://birmarket.az/product/2199504-linoleum-ortuk-2-0m-1-0m",
    "Birmarket Dekor materialları"
  ],
  [
    "2209772",
    "Kompozit taxta divar paneli, teak, 290x21.9 sm",
    "Brendsiz",
    36,
    "https://strgimgr.umico.az/img/product/280/e8ff402e-28b5-47fa-9cfb-192e9ed57075.jpeg",
    "https://birmarket.az/product/2209772-kompozit-taxta-divar-paneli-teak-290x21-9-sm",
    "Birmarket Dekor materialları"
  ],
  [
    "500248",
    "Maye oboylar Silk Plaster Sand 137, açıq boz",
    "Silk Plaster",
    19,
    "https://strgimgr.umico.az/sized/280/500248-ffcb04ad6daa7a0499863279c9f66ae7.jpg",
    "https://birmarket.az/product/500248-maye-oboylar-silk-plaster-sand-137-achiq-boz",
    "Birmarket Dekor materialları"
  ],
  [
    "2471926",
    "Divar paneli No brand 9599, qəhvəyi, plastik, 50x280 sm",
    "Brendsiz",
    29,
    "https://strgimgr.umico.az/img/product/280/70a87daa-29f9-44c4-94c7-b2fa4935913d.jpeg",
    "https://birmarket.az/product/2471926-divar-paneli-no-brand-karicnivi-plastik-50-sm",
    "Birmarket Dekor materialları"
  ],
  [
    "2156406",
    "Derz dolğusu Mr.Fix Fugamax Colorful",
    "mr.fix",
    3.08,
    "https://strgimgr.umico.az/img/product/280/0a1483ac-c031-429b-83c4-568918506f92.jpeg",
    "https://birmarket.az/product/2156406-mr-fix-fugamax-colorful-fildishi",
    "Birmarket Dekor materialları"
  ],
  [
    "850250",
    "Dekorativ yapışqan plyonka MA-GH266, boz, 5 m",
    "Brendsiz",
    11.89,
    "https://strgimgr.umico.az/sized/280/850250-66bff9e510748dd3ef7c5257e49c9fd2.jpg",
    "https://birmarket.az/product/850250-dekorativ-yapishqan-plyonka-ma-gh266-boz-5-m",
    "Birmarket Dekor materialları"
  ],
  [
    "1187506",
    "Boya təmizləyicisi Novbitxim, 0.5 l",
    "Novbitxim",
    12,
    "https://strgimgr.umico.az/img/product/280/b682138d-3f6a-4a1c-9b2e-a04ae0c51b53.jpeg",
    "https://birmarket.az/product/1187506-boya-sokucu-0-5-lt-4601147003082",
    "Birmarket Dekor materialları"
  ],
  [
    "235389",
    "Oboylar üçün yapışqan Metylan Vinil Premium 300 q",
    "Metylan",
    10.99,
    "https://strgimgr.umico.az/sized/280/235389-c63e9d5341833ebb18f123c31693913a.jpg",
    "https://birmarket.az/product/235389-oboylar-uchun-yapishqan-metylan-vinil-premium-300-q",
    "Birmarket Dekor materialları"
  ],
  [
    "2256808",
    "Keramoqranit Black Marquina, parlaq, 600x600x0.9 mm",
    "Brendsiz",
    5.5,
    "https://strgimgr.umico.az/img/product/280/d37c3612-dc2e-46f2-8e65-5c89561fed17.jpeg",
    "https://birmarket.az/product/2256808-luks-black-marquina-uslublu-kafel-parlaq-ve-dozumlu",
    "Birmarket Dekor materialları"
  ],
  [
    "2371973",
    "Döşəmə və Divar üçün Qranit Naxışlı Kafel 50x50 sm",
    "Brendsiz",
    4.5,
    "https://strgimgr.umico.az/img/product/280/fce4b912-84cd-4f3c-8768-2e4078e79341.jpeg",
    "https://birmarket.az/product/2371973-dosheme-ve-divar-uchun-premium-qranit-naxishli-kafel-50x50-sm",
    "Birmarket Dekor materialları"
  ],
  [
    "1484394",
    "Epoksid qatran AR_037_09311",
    "Brendsiz",
    214.8,
    "https://strgimgr.umico.az/img/product/280/825b2f95-f89a-450e-9ea0-1307ac6c635c.jpeg",
    "https://birmarket.az/product/1484394-epoxy-master",
    "Birmarket Dekor materialları"
  ],
  [
    "2078300",
    "Kafel Seranit HAVANA, ağ, 60x120 sm",
    "Seranit",
    85,
    "https://strgimgr.umico.az/img/product/280/ea2f5608-30e6-4618-b63a-34d5fc0fa279.jpeg",
    "https://birmarket.az/product/2078300-kafel-seranit-havana-ag-fon-parlaq-60x120-1-eded",
    "Birmarket Dekor materialları"
  ],
  [
    "2406695",
    "Divar paneli alçipan luku 50x50",
    "Brendsiz",
    49.98,
    "https://strgimgr.umico.az/img/product/280/f58ad3ed-bebd-4c6e-b06b-2b7ccb605f63.jpeg",
    "https://birmarket.az/product/2406695-divar-paneli-alchipan-luku-50x50",
    "Birmarket Dekor materialları"
  ],
  [
    "2357662",
    "Yapışqan Laminat 3028",
    "Brendsiz",
    3.17,
    "https://strgimgr.umico.az/img/product/280/741bcab7-0376-47fd-9977-31defac8ec4b.jpeg",
    "https://birmarket.az/product/2357662-yapishqan-laminat-1",
    "Birmarket Dekor materialları"
  ],
  [
    "1906712",
    "Hovuz şüşə mozaika Ezarri Niebla Intense Blue, silikonlu, 25x25 mm, BP-501",
    "Ezarri",
    49.5,
    "https://strgimgr.umico.az/img/product/280/5a20ae9e-fd44-4e18-9161-d7361933334f.jpeg",
    "https://birmarket.az/product/1906712-hovuz-shushe-mozaika-ezarri-niebla-intense-blue-silikonlu-25x25-mm-bp-501-mozaik_bp_501",
    "Birmarket Dekor materialları"
  ],
  [
    "1475784",
    "Foto oboy Yapon üslubunda albalı çiçəkləri və quşlarla, 3D effektli, 3x4 m, tək parça",
    "Brendsiz",
    419,
    "https://strgimgr.umico.az/img/product/280/72a7f2d4-44a9-426d-82f3-340fb9d022d6.jpeg",
    "https://birmarket.az/product/1475784-yapon-uslubunda-albali-chichekleri-ve-qushlarla-3d-divar-kagizi-3-00-x-4-00-tek-parcha-shovsuz",
    "Birmarket Dekor materialları"
  ],
  [
    "1870109",
    "Döşəmə yaşmağı Deconika D85 001, ağ mat, 85×21×2200 mm, PVC, 1 ədəd - KRN_D85 001",
    "Ideal",
    4,
    "https://strgimgr.umico.az/img/product/280/0348a122-586b-4b97-afca-e77858614777.jpeg",
    "https://birmarket.az/product/1870109-dosheme-yashmagi-deconika-d85-001-ag-mat-85x21x2200-mm-pvc-1-eded-krn_d85-001",
    "Birmarket Dekor materialları"
  ],
  [
    "2315946",
    "LED lampa Max, E27, 25 Vt, 4000K",
    "MAX",
    4.8,
    "https://strgimgr.umico.az/img/product/280/1550eb49-eda9-40b3-aa66-1d0b01b7dfdb.jpeg",
    "https://birmarket.az/product/2315946-max-25w-led-e27-4000k-1800lm-parlaq-aydin-ishiq-ve-enerji-qenaeti",
    "Birmarket İşıqlandırma"
  ],
  [
    "1188601",
    "LED lent FAFO Neon Flex, IP65, 100 m",
    "FAFO",
    180,
    "https://strgimgr.umico.az/img/product/280/8f9bea9b-14d2-47c4-aa58-4343871e45d3.jpeg",
    "https://birmarket.az/product/1188601-led-lent-fafo-neon-flex-100-m-ip65-ag-ishiq-elastik-fa12v6121208mm",
    "Birmarket İşıqlandırma"
  ],
  [
    "1541783",
    "Led projektor MAX FL0830S Mini 6500K",
    "MAX",
    5.4,
    "https://strgimgr.umico.az/img/product/280/e123c37d-a5f0-41c8-ba94-429d31da27c4.jpeg",
    "https://birmarket.az/product/1541783-led-projektor-max-fl0830s-mini-6500k",
    "Birmarket İşıqlandırma"
  ],
  [
    "2072244",
    "Yarpaq dizaynlı LED divar lampası, qara-qızılı, 60 sm",
    "Brendsiz",
    74,
    "https://strgimgr.umico.az/img/product/280/e387fd3c-e7bc-4fc4-b612-424ff4c4528e.jpeg",
    "https://birmarket.az/product/2072244-dekorativ-led-divar-ishigi-qara-qizili-yarpaq-dizaynli-divar-lampasi-60-sm-gips-material",
    "Birmarket İşıqlandırma"
  ],
  [
    "1395906",
    "Trek lampası Hermes PR-22 BK 10W 3000K RAY",
    "Brendsiz",
    29,
    "https://strgimgr.umico.az/img/product/280/6480bec7-adab-424e-ac2e-8a24a7d716f3.jpeg",
    "https://birmarket.az/product/1395906-spot-hermes-pr-22-bk-10w-3000k-ray",
    "Birmarket İşıqlandırma"
  ],
  [
    "1582000",
    "Lampa Max TB 1507",
    "MAX",
    1.39,
    "https://strgimgr.umico.az/img/product/280/86ff4b01-90c7-4057-b890-440456bc1d36.jpeg",
    "https://birmarket.az/product/1582000-lampa-max-tb1507-ince-patron-ww",
    "Birmarket İşıqlandırma"
  ],
  [
    "1208619",
    "Divar lampası Borsan, 35x18 sm",
    "Borsan",
    18.2,
    "https://strgimgr.umico.az/img/product/280/3bc5406e-3590-431b-a84a-e626ec1dde64.jpeg",
    "https://birmarket.az/product/1208619-divar-chiragi-borsan-35x18-sm-shusheli-korpus-e27",
    "Birmarket İşıqlandırma"
  ],
  [
    "335714",
    "LED lent Hoco DL30 4.m, qara",
    "Hoco",
    22.95,
    "https://strgimgr.umico.az/sized/280/335714-fc9eefaba06348bb01ff292a9902890b.jpg",
    "https://birmarket.az/product/335714-led-lent-hoco-dl30-4-m-qara",
    "Birmarket İşıqlandırma"
  ],
  [
    "1378580",
    "Projektor MAX M-SLT33-1000W",
    "MAX",
    79.83,
    "https://strgimgr.umico.az/img/product/280/1e97b68d-765b-41a3-8719-62b22a31b722.jpeg",
    "https://birmarket.az/product/1378580-projektor",
    "Birmarket İşıqlandırma"
  ],
  [
    "1315178",
    "Bağ və terras üçün günəş lampası, LED, IP65, 10 m kabel, iki başlı, uzaqdan idarə olunan - kop_155",
    "Brendsiz",
    49.99,
    "https://strgimgr.umico.az/img/product/280/df231e28-eb6c-4cc3-b462-3cb821312f82.jpeg",
    "https://birmarket.az/product/1315178-bag-ve-terras-uchun-gunesh-lampasi-led-ip65-10-m-kabel-iki-bashli-uzaqdan-idare-olunan-kop_155",
    "Birmarket İşıqlandırma"
  ],
  [
    "1168265",
    "LED spot FAFO, 22W, dairəvi, ağ",
    "FAFO",
    5.4,
    "https://strgimgr.umico.az/img/product/280/d68e9893-8cea-4d5b-811d-9d5ff7e45a37.jpeg",
    "https://birmarket.az/product/1168265-led-spot-fafo-22w-ag-neme-davamli-fa-yn22",
    "Birmarket İşıqlandırma"
  ],
  [
    "2315496",
    "LED lampa Max, E14, 4 Vt, 3000K",
    "MAX",
    3.61,
    "https://strgimgr.umico.az/img/product/280/763696b8-dd97-49b3-8e53-0be0d6593370.jpeg",
    "https://birmarket.az/product/2315496-max-led-filament-lampa-4w-e14-sham-tipli-dekorativ-ampul-enerji-qenaetli",
    "Birmarket İşıqlandırma"
  ],
  [
    "1260393",
    "Günəş işığı 2178T",
    "Brendsiz",
    11.75,
    "https://strgimgr.umico.az/img/product/280/9fe3b563-78f2-4960-9065-373278ba6e17.jpeg",
    "https://birmarket.az/product/1260393-gunesh-ishigi-2178t",
    "Birmarket İşıqlandırma"
  ],
  [
    "2407066",
    "Günəş lampası 2407066, 6 Vt",
    "Brendsiz",
    42,
    "https://strgimgr.umico.az/img/product/280/dedb4ad1-ff9c-479b-82b0-91109815f730.jpeg",
    "https://birmarket.az/product/2407066-solnechnyy-svetodiodnyy-ulichnyy-svetilnik-enerlux-6-w",
    "Birmarket İşıqlandırma"
  ],
  [
    "1802749",
    "LED işıqlandırma 3759, 5 m",
    "Brendsiz",
    34.9,
    "https://strgimgr.umico.az/img/product/280/91d24eb7-b6ea-42ba-bf07-b5e287390152.jpeg",
    "https://birmarket.az/product/1802749-led-ishiq-5-m-rgb-pultlu",
    "Birmarket İşıqlandırma"
  ],
  [
    "2093792",
    "Divar çırağı 2118-1, plastik/metal, ağ, 50 sm",
    "Brendsiz",
    7.8,
    "https://strgimgr.umico.az/img/product/280/08618313-1d4d-432e-b4ad-e918c1af37f7.jpeg",
    "https://birmarket.az/product/2093792-sensorlu-led-lampa-usb-charge-3-rejim-50sm",
    "Birmarket İşıqlandırma"
  ],
  [
    "1209523",
    "İkili LED spot J4ARBDWH, COB LED + GU10",
    "Brendsiz",
    9.5,
    "https://strgimgr.umico.az/img/product/280/6ee92a34-b7b1-40f4-901e-a05fb75fab5e.jpeg",
    "https://birmarket.az/product/1209523-led-spot-kvadrat-ag-9w-j4arbdwh",
    "Birmarket İşıqlandırma"
  ],
  [
    "1504991",
    "İşıqdiodlu şam lampa MAX Candle M-CB0404_LDM, 4W, 6500K",
    "MAX",
    2.99,
    "https://strgimgr.umico.az/img/product/280/8139464b-8a2e-4ad4-998e-b3839521036c.jpeg",
    "https://birmarket.az/product/1504991-ishiqdiodlu-sham-lampa-max-candle-m-cb0404_ldm-4w-6500k-m-cb0404_ldm",
    "Birmarket İşıqlandırma"
  ],
  [
    "2480549",
    "Günəş enerjili küçə çırağı 500 W ağ.",
    "Brendsiz",
    41,
    "https://strgimgr.umico.az/img/product/280/5b317afe-3b6e-4ea3-bc8c-915e583a4993.jpeg",
    "https://birmarket.az/product/2480549-kuche-chiragi-no-brand-gunesh-lampasi-ag-500-vt-plastik",
    "Birmarket İşıqlandırma"
  ],
  [
    "2419414",
    "Günəş paneli ile projektor. globe",
    "Brendsiz",
    39,
    "https://strgimgr.umico.az/img/product/280/f0159713-243e-4679-b211-a1488cdc2e4c.jpeg",
    "https://birmarket.az/product/2419414-gunesh-paneli-ile-projektor-globe",
    "Birmarket İşıqlandırma"
  ],
  [
    "1463467",
    "İşıq filtri müasir LED, simsiz, maqnit, USB ilə enerji, tənzimlənən parlaqlıq, 50 sm, qara, plastik - miks1443",
    "Brendsiz",
    29.9,
    "https://strgimgr.umico.az/img/product/280/9a965d9b-57bd-46d2-a40e-475ff485a8ff.jpeg",
    "https://birmarket.az/product/1463467-ishiq-filtri-muasir-led-simsiz-maqnit-usb-ile-enerji-tenzimlenen-parlaqliq-50-sm-qara-plastik-miks1443",
    "Birmarket İşıqlandırma"
  ],
  [
    "2060996",
    "LED lent 5 metr, İL - 4516",
    "Brendsiz",
    28.51,
    "https://strgimgr.umico.az/img/product/280/6c941619-40c5-4769-b4fb-ae611b295c80.jpeg",
    "https://birmarket.az/product/2060996-led-lent-5-metr-il-4516",
    "Birmarket İşıqlandırma"
  ],
  [
    "2034984",
    "Led panel işıq 48w",
    "Brendsiz",
    15,
    "https://strgimgr.umico.az/img/product/280/022e2b4f-6132-4df4-8d22-0b3ef2753e9f.jpeg",
    "https://birmarket.az/product/2034984-sivaq-ustu-spot-48w",
    "Birmarket İşıqlandırma"
  ],
  [
    "909112",
    "Tavan üçün lampa-ventilyator light_01, 30W",
    "Brendsiz",
    29.21,
    "https://strgimgr.umico.az/sized/280/909112-471a1dfdc62a157b1e095fca579b388a.jpg",
    "https://birmarket.az/product/909112-tavan-uchun-lampa-ventilyator-light_01-30w",
    "Birmarket İşıqlandırma"
  ],
  [
    "1224836",
    "Polipropilen boruların lehimlənməsi üçün ütü, akkumulyator ilə, 21V, 32MM",
    "Brendsiz",
    256.99,
    "https://strgimgr.umico.az/img/product/280/e2d2eb5e-0376-4bc2-a339-a44f1536bb8d.jpeg",
    "https://birmarket.az/product/1224836-pvc-utu-batareyali-21v-32mm",
    "Birmarket Təmir və tikinti"
  ],
  [
    "2073168",
    "Elastik şkaf və çəkməcə kilidi, İL - 620",
    "Brendsiz",
    0.97,
    "https://strgimgr.umico.az/img/product/280/5b2d0a29-ab14-4cc6-b1f0-acb00cc6c36d.jpeg",
    "https://birmarket.az/product/2073168-elastik-shkaf-ve-chekmece-kilidi-il-620",
    "Birmarket Təmir və tikinti"
  ]
];

  const officialProducts = [
    {
      id: "penguin-penakril-15l-official",
      sku: "PNG-PENAKRIL-15L-OFFICIAL",
      name: "Penguin Penakril eksteryer boyası 15 L",
      brand: "Penguin",
      category: "paints",
      subcategory: "Eksteryer boya",
      supplier: "Penguin Paints",
      origin: "Azərbaycan",
      package: "15 L",
      price: "Sorğu əsasında",
      priceNote: "Rəsmi məhsul səhifəsində qiymət göstərilmir",
      priceStatus: "request",
      imageUrl: "https://penguin.az/uploads/products/gallery/penakril669f9ba2bf90e.jpg",
      sourceUrl: "https://penguin.az/catalog/product/penguin-penakril",
      sourceLabel: "Penguin rəsmi məhsul səhifəsi",
      availability: "Rəsmi satış nöqtələri / sorğu əsasında",
      specs: ["Akrilik kopolimer əsaslı eksteryer boya", "2.5 L, 7.5 L və 15 L qablaşdırma", "Mat və yarı-mat", "Püskürtmə, fırça və rulo ilə tətbiq"]
    },
    {
      id: "penguin-softline-velvet-15l-official",
      sku: "PNG-SOFTLINE-15L-OFFICIAL",
      name: "Penguin Softline Velvet Smooth boya 15 L",
      brand: "Penguin",
      category: "paints",
      subcategory: "Daxili boya",
      supplier: "Penguin Paints",
      origin: "Azərbaycan",
      package: "15 L",
      price: "Sorğu əsasında",
      priceNote: "Rəsmi məhsul səhifəsində qiymət göstərilmir",
      priceStatus: "request",
      imageUrl: "https://penguin.az/uploads/products/gallery/sofline6a2699115d2e3.jpeg",
      sourceUrl: "https://penguin.az/catalog/product/penguin-softline-velvet-smooth",
      sourceLabel: "Penguin rəsmi məhsul səhifəsi",
      availability: "Rəsmi satış nöqtələri / sorğu əsasında",
      specs: ["Məxməri hamar interyer boyası", "15 L qablaşdırma", "Mat səth", "Fırça və rulo ilə tətbiq"]
    }
  ];

  const normalizeBrand = (brand, name) => {
    const cleaned = String(brand || "").trim();
    const lowerName = String(name || "").toLowerCase();
    if (cleaned && cleaned.toLowerCase() !== "no brand") return cleaned;
    const knownBrands = ["Bosch", "DeWALT", "Makita", "Ingco", "Kudo", "MAX", "Grohe", "Legrand", "Clipsal", "Navigator", "IEK", "Emtop", "Shturm", "Karpat", "Makute", "Mister Decor", "Metylan", "Seranit", "Ezarri", "FAFO", "Borsan", "Hoco", "LuxWares", "GPD"];
    const detected = knownBrands.find((item) => lowerName.includes(item.toLowerCase()));
    return detected || "Birmarket";
  };

  const inferCategory = (name, sourceSection) => {
    const value = String(name || "").toLowerCase();
    if (/günəş|solar/.test(value) && /lampa|işıq|çırağ|projektor/.test(value)) return ["lighting", "Günəş lampası"];
    if (/led lent|neon/.test(value)) return ["lighting", "LED lent"];
    if (/projektor/.test(value)) return ["lighting", "LED projektor"];
    if (/spot|trek/.test(value)) return ["lighting", value.includes("trek") ? "Trek işıq" : "Spot işıq"];
    if (/lampa|işıq|çırağ|panel işıq/.test(value)) return ["lighting", "LED lampa"];
    if (/rozetka|söndürən/.test(value)) return ["electrical", "Rozetka və açarlar"];
    if (/uzadıcı|baraban|blok .*yuva|çəngəl|taxıc/.test(value)) return ["electrical", "Uzadıcı və baraban"];
    if (/kabel|cat|cctv|telefon uzatma/.test(value)) return ["electrical", value.includes("cctv") ? "CCTV kabel" : "Montaj kabeli"];
    if (/rele|stabilizator|paylama bloku|qutu|xamut|qövs|büzücü/.test(value)) return ["electrical", "Rele və avtomatika"];
    if (/multimetr|gərginlik|indikator/.test(value)) return ["measuring-surveying", "Multimetr"];
    if (/qaynaq/.test(value)) return ["welding-cutting", "MIG/MMA qaynaq"];
    if (/lazer|nivelir|dərəcə/.test(value)) return ["measuring-surveying", "Lazer nivelir"];
    if (/perforator/.test(value)) return ["tools", "Perforator"];
    if (/drel|şurup|vintaçan/.test(value)) return ["tools", "Drel və şurupbağlayan"];
    if (/lobzik|mişar|kəsici|kafel kəsici/.test(value)) return ["tools", /kafel/.test(value) ? "Kafel kəsici" : "Elektrik mişarı"];
    if (/cilalama/.test(value)) return ["tools", "Cilalama maşını"];
    if (/renovator/.test(value)) return ["tools", "Renovator"];
    if (/fen/.test(value)) return ["tools", "İnşaat feni"];
    if (/neyler|stepler/.test(value)) return ["tools", "Neyler və stepler"];
    if (/boyaçəkən/.test(value)) return ["tools", "Boya püskürdücü"];
    if (/lehim/.test(value)) return ["tools", "Lehim aparatı"];
    if (/qayka açan/.test(value)) return ["tools", "Qayka açan"];
    if (/alət dəsti|açar dəsti/.test(value)) return ["tools", "Açar dəsti"];
    if (/unitaz|çanaq|lavabo/.test(value)) return ["sanitary-ware", value.includes("mətbəx") ? "Mətbəx çanağı" : "Lavabo və çanaq"];
    if (/grohe|kran|suqarışdırıcı|qarışdırıcı|aerator|arko/.test(value)) return ["sanitary-ware", "Suqarışdırıcı"];
    if (/duş|sifon|tros|lyuk|vanna|hamam|bacok|asma çən/.test(value)) return ["sanitary-ware", /mebel|şkaf|güzgü/.test(value) ? "Hamam mebeli" : "Duş qarnituru"];
    if (/boya|astar|lak|emal|tonlayıcı|təmizləyici/.test(value)) {
      if (value.includes("astar")) return ["paints", "Sprey astar"];
      if (value.includes("təmizləyici")) return ["paints", "Boya təmizləyici"];
      if (value.includes("lak")) return ["paints", "Sprey lak"];
      if (value.includes("metal")) return ["paints", "Metal boya"];
      return ["paints", "Interyer boya"];
    }
    if (/oboy|divar kağız|plyonka|maye oboy/.test(value)) return ["wall-decor", value.includes("maye") ? "Maye oboy" : "Flizelin oboy"];
    if (/panel|linoleum|kafel|keramoqranit|mozaika|laminat|döşəmə/.test(value)) return ["flooring", value.includes("kafel") ? "Kafel" : "Divar paneli"];
    if (sourceSection.includes("Elektrik")) return ["electrical", "Elektrik aksesuarları"];
    if (sourceSection.includes("Santexnika")) return ["sanitary-ware", "Hamam aksesuarları"];
    if (sourceSection.includes("Dekor")) return ["repair-retail-items", "Kiçik boya"];
    return ["tools", "Əl alətləri"];
  };

  const inferPackage = (name) => {
    const match = String(name || "").match(/(\d+(?:[.,]\d+)?\s?(?:mm|sm|m|m²|m2|vt|w|kw|kq|kg|l|a|v|əd|parça))/i);
    return match ? match[1].replace("m2", "m²") : "1 əd.";
  };

  const birmarketProducts = birmarketRows.map(([sku, name, brandRaw, price, imageUrl, sourceUrl, sourceSection]) => {
    const localizedName = String(name || "").replace(/\bNo brand\b/gi, "Brendsiz");
    const [category, subcategory] = inferCategory(localizedName, sourceSection);
    const brand = normalizeBrand(brandRaw, localizedName);
    const formattedPrice = Number(price).toLocaleString("az-AZ", { minimumFractionDigits: Number.isInteger(price) ? 0 : 2, maximumFractionDigits: 2 }) + " AZN";
    return {
      id: "birmarket-" + sku,
      sku: "BM-" + sku,
      name: localizedName,
      brand,
      category,
      subcategory,
      supplier: "Birmarket",
      origin: "Azərbaycan bazarı / idxal",
      package: inferPackage(localizedName),
      price: formattedPrice,
      priceNote: "Birmarket açıq katalog qiyməti, 2026-07-11 tarixində yoxlanıldı",
      priceStatus: "confirmed",
      imageUrl,
      sourceUrl,
      sourceLabel: "Birmarket məhsul səhifəsi",
      availability: "Mənbədə stok vəziyyəti ilə yoxlanılır",
      specs: [
        sourceSection,
        subcategory + " üzrə real bazar məhsulu",
        "Qiymət və mövcudluq dəyişə bilər; sifarişdən əvvəl təchizatçı təsdiqi lazımdır"
      ]
    };
  });

  const tvimRows = [
    ["001", "A tip İzospan membranı", "İzospan", "insulation", "Membran", "1 m² / ədəd (dəqiqləşdirilməlidir)", 0.69, "Satışda", "https://tvim.az/image/cache/catalog/izospan_A-removebg-preview-240x240.png", "https://tvim.az/az/a-tip-i-zospan", ["Su və küləkdən qoruyucu membran", "Qiymət vahidi satıcı ilə dəqiqləşdirilməlidir"]],
    ["002", "AF+ İzospan membranı", "İzospan", "insulation", "Membran", "1 m² / ədəd (dəqiqləşdirilməlidir)", 2.86, "Satışda", "https://tvim.az/image/cache/catalog/_af_1_-removebg-preview-240x240.png", "https://tvim.az/az/af-i-zospan", ["İstilik əks etdirən membran", "Qiymət vahidi satıcı ilə dəqiqləşdirilməlidir"]],
    ["003", "Mr.Fix Akdeniz mavi fuga 1 kq", "Mr.Fix", "adhesives-sealants", "Fuga", "1 kq", 2.78, "Satışda", "https://tvim.az/image/cache/catalog/mrmrmrmrmrmrfix-240x240.png", "https://tvim.az/az/akdeniz-mavi-1kq-mr-fix", ["Kafel arası üçün rəngli fuga", "Akdeniz mavi rəng"]],
    ["004", "Knauf Diamant alçıpan 12,5 × 2500 × 1200 mm", "Knauf", "drywall-ceilings", "Alçıpan lövhə", "1 lövhə", 19.4, "Sifarişlə", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%20Jun%2020,%202025,%2010_52_26%20AM-240x240.png", "https://tvim.az/az/alcipan-diamant-12-5x2500x1200mm-knauf", ["12,5 mm qalınlıq", "2500 × 1200 mm ölçü", "Məhsul kodu: YM08366"]],
    ["005", "Gilan Knauf EKOGIP-A alçıpan 9,5 × 2500 × 1200 mm", "Gilan Knauf", "drywall-ceilings", "Alçıpan lövhə", "1 lövhə", 3.1, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%20Aug%209,%202025,%2001_41_32%20PM-240x240.png", "https://tvim.az/az/alcipan-ekogip-a-9-5x2500x1200mm-gilan-knauf", ["9,5 mm qalınlıq", "2500 × 1200 mm ölçü"]],
    ["006", "Gilan Knauf EKOGIP-H3 nəmə davamlı alçıpan 9,5 × 2500 × 1200 mm", "Gilan Knauf", "drywall-ceilings", "Yaşıl alçıpan", "1 lövhə", 3.45, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%20Aug%209,%202025,%2001_41_32%20PM-240x240.png", "https://tvim.az/az/alcipan-ekogip-h3-9-5x2500x1200mm-gilan-knauf", ["Nəmə davamlı H3 lövhə", "9,5 mm qalınlıq", "2500 × 1200 mm ölçü"]],
    ["007", "Gilan Knauf GKL alçıpan 9,5 mm, 1 lövhə = 3 m²", "Gilan Knauf", "drywall-ceilings", "Alçıpan lövhə", "1 lövhə / 3 m²", 3.83, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%20Jun%2020,%202025,%2010_38_17%20AM-240x240.png", "https://tvim.az/az/alcipan-gkl-9-5mm-1p-3m2-gilan-knauf", ["9,5 mm qalınlıq", "Bir lövhənin sahəsi 3 m²"]],
    ["008", "Gilan Knauf GKL-A alçıpan 12,5 × 2500 × 1200 mm", "Gilan Knauf", "drywall-ceilings", "Alçıpan lövhə", "1 lövhə", 3.85, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%20Aug%209,%202025,%2001_41_32%20PM-240x240.png", "https://tvim.az/az/alcipan-gkl-a-12-5x2500x1200mm-gilan-knauf", ["12,5 mm qalınlıq", "2500 × 1200 mm ölçü"]],
    ["009", "Gilan Knauf GKL-A alçıpan 9,5 × 2500 × 1200 mm", "Gilan Knauf", "drywall-ceilings", "Alçıpan lövhə", "1 lövhə", 3.35, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%20Aug%209,%202025,%2001_41_32%20PM-240x240.png", "https://tvim.az/az/alcipan-gkl-a-9-5x2500x1200mm-gilan-knauf", ["9,5 mm qalınlıq", "2500 × 1200 mm ölçü"]],
    ["010", "Gilan Knauf GKL-DFIR yanğına davamlı alçıpan 12,5 × 2500 × 1200 mm", "Gilan Knauf", "drywall-ceilings", "Yanğına davamlı alçıpan", "1 lövhə", 4.45, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%20Aug%209,%202025,%2001_41_32%20PM-240x240.png", "https://tvim.az/az/alcipan-gkl-dfir-12-5x2500x1200mm-gilan-knauf", ["Yanğına davamlı DFIR lövhə", "12,5 mm qalınlıq", "2500 × 1200 mm ölçü"]],
    ["011", "Gilan Knauf GKL-H2 nəmə davamlı alçıpan 12,5 × 2500 × 1200 mm", "Gilan Knauf", "drywall-ceilings", "Yaşıl alçıpan", "1 lövhə", 4.2, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%20Aug%209,%202025,%2001_41_32%20PM-240x240.png", "https://tvim.az/az/alcipan-gkl-h2-12-5x2500x1200mm-gilan-knauf", ["Nəmə davamlı H2 lövhə", "12,5 mm qalınlıq", "2500 × 1200 mm ölçü"]],
    ["012", "Gilan Knauf GKL-H2 nəmə davamlı alçıpan 9,5 × 2500 × 1200 mm", "Gilan Knauf", "drywall-ceilings", "Yaşıl alçıpan", "1 lövhə", 3.7, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%20Aug%209,%202025,%2001_41_32%20PM-240x240.png", "https://tvim.az/az/alcipan-gkl-h2-9-5x2500x1200mm-gilan-knauf", ["Nəmə davamlı H2 lövhə", "9,5 mm qalınlıq", "2500 × 1200 mm ölçü"]],
    ["013", "Primet C tipli alçıpan profili", "Primet", "drywall-ceilings", "CD/UD profil", "1 ədəd", 1.5, "Satışda", "https://tvim.az/image/cache/catalog/duvar-u-alcipan-profil-50mm-3-mt-e7092a-500x500-240x240.webp", "https://tvim.az/az/alcipan-profili-c-primet", ["C tipli karkas profili", "Ölçü satıcı ilə dəqiqləşdirilməlidir"]],
    ["014", "Primet U tipli alçıpan profili", "Primet", "drywall-ceilings", "CD/UD profil", "1 ədəd", 0.9, "Satışda", "https://tvim.az/image/cache/catalog/duvar-u-alcipan-profil-50mm-3-mt-e7092a-240x240.webp", "https://tvim.az/az/alcipan-profili-u-primet", ["U tipli karkas profili", "Ölçü satıcı ilə dəqiqləşdirilməlidir"]],
    ["015", "Knauf Sapfir alçıpan 12,5 × 2500 × 1200 mm", "Knauf", "drywall-ceilings", "Alçıpan lövhə", "1 lövhə", 8.25, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%20Jun%2020,%202025,%2010_52_26%20AM-240x240.png", "https://tvim.az/az/alcipan-sapfir-12-5x2500x1200mm-knauf", ["12,5 mm qalınlıq", "2500 × 1200 mm ölçü"]],
    ["016", "AQ Proff İzospan membranı", "İzospan", "insulation", "Membran", "1 m² / ədəd (dəqiqləşdirilməlidir)", 2.3, "Satışda", "https://tvim.az/image/cache/catalog/_aq-kopiya__1_-removebg-preview-240x240.png", "https://tvim.az/az/aq-proff-i-zospan", ["Peşəkar su və külək izolyasiya membranı", "Qiymət vahidi satıcı ilə dəqiqləşdirilməlidir"]],
    ["017", "Knauf Aquapanel Indoor 1200 × 2400 × 12,5 mm", "Knauf", "drywall-ceilings", "Sement əsaslı lövhə", "1 lövhə", 27, "Satışda", "https://tvim.az/image/cache/catalog/Aquapanel0000000-240x240.png", "https://tvim.az/az/aquapanel-i-ndoor-knauf-1200x2400-12-5mm", ["Sement əsaslı daxili lövhə", "1200 × 2400 × 12,5 mm", "Məhsul kodu: YM08522"]],
    ["018", "Knauf Aquapanel Outdoor 1200 × 2400 × 12,5 mm", "Knauf", "drywall-ceilings", "Sement əsaslı lövhə", "1 lövhə", 28, "Satışda", "https://tvim.az/image/cache/catalog/aquout-240x240.jpeg", "https://tvim.az/az/aquapanel-out-knauf-1200x2400-12-5mm", ["Sement əsaslı xarici lövhə", "1200 × 2400 × 12,5 mm"]],
    ["019", "Knauf Aquapanel Universal 900 × 1200 × 8 mm", "Knauf", "drywall-ceilings", "Sement əsaslı lövhə", "1 lövhə", 20, "Satışda", "https://tvim.az/image/cache/catalog/c87de45d-2861-48e0-ac2a-901839e5992a-removebg-preview-240x240.png", "https://tvim.az/az/aquapanel-universal-knauf-900x1200-8mm", ["Universal sement əsaslı lövhə", "900 × 1200 × 8 mm"]],
    ["020", "AS 130 Proff İzospan membranı", "İzospan", "insulation", "Membran", "1 m² / ədəd (dəqiqləşdirilməlidir)", 1.55, "Satışda", "https://tvim.az/image/cache/catalog/100.-removebg-preview-240x240.png", "https://tvim.az/az/as-130-proff-izospan", ["Peşəkar diffuziya membranı", "Qiymət vahidi satıcı ilə dəqiqləşdirilməlidir"]],
    ["021", "Dalsan Boardex fasad lövhəsi 1200 × 2400 × 12,5 mm", "Dalsan", "facade-systems", "Fasad lövhəsi", "1 lövhə", 19.79, "Satışda", "https://tvim.az/image/cache/catalog/boardex-240x240.png", "https://tvim.az/az/boardex-1200x2400-12-5mm-dalsan", ["Fasad və nəm zonalar üçün lövhə", "1200 × 2400 × 12,5 mm"]],
    ["022", "Hekimboard fibrosement Betopan 1250 × 2500 × 8 mm", "Hekimboard", "facade-systems", "Fibrosement lövhə", "1 lövhə", 48.35, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%205%20Eyl%202025%2009_42_02-240x240.png", "https://tvim.az/az/fibrosement-lovheleri-betopan-1250x2500x8mm-hekimboard", ["Fibrosement lövhə", "1250 × 2500 × 8 mm"]],
    ["023", "Hekimboard fibrosement Betopan 1250 × 2500 × 10 mm", "Hekimboard", "facade-systems", "Fibrosement lövhə", "1 lövhə", 58, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%205%20Eyl%202025%2009_42_02-240x240.png", "https://tvim.az/az/fibrosement-lovheleri-betopan-1250x2500x10mm-hekimboard", ["Fibrosement lövhə", "1250 × 2500 × 10 mm"]],
    ["024", "Hekimboard fibrosement Betopan 1250 × 2500 × 12 mm", "Hekimboard", "facade-systems", "Fibrosement lövhə", "1 lövhə", 70, "Satışda", "https://tvim.az/image/cache/catalog/ChatGPT%20Image%205%20Eyl%202025%2009_42_02-240x240.png", "https://tvim.az/az/fibrosement-lovheleri-betopan-1250x2500x12mm-hekimboard", ["Fibrosement lövhə", "1250 × 2500 × 12 mm"]],
    ["025", "Knauf Guardex fasad lövhəsi 1200 × 2400 × 12,5 mm", "Knauf", "facade-systems", "Fasad lövhəsi", "1 lövhə", 19.5, "Satışda", "https://tvim.az/image/cache/catalog/89oCOglyj6pibEII-240x240.jpeg", "https://tvim.az/az/guardex-knauf-1200x2400-12-5mm", ["Xarici divar və fasad üçün lövhə", "1200 × 2400 × 12,5 mm"]],
    ["026", "Mətanət A Parakontakt astarı 20 kq", "Mətanət A", "construction-chemicals", "Astar və primer", "20 kq", 40, "Satışda", "https://tvim.az/image/cache/catalog/products-97-240x240.webp", "https://tvim.az/az/parakontakt-20kq-metanet-a", ["Beton səthlər üçün kontakt astar", "20 kq qablaşdırma"]],
    ["027", "Panda Panplus Premium ağ interyer boyası 25 kq / 15 L", "Panda", "paints", "Interyer boya", "25 kq / 15 L", 85.5, "Satışda", "https://tvim.az/image/cache/catalog/1745301874_gLo26ualaW-240x240.jpg", "https://tvim.az/az/panplus-premium-ic-cebhe-boyasi-ag-25kq-15l-panda", ["Ağ, mat interyer boyası", "25 kq / 15 L qablaşdırma"]],
    ["028", "Panda Panakril mat fasad boyası 3,5 kq", "Panda", "paints", "Eksteryer boya", "3,5 kq", 12.1, "Satışda", "", "https://tvim.az/az/panakril-fasad-mat-3-5kq-panda", ["Mat fasad boyası", "3,5 kq qablaşdırma", "Mənbədə yalnız placeholder şəkil göstərilir"]],
    ["029", "Turkaz şəffaf akvarium silikonu 280 ml", "Turkaz", "construction-chemicals", "Silikon", "280 ml", 7.5, "Satışda", "https://tvim.az/image/cache/catalog/75e8e6e4-5500-4d75-9681-b864e1577eee-240x240.jpg", "https://tvim.az/az/akvarium-silikonu-280ml-seffaf-turkaz", ["Şəffaf akvarium silikonu", "280 ml patron"]],
    ["030", "Metylan Premium Universal oboy yapışqanı 500 q", "Metylan", "wall-decor", "Oboy yapışqanı", "500 q", 15.5, "Satışda", "https://tvim.az/image/cache/catalog/235390-5813cc9b063df60d34d4029cf21857a4-240x240.webp", "https://tvim.az/az/oboy-kleyi-premium-universal-500qr-metylan", ["Universal divar kağızı yapışqanı", "500 q qablaşdırma"]],
    ["031", "METAK PP kanalizasiya borusu Ø75, 50 sm", "METAK", "drainage-sewer", "Kanalizasiya borusu", "1 ədəd", 2.13, "Satışda", "https://tvim.az/image/cache/catalog/ff6a6764-2b5d-4921-9c41-61b38faf565a-removebg-preview-240x240.png", "https://tvim.az/az/pp-boru-75-50sm-metak", ["Ø75 mm PP boru", "50 sm uzunluq"]],
    ["032", "METAK PP üçlük Ø110, 90°", "METAK", "plumbing", "Fitinqlər", "1 ədəd", 2.62, "Satışda", "https://tvim.az/image/cache/catalog/eecc7aa3-a770-436c-aec1-615cdd6213e5-removebg-preview-240x240.png", "https://tvim.az/az/pp-ucluk-110-90-metak", ["Ø110 mm PP üçlük", "90° bucaq"]],
    ["033", "METAK PPRC amerikanka iç diş 25 × 25", "METAK", "plumbing", "Fitinqlər", "1 ədəd", 2.62, "Satışda", "https://tvim.az/image/cache/catalog/metakkkkkkkkk-240x240.png", "https://tvim.az/az/pprc-amerikanka-i-c-dis-25x25-metak", ["PPRC birləşdirici", "İç diş 25 × 25"]],
    ["034", "Fırat 5 çıxışlı kollektor", "Fırat", "plumbing", "Kollektor", "1 ədəd", 90, "Satışda", "https://tvim.az/image/cache/catalog/WhatsApp_G%C3%B6rsel_2025-06-24_saat_11.39.50_87b32c78-removebg-preview-240x240.png", "https://tvim.az/az/kollektor-5-cixisli-firat", ["5 çıxışlı su kollektoru", "Fitinq ölçüləri satıcı ilə dəqiqləşdirilməlidir"]],
    ["035", "Gold Banyo BO 607 unitaz", "Gold Banyo", "sanitary-ware", "Döşəmə unitaz", "1 ədəd", 175, "Satışda", "https://tvim.az/image/cache/catalog/tm-dg-snt-1119-cm-0021_1-240x240.webp", "https://tvim.az/az/unitaz-bo-607-gold-banyo", ["BO 607 model döşəmə unitazı", "Komplektasiya satıcı ilə dəqiqləşdirilməlidir"]],
    ["036", "Derya keramik lavabo 55 sm", "Derya", "sanitary-ware", "Lavabo", "1 ədəd", 65, "Satışda", "", "https://tvim.az/", ["55 sm keramik lavabo", "Birbaşa məhsul səhifəsi və foto yenidən yoxlanmalıdır"]],
    ["037", "Bosch GSB 600 zərbəli drel", "Bosch", "tools", "Drel", "1 ədəd", 90, "Satışda", "https://tvim.az/image/cache/catalog/827136-fd02f2a7fbfad48eacbfb1d4d67e73a6-240x240.webp", "https://tvim.az/az/drel-gsb-600-bosch", ["GSB 600 model zərbəli drel", "Şəbəkədən qidalanma"]],
    ["038", "Bosch GSB 13 RE zərbəli drel", "Bosch", "tools", "Drel", "1 ədəd", 140, "Satışda", "https://tvim.az/image/cache/catalog/impact-drill-gsb-13-re-6634-1000x1000-240x240.webp", "https://tvim.az/az/drel-gsb-13-re-bosch", ["GSB 13 RE model zərbəli drel", "Sürət tənzimlənməsi"]],
    ["039", "INGCO ID8508-2 drel 850 W", "INGCO", "tools", "Drel", "1 ədəd", 73.92, "Satışda", "https://tvim.az/image/cache/catalog/923da399-f6c1-11e7-a01d-000c29bb375f-240x240.webp", "https://tvim.az/az/drel-850w-ingco", ["850 W güc", "Model: ID8508-2"]],
    ["040", "INGCO HLL306505 lazer səviyyə 30 m", "INGCO", "measuring-surveying", "Lazer nivelir", "1 ədəd", 171, "Satışda", "", "https://tvim.az/", ["30 m iş məsafəsi", "Model: HLL306505", "Birbaşa məhsul səhifəsi və foto yenidən yoxlanmalıdır"]]
  ];

  const tvimProducts = tvimRows.map(([sku, name, brand, category, subcategory, packageText, price, availability, imageUrl, sourceUrl, specs]) => ({
    id: "tvim-20260718-" + sku,
    sku: "TVIM-20260718-" + sku,
    name,
    brand,
    category,
    subcategory,
    supplier: "TVIM",
    origin: "Azərbaycan bazarı / idxal",
    package: packageText,
    price: Number(price).toLocaleString("az-AZ", { minimumFractionDigits: Number.isInteger(price) ? 0 : 2, maximumFractionDigits: 2 }) + " AZN",
    priceAmount: price,
    priceCurrency: "AZN",
    priceNote: "TVIM pərakəndə qiyməti, 18.07.2026 tarixində yoxlanılıb; stok, ƏDV və çatdırılma sifarişdən əvvəl təsdiqlənməlidir",
    priceStatus: "confirmed",
    priceVerifiedAt: "2026-07-18T00:00:00.000Z",
    imageUrl,
    sourceUrl,
    sourceLabel: sourceUrl === "https://tvim.az/" ? "TVIM kataloqu" : "TVIM məhsul səhifəsi",
    availability,
    specs: [
      ...specs,
      "Pərakəndə qiymət; topdan sifariş və çatdırılma ayrıca təsdiqlənir"
    ]
  }));

  const sourcedBrands = [...new Set([...birmarketProducts, ...officialProducts, ...tvimProducts].map((product) => product.brand))]
    .filter(Boolean)
    .map((brand, index) => ({
      id: slugify(brand) || "market-brand-" + String(index + 1).padStart(2, "0"),
      name: brand,
      country: brand === "Penguin" || brand === "Birmarket" ? "Azərbaycan" : "Bazar təchizatçısı",
      segments: ["tools", "electrical", "lighting", "sanitary-ware", "paints", "flooring"],
      website: brand === "Birmarket" ? "https://birmarket.az" : "Təchizatçı / rəsmi məhsul səhifəsi",
      certification: "Açıq mənbə məhsul məlumatı"
    }));

  appendUnique("brands", sourcedBrands);
  appendUnique("products", officialProducts);
  appendUnique("products", birmarketProducts);
  appendUnique("products", tvimProducts);

  const existingProductKeys = new Set((data.products || []).map((item) => item.category + "::" + item.subcategory));
  const generatedMarketProducts = [];
  data.categories.forEach((category) => {
    (category.subcategories || []).forEach((subcategory, index) => {
      const key = category.id + "::" + subcategory;
      if (existingProductKeys.has(key)) return;
      generatedMarketProducts.push({
        id: "az-rfq-" + category.id + "-" + slugify(subcategory),
        sku: "AZ-RFQ-" + slugify(category.id).toUpperCase() + "-" + String(index + 1).padStart(2, "0"),
        name: subcategory + " məhsul qrupu",
        brand: "ConstEra Sorğu",
        category: category.id,
        subcategory,
        supplier: "Açıq Azərbaycan təchizatçı bazası",
        origin: "Azərbaycan/İdxal",
        package: "Layihəyə görə",
        price: "Sorğu əsasında",
        priceNote: "Bu alt kateqoriya real təchizatçı qiyməti və məhsul fotosu əlavə edilənə qədər qiymət sorğusu ilə işləyir",
        priceStatus: "request",
        availability: "Təchizatçıdan asılıdır",
        specs: [
          category.title || category.id,
          subcategory + " üzrə məhsul qrupu",
          "İdarəetmə panelindən real SKU, qiymət və foto ilə əvəzlənə bilər"
        ]
      });
      existingProductKeys.add(key);
    });
  });
  appendUnique("products", generatedMarketProducts);

  const marketPackageRows = [
    {
      id: "az-market-hazirev-praktik",
      title: "Hazırev Praktik təmir paketi",
      category: "ready-renovation",
      subcategory: "Ekonom təmir",
      type: "Hazır təmir",
      level: "ekonom",
      providerName: "Hazırev",
      providerType: "company",
      providerWebsite: "https://hazirev.az/",
      providerVerified: true,
      unit: "m²",
      price: "189 AZN / m²",
      priceAmount: 189,
      priceCurrency: "AZN",
      priceUnit: "m²",
      pricingBasis: "100 m² nümunəsi üzrə mənbədə göstərilir",
      priceConfirmationRequired: true,
      timeline: "Təklif zamanı dəqiqləşir",
      team: "Hazırev icra komandası",
      idealFor: "Sadə, funksional və büdcəyə həssas mənzil təmiri",
      includes: ["Təmir işləri", "Materialların çatdırılması və qaldırılması", "Tullantıların təmizlənməsi", "Yekun təmizlik"],
      deliverables: ["İş həcmi", "Mərhələli smeta", "Müqavilə və təhvil şərtləri"],
      warrantyMonths: 12,
      sourceUrl: "https://hazirev.az/",
      sourceLabel: "Hazırev rəsmi saytı",
      lastVerified: "2026-07-18"
    },
    {
      id: "az-market-hazirev-trend",
      title: "Hazırev Trend təmir paketi",
      category: "ready-renovation",
      subcategory: "Standart təmir",
      type: "Hazır təmir",
      level: "standart",
      providerName: "Hazırev",
      providerType: "company",
      providerWebsite: "https://hazirev.az/",
      providerVerified: true,
      unit: "m²",
      price: "249 AZN / m²",
      priceAmount: 249,
      priceCurrency: "AZN",
      priceUnit: "m²",
      pricingBasis: "100 m² nümunəsi üzrə mənbədə göstərilir",
      priceConfirmationRequired: true,
      timeline: "Təklif zamanı dəqiqləşir",
      team: "Hazırev icra komandası",
      idealFor: "Müasir görünüşlü, orta büdcəli mənzil təmiri",
      includes: ["Təmir işləri", "Materialların çatdırılması və qaldırılması", "Tullantıların təmizlənməsi", "Yekun təmizlik"],
      deliverables: ["İş həcmi", "Mərhələli smeta", "Müqavilə və təhvil şərtləri"],
      warrantyMonths: 12,
      sourceUrl: "https://hazirev.az/",
      sourceLabel: "Hazırev rəsmi saytı",
      lastVerified: "2026-07-18"
    },
    {
      id: "az-market-hazirev-premium",
      title: "Hazırev Premium təmir paketi",
      category: "ready-renovation",
      subcategory: "Premium təmir",
      type: "Premium təmir",
      level: "premium",
      providerName: "Hazırev",
      providerType: "company",
      providerWebsite: "https://hazirev.az/",
      providerVerified: true,
      unit: "m²",
      price: "299 AZN / m²",
      priceAmount: 299,
      priceCurrency: "AZN",
      priceUnit: "m²",
      pricingBasis: "100 m² nümunəsi üzrə mənbədə göstərilir",
      priceConfirmationRequired: true,
      timeline: "Təklif zamanı dəqiqləşir",
      team: "Hazırev premium icra komandası",
      idealFor: "Xüsusi interyer elementləri olan premium mənzil təmiri",
      includes: ["Təmir işləri", "Xüsusi interyer elementləri", "Materialların çatdırılması və qaldırılması", "Yekun təmizlik"],
      deliverables: ["İş həcmi", "Premium material smetası", "Müqavilə və təhvil şərtləri"],
      warrantyMonths: 12,
      sourceUrl: "https://hazirev.az/kalk/3",
      sourceLabel: "Hazırev rəsmi saytı",
      lastVerified: "2026-07-18"
    },
    {
      id: "az-market-baki-acar-teslim-270",
      title: "Bakı açar təslim təmir və tikinti paketi",
      category: "full-combo",
      subcategory: "Açar təslim ev",
      type: "Tikinti + təmir",
      level: "standart",
      providerName: "Bakı açar təslim təmir xidməti",
      providerType: "market_listing",
      providerWebsite: "https://tap.az/elanlar/xidmetler/temir-tikinti/47811374",
      providerVerified: false,
      unit: "m²",
      price: "270 AZN / m²-dən",
      priceAmount: 270,
      priceCurrency: "AZN",
      priceUnit: "m²",
      pricePrefix: "from",
      pricingBasis: "Elan mənbəsində göstərilən başlanğıc qiymət",
      priceConfirmationRequired: true,
      timeline: "Layihə və sahə baxışından sonra",
      team: "Layihə, dizayn və icra komandası",
      idealFor: "Fərdi layihə, əsaslı təmir və interyer dizaynını birləşdirən açar təslim iş",
      includes: ["Fərdi layihə", "Əsaslı təmir", "Interyer dizaynı", "Eskiz və işçi layihə", "Material və işçilik", "Müqavilə və zəmanət"],
      deliverables: ["Layihə brifi", "Mərhələli smeta", "Müqavilə şərtləri"],
      sourceUrl: "https://tap.az/elanlar/xidmetler/temir-tikinti/47811374",
      sourceLabel: "Tap.az elan mənbəyi",
      lastVerified: "2026-07-18"
    },
    {
      id: "az-market-standart-temir-450",
      title: "Bakı standart təmir paketi",
      category: "ready-renovation",
      subcategory: "Standart təmir",
      type: "Hazır təmir",
      level: "standart",
      providerName: "Standart təmir təklifi",
      providerType: "social_listing",
      providerWebsite: "https://www.instagram.com/p/DXi5K-blljg/",
      providerVerified: false,
      unit: "m²",
      price: "450 AZN / m²",
      priceAmount: 450,
      priceCurrency: "AZN",
      priceUnit: "m²",
      pricingBasis: "Sosial media paylaşımında göstərilən qiymət",
      priceConfirmationRequired: true,
      timeline: "Sahə baxışından sonra",
      team: "Təmir briqadası",
      idealFor: "Elektrik, santexnika, suvaq və üzləmə işləri tələb olunan mənzil",
      includes: ["Elektrik sistemi", "Santexnika sistemi", "Suvaq", "Üzləmə işləri"],
      deliverables: ["İş həcmi", "Material smetası", "İcra qrafiki"],
      sourceUrl: "https://www.instagram.com/p/DXi5K-blljg/",
      sourceLabel: "Instagram paylaşımı",
      lastVerified: "2026-07-18"
    },
    {
      id: "az-market-tikinti-temir-500",
      title: "Tikinti və təmir birgə paketi",
      category: "full-combo",
      subcategory: "Açar təslim ev",
      type: "Tikinti + təmir",
      level: "standart",
      providerName: "Tikinti və təmir təklifi",
      providerType: "social_listing",
      providerWebsite: "https://www.instagram.com/p/DVF5NeZCAlQ/",
      providerVerified: false,
      unit: "m²",
      price: "500 AZN / m²-dən",
      priceAmount: 500,
      priceCurrency: "AZN",
      priceUnit: "m²",
      pricePrefix: "from",
      pricingBasis: "Sosial media paylaşımında göstərilən başlanğıc qiymət",
      priceConfirmationRequired: true,
      timeline: "Layihə ölçüsünə görə",
      team: "Tikinti və təmir komandası",
      idealFor: "Tikinti və təmirin vahid müqavilə ilə açar təslim icrası",
      includes: ["Tikinti", "Təmir", "Material", "İşçilik", "Açar təslim"],
      deliverables: ["Tam iş həcmi", "Mərhələli smeta", "Təhvil planı"],
      sourceUrl: "https://www.instagram.com/p/DVF5NeZCAlQ/",
      sourceLabel: "Instagram paylaşımı",
      lastVerified: "2026-07-18"
    },
    {
      id: "az-market-qaba-insaat-250",
      title: "Qaba inşaat paketi",
      category: "ready-construction",
      subcategory: "Qara karkas",
      type: "Hazır tikinti",
      level: "ekonom",
      providerName: "Qaba inşaat təklifi",
      providerType: "social_listing",
      providerWebsite: "https://www.instagram.com/reel/DRuRqHjiM3R/",
      providerVerified: false,
      unit: "m²",
      price: "250 AZN / m²",
      priceAmount: 250,
      priceCurrency: "AZN",
      priceUnit: "m²",
      pricingBasis: "Sosial media paylaşımında göstərilən qiymət",
      priceConfirmationRequired: true,
      timeline: "Layihə ölçüsünə görə",
      team: "Qaba tikinti briqadası",
      idealFor: "Fərdi ev və kiçik obyektlərin qaba inşaat mərhələsi",
      includes: ["Qaba tikinti işləri"],
      deliverables: ["İş həcmi", "Konstruksiya smetası", "Mərhələ planı"],
      sourceUrl: "https://www.instagram.com/reel/DRuRqHjiM3R/",
      sourceLabel: "Instagram paylaşımı",
      lastVerified: "2026-07-18"
    },
    {
      id: "az-market-tam-temir-500",
      title: "Tam təmir və açar təhvil paketi",
      category: "full-combo",
      subcategory: "Açar təslim ev",
      type: "Tikinti + təmir",
      level: "standart",
      providerName: "Tam təmir təklifi",
      providerType: "social_listing",
      providerWebsite: "https://www.instagram.com/reel/DRuRqHjiM3R/",
      providerVerified: false,
      unit: "m²",
      price: "500 AZN / m²",
      priceAmount: 500,
      priceCurrency: "AZN",
      priceUnit: "m²",
      pricingBasis: "Sosial media paylaşımında göstərilən qiymət",
      priceConfirmationRequired: true,
      timeline: "Layihə ölçüsünə görə",
      team: "Dizayn və açar təhvil komandası",
      idealFor: "Material, işçilik və dizayn daxil tam açar təhvil layihə",
      includes: ["Material", "İşçilik", "Dizayn", "Açar təhvil"],
      deliverables: ["Dizayn brifi", "Tam smeta", "Təhvil planı"],
      sourceUrl: "https://www.instagram.com/reel/DRuRqHjiM3R/",
      sourceLabel: "Instagram paylaşımı",
      lastVerified: "2026-07-18"
    },
    {
      id: "az-market-standart-temir-219",
      title: "Kampaniyalı standart təmir paketi",
      category: "ready-renovation",
      subcategory: "Standart təmir",
      type: "Hazır təmir",
      level: "standart",
      providerName: "Standart və komfort təmir təklifi",
      providerType: "social_listing",
      providerWebsite: "https://www.instagram.com/reel/DVZvd2FAqdH/",
      providerVerified: false,
      unit: "m²",
      price: "219 AZN / m²",
      priceAmount: 219,
      oldPriceAmount: 230,
      priceCurrency: "AZN",
      priceUnit: "m²",
      pricingBasis: "Sosial media paylaşımında kampaniya qiyməti kimi göstərilib",
      priceConfirmationRequired: true,
      timeline: "Sahə baxışından sonra",
      team: "Təmir briqadası",
      idealFor: "Materiallar daxil standart mənzil təmiri",
      includes: ["Təmir materialları", "Təmir işləri"],
      deliverables: ["İş həcmi", "Material smetası", "Kampaniya şərtlərinin təsdiqi"],
      sourceUrl: "https://www.instagram.com/reel/DVZvd2FAqdH/",
      sourceLabel: "Instagram paylaşımı",
      lastVerified: "2026-07-18"
    }
  ];
  appendUnique("packages", marketPackageRows);

  mergeCategories("rentalCategories", [
    {
      id: "heavy-equipment",
      group: "Ağır texnika",
      subcategories: ["Mini ekskavator", "Bekolader", "Təkərli ekskavator", "Teleskopik yükləyici"]
    },
    {
      id: "earthworks",
      group: "Torpaq və yol texnikası",
      subcategories: ["Vərdənə", "Katok"]
    },
    {
      id: "access-equipment",
      group: "Hündürlük və iskele",
      subcategories: ["Qayçı platforma"]
    }
  ]);

  const sourcedRentalRows = [
    {
      id: "az-rental-avtokran-xcmg-25t",
      name: "XCMG avtokran 25 ton",
      category: "heavy-equipment",
      subcategory: "Avtokran",
      capacity: "25 ton · 48 m ox",
      unit: "günlük / aylıq",
      price: "350 AZN · elan qiyməti",
      priceAmount: 350,
      priceCurrency: "AZN",
      priceStatus: "source",
      priceConfirmationRequired: true,
      rentalPeriods: ["günlük", "aylıq"],
      city: "Bakı",
      deposit: "Müqavilə əsasında",
      delivery: "Bakı · ünvan və marşrut üzrə",
      operator: "Operatorla",
      specs: ["25 ton qaldırma gücü", "48 m ox uzunluğu", "Günlük və aylıq icarə", "Qiymət sifariş zamanı təsdiqlənir"],
      imageUrl: "assets/images/equipment/avtokran-25t-xcmg.jpg",
      imageCredit: "Tap.az elan şəkli",
      sourceUrl: "https://tap.az/elanlar/xidmetler/neqliyyat-icaresi/46171461",
      sourceLabel: "Tap.az elan mənbəyi",
      sourceVerified: true,
      lastVerified: "2026-07-18"
    },
    {
      id: "az-rental-mini-ekskavator-new-holland-e50",
      name: "Mini ekskavator New Holland Kobelco E50.2SR",
      category: "heavy-equipment",
      subcategory: "Mini ekskavator",
      capacity: "E50.2SR sinfi",
      unit: "günlük / razılaşma ilə",
      price: "250 AZN · elan qiyməti",
      priceAmount: 250,
      priceCurrency: "AZN",
      priceStatus: "source",
      priceConfirmationRequired: true,
      rentalPeriods: ["günlük", "razılaşma ilə"],
      city: "Bakı",
      deposit: "Müqavilə əsasında",
      delivery: "Bakı · obyekt ünvanına görə",
      operator: "Sorğuda dəqiqləşir",
      specs: ["Xəndək qazılması", "Kommunikasiya xətləri", "Landşaft işləri", "Kiçik söküntü", "Qiymət sifariş zamanı təsdiqlənir"],
      imageUrl: "assets/images/equipment/mini-ekskavator-new-holland.jpg",
      imageCredit: "insaat.az elan şəkli",
      sourceUrl: "https://insaat.az/mini-ekskavator-icareye-verilir-32397.html",
      sourceLabel: "insaat.az elan mənbəyi",
      sourceVerified: true,
      lastVerified: "2026-07-18"
    },
    {
      id: "az-rental-naf-telehandler",
      name: "Teleskopik yükləyici / Telehandler",
      category: "heavy-equipment",
      subcategory: "Teleskopik yükləyici",
      capacity: "Modelə və hündürlüyə görə",
      unit: "gün / həftə / ay",
      price: "Sorğu əsasında",
      priceAmount: null,
      priceCurrency: "AZN",
      priceStatus: "request",
      priceConfirmationRequired: true,
      rentalPeriods: ["günlük", "həftəlik", "aylıq"],
      city: "Bakı və Azərbaycan",
      deposit: "Müqavilə əsasında",
      delivery: "Azərbaycan üzrə sorğu ilə",
      operator: "Sorğuda dəqiqləşir",
      specs: ["Hündürlükdə material ötürülməsi", "Yükqaldırma və sahə logistikası", "Model və tutum sorğuda seçilir"],
      imageUrl: "assets/images/equipment/teleskopik-yukleyici.webp",
      imageCredit: "NAF Texnika rəsmi kataloqu",
      sourceUrl: "https://www.naftexnika.az/",
      sourceLabel: "NAF Texnika rəsmi kataloqu",
      sourceVerified: true,
      sourceOfficial: true,
      lastVerified: "2026-07-18"
    },
    {
      id: "az-rental-naf-bekolader",
      name: "JCB bekolader",
      category: "heavy-equipment",
      subcategory: "Bekolader",
      capacity: "Model və komplektasiyaya görə",
      unit: "gün / həftə / ay",
      price: "Sorğu əsasında",
      priceAmount: null,
      priceCurrency: "AZN",
      priceStatus: "request",
      priceConfirmationRequired: true,
      rentalPeriods: ["günlük", "həftəlik", "aylıq"],
      city: "Bakı və Azərbaycan",
      deposit: "Müqavilə əsasında",
      delivery: "Azərbaycan üzrə sorğu ilə",
      operator: "Sorğuda dəqiqləşir",
      specs: ["Qazma və yükləmə", "Sahə hazırlığı", "Model və operator şərti sorğuda seçilir"],
      imageUrl: "assets/images/equipment/bekolader-jcb.webp",
      imageCredit: "NAF Texnika rəsmi kataloqu",
      sourceUrl: "https://www.naftexnika.az/",
      sourceLabel: "NAF Texnika rəsmi kataloqu",
      sourceVerified: true,
      sourceOfficial: true,
      lastVerified: "2026-07-18"
    },
    {
      id: "az-rental-naf-tekerli-ekskavator",
      name: "CAT təkərli ekskavator",
      category: "heavy-equipment",
      subcategory: "Təkərli ekskavator",
      capacity: "Model və iş həcminə görə",
      unit: "gün / həftə / ay",
      price: "Sorğu əsasında",
      priceAmount: null,
      priceCurrency: "AZN",
      priceStatus: "request",
      priceConfirmationRequired: true,
      rentalPeriods: ["günlük", "həftəlik", "aylıq"],
      city: "Bakı və Azərbaycan",
      deposit: "Müqavilə əsasında",
      delivery: "Azərbaycan üzrə sorğu ilə",
      operator: "Sorğuda dəqiqləşir",
      specs: ["Şəhər və yol şəraitində qazıntı", "Mobil ağır texnika", "Model və operator şərti sorğuda seçilir"],
      imageUrl: "assets/images/equipment/tekerli-ekskavator-cat.webp",
      imageCredit: "NAF Texnika rəsmi kataloqu",
      sourceUrl: "https://www.naftexnika.az/",
      sourceLabel: "NAF Texnika rəsmi kataloqu",
      sourceVerified: true,
      sourceOfficial: true,
      lastVerified: "2026-07-18"
    },
    {
      id: "az-rental-market-verdene-130",
      name: "Vərdənə icarəsi",
      category: "earthworks",
      subcategory: "Vərdənə",
      capacity: "Modelə görə",
      unit: "Müddət sorğuda seçilir",
      price: "130 AZN · elan qiyməti",
      priceAmount: 130,
      priceCurrency: "AZN",
      priceStatus: "source",
      priceConfirmationRequired: true,
      rentalPeriods: ["razılaşma ilə"],
      city: "Bakı",
      deposit: "Müqavilə əsasında",
      delivery: "Ünvan üzrə sorğu ilə",
      operator: "Sorğuda dəqiqləşir",
      specs: ["Torpaq və yol sıxlaşdırılması", "Qiymət vahidi və müddət sifariş zamanı təsdiqlənir"],
      sourceUrl: "https://tap.az/elanlar/xidmetler/neqliyyat-icaresi?q%5Bkeywords%5D=tikinti+texnikalari",
      sourceLabel: "Tap.az axtarış nəticəsi",
      sourceVerified: false,
      lastVerified: "2026-07-18"
    },
    {
      id: "az-rental-market-katok-150",
      name: "Katok icarəsi",
      category: "earthworks",
      subcategory: "Katok",
      capacity: "Modelə görə",
      unit: "Müddət sorğuda seçilir",
      price: "150 AZN · elan qiyməti",
      priceAmount: 150,
      priceCurrency: "AZN",
      priceStatus: "source",
      priceConfirmationRequired: true,
      rentalPeriods: ["razılaşma ilə"],
      city: "Bakı",
      deposit: "Müqavilə əsasında",
      delivery: "Ünvan üzrə sorğu ilə",
      operator: "Sorğuda dəqiqləşir",
      specs: ["Torpaq və asfalt sıxlaşdırılması", "Qiymət vahidi və müddət sifariş zamanı təsdiqlənir"],
      sourceUrl: "https://tap.az/elanlar/xidmetler/neqliyyat-icaresi?q%5Bkeywords%5D=tikinti+texnikalari",
      sourceLabel: "Tap.az axtarış nəticəsi",
      sourceVerified: false,
      lastVerified: "2026-07-18"
    },
    {
      id: "az-rental-market-qayci-platforma-70",
      name: "Qayçı səbət platforma",
      category: "access-equipment",
      subcategory: "Qayçı platforma",
      capacity: "Model və hündürlüyə görə",
      unit: "Müddət sorğuda seçilir",
      price: "70 AZN · elan qiyməti",
      priceAmount: 70,
      priceCurrency: "AZN",
      priceStatus: "source",
      priceConfirmationRequired: true,
      rentalPeriods: ["razılaşma ilə"],
      city: "Bakı",
      deposit: "Müqavilə əsasında",
      delivery: "Ünvan üzrə sorğu ilə",
      operator: "Sorğuda dəqiqləşir",
      specs: ["Hündürlükdə montaj və servis", "Qiymət vahidi və müddət sifariş zamanı təsdiqlənir"],
      sourceUrl: "https://tap.az/elanlar/xidmetler/neqliyyat-icaresi?q%5Bkeywords%5D=tikinti+texnikalari",
      sourceLabel: "Tap.az axtarış nəticəsi",
      sourceVerified: false,
      lastVerified: "2026-07-18"
    }
  ];
  appendUnique("rentals", sourcedRentalRows);

  const hasHttpsSource = (item) => /^https:\/\//i.test(String(item?.sourceUrl || ""));
  const hasUsableImage = (item) => /^(?:https:\/\/|\/?assets\/)/i.test(String(item?.imageUrl || ""));
  const hasPositiveAmount = (item) => {
    if (item?.priceAmount === null || item?.priceAmount === undefined || item?.priceAmount === "") return false;
    const amount = Number(item.priceAmount);
    return Number.isFinite(amount) && amount > 0;
  };
  const getSourceQualityScore = (item, kind = "product") => {
    let score = 0;
    const sourced = hasHttpsSource(item);
    const imaged = hasUsableImage(item);
    const priced = hasPositiveAmount(item);

    if (sourced) score += 500;
    if (imaged) score += 180;
    if (priced) score += 120;
    if (kind === "product" && item?.priceStatus === "confirmed" && sourced) score += 180;
    if (kind === "package" && item?.providerVerified) score += 160;
    if (kind === "rental" && item?.sourceOfficial) score += 160;
    else if (kind === "rental" && item?.sourceVerified) score += 80;
    if (item?.priceVerifiedAt || item?.lastVerified) score += 25;
    if (item?.providerName || item?.supplier) score += 10;
    return score;
  };
  const getItemTitle = (item) => String(item?.name || item?.title || item?.sku || item?.id || "");
  const compareSourceQuality = (left, right, kind = "product") =>
    getSourceQualityScore(right, kind) - getSourceQualityScore(left, kind)
      || getItemTitle(left).localeCompare(getItemTitle(right), "az");
  const sortBySourceQuality = (items, kind = "product") =>
    [...(items || [])].sort((left, right) => compareSourceQuality(left, right, kind));

  data.products = sortBySourceQuality(data.products, "product");
  data.packages = sortBySourceQuality(data.packages, "package");
  data.rentals = sortBySourceQuality(data.rentals, "rental");
  window.CONSTERA_MARKETPLACE_RANKING = Object.freeze({
    hasHttpsSource,
    hasUsableImage,
    getSourceQualityScore,
    compareSourceQuality,
    sortBySourceQuality
  });

  data.updatedAt = "2026-07-18";
  data.marketSourceSummary = {
    updatedAt: "2026-07-18",
    birmarketProducts: birmarketProducts.length,
    officialProducts: officialProducts.length,
    tvimProducts: tvimProducts.length,
    sourcedPackages: marketPackageRows.length,
    sourcedRentals: sourcedRentalRows.length,
    generatedRfqProducts: generatedMarketProducts.length,
    note: "Qiymətlər açıq mənbələrdən götürülüb və dəyişə bilər. Sifarişdən əvvəl təchizatçı təsdiqi lazımdır. Şəkillər xarici mənbə URL-ləri kimi saxlanılıb."
  };
})();
