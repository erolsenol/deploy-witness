# DeployWitness — Uygulama Görev Listesi

> Progress update (2026-09-30): v0.1 MVP remains public. Roadmap slices now add bounded Coolify retries with Retry-After, deployment freshness correlation, pinned public-DNS HTTP probes with explicit localhost opt-in, and JUnit output. Local suite: 57 tests. npm registry publication and provider expansion remain separate roadmap items.

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

## DeployWitness 0.2+ genişletme planı

Detaylı mimari, scope, güvenlik modeli ve release kapıları [`tasks/plan.md`](plan.md) dosyasındadır. Aşağıdaki işler mevcut unchecked MVP görevlerini silmez veya tamamlanmış saymaz; MVP sonrası eklenti roadmap’idir.

### DW-R01: Kanıt sözleşmesi ve freshness/correlation ADR

**İş:** Report v1 uyumluluğunu koruyarak deployment kimliği, run window, source freshness, digest ve decision policy semantiğini yazılı dondur.

**Kabul ölçütleri:**
- [ ] PASS/FAIL/INCOMPLETE ve required/optional/WARN karar matrisi yayınlanır.
- [ ] Her kanıt sınıfının neyi kanıtlamadığı örnek raporla gösterilir.
- [ ] Verilen run-start sınırından eski deployment PASS üretemez; sınır yoksa rapor korelasyon eksikliğini WARN olarak açıklar.

**Doğrulama:** JSON Schema ve rapor örnekleri doğrulanır; report v1 consumer fixture’ları korunur.
**Bağımlılık:** Mevcut report/config v1 incelemesi.
**Boyut:** M.

### DW-R02: Coolify polling dayanıklılığı

**İş:** Retry-After, sınırlı backoff/jitter, global deadline, cancellation ve bounded pagination ekle.

**Kabul ölçütleri:**
- [x] Yalnızca idempotent transient GET hataları retry edilir; auth/config hataları edilmez.
- [x] Retry-After ve toplam deadline/maksimum deneme sınırları uygulanır.
- [x] Supplied run boundary’den eski, missing timestamp veya newest timestamp tie deployment UNKNOWN/FAIL olur, PASS değil.

**Doğrulama:** Fake clock, kontrollü fetch ve Retry-After delta/date fixture’larıyla deterministik testler.
**Bağımlılık:** DW-R01.
**Boyut:** M.

### DW-R03: HTTP probe SSRF ve network sınırı

**İş:** Public URL probe’larında DNS/IP ve connect-time güvenliğini, IPv4/IPv6 dahil, gerçekçi biçimde uygula.

**Kabul ölçütleri:**
- [x] Private, loopback, link-local, metadata, multicast ve mapped-IP blokları reddedilir.
- [x] DNS rebinding/TOCTOU savunması testle doğrulanır: tüm DNS cevapları kontrol edilir ve soket doğrulanmış IP’ye pinlenir.
- [x] Redirect kapalı, response byte limiti, timeout ve secret/body redaction korunur.

**Doğrulama:** DNS/resolver sınırları, IPv4/IPv6 edge case’ler, redirects ve oversized stream testleri; threat-model incelemesi.
**Bağımlılık:** DW-R01.
**Boyut:** L (alt görevlere bölünerek uygulanacak).

### DW-R04: Config ergonomisi ve report consumer contract

**İş:** Env override önceliği, config explain/dry-run, JSON Schema çıktısı ve JUnit formatter ekle.

**Kabul ölçütleri:**
- [ ] Config açıklaması değerleri ve sırları yazdırmadan kaynak/override sırasını gösterir.
- [ ] JUnit ve JSON aynı check ID/status/decision sonuçlarını temsil eder.
- [ ] Report v1 ve config v1 tüketicileri için migration sınırları testlidir.

**Doğrulama:** CLI integration + format parity testleri ve packed consumer smoke.
**Bağımlılık:** DW-R01.
**Boyut:** M.

**Checkpoint R1:** DW-R01–R04 tamamlandığında Coolify ve HTTP probe yanlış PASS riskleri kapatılmış, rapor tüketicileri için geriye uyum korunmuş olmalı.

### DW-R05: Provider contract test suite

**İş:** Adapter status, pagination, identity, rate-limit ve redaction davranışlarını ortak test arayüzüne taşı.

**Kabul ölçütleri:**
- [ ] Capability support/unsupported/unavailable açıkça raporlanır.
- [ ] Her adapter aynı unknown, stale, wrong SHA/resource ve auth senaryolarını geçirir.
- [ ] Adapter karar motoru içermez; yalnızca provider verisini normalize eder.

