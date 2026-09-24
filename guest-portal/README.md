# Hillside 18 — samostatný prototyp portálu pro hosty

Čisté HTML/CSS/JS, bez instalace, sestavení, API, databáze či externích knihoven. Všechny ilustrace jsou lokální. Nevytváří rezervace, neposílá zprávy, neověřuje platby a nic nemění v generátoru ani na produkční stránce.

## Otevření a nasazení
1. Pro rychlý náhled otevřete index.html. Doporučený test je přes lokální HTTP server nebo samostatný Vercel projekt.
2. Ve Vercelu založte NOVÝ projekt, např. hillside18-guest-prototype. Nahrajte obsah této složky jako vlastní nový repozitář. Framework: Other, build a install command: prázdné, output: kořen projektu. Alternativně spusťte Vercel CLI z této složky a vytvořte nový projekt.
3. Použijte pouze jeho novou testovací doménu. Nepřipojujte existující projekt generátoru, produkční doménu ani produkční guest page.
4. Provozní informace, časy 16:00–20:00 / 10:00, navigace, parkování a lyžárna jsou převzaté z původní hostovské stránky. Wi-Fi údaje najdou hosté u tabletu v apartmánu. Logo a tři původní fotografie jsou lokálně v assets/. Kontakt na místě: +420 731 990 087; recepce: +420 840 113 114.
5. Otestujte níže uvedené odkazy s falešnými kódy. Pro test skutečného odkazu v kopii ručně nahraďte pouze doménu a cestu, zachovejte query a hash. Nastavení generátoru zatím neměňte.

## Odkazy a stavy

Kód dveří je vždy přesně čtyřmístný číselný řetězec. Počáteční nuly se zachovají (např. 0258); jiný formát se nezobrazí.

| Test (připojit za doménu) | Výsledek |
|---|---|
| /?apt=1&alf=DEMO&lang=cs | Check-in čeká; tlačítko otevře Alfred login/DEMO |
| /?apartment=2&alf=DEMO&unpaid=1&lang=en | Check-in hotový, platba čeká |
| /?apartment_no=3&done=1&door=0258&lang=de | Vše připraveno, kód 0258 |
| /?done=1&door=2580&lang=cs#apt=4 | Apartmán z hashe |
| /?apt=2&unpaid=1&done=1&door=2580 | Čekající platba má přednost; kód skrytý |
| /?apt=1&door=2580 | Bez done se kód nezobrazí |
| /?apt=1&done=1 | Vše hotovo, jasná informace o chybějícím kódu |
| /?alf=javascript%3Aalert(1) | Nebezpečný odkaz se nepoužije |
| /?apt=1&lang=xx | Výchozí čeština |
| /?apt=2 | Check-in tlačítko otevře obecné přihlášení do Alfréda, host zadá kód z potvrzení |
| /?apt=2&unpaid=1 | Výrazné tlačítko dokončení platby, i bez osobního alf odkazu |
| /?alf=https%3A%2F%2Falfred.previo.app%2Flogin%2FDEMO | Celá URL Alfréda |
| /wallet-preview.html?lang=de | Německý náhled kontaktní karty |

DEMO není skutečná rezervace, testovací kódy neotevírají dveře.

Priorita apartmánu: první neprázdné apt → apartment → apartment_no → #apt=. Lang: cs/cz, en, de, jinak cs. Příznaky: 1/true/yes; absent/0/false nejsou aktivní. unpaid má přednost před done. Aktuální generátor posílá unpaid=1 SAMOSTATNĚ pro dokončený check-in a čekající platbu; tento případ je výslovně podporován. Samotný door není potvrzení check-inu.

Alf přijímá krátký kód nebo HTTP(S) URL na povoleném hostiteli alfred.previo.app (převádí se na HTTPS). Další legitimní hostitele lze přidat do config.js; neznámé URL se z bezpečnostních důvodů nepoužijí.

Tlačítko check-inu/platby je vždy dostupné. Pokud alf chybí nebo je neplatný, otevře oficiální obecné přihlášení https://alfred.previo.app/ místo odkazu na podporu. S platným alf otevře danou rezervaci. Na mobilu je hlavní akce také pevně dole. Platba probíhá v Alfrédovi, portál sám peníze nevybírá. Pro konkrétní rezervaci musí odkaz obsahovat její skutečný alf; prototyp ho bez vstupu nemůže znát.

## Krátký testovací plán
- Projděte 3 stavy × 3 jazyky na telefonu i počítači.
- Zkontrolujte přepnutí jazyka: zachování parametrů i hashe, kódu a stavu.
- Vyzkoušejte kopírování kódu přes HTTPS, volání, WhatsApp, skoky v menu a stažení kontaktu. Telefonát ani zpráva se automaticky neodesílají.
- Ověřte chybějící údaje, konfliktní stavy a počáteční nuly kódu.
- Zvětšete fotografie parkoviště, klávesnice a lyžárny; okno zavřete tlačítkem nebo Escape.
- Zkontrolujte odkaz na linku C v každém jazyce a aktuální sezónní provoz dopravce.
- Potvrďte všechny provozní texty před ostrým použitím.

## Provozní omezení
Jde o statický prototyp. Platba ani check-in samy nepřepnou stránku: je potřeba nový odkaz se stavem. URL parametry jsou uživatelsky měnitelné; tato logika není autentizace ani zabezpečení dveří. Kód v URL už má příjemce k dispozici i pokud je skrytý v UI. Pro reálné ověřování stavu je potřebný server s neprůhledným tokenem rezervace. Nesdílejte skutečné kódy ve veřejných testech.

Prototyp nemá analytiku ani vzdálené assety. Vercel konfigurace vypíná indexování, referrer a cachování; hosting může nadále logovat příchozí URL.

## Karta podpory
wallet-preview.html je jasně označený vizuální návrh. support.vcf je funkční kontakt pro uložení do telefonu, nikoli Google Wallet pass. Samostatný adresář wallet-toolkit obsahuje nástroj pro podepsaný Wallet odkaz; do tohoto statického webu nikdy nevkládejte servisní klíče.


