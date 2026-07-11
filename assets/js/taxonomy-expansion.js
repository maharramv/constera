(function expandConsteraTaxonomy() {
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

  const materialCategories = [
    {
      id: "dry-mixes",
      group: "Qarışıqlar və kimya",
      subcategories: ["Maşın suvağı", "Gips karton yapışdırıcı", "Fuga", "Dekorativ suvaq", "Sürətli təmir qarışığı", "İsti döşəmə şapı"]
    },
    {
      id: "paints",
      group: "Tamamlama və dekor",
      subcategories: ["Tavan boyası", "Antibakterial boya", "Metal boyası", "Taxta boyası", "Teksturalı boya", "Rəng pastası", "Boya alətləri"]
    },
    {
      id: "construction-chemicals",
      group: "Qarışıqlar və kimya",
      subcategories: ["Astar və primer", "Sement qatqısı", "Antifriz qatqı", "Epoksi boya", "Kimyəvi anker", "Səth möhkəmləndirici"]
    },
    {
      id: "cement-concrete",
      group: "Konstruksiya və daşıyıcı sistem",
      subcategories: ["Sement M400", "Sement M500", "Beton C20/25", "Beton C25/30", "Quru beton", "Beton blok", "Hazır hörgü məhlulu"]
    },
    {
      id: "metal",
      group: "Metal və konstruksiya",
      subcategories: ["Katanka", "Armaturlu setka", "Bağlama məftili", "Metal konstruksiya", "Paslanmaz profil", "Sendviç panel karkası"]
    },
    {
      id: "electrical",
      group: "Elektrik və zəif axın",
      subcategories: ["NYM kabel", "VVG kabel", "Yanğına davamlı kabel", "UPS", "Kontaktör", "Rele", "Torpaqlama", "Kabel ləvazimatları"]
    },
    {
      id: "plumbing",
      group: "Santexnika və su sistemləri",
      subcategories: ["Metal-plastik boru", "HDPE boru", "Kollektor", "Vanalar", "Su sayğacı", "Duş sistemi", "Hamam aksessuarları"]
    },
    {
      id: "hvac",
      group: "HVAC və iqlim",
      subcategories: ["VRV/VRF sistem", "Chiller", "Hava pərdəsi", "Kanal tipli kondisioner", "İstilik nasosu", "Termostat", "Hava diffuzoru"]
    },
    {
      id: "tools",
      group: "Alətlər və sərfiyyat",
      subcategories: ["Mişar", "Frezer", "Beton kəsici", "Alət batareyası", "Burğu və tac", "Disklər", "Ölçü lentləri", "Alət çantası"]
    },
    {
      id: "fasteners",
      group: "Bərkidici və furnitura",
      subcategories: ["Gips karton şurupu", "Taxta şurupu", "Metal anker", "Kimyəvi anker", "Perçin", "Kronşteyn", "Montaj lentləri"]
    },
    {
      id: "insulation",
      group: "İzolyasiya və membran",
      subcategories: ["PIR panel", "Akustik panel", "Səs izolyasiyası", "Su izolyasiya membranı", "Geotekstil", "Folqalı izolyasiya", "Kauçuk izolyasiya"]
    },
    {
      id: "flooring",
      group: "Döşəmə və üzlük",
      subcategories: ["LVT", "Vinil döşəmə", "Epoksi döşəmə", "Xalça plitə", "Süni mərmər", "Mərmər", "Qranit", "Fuga və profil"]
    },
    {
      id: "doors-windows",
      group: "Qapı, pəncərə və şüşə",
      subcategories: ["Alüminium vitraj", "Sürüşmə sistem", "Oda davamlı qapı", "Avtomatik qapı", "Şüşə arakəsmə", "Pəncərə altlığı", "Jalüz və pərdə"]
    },
    {
      id: "roofing",
      group: "Dam və fasad",
      subcategories: ["Sandviç panel", "Keramika kirəmit", "PVC membran", "EPDM membran", "Dam pəncərəsi", "Qar tutucu", "Baca və vent çıxışı"]
    },
    {
      id: "safety",
      group: "Təhlükəsizlik və mühafizə",
      subcategories: ["İş ayaqqabısı", "Reflektor jilet", "Respirator", "Təhlükəsizlik kəməri", "İlk yardım dəsti", "Yanğın şkafı", "Access control"]
    },
    {
      id: "landscape",
      group: "Ərazi və landşaft",
      subcategories: ["Qazon", "Dekorativ daş", "Açıq hava işıqlandırması", "Drenaj kanalı", "Suvarma nasosu", "Pergola", "Bağ mebeli"]
    },
    {
      id: "masonry-blocks",
      group: "Konstruksiya və daşıyıcı sistem",
      title: "Kərpic, blok və hörgü",
      subtitle: "Qazbeton, beton blok, kərpic, daş və hörgü sistemləri",
      subcategories: ["Qazbeton blok", "Beton blok", "Keramzit blok", "Kərpic", "Mişar daşı", "Dekorativ daş", "Hörgü toru", "Arakəsmə blok"]
    },
    {
      id: "bulk-materials",
      group: "Konstruksiya və daşıyıcı sistem",
      title: "Toplu xammal",
      subtitle: "Qum, çınqıl, şebel, dolğu və sahə hazırlığı materialları",
      subcategories: ["Yuyulmuş qum", "Karxana qumu", "Çınqıl 5-20", "Çınqıl 20-40", "Şebel", "Gil", "Dolğu torpağı", "Qara torpaq"]
    },
    {
      id: "drywall-ceilings",
      group: "Tamamlama və dekor",
      title: "Alçıpan və tavan sistemləri",
      subtitle: "Alçıpan, profil, asma tavan, akustik tavan və aksesuarlar",
      subcategories: ["Alçıpan lövhə", "Yaşıl alçıpan", "Yanğına davamlı alçıpan", "CD/UD profil", "Asma tavan kaseti", "Akustik tavan", "Tavan aksesuarı", "Tavan izolyasiyası"]
    },
    {
      id: "facade-systems",
      group: "Dam və fasad",
      title: "Fasad sistemləri",
      subtitle: "Ventilyasiyalı fasad, suvaq fasad, daş üzlük və fasad aksesuarları",
      subcategories: ["Ventilyasiyalı fasad", "Kompozit panel", "Fasad daşı", "Fasad keramikası", "Fasad profili", "Termo fasad", "Fasad setkası", "Fasad dübeli"]
    },
    {
      id: "waterproofing-systems",
      group: "İzolyasiya və membran",
      title: "Hidroizolyasiya sistemləri",
      subtitle: "Membran, sürtmə izolyasiya, drenaj və yaş zona sistemləri",
      subcategories: ["Bitum membran", "PVC membran", "Sürtmə hidroizolyasiya", "Kristalizə izolyasiya", "Drenaj membranı", "Buxar bariyeri", "Hamam izolyasiyası", "Dam izolyasiyası"]
    },
    {
      id: "adhesives-sealants",
      group: "Qarışıqlar və kimya",
      title: "Yapışdırıcı, silikon və mastik",
      subtitle: "Montaj yapışdırıcıları, silikonlar, mastiklər və fugalar",
      subcategories: ["Poliuretan yapışdırıcı", "MS polymer", "Sanitar silikon", "Akril mastik", "Yanğına davamlı mastik", "Fuga", "Epoksi fuga", "Maye mismar"]
    },
    {
      id: "sanitary-ware",
      group: "Santexnika və su sistemləri",
      title: "Sanitar avadanlıq",
      subtitle: "Unitaz, lavabo, duş, vanna və sanitar aksesuarlar",
      subcategories: ["Asma unitaz", "Döşəmə unitaz", "Lavabo", "Duş kabinəsi", "Vanna", "Duş seti", "İnstallasiya sistemi", "Hamam mebeli"]
    },
    {
      id: "heating-systems",
      group: "HVAC və iqlim",
      title: "İstilik sistemləri",
      subtitle: "Kombi, radiator, isti döşəmə və istilik aksesuarları",
      subcategories: ["Kombi", "Panel radiator", "Alüminium radiator", "İsti döşəmə borusu", "Kollektor qrupu", "Dövriyyə nasosu", "Termostat", "Kombi aksesuarı"]
    },
    {
      id: "lighting",
      group: "Elektrik və zəif axın",
      title: "İşıqlandırma",
      subtitle: "LED panel, projektor, xətti işıq və dekorativ işıqlandırma",
      subcategories: ["LED panel", "Spot işıq", "Xətti işıq", "Projektor", "Avariyalı işıq", "Fasad işığı", "Bağ işığı", "LED lent"]
    },
    {
      id: "low-current",
      group: "Elektrik və zəif axın",
      title: "Zəif axın və təhlükəsizlik sistemləri",
      subtitle: "CCTV, interkom, LAN, alarm və giriş nəzarət sistemləri",
      subcategories: ["CCTV kamera", "NVR/DVR", "LAN kabel", "Rack kabinet", "Interkom", "Alarm sistemi", "Giriş kartı", "Turniket"]
    },
    {
      id: "smart-home",
      group: "Elektrik və zəif axın",
      title: "Smart home və avtomatika",
      subtitle: "Ağıllı ev, sensor, röle, pərdə və iqlim idarəetməsi",
      subcategories: ["Smart rele", "Sensor", "Ağıllı açar", "Pərdə motoru", "İqlim idarəsi", "Gateway", "Ssenari paneli", "Enerji monitorinqi"]
    },
    {
      id: "solar-energy",
      group: "Enerji və generator",
      title: "Günəş enerjisi",
      subtitle: "Panel, inverter, batareya və montaj sistemləri",
      subcategories: ["Günəş paneli", "Solar inverter", "Batareya", "Montaj konstruksiyası", "DC kabel", "Kombiner box", "Solar qoruyucu", "Enerji monitorinqi"]
    },
    {
      id: "generators-power",
      group: "Enerji və generator",
      title: "Generator və enerji ehtiyatı",
      subtitle: "Dizel generator, UPS, stabilizator və enerji paylama",
      subcategories: ["Dizel generator", "Benzin generator", "UPS", "Stabilizator", "ATS panel", "Yanacaq çəni", "Generator kabini", "Enerji paylayıcı"]
    },
    {
      id: "pumps-water",
      group: "Santexnika və su sistemləri",
      title: "Nasos və su təchizatı",
      subtitle: "Su nasosları, hidrofor, filtrasiya və su anbarı sistemləri",
      subcategories: ["Hidrofor", "Drenaj nasosu", "Quyu nasosu", "Sirkulyasiya nasosu", "Su filtri", "Su anbarı", "Təzyiq çəni", "Nasos avtomatikası"]
    },
    {
      id: "pool-spa",
      group: "Santexnika və su sistemləri",
      title: "Hovuz və SPA",
      subtitle: "Hovuz avadanlığı, filtrasiya, kimya və üzlük sistemləri",
      subcategories: ["Hovuz pompası", "Hovuz filtri", "Skimmer", "Hovuz kimyası", "Mozaika", "Hovuz işığı", "Sauna avadanlığı", "SPA aksesuarı"]
    },
    {
      id: "kitchen-interior",
      group: "İnteryer və mebel",
      title: "Mətbəx və interyer materialları",
      subtitle: "Mətbəx, mebel paneli, aksesuar və interyer tamamlayıcıları",
      subcategories: ["MDF panel", "Akril panel", "Mətbəx dəzgahı", "Mebel furniturası", "Sürgü sistemi", "Qarderob sistemi", "Dekor panel", "Akustik panel"]
    },
    {
      id: "road-infrastructure",
      group: "Ərazi və landşaft",
      title: "Yol və infrastruktur",
      subtitle: "Səki, bordür, drenaj, kanal və yol təhlükəsizliyi materialları",
      subcategories: ["Səki daşı", "Bordür", "Drenaj kanalı", "Yağış barmaqlığı", "Geotekstil", "Yol nişanı", "Bariyer", "Asfalt materialı"]
    },
    {
      id: "storage-logistics",
      group: "Anbar və logistika",
      title: "Anbar və logistika avadanlığı",
      subtitle: "Rəf, palet, konteyner, qablaşdırma və anbar sistemləri",
      subcategories: ["Anbar rəfi", "Palet", "Stretch film", "Qablaşdırma lenti", "Konteyner", "Transpalet", "Anbar arabası", "Etiket sistemi"]
    },
    {
      id: "cleaning-maintenance",
      group: "Təmizlik və baxım",
      title: "Təmizlik və baxım məhsulları",
      subtitle: "Təmir sonrası təmizlik, kimyəvi vasitələr və baxım ləvazimatları",
      subcategories: ["Təmizlik kimyası", "Sənaye tozsoranı", "Mop və araba", "Fasad yuma vasitəsi", "Döşəmə baxımı", "Dezinfeksiya", "Tullantı torbası", "Təmizlik aksesuarı"]
    }
  ];

  const serviceCategories = [
    {
      id: "construction",
      group: "Tikinti icrası",
      subcategories: ["Dəmir-beton işləri", "Metal konstruksiya", "Sənaye döşəməsi", "Sandviç panel montajı", "Anbar tikintisi", "Kiçik memarlıq formaları"]
    },
    {
      id: "renovation",
      group: "Təmir və fit-out",
      subcategories: ["Açar təslim mənzil", "Premium mənzil təmiri", "Villa interyeri", "Restoran təmiri", "Klinika təmiri", "Showroom fit-out"]
    },
    {
      id: "design",
      group: "Dizayn və sənədlər",
      subcategories: ["İşçi layihə", "MEP layihəsi", "BIM model", "Render animasiya", "Material board", "Müəllif nəzarəti"]
    },
    {
      id: "engineering",
      group: "Mühəndis sistemləri",
      subcategories: ["Kombi və istilik", "İsti döşəmə", "Ventilyasiya balanslama", "Generator montajı", "Solar sistem montajı", "Access control"]
    },
    {
      id: "finishing",
      group: "Tamamlama və dekor",
      subcategories: ["Mikrosement", "Epoksi döşəmə", "Dekorativ boya", "Akustik panel", "Şüşə arakəsmə", "Mebel montajı"]
    },
    {
      id: "exterior",
      group: "Fasad və ərazi",
      subcategories: ["Ventilyasiyalı fasad", "Kompozit panel fasad", "Hovuz tikintisi", "Pergola və kölgəlik", "Avtomatik suvarma", "Açıq hava işıqlandırması"]
    },
    {
      id: "preconstruction",
      group: "Hazırlıq və layihə öncəsi",
      title: "Layihə öncəsi hazırlıq",
      subtitle: "Ölçü, audit, geologiya, planlama və icazə hazırlığı",
      subcategories: ["Sahə ölçüsü", "Texniki tapşırıq", "Geologiya koordinasiyası", "Mövcud vəziyyət planı", "İcazə sənədləri", "Risk auditi", "Büdcə planlama", "Təchizat strategiyası"]
    },
    {
      id: "demolition",
      group: "Söküntü və hazırlıq",
      title: "Söküntü və utilizasiya",
      subtitle: "Söküntü, tullantı, sahə boşaltma və təhlükəsiz hazırlıq işləri",
      subcategories: ["Daxili söküntü", "Beton kəsmə", "Tullantı daşınması", "Sahə təmizliyi", "Qoruyucu örtük", "Toz nəzarəti", "Təhlükəsiz giriş", "Utilizasiya planı"]
    },
    {
      id: "industrial-services",
      group: "Sənaye və B2B",
      title: "Sənaye və anbar xidmətləri",
      subtitle: "Anbar, istehsalat, logistika və sənaye obyektləri üçün işlər",
      subcategories: ["Sənaye döşəməsi", "Anbar rəf montajı", "Yükləmə zonası", "Yanğın xətti", "Sənaye elektrik", "Kompressor xətti", "Ofis-anbar fit-out", "Texniki otaq"]
    },
    {
      id: "handover-cleaning",
      group: "Təhvil və servis",
      title: "Təmizlik, təhvil və servis",
      subtitle: "Təmir sonrası təmizlik, defekt listi, servis və zəmanət koordinasiyası",
      subcategories: ["Təmir sonrası təmizlik", "Qüsur siyahısı", "Zəmanət servisi", "Foto hesabat", "Son yoxlama", "İstismar təlimatı", "Aylıq baxım", "Təcili servis"]
    }
  ];

  const packageCategories = [
    {
      id: "ready-renovation",
      group: "Təmir paketləri",
      subcategories: ["White box təmir", "Açar təslim mənzil", "Kirayə üçün təmir", "Premium interyer", "Təcili təmir"]
    },
    {
      id: "ready-construction",
      group: "Tikinti paketləri",
      subcategories: ["Fundament paketi", "Karkas + dam", "Ağ suvaq + MEP", "Sənaye karkası", "Kiçik obyekt tikintisi"]
    },
    {
      id: "full-combo",
      group: "Tam həllər",
      subcategories: ["Ev + landşaft", "Villa + hovuz", "Restoran tam paket", "Klinika tam paket", "Sərgi zalı tam paket", "Anbar + ofis"]
    },
    {
      id: "room-packages",
      group: "Otaq və zona paketləri",
      title: "Otaq və zona paketləri",
      subtitle: "Ayrı-ayrı otaq, yaş zona və kommersiya zonaları üçün paketlər",
      subcategories: ["Uşaq otağı", "Yataq otağı", "Qonaq otağı", "Dəhliz və giriş", "Balkon və terras", "Sanitar qovşaq", "Mətbəx zonası", "Server otağı"]
    },
    {
      id: "engineering-packages",
      group: "Mühəndis paketləri",
      title: "Mühəndis sistem paketləri",
      subtitle: "Elektrik, santexnika, HVAC, zəif axın və smart home paketləri",
      subcategories: ["Elektrik tam paket", "Santexnika tam paket", "HVAC tam paket", "Zəif axın tam paket", "Yanğın təhlükəsizliyi", "Ağıllı ev", "Günəş enerjisi", "Generator ehtiyatı"]
    },
    {
      id: "exterior-packages",
      group: "Fasad və ərazi paketləri",
      title: "Fasad və ərazi paketləri",
      subtitle: "Fasad, dam, həyət, hasar, landşaft və açıq hava sistemləri",
      subcategories: ["Fasad tam paket", "Dam tam paket", "Həyət abadlığı", "Hasar və darvaza", "Landşaft tam paket", "Hovuz və SPA", "Pergola və terras", "Açıq işıqlandırma"]
    },
    {
      id: "maintenance-packages",
      group: "Servis paketləri",
      title: "Baxım və servis paketləri",
      subtitle: "Obyektlər üçün aylıq texniki servis və təmir dəstəyi",
      subcategories: ["Aylıq usta servisi", "Ofis baxımı", "Obyekt baxımı", "HVAC servis", "Santexnika servis", "Elektrik servis", "Təmizlik servisi", "Təcili paket"]
    }
  ];

  const rentalCategories = [
    {
      id: "survey-measurement",
      group: "Ölçmə və nəzarət",
      title: "Ölçmə və nəzarət cihazları",
      subtitle: "Geodeziya, termal yoxlama, nəm və keyfiyyət nəzarəti cihazları",
      subcategories: ["Elektron taxometr", "GNSS ölçmə cihazı", "Fırlanan lazer niveliri", "Termal kamera", "Nəm ölçən", "Beton skaner", "Məsafəölçən", "Endoskop kamera"]
    },
    {
      id: "demolition-cutting",
      group: "Söküntü və kəsmə",
      title: "Söküntü və kəsmə avadanlığı",
      subtitle: "Beton, asfalt, divar, metal və söküntü üçün avadanlıq",
      subcategories: ["Otboynik", "Divar mişarı", "Döşəmə mişarı", "Beton qırıcı", "Hidravlik çəkic", "Plazma kəsici", "Toz tutucu", "Söküntü konteyneri"]
    },
    {
      id: "welding-metalwork",
      group: "Metal emalı",
      title: "Qaynaq və metal emalı",
      subtitle: "Qaynaq, kəsmə, bükmə və metal montaj avadanlığı",
      subcategories: ["MIG qaynaq", "TIG qaynaq", "Qaynaq generatoru", "Boru bükən", "Profil kəsən", "Maqnit drel", "Plazma kəsici", "Qaz kəsmə dəsti"]
    },
    {
      id: "painting-coating",
      group: "Tamamlama alətləri",
      title: "Boya və örtük avadanlığı",
      subtitle: "Boya, dekorativ örtük, epoksi və fasad tətbiqi avadanlığı",
      subcategories: ["Havasız boya aparatı", "Kompressorlu boya dəsti", "Epoksi qarışdırıcı", "Dekorativ mala", "Fasad püskürtmə", "Rəng qarışdırıcı", "Quruducu lampa", "Maskalama dəsti"]
    },
    {
      id: "site-safety-rental",
      group: "Sahə təhlükəsizliyi",
      title: "Sahə təhlükəsizliyi icarəsi",
      subtitle: "Müvəqqəti təhlükəsizlik, giriş, işarələmə və qoruma sistemləri",
      subcategories: ["Düşmə qoruma", "Müvəqqəti işıqlandırma", "Sahə kamera sistemi", "Giriş turniketi", "Təhlükəsizlik toru", "Qoruyucu örtük", "Səs bariyeri", "Yanğın seti"]
    }
  ];

  mergeCategories("categories", materialCategories);
  mergeCategories("serviceCategories", serviceCategories);
  mergeCategories("packageCategories", packageCategories);
  mergeCategories("rentalCategories", rentalCategories);

  appendUnique("brands", [
    { id: "constera-rfq", name: "ConstEra Sorğu", country: "Azərbaycan", segments: ["bulk-materials", "masonry-blocks", "facade-systems", "lighting", "tools"], website: "rfq.html", certification: "Qiymət sorğusu məhsul qrupu" },
    { id: "akkord", name: "Akkord", country: "Azərbaycan", segments: ["cement-concrete", "masonry-blocks"], website: "Təchizatçı təsdiqi lazımdır", certification: "Yerli bazar profili" },
    { id: "matanat-a", name: "Matanat A", country: "Azərbaycan", segments: ["dry-mixes", "construction-chemicals"], website: "matanata.com", certification: "Yerli bazar profili" },
    { id: "fawori", name: "Fawori", country: "Türkiyə", segments: ["paints"], website: "fawori.com.tr", certification: "Qlobal kataloq" },
    { id: "filli-boya", name: "Filli Boya", country: "Türkiyə", segments: ["paints"], website: "filliboya.com", certification: "Qlobal kataloq" },
    { id: "eca", name: "E.C.A.", country: "Türkiyə", segments: ["plumbing", "heating-systems"], website: "eca.com.tr", certification: "Qlobal kataloq" },
    { id: "hager", name: "Hager", country: "Almaniya", segments: ["electrical"], website: "hager.com", certification: "Qlobal kataloq" },
    { id: "hilti", name: "Hilti", country: "Lixtenşteyn", segments: ["tools", "fasteners"], website: "hilti.com", certification: "Qlobal kataloq" },
    { id: "dewalt", name: "DeWALT", country: "ABŞ", segments: ["tools"], website: "dewalt.com", certification: "Qlobal kataloq" },
    { id: "ingco", name: "INGCO", country: "Çin", segments: ["tools"], website: "ingcotools.com", certification: "Qlobal kataloq" }
  ]);

  const existingProductKeys = new Set((data.products || []).map((item) => `${item.category}::${item.subcategory}`));
  const generatedProducts = [];
  data.categories.forEach((category) => {
    (category.subcategories || []).forEach((subcategory, index) => {
      const key = `${category.id}::${subcategory}`;
      if (existingProductKeys.has(key)) return;
      generatedProducts.push({
        id: `rfq-${category.id}-${slugify(subcategory)}`,
        sku: `RFQ-${slugify(category.id).slice(0, 8).toUpperCase()}-${String(index + 1).padStart(2, "0")}`,
        name: `${subcategory} məhsul qrupu`,
        brand: "ConstEra Sorğu",
        category: category.id,
        subcategory,
        supplier: "Açıq təchizatçı bazası",
        origin: "Azərbaycan/İdxal",
        package: "Layihəyə görə",
        price: "Sorğu əsasında",
        priceNote: "Qiymət sorğusu və təchizatçı siyahısı ilə təsdiqlənir",
        availability: "Təchizatçıdan asılıdır",
        specs: [
          `${category.title} kateqoriyası`,
          `${subcategory} üzrə ölçü, marka və variantlar`,
          "Miqdar, çatdırılma və sertifikat tələbi Qiymət sorğusunda dəqiqləşdirilir"
        ]
      });
    });
  });
  appendUnique("products", generatedProducts);

  const existingServiceKeys = new Set((data.services || []).map((item) => `${item.category}::${item.subcategory}`));
  const generatedServices = [];
  data.serviceCategories.forEach((category) => {
    (category.subcategories || []).forEach((subcategory) => {
      const key = `${category.id}::${subcategory}`;
      if (existingServiceKeys.has(key)) return;
      generatedServices.push({
        id: `svc-${category.id}-${slugify(subcategory)}`,
        title: `${subcategory} xidməti`,
        category: category.id,
        subcategory,
        type: category.title,
        unit: "layihə / m²",
        price: "Sorğu əsasında",
        leadTime: "Brif və sahə baxışından sonra",
        team: "İxtisaslaşmış usta və sahə koordinatoru",
        specs: [
          `${category.title} üzrə iş həcmi`,
          "Material, usta və avadanlıq tələbi ayrıca hesablanır",
          "Qiymət sorğusu əsasında qiymət və icra qrafiki hazırlanır"
        ],
        deliverables: ["İş həcmi", "Smeta bazası", "Təhvil qeydi"]
      });
    });
  });
  appendUnique("services", generatedServices);

  const existingPackageKeys = new Set((data.packages || []).map((item) => `${item.category}::${item.subcategory}`));
  const generatedPackages = [];
  data.packageCategories.forEach((category) => {
    (category.subcategories || []).forEach((subcategory) => {
      const key = `${category.id}::${subcategory}`;
      if (existingPackageKeys.has(key)) return;
      generatedPackages.push({
        id: `pkg-${category.id}-${slugify(subcategory)}`,
        title: `${subcategory} hazır paketi`,
        category: category.id,
        subcategory,
        type: category.title,
        unit: "paket / layihə",
        price: "Sorğu əsasında",
        timeline: "Layihə ölçüsünə görə",
        team: "Paket komandası + texniki nəzarət",
        idealFor: `${subcategory} üzrə sürətli Qiymət sorğusu və standartlaşdırılmış icra planı`,
        includes: [
          "İş həcminin strukturlaşdırılması",
          "Material və usta ehtiyacının çıxarılması",
          "Qiymət sorğusu üçün təchizat və icra paketinin hazırlanması"
        ],
        deliverables: ["Paket smetası", "İcra qrafiki", "Təhvil checklist-i"]
      });
    });
  });
  appendUnique("packages", generatedPackages);

  const existingRentalKeys = new Set((data.rentals || []).map((item) => `${item.category}::${item.subcategory}`));
  const generatedRentals = [];
  data.rentalCategories.forEach((category) => {
    (category.subcategories || []).forEach((subcategory) => {
      const key = `${category.id}::${subcategory}`;
      if (existingRentalKeys.has(key)) return;
      generatedRentals.push({
        id: `rent-${category.id}-${slugify(subcategory)}`,
        name: `${subcategory} icarəsi`,
        category: category.id,
        subcategory,
        capacity: "Layihəyə görə",
        unit: "gün / həftə / ay",
        price: "Sorğu əsasında",
        deposit: "Müqavilə əsasında",
        delivery: "Obyekt ünvanı və müddətə görə",
        operator: "Şərtə görə",
        specs: [
          `${category.title} üzrə istifadə`,
          "Müddət və çatdırılma Qiymət sorğusunda dəqiqləşdirilir",
          "Operator və servis şərtləri ayrıca təsdiqlənir"
        ]
      });
    });
  });
  appendUnique("rentals", generatedRentals);

  data.taxonomySummary = {
    materialCategories: data.categories.length,
    materialSubcategories: data.categories.reduce((sum, category) => sum + (category.subcategories || []).length, 0),
    serviceCategories: data.serviceCategories.length,
    serviceSubcategories: data.serviceCategories.reduce((sum, category) => sum + (category.subcategories || []).length, 0),
    packageCategories: data.packageCategories.length,
    packageSubcategories: data.packageCategories.reduce((sum, category) => sum + (category.subcategories || []).length, 0),
    rentalCategories: data.rentalCategories.length,
    rentalSubcategories: data.rentalCategories.reduce((sum, category) => sum + (category.subcategories || []).length, 0)
  };
})();