**Doğrulama:** Coolify adapter’ı contract suite’e geçirilir; fixture kaynağı belgelenir.
**Bağımlılık:** DW-R01, DW-R02.
**Boyut:** M.

### DW-R06: Vercel provider adapter

**İş:** Resmi API sözleşmesi doğrulandıktan sonra Vercel project/team deployment doğrulamasını ekle.

**Kabul ölçütleri:**
- [ ] Preview/production target, project/team scope, deployment state ve full commit SHA ayrı kanıttır.
- [ ] Bilinmeyen API state ve eksik commit PASS olmaz.
- [ ] Minimum token erişimi ve secret kullanımı dokümante edilir.

**Doğrulama:** Contract fixture’ları, provider E2E için ayrı opt-in staging workflow.
**Bağımlılık:** DW-R05.
**Boyut:** L.

### DW-R07: İkinci provider seçimi ve adapter

**İş:** Gerçek kullanıcı talebine göre Railway veya Render’dan birini seç; iki provider’ı aynı anda başlatma.

**Kabul ölçütleri:**
- [ ] Seçim API kanıtı, deployment kimliği ve kullanıcı talebiyle ADR’de gerekçelendirilir.
- [ ] Provider status semantiği common state’e varsayım yapmadan eşlenir.
- [ ] Adapter ortak contract suite’i ve secret redaction testlerini geçirir.

**Doğrulama:** Fixture bazlı bütün state’ler ve dedicated staging E2E.
**Bağımlılık:** DW-R05, en az bir gerçek kullanıcı talebi.
**Boyut:** L.

**Checkpoint R2:** En az iki provider ortak karar/rapor sözleşmesini kullanır; provider-specific sınırlar consumer dokümanında görünür.

### DW-R08: Runtime ve provider image digest eşleştirme

**İş:** Beklenen OCI digest, provider deployment digest’i ve opsiyonel runtime build marker’ını ayrı kontrollerle ilişkilendir.

**Kabul ölçütleri:**
- [ ] Tag eşitliği immutable digest eşitliği sayılmaz.
- [ ] Digest alanı sunmayan provider UNSUPPORTED bildirir; required policy PASS vermez.
- [ ] Kaynak SHA, image digest ve runtime marker çelişkisi PASS olamaz.

**Doğrulama:** Mismatch, missing, unsupported ve positive digest fixtures.
**Bağımlılık:** DW-R01, DW-R05.
**Boyut:** M.

### DW-R09: GitHub artifact attestation verifier (opt-in)

**İş:** GitHub artifact provenance signature/identity/subject doğrulamasını ayrı supply-chain check olarak ekle.

**Kabul ölçütleri:**
- [ ] Repository, workflow identity, commit, subject digest ve trust policy kontrol edilir.
- [ ] Attestation build provenance’ı kanıtlar; production runtime state olarak sunulmaz.
- [ ] Varsayılan optional davranış ve required policy kullanımı dokümante edilir.

**Doğrulama:** Trusted positive, wrong repo/workflow/digest, absent attestation ve invalid verification testleri.
**Bağımlılık:** DW-R08 ve ayrı threat-model ADR.
**Boyut:** L.

### DW-R10: npm OIDC release ve provenance

**İş:** İlk package bootstrap’i tamamlandıktan sonra tag bazlı npm Trusted Publishing workflow’u ve doğrulama rehberini ekle.

**Kabul ölçütleri:**
- [ ] Release workflow yalnızca protected tag/environment ile çalışır, minimum OIDC izinlerini alır.
- [ ] Uzun ömürlü npm publish token kullanılmaz; provenance otomatik oluşur.
- [ ] Paketin registry kurulumu ve provenance doğrulaması release gate’inden geçer.

**Doğrulama:** Test/staged package veya kontrollü public prerelease; registry version, tarball contents ve provenance kontrolü.
**Bağımlılık:** npm package hesabında Trusted Publisher bootstrap ayarı ve release approval.
**Boyut:** M.

### DW-R11: Consumer demos, governance ve v1 release gate

**İş:** Monorepo örneği, GitHub dışı CI örneği, support/security politikaları ve v1 API kararlılık kontrolünü hazırla.

**Kabul ölçütleri:**
- [ ] CLI, Node Action ve GitHub dışı CI örneği clean consumer’da çalışır.
- [ ] Security response, support matrix, semver ve schema migration policy yayınlanır.
- [ ] v1.0 yalnızca en az iki provider, P0 security, consumer ve release gate’leri geçtiğinde aday olur.

**Doğrulama:** CI matrix, consumer smoke, staging positive/negative controls ve release checklist.
**Bağımlılık:** DW-R04, DW-R06, DW-R07, DW-R10.
**Boyut:** L.
