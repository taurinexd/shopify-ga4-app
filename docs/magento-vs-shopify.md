# Magento 2 vs Shopify — Data Layer & Tracking

> **Premessa onesta:** la mia esperienza pratica e-commerce è su altre piattaforme, non su Magento 2 / Adobe Commerce. Il confronto sotto è **research-based**, ricostruito da:
> - Adobe Commerce DevDocs (`experienceleague.adobe.com/docs/commerce-admin` e `developer.adobe.com/commerce`)
> - Codice open-source del modulo `Magento_GoogleTagManager` (Adobe Commerce, repo pubblico `magento/magento2`)
> - Documentazione Shopify (`shopify.dev/docs`) verificata empiricamente durante la challenge
>
> L'obiettivo è mostrare un confronto architetturale rigoroso — quello che il brief chiede — anche senza claim di expertise hands-on su M2. Dove cito API o pattern M2 lo faccio sulla base di quanto documentato pubblicamente; dove cito Shopify, lo confermo dal codice di questa challenge.

## 1. Iniezione script

Magento 2 utilizza un sistema dichiarativo a tre livelli per iniettare codice di tracking. Il modulo `Magento_GoogleTagManager` registra blocchi via `view/frontend/layout/default.xml` e usa container Layout XML (`<referenceContainer name="before.body.end">`) per scegliere il punto esatto di iniezione. La logica di stato è costruita server-side in PHP via observer su eventi come `controller_action_predispatch` e DI configurato in `etc/di.xml`. Il merchant non vede mai HTML inline: tutto passa dal sistema di template Magento.

Shopify ha un modello opposto e più piatto. In questa challenge l'iniezione avviene attraverso una Theme App Extension (`extensions/ga4-datalayer/`) registrata come app embed block. Il blocco `blocks/ga4-embed.liquid` espone uno schema dichiarativo che il merchant attiva da Theme Editor; il payload `dataLayer` viene serializzato server-side da Liquid (`{{ shop | json }}`, `{{ product | json }}`) e l'asset JS è caricato come modulo. Non c'è equivalente di `<referenceContainer>`: l'app embed gira solo a livello `body`. Il prezzo del controllo granulare M2 è una curva di apprendimento più alta; il prezzo della linearità Shopify è meno flessibilità sul punto di injection.

## 2. Reattività dello stato cart

È l'area architetturalmente più divergente. Magento 2 espone uno stato cart reattivo via `Magento_Customer/js/customer-data` (KO.js + RequireJS): un cookie `section_data_ids` invalida sezioni server-side, la sezione `cart` viene re-fetched, e gli observer KO subscribono ai cambi. Il tracking GTM "addToCart" può quindi reagire a un push del modello, non a una richiesta HTTP.

Shopify non ha equivalente. La Storefront Cart Ajax API (`/cart/add.js`, `/cart/update.js`) ritorna lo stato corrente, ma non c'è broadcast event globale: ogni tema implementa il proprio. La soluzione adottata in `src/adapters/cart-api.ts` è un interceptor su `window.fetch` e `XMLHttpRequest` che riconosce gli endpoint cart, parse-a la response, e dispatcha eventi `CustomEvent` interni che il layer GA4 ascolta. È un workaround necessario perché manca il pattern customer-data di M2. Conseguenza: ogni progetto Shopify reinventa il proprio "section invalidation"; M2 lo fornisce out-of-the-box con un costo iniziale più alto.

## 3. Tracking checkout

Magento 2 ha checkout monolitico basato su KO.js (`Magento_Checkout/js/view/payment`), tracking lato server via observer su `checkout_submit_all_after` o `sales_order_place_after` che popola un `dataLayer` server-side renderizzato nella success page. Il dedup `purchase` è gestibile lato observer perché l'evento server-side fire-a una volta sola.

Shopify offre Customer Events / Web Pixel API (sandbox isolata, documentata in `shopify.dev/docs/api/web-pixels-api`). L'estensione `extensions/ga4-pixel/` riceve `checkout_completed` come singolo evento autoritativo, indipendente da quanti pageload `/thank_you` succedano. La sandbox Strict isola il pixel dal globale del tema, evitando race condition fra moduli. Vantaggio Shopify: dedup nativo + isolamento. Vantaggio M2: il dato è già nel server-side context, niente sandbox-cross da risolvere.

## 4. Integrazione GTM

