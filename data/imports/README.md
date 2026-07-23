# ConstEra master kataloq importu

`constera-master-catalog-v1-v3.json` kumulyativ `v3` mənbə faylıdır və `v1`, `v2`, `v3`
paketlərindəki bütün unikal qeydləri saxlayır.

- `v1` SHA-256: `cce3800855204ad11ed5cd4891f48f227791e84f46a51eedbd0e4a91a6be0ebd`
- `v2` SHA-256: `84519e8e3ef92debc140ebaa4646bedf8addfedde43dae5a18a35d6b46d74de0`
- `v3` SHA-256: `7ce137c35662881871345f0273cef0d3141f884daad5dc9b7401cd6787faca93`

Publik kataloqa keçid qaydaları `window.CONSTERA_MARKETPLACE.masterCatalogImport`
obyektində qeyd olunur:

- dəqiq mənbəsi olan aktiv qeydlər yayımlanır;
- eyni məhsul və ya elan mövcuddursa daha dolğun ConstEra qeydi qorunur;
- `historical_listing` və `verify_before_publish` qeydləri arxivdə qalır, publik olmur;
- qiymət və stok 23.07.2026 tarixində yenidən yoxlanmış məhsullarda ayrıca qeyd edilir.
