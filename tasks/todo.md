# DeployWitness — Uygulama Görev Listesi

> MVP implementation status (2026-09-30): public repo created; Coolify read-only verifier, HTTP probes, config loader, CLI, Node 24 GitHub Action, JSON report, examples, CI, and 21 unit tests are implemented. npm registry publish is pending registry authentication and trusted-publishing setup; broader provider adapters and Retry-After support remain roadmap work.

Bu liste plan onaylandıktan sonra uygulama sırasıdır. Her görev ayrı ve gözden geçirilebilir bir dilim olarak bitirilir; geniş görevler alt görevlere bölünür.

## Faz 0 — Ürün sözleşmesi

### DW-01: Proje adını ve public kapsamı kesinleştir

**İş:** Ürün adı DeployWitness olarak kararlaştırıldı; repo, npm, GitHub Action ve metadata yüzeylerinde ortaklaştır.

**Kabul ölçütleri:**
- [x] Ürün adı DeployWitness olarak kararlaştırıldı ve proje metadata'sına işlendi.
- [ ] Repo slug, package scope, CLI binary ve Action adı kararlı biçimde seçilmiş.
- [ ] README one-liner, neyi kanıtladığını ve sınırlamalarını anlatıyor.

**Doğrulama:** GitHub/npm adı önceki araştırmada müsaitti; public repo oluşturma sırasında tekrar doğrulanacak.
**Bağımlılık:** Yok.
**Boyut:** S.

### DW-02: JSON kanıt modeli ve karar kurallarını dondur

**İş:** Check status’ları, required/warn davranışı, failure code’ları, rapor versioning ve PASS kararının koşullarını tanımla.

**Kabul ölçütleri:**
- [ ] PASS sadece bütün zorunlu kanıtlar doğruysa mümkün.
- [ ] UNKNOWN, UNSUPPORTED, SKIP, WARN ve FAIL birbirinden ayrılıyor.
- [ ] Örnek başarılı/başarısız rapor ve JSON Schema dokümante edilmiş.

**Doğrulama:** Şema örnekleri valid; decision contract örnek vakalarda beklenen kararı üretiyor.
**Bağımlılık:** DW-01.
**Boyut:** M.

### DW-03: Coolify API yetki ve uyumluluk matrisi

**İş:** Uygulama deployment listesi/status/commit endpoint’lerini ve minimum salt-okunur izinleri resmi docs ve uygun test ortamında doğrula.

**Kabul ölçütleri:**
- [ ] Token kapsamı en az gerekli izinle belgelenmiş.
- [ ] Desteklenen deployment alanları, pagination ve geçerli status değerleri fixture’larla kayıtlı.
- [ ] Bilinmeyen status ve eksik SHA davranışı açıkça fail-closed.

**Doğrulama:** Resmi doküman referansı ve redakte edilmiş örnek yanıtlar.
**Bağımlılık:** DW-02.
**Boyut:** M.

## Faz 1 — Repo temeli

### DW-04: TypeScript workspace ve kalite kapılarını kur

**İş:** Strict TypeScript, ESM, workspace, lint/format, test runner, build ve Node matrix CI’sini ekle.

**Kabul ölçütleri:**
- [ ] Temiz clone’da tek dokümante kurulum komutu çalışıyor.
- [ ] CI lint, typecheck, tests ve build yapıyor.
- [ ] Node runtime aralığı ve action runtime ayrı ve belgeli.

**Doğrulama:** CI Node 22/24 build/typecheck; package manager lock temiz.
**Bağımlılık:** DW-01.
**Boyut:** M.

### DW-05: Public repo yönetişimi ve güvenlik politikası

**İş:** Lisans, README, SECURITY.md, CONTRIBUTING.md, Code of Conduct, issue/PR şablonları ve dependabot ekle.

**Kabul ölçütleri:**
- [ ] Lisans dosyası ve paket metadata eşleşiyor.
- [ ] Güvenlik bildirimi kanalı ve desteklenen sürüm politikası açıklanmış.
- [ ] CI izinleri minimumda; bağımlılık güncellemeleri kontrollü.

**Doğrulama:** Repo metadata denetimi, link ve workflow permission review.
**Bağımlılık:** DW-04.
**Boyut:** M.

## Faz 2 — İlk doğrulama dilimi

### DW-06: Coolify read-only istemci ve hata modeli