Magento 2 ha un modulo ufficiale `Magento_GoogleTagManager` (parte del package Commerce, opt-in su Adobe Commerce Cloud) che costruisce il `dataLayer` server-side in PHP, mappando `Magento\Catalog\Model\Product` → array Enhanced Ecommerce. Il developer ottiene type-safe DTOs e configurazione admin nativa.

Shopify non ha modulo GA4/GTM ufficiale per developer. Ci sono integrazioni native consumer (Google & YouTube channel, integrazione GA4 nativa via Shop Sales Channel), ma per chi costruisce un'app custom non esiste un equivalente. La conseguenza è che progetti come questa challenge ricostruiscono manualmente il pattern: schema Zod per validazione (`src/datalayer/schema.ts`), builder TypeScript per ogni evento (`src/events/*.ts`), App Pixel separato per `purchase`. Più lavoro, più libertà sulla shape finale.

## 5. Type safety

Magento 2 ha service contracts via annotation `@api` su interfacce in `Api/Data/`, DTO immutabili, strict typing PHP nei plugin (DI container valida le firme a runtime). Il payload tracking è un oggetto PHP fortemente tipato prima di diventare JSON.

Shopify Liquid è weakly typed: ogni output è stringificato. Il recovery in questo progetto avviene su due livelli: (1) `{{ object | json }}` per serializzare in modo sicuro lato Liquid; (2) Zod schema in `src/datalayer/schema.ts` che valida il payload runtime prima del push, con TypeScript types derivati via `z.infer`. È un pattern "type safety alla frontiera": il dato arriva untyped da Liquid, viene tipato al confine JS, da lì in poi il compilatore protegge. Differente filosofia, stesso effetto pratico se applicato con disciplina.

## 6. Cosa Shopify fa meglio (research-based observation)

- **Dedup nativo per `purchase`** via App Pixel single-fire — su M2, da quanto documentato, richiede sessionStorage hack o controllo manuale dell'observer
- **Sandbox isolation Web Pixel** — su M2 il global JS namespace è terreno di scontro tra moduli che caricano script GTM differenti
- **Block schema per merchant config** — UX più friendly del nested admin config M2 (Stores → Configuration → Sales → Google API)
- **Cross-domain identity** via `cart.attributes` — pattern semplice, native, GDPR-friendly per propagare `client_id` a checkout

## 7. Cosa manca su Shopify (osservazioni dalle docs M2)

- **Plugin/DI system**: niente equivalente di `di.xml`, le app sono silos e non possono "estendere" il comportamento di un'altra app via interceptor
- **Layout XML dichiarativo**: niente `<referenceContainer>` per scegliere il punto di iniezione (body-end vs head vs after-product-info)
- **Service contracts type-safe**: niente DTO server-side per shape del dato, Liquid resta untyped
- **Server-side observers**: niente equivalente di `events.xml`, si passa per webhook lato server o Customer Events lato pixel — non c'è interception in-process

## 8. La sorpresa (research finding)

Shopify NON ha un modulo GA4/GTM ufficiale per developer. Esistono integrazioni native consumer (Google channel app, Shopify ↔ GA4 native integration), ma per chi costruisce app custom non c'è un `Magento_GoogleTagManager`-equivalent. La community ha riempito il gap con app commerciali (Analyzify, Littledata, Elevar) — questo è il gap che questa challenge mira a coprire mostrando il pattern end-to-end. Su M2 il modulo è first-party, su Shopify è third-party-marketplace o build-it-yourself.

## Conclusione

Il pattern emergente: M2 ha un modello "convention over configuration" molto rigido (DI + Layout XML + observers + service contracts) che dà controllo granulare ma curva di apprendimento alta e ciclo di feedback lento. Shopify offre più libertà architetturale ma meno strumenti pre-costruiti — il developer sceglie e difende ogni decisione (block embed vs section, App Pixel vs Custom Pixel, dataLayer storefront vs Measurement Protocol server-side, fetch interceptor vs poll).

Per il caso GA4 specifico, Shopify ha vantaggi netti su isolation (Web Pixel sandbox) e dedup (App Pixel single-fire) ma richiede al developer di ricostruire l'intera pipeline che M2 fornisce out-of-the-box via `Magento_GoogleTagManager`. Trade-off classico: ergonomia developer vs controllo merchant. Questa challenge sceglie di assorbire il costo developer per liberare il merchant — coerente con il posizionamento delle due piattaforme.