**İş:** Bearer auth, HTTPS, timeout, request-id, API hata sınıflandırması ve redaction içeren minimal istemci oluştur.

**Kabul ölçütleri:**
- [ ] Her istek deadline ve response size sınırıyla çalışıyor.
- [ ] 401/403, rate limit, 5xx, network ve invalid JSON farklı failure code veriyor.
- [ ] Token hiçbir error/log/test snapshot’ında görünmüyor.

**Doğrulama:** Stub server testleri; unauthorized ve malformed responses.
**Bağımlılık:** DW-03, DW-04.
**Boyut:** M.

### DW-07: Coolify deployment adapter

**İş:** Uygulamanın deployment kayıtlarını ortak ProviderSnapshot modeline eşle ve hedef SHA’ya ait son dağıtımı bul.

**Kabul ölçütleri:**
- [ ] Full SHA eşleşmesi yapılır; short SHA başarı sayılmaz.
- [ ] Pending/running beklenir; başarılı/failure/cancelled/unknown açık sonuç verir.
- [ ] API ham body’si kullanıcı raporuna aktarılmaz.

**Doğrulama:** Her status, no deployment, wrong SHA ve missing field fixture testleri.
**Bağımlılık:** DW-02, DW-06.
**Boyut:** M.

### DW-08: Doğrulama orkestrasyonu ve rapor üretimi

**İş:** Provider check’lerini ortak check modelinde çalıştır, karar ver ve sürümlü JSON/terminal raporu oluştur.

**Kabul ölçütleri:**
- [ ] Check sonucu source/observedAt/expected/observed ile ilişkilendirilir.
- [ ] Sırlar ve raw response alanları schema tarafından dışlanır.
- [ ] Zorunlu unknown/timeout PASS üretemez.

**Doğrulama:** Karar tablosu testleri ve snapshot olmayan stabil JSON assertions.
**Bağımlılık:** DW-02, DW-07.
**Boyut:** M.

**Kontrol noktası:** DW-08 sonunda yalnızca Coolify deployment kaydıyla doğrulama çalışan yerel bir dikey dilim tamamlanmış olur.

## Faz 3 — Dış runtime doğrulaması

### DW-09: HTTP health probe

**İş:** Status, response header, JSON path, TLS/DNS, timeout ve marker eşitliği kontrollerini sağlayıcıdan bağımsız ekle.

**Kabul ölçütleri:**
- [ ] Status 200 ile deployment SHA kanıtı birbirine karıştırılmaz.
- [ ] Redirect sonrası auth header başka origin’e aktarılmaz.
- [ ] Required/warn policy ve per-probe timeout çalışır.

**Doğrulama:** Local HTTP server ile 2xx/4xx/5xx, redirect, timeout, TLS ve marker senaryoları.
**Bağımlılık:** DW-08.
**Boyut:** M.

### DW-10: URL güvenlik sınırları

**İş:** URL parse/host validation, private network politikası, response size ve redirect limitlerini tanımla.

**Kabul ölçütleri:**
- [ ] HTTPS varsayılan; localhost sadece açık local-development flag’iyle.
- [ ] Link-local/private IP ve redirect politikası açıkça uygulanır.
- [ ] URL/header injection girdileri shell veya GitHub command olarak yürütülmez.

**Doğrulama:** IPv4/IPv6 internal adres, DNS rebind sınırları için tasarım incelemesi, redirect chain ve oversized response testleri.
**Bağımlılık:** DW-09.
**Boyut:** M.

## Faz 4 — Kullanım yüzeyleri

### DW-11: Config şeması, env resolution ve init

**İş:** YAML/JSON config, Zod validation, env var expansion ve dosya oluşturan init komutunu ekle.

**Kabul ölçütleri:**
- [ ] Unknown key ve yanlış tip alan bazında gösteriliyor.
- [ ] Secret değerleri config dump/diagnostic çıktısında gizli.
- [ ] init mevcut config’i varsayılan olarak ezmiyor.

**Doğrulama:** Valid/invalid config örnekleri ve overwrite guard.
**Bağımlılık:** DW-02, DW-09.
**Boyut:** M.

### DW-12: CLI komutları ve exit-code API

**İş:** init, config validate, verify, explain, version, json/report format seçeneklerini sun.

**Kabul ölçütleri:**
- [ ] PASS, verification fail, config/provider failure ve timeout exit code’ları belgeli ve stabil.
- [ ] CLI offline config validation yapabilir.
- [ ] Human ve JSON rapor aynı decision/check sonuçlarına dayanır.

**Doğrulama:** CLI integration tests, help output ve packed consumer smoke.
**Bağımlılık:** DW-08, DW-11.
**Boyut:** M.

### DW-13: Node 24 GitHub Action

**İş:** action.yml, input/output contract, Action Toolkit integration, summary ve annotation ekle.

**Kabul ölçütleri:**
- [ ] Action aynı core çağrısını kullanır; ikinci bir decision motoru yok.
- [ ] GitHub token varsayılanı gerekmez; minimum izinler ve token maskleme uygulanır.
- [ ] Başarısız required check workflow adımını başarısız bitirir.

**Doğrulama:** action test harness, workflow fixture ve step summary escaping testleri.
**Bağımlılık:** DW-12.
**Boyut:** M.

### DW-14: Action bundle ve release tag akışı

**İş:** Node action bundle üretimi, generated dist kontrolü ve SHA pin’li release rehberi.

**Kabul ölçütleri:**
- [ ] CI bundle’ın kaynakla güncel olduğunu doğrular.
- [ ] Action `uses: owner/repo@<full-sha>` örneği sunar.
- [ ] GitHub release tag’i immutable action referansı sağlar.

**Doğrulama:** Clean checkout bundle/build ve örnek consumer workflow.
**Bağımlılık:** DW-13.
**Boyut:** S.

## Faz 5 — Public beta ve gerçek hedefte kanıt

### DW-15: Quickstart ve Coolify örnekleri

**İş:** Basic app, sürüm endpoint’i ve monorepo resource matrix için uçtan uca doküman/example yaz.

**Kabul ölçütleri:**
- [ ] İlk kurulum 10 dakikada tamamlanabilir.
- [ ] Coolify token ve resource UUID ayarları least-privilege açıklamasıyla gösterilir.
- [ ] Provider/HTTP/marker kanıtlarının ayrı anlamları dokümante edilir.

**Doğrulama:** Örnek workflow YAML validation ve clean repo install walkthrough.
**Bağımlılık:** DW-13, DW-14.
**Boyut:** M.

### DW-16: DeployWitness’u kendi staging uygulamasında çalıştır

**İş:** Önce non-production Coolify uygulaması ve health marker ile controlled end-to-end doğrulama yap.

**Kabul ölçütleri:**
- [ ] Beklenen SHA eşleşmesi ve kasıtlı yanlış SHA failure’ı gözlemlenmiş.
- [ ] App healthy ama marker yanlış senaryosu PASS vermiyor.
- [ ] Token/PII rapora çıkmıyor; rapor JSON şemaya uyuyor.

**Doğrulama:** Redakte edilmiş staging raporu, GitHub Actions run linki ve negative control kanıtı.
**Bağımlılık:** DW-15.
**Boyut:** M.

### DW-17: v0.1 beta yayınla ve sonraki ihtiyaçları ölç

**İş:** Public repo, npm package ve GitHub Action release’i yayınla; provider genişleme talebini issue template ile topla.

**Kabul ölçütleri:**
- [ ] README npm install ve full-SHA Action kurulumunu içerir.
- [ ] npm tarball yalnızca runtime dosyaları, lisans ve gerekli dokümanları içerir.
- [ ] Changelog, desteklenen runtime, semver ve deprecation politikası var.

**Doğrulama:** npm registry’den temiz consumer install, GitHub Action SHA ile çalıştırma, public CI.
**Bağımlılık:** DW-16.
**Boyut:** M.

## İleriki sürüm adayları — MVP tamamlandıktan sonra

- Render/Railway/Fly.io gibi provider adapter’ları (yalnızca istenen ve belgelenmiş API’lerle).
- GitHub deployment status/check-run entegrasyonu, gerekirse isteğe bağlı izinle.
- Önceki/sonraki deploy diff’i ve rollback target kanıtı (rollback icra etmeden).
- Attestation/provenance; önce tehdit modeli ve trust root belirlenerek.
- Policy custom check plug-in sözleşmesi, sadece iki gerçek adapter bunu haklı çıkardığında.

Her adapter için acceptance standardı: API sözleşmesi kaynaklı fixture’lar, status coverage, commit identity, failure/unknown handling, token redaction, dokümante minimum permissions ve kendi consumer örneği.
