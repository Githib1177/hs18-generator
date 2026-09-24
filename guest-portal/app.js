'use strict';
const C = window.HILLSIDE_CONFIG;
const translations = {
  "cs": {
    "eyebrow": "VÁŠ DOMOV NA HORÁCH",
    "welcome": "Vítejte v Hillside 18.",
    "intro": "Vše pro pohodový příjezd. A ještě pohodovější pobyt.",
    "caption": "Zpomalte. Jste na horách.",
    "apartment": "Apartmán",
    "unknownApartment": "Váš pobyt v Hillside 18",
    "stay": "VÁŠ POBYT",
    "steps": [
      "Online check-in",
      "Platba",
      "Vstup"
    ],
    "badges": {
      "checkin": "Před příjezdem",
      "payment": "Zbývá platba",
      "ready": "Vše hotovo"
    },
    "titles": {
      "checkin": "Už jen malý krok k horám.",
      "payment": "Check-in je hotový.",
      "ready": "Vše je připraveno."
    },
    "descriptions": {
      "checkin": "Vyplňte online check-in za všechny hosty v Alfrédovi. Odkaz na rezervaci a platbu máte hned zde.",
      "payment": "Check-in všech hostů je hotový. Otevřete Alfréda a dokončete zbývající platbu za pobyt.",
      "ready": "Vítejte. Přejeme vám příjemný pobyt a spoustu krásných chvil na horách."
    },
    "actions": {
      "checkin": "Dokončit online check-in ↗",
      "payment": "Dokončit platbu v Alfrédovi ↗",
      "ready": "Informace k příjezdu ↓"
    },
    "actionNote": "Kód ke vstupu obdržíte po dokončení check-inu a úhradě pobytu.",
    "missingAlfred": "V Alfrédovi zadejte kód rezervace z potvrzovacího e-mailu nebo SMS.",
    "contactAction": "Kontakt a pomoc ↓",
    "accessCode": "VÁŠ KÓD KE VSTUPU",
    "locked": "Kód bude dostupný po dokončení check-inu a platby.",
    "codeMissing": "V tomto odkazu není platný vstupní kód. Použijte poslední zprávu s přístupovými údaji.",
    "codeNote": "Hlavní vstup i lyžárna · 4 číslice",
    "copy": "Kopírovat kód",
    "copied": "Zkopírováno.",
    "copyFailed": "Kopírování není dostupné. Označte a zkopírujte údaj ručně.",
    "arrival": "Příjezd",
    "comfort": "V apartmánu",
    "checkout": "Odjezd",
    "guide": "VŠE DŮLEŽITÉ NA JEDNOM MÍSTĚ",
    "settle": "Zabydlete se.",
    "firstStop": "01 · PRVNÍ ZASTÁVKA",
    "arrivalText": "Příjezd je možný od 16:00 do 20:00. Při příjezdu prosím zavolejte na +420 731 990 087. Pozdější příjezd oznamte předem na stejném čísle.",
    "checkinTime": "Check-in",
    "perReservation": "Dle rezervace",
    "navigate": "Navigace a adresa ↗",
    "parking": "Tady zaparkujete",
    "parkingText": "Parkujte na místě označeném vaším apartmánem. APT 3 a APT 2 mají po jednom příčném místě. APT 1 má dvě místa: jedno příčné a jedno podélné podél zídky. Zbývající místo je označené P.",
    "entrance": "Vstup do domu",
    "entranceText": "Vchod je bezklíčový. Na klávesnici zadejte svůj čtyřmístný kód. Rozsvítí se zelená a dveře se na několik vteřin odemknou.",
    "skiRoom": "Lyžárna",
    "skiText": "Lyžárna je v přízemí: od altánu sejděte po schodech dolů a pokračujte uličkou vlevo. Otevřete ji stejným kódem jako hlavní vstup.",
    "skibus": "Na svah skibusem",
    "busText": "Zastávka C6 „Pod lanovkou“ je asi 30 m od domu směrem na Klínovec. Jezdí tudy linka C: Klínovec – Loučná – České Hamry – Klínovec.",
    "busNote": "Skibus je sezonní. Aktuální provoz a odjezdy najdete přímo u dopravce; zkontrolujte datum platnosti jízdního řádu.",
    "wifiPlaceholder": "Název sítě a heslo najdete v apartmánu u tabletu.",
    "wifiNetwork": "Síť",
    "wifiPassword": "Heslo",
    "copyPassword": "Kopírovat heslo",
    "apartmentReady": "Vše připraveno pro váš pobyt",
    "apartmentReadyText": "Apartmán je pro vás připravený: postele jsou povlečené a ručníky nachystané. K dispozici je také vybavená kuchyně včetně kávovaru na kapsle Nespresso.",
    "tablet": "Teplo a světlo",
    "tabletText": "Tablet je na zdi v hlavní místnosti. Probuďte jej dvojitým poklepáním a nastavte topení a světla.",
    "littleExtras": "MALÉ RADOSTI",
    "makeYours": "Pobyt podle vás.",
    "fireplace": "Večer u krbu",
    "fireplaceText": "V ceně je dřevo, které najdete v dřevníku pod hlavním parkovištěm u APT 3. Popel nemusíte denně vynášet — zajistíme.",
    "fireplacePrice": "500 Kč / den",
    "dog": "I se čtyřnohým parťákem",
    "dogText": "Pobyt se psem prosím nahlaste ubytovateli.",
    "dogPrice": "1 200 Kč / pobyt",
    "untilNext": "ZASE NĚKDY NA HORÁCH",
    "checkoutText": "Apartmán prosím uvolněte do 10:00. Před odchodem zkontrolujte okna a zavřete dveře.",
    "hereForYou": "JSME TU PRO VÁS",
    "helpTitle": "Potřebujete s něčím pomoct?",
    "contactMissing": "Kontakty na podporu na místě čekají na doplnění. Zatím použijte kontakt v potvrzení rezervace.",
    "contactReady": "Podpora na místě vám pomůže s příjezdem i během pobytu.",
    "call": "Zavolat",
    "whatsapp": "WhatsApp",
    "help": "Pomoc",
    "prototype": "Náhled portálu · Hillside 18",
    "mapMissing": "Přesnou adresu a trasu najdete v potvrzení rezervace.",
    "wallet": "Karta podpory · náhled ↗",
    "parkingCaption": "Zleva: APT 3 · APT 2 · APT 1 · P. Podél zídky: APT 1.",
    "parkingLabel": "MÍSTA PODLE APARTMÁNŮ",
    "parkingAlt": "Orientační rozvržení parkoviště nad domem: čtyři příčná místa zleva APT 3, APT 2, APT 1 a P; páté podélné místo u zídky patří APT 1.",
    "entranceTip": "Překlep? Stiskněte * a po 5 sekundách zadejte kód znovu. Po zavření se dveře automaticky zamknou.",
    "keypadCaption": "Klávesnice u vstupu · po zadání kódu vyčkejte na zelenou",
    "keypadAlt": "Vstupní klávesnice s číslicemi a tlačítkem hvězdička.",
    "skiTip": "Lyže a snowboardy nenoste do bytu. V lyžárně je vysoušeč obuvi, který běží v intervalech.",
    "skiCaption": "Od altánu po schodech dolů, potom uličkou vlevo",
    "skiAlt": "Schody a ulička k lyžárně. Zelený symbol lyží s ukazatelem označuje vstup.",
    "busSchedule": "Jízdní řád linky C ↗",
    "busMap": "Mapa linky C ↗",
    "tabletTip": "Větrejte krátce a intenzivně. Při otevřených oknech systém netopí.",
    "fireplaceWarning": "Pokud nemáte s krbem zkušenost, netopte v něm. Hrozí nebezpečí požáru.",
    "checkoutPayment": "Veškeré platby a doplatky uhraďte online přes Alfréda nebo platební bránu. Platba na místě není možná.",
    "reception": "Recepce · +420 840 113 114",
    "exploreEyebrow": "JEŠTĚ VÍC Z VAŠEHO POBYTU",
    "exploreTitle": "Kam dnes vyrazíte?",
    "exploreText": "Praktické odkazy pro plánování dne — přímo od skiareálu.",
    "resort": "Skiareál Klínovec",
    "resortSub": "Oficiální informace a novinky",
    "webcams": "Webkamery",
    "webcamsSub": "Podívejte se, jak je na svahu",
    "slopes": "Sjezdovky a lanovky",
    "slopesSub": "Aktuální stav provozu",
    "resortMap": "Mapa areálu",
    "resortMapSub": "Naplánujte si trasu",
    "food": "Restaurace a občerstvení",
    "foodSub": "Kde se najíst ve skiareálu",
    "skipass": "Skipasy online",
    "skipassSub": "Oficiální e-shop skiareálu",
    "zoom": "Zvětšit fotografii",
    "close": "Zavřít fotografii",
    "reservation": "Otevřít rezervaci v Alfrédovi ↗"
  },
  "en": {
    "eyebrow": "YOUR HOME IN THE MOUNTAINS",
    "welcome": "Welcome to Hillside 18.",
    "intro": "Everything for an easy arrival. And an even more relaxing stay.",
    "caption": "Slow down. You’re in the mountains.",
    "apartment": "Apartment",
    "unknownApartment": "Your stay at Hillside 18",
    "stay": "YOUR STAY",
    "steps": [
      "Online check-in",
      "Payment",
      "Access"
    ],
    "badges": {
      "checkin": "Before you arrive",
      "payment": "Payment pending",
      "ready": "All ready"
    },
    "titles": {
      "checkin": "One step closer to the mountains.",
      "payment": "Check-in is complete.",
      "ready": "Everything is ready."
    },
    "descriptions": {
      "checkin": "Complete online check-in for everyone in your party in Alfred. Your reservation and payment are just a tap away.",
      "payment": "Everyone is checked in. Open Alfred to complete the remaining payment for your stay.",
      "ready": "Welcome. Enjoy your stay and make time for the little mountain moments."
    },
    "actions": {
      "checkin": "Complete online check-in ↗",
      "payment": "Complete payment in Alfred ↗",
      "ready": "Arrival information ↓"
    },
    "actionNote": "You will receive your access code after check-in and payment are complete.",
    "missingAlfred": "Enter the reservation code from your confirmation email or SMS in Alfred.",
    "contactAction": "Contact & help ↓",
    "accessCode": "YOUR ACCESS CODE",
    "locked": "Your code will be available once check-in and payment are complete.",
    "codeMissing": "This link does not contain a valid access code. Please use the latest message with your access details.",
    "codeNote": "Main entrance & ski room · 4 digits",
    "copy": "Copy code",
    "copied": "Copied.",
    "copyFailed": "Copying is unavailable. Select and copy the text manually.",
    "arrival": "Arrival",
    "comfort": "Your apartment",
    "checkout": "Departure",
    "guide": "THE ESSENTIALS, ALL TOGETHER",
    "settle": "Make yourself at home.",
    "firstStop": "01 · FIRST STOP",
    "arrivalText": "Arrival is from 16:00 to 20:00. Please call +420 731 990 087 on arrival. Let us know in advance on the same number if you will arrive after 20:00.",
    "checkinTime": "Check-in",
    "perReservation": "See your booking",
    "navigate": "Directions & address ↗",
    "parking": "Park right here",
    "parkingText": "Park in the space marked for your apartment. APT 3 and APT 2 each have one perpendicular space. APT 1 has two spaces: one perpendicular and one parallel to the wall. The remaining space is marked P.",
    "entrance": "Getting inside",
    "entranceText": "Entry is keyless. Enter your four-digit code on the keypad. The light turns green and the door unlocks for a few seconds.",
    "skiRoom": "Ski room",
    "skiText": "The ski room is on the ground floor: go down the steps from the gazebo, then follow the passage to the left. Use the same code as for the main entrance.",
    "skibus": "To the slopes",
    "busText": "Stop C6 “Pod lanovkou” is about 30 m towards Klínovec. It is served by line C: Klínovec – Loučná – České Hamry – Klínovec.",
    "busNote": "The ski bus is seasonal. Check current service, departures and timetable validity on the operator’s website.",
    "wifiPlaceholder": "The network name and password are in your apartment, next to the tablet.",
    "wifiNetwork": "Network",
    "wifiPassword": "Password",
    "copyPassword": "Copy password",
    "apartmentReady": "Ready for your stay",
    "apartmentReadyText": "Your apartment is ready for you, with freshly made beds and towels laid out. The kitchen is equipped, including a coffee machine for Nespresso capsules.",
    "tablet": "Warmth & light",
    "tabletText": "The tablet is mounted on the wall in the main room. Double-tap to wake it up and control heating and lighting.",
    "littleExtras": "LITTLE PLEASURES",
    "makeYours": "Stay your way.",
    "fireplace": "An evening by the fire",
    "fireplaceText": "Firewood is included. Find it in the woodshed below the main car park by apartment 3. There is no need to remove ash daily — we will take care of it.",
    "fireplacePrice": "20 EUR / day",
    "dog": "Four-legged friends welcome",
    "dogText": "Please let your host know if you are bringing a dog.",
    "dogPrice": "50 EUR / stay",
    "untilNext": "UNTIL NEXT TIME",
    "checkoutText": "Please vacate the apartment by 10:00. Check the windows and close the doors before leaving.",
    "hereForYou": "HERE FOR YOU",
    "helpTitle": "Need a hand?",
    "contactMissing": "On-site support contacts are awaiting confirmation. Please use the contact in your booking confirmation for now.",
    "contactReady": "On-site support can help with your arrival and during your stay.",
    "call": "Call us",
    "whatsapp": "WhatsApp",
    "help": "Help",
    "prototype": "Portal preview · Hillside 18",
    "mapMissing": "Find the exact address and directions in your booking confirmation.",
    "wallet": "Support card · preview ↗",
    "parkingCaption": "From left: APT 3 · APT 2 · APT 1 · P. Along the wall: APT 1.",
    "parkingLabel": "SPACES BY APARTMENT",
    "parkingAlt": "Illustrated layout of the car park above the house: four perpendicular spaces from left, APT 3, APT 2, APT 1 and P; the fifth space, parallel to the wall, is for APT 1.",
    "entranceTip": "Mistyped? Press * and wait 5 seconds before trying again. The door locks automatically when closed.",
    "keypadCaption": "Entrance keypad · wait for the green light after entering your code",
    "keypadAlt": "Entrance keypad with number buttons and a star button.",
    "skiTip": "Please do not take skis or snowboards into the apartment. A boot dryer runs at intervals in the ski room.",
    "skiCaption": "Down the steps from the gazebo, then along the passage on the left",
    "skiAlt": "Steps and passage to the ski room. A green ski symbol with a pointer marks the entrance.",
    "busSchedule": "Line C timetable ↗",
    "busMap": "Line C route map ↗",
    "tabletTip": "Air the apartment briefly and thoroughly. Heating stops while windows are open.",
    "fireplaceWarning": "If you have no experience using a fireplace, please do not light it. There is a risk of fire.",
    "checkoutPayment": "Please make all payments and settle any outstanding balance online through Alfred or the payment gateway. On-site payment is not available.",
    "reception": "Reception · +420 840 113 114",
    "exploreEyebrow": "MAKE MORE OF YOUR STAY",
    "exploreTitle": "Where to today?",
    "exploreText": "Useful links to plan your day, directly from the resort.",
    "resort": "Klínovec ski resort",
    "resortSub": "Official information and news",
    "webcams": "Webcams",
    "webcamsSub": "See the conditions on the slopes",
    "slopes": "Slopes & lifts",
    "slopesSub": "Current operating status",
    "resortMap": "Resort map",
    "resortMapSub": "Plan your route",
    "food": "Restaurants & refreshments",
    "foodSub": "Places to eat at the resort",
    "skipass": "Skipasses online",
    "skipassSub": "The resort’s official shop",
    "zoom": "Enlarge photo",
    "close": "Close photo",
    "reservation": "Open reservation in Alfred ↗"
  },
  "de": {
    "eyebrow": "IHR ZUHAUSE IN DEN BERGEN",
    "welcome": "Willkommen im Hillside 18.",
    "intro": "Alles für eine entspannte Anreise. Und einen noch schöneren Aufenthalt.",
    "caption": "Ankommen. Durchatmen. Berge genießen.",
    "apartment": "Apartment",
    "unknownApartment": "Ihr Aufenthalt im Hillside 18",
    "stay": "IHR AUFENTHALT",
    "steps": [
      "Online-Check-in",
      "Zahlung",
      "Zugang"
    ],
    "badges": {
      "checkin": "Vor Ihrer Anreise",
      "payment": "Zahlung ausstehend",
      "ready": "Alles bereit"
    },
    "titles": {
      "checkin": "Nur noch ein Schritt bis zu den Bergen.",
      "payment": "Der Check-in ist abgeschlossen.",
      "ready": "Alles ist vorbereitet."
    },
    "descriptions": {
      "checkin": "Schließen Sie den Online-Check-in für alle Gäste in Alfred ab. Buchung und Zahlung erreichen Sie direkt hier.",
      "payment": "Alle Gäste sind eingecheckt. Öffnen Sie Alfred und begleichen Sie die ausstehende Zahlung für Ihren Aufenthalt.",
      "ready": "Herzlich willkommen. Wir wünschen Ihnen einen erholsamen Aufenthalt und schöne Momente in den Bergen."
    },
    "actions": {
      "checkin": "Online-Check-in abschließen ↗",
      "payment": "Zahlung in Alfred abschließen ↗",
      "ready": "Informationen zur Anreise ↓"
    },
    "actionNote": "Ihren Zugangscode erhalten Sie nach Abschluss des Check-ins und der Zahlung.",
    "missingAlfred": "Geben Sie in Alfred den Buchungscode aus Ihrer Bestätigungs-E-Mail oder SMS ein.",
    "contactAction": "Kontakt und Hilfe ↓",
    "accessCode": "IHR ZUGANGSCODE",
    "locked": "Ihr Code ist nach Abschluss des Check-ins und der Zahlung verfügbar.",
    "codeMissing": "Dieser Link enthält keinen gültigen Zugangscode. Bitte verwenden Sie die letzte Nachricht mit Ihren Zugangsdaten.",
    "codeNote": "Haupteingang und Skiraum · 4 Ziffern",
    "copy": "Code kopieren",
    "copied": "Kopiert.",
    "copyFailed": "Kopieren ist nicht verfügbar. Bitte markieren und kopieren Sie den Text manuell.",
    "arrival": "Anreise",
    "comfort": "Im Apartment",
    "checkout": "Abreise",
    "guide": "ALLES WICHTIGE AN EINEM ORT",
    "settle": "Fühlen Sie sich wie zu Hause.",
    "firstStop": "01 · ANKOMMEN",
    "arrivalText": "Die Anreise ist von 16:00 bis 20:00 Uhr möglich. Rufen Sie bei Ihrer Ankunft bitte +420 731 990 087 an. Eine spätere Anreise kündigen Sie bitte vorher unter derselben Nummer an.",
    "checkinTime": "Check-in",
    "perReservation": "Laut Buchung",
    "navigate": "Anfahrt und Adresse ↗",
    "parking": "Hier parken Sie",
    "parkingText": "Parken Sie auf dem mit Ihrem Apartment gekennzeichneten Stellplatz. APT 3 und APT 2 haben jeweils einen Querstellplatz. APT 1 hat zwei Stellplätze: einen quer und einen längs entlang der Mauer. Der übrige Stellplatz ist mit P gekennzeichnet.",
    "entrance": "Zugang zum Haus",
    "entranceText": "Der Zugang ist schlüssellos. Geben Sie Ihren vierstelligen Code an der Tastatur ein. Das Licht wird grün und die Tür wird für einige Sekunden entriegelt.",
    "skiRoom": "Skiraum",
    "skiText": "Der Skiraum befindet sich im Erdgeschoss: vom Pavillon die Treppe hinunter und dann links durch den Durchgang. Verwenden Sie denselben Code wie am Haupteingang.",
    "skibus": "Ab auf die Piste",
    "busText": "Die Haltestelle C6 „Pod lanovkou“ liegt etwa 30 m in Richtung Klínovec. Hier fährt die Linie C: Klínovec – Loučná – České Hamry – Klínovec.",
    "busNote": "Der Skibus fährt saisonal. Aktuellen Betrieb, Abfahrten und Gültigkeit des Fahrplans finden Sie beim Betreiber.",
    "wifiPlaceholder": "Netzwerkname und Passwort finden Sie im Apartment neben dem Tablet.",
    "wifiNetwork": "Netzwerk",
    "wifiPassword": "Passwort",
    "copyPassword": "Passwort kopieren",
    "apartmentReady": "Alles für Ihren Aufenthalt vorbereitet",
    "apartmentReadyText": "Ihr Apartment ist vorbereitet: Die Betten sind bezogen und die Handtücher liegen bereit. Die Küche ist ausgestattet, einschließlich einer Kaffeemaschine für Nespresso-Kapseln.",
    "tablet": "Wärme und Licht",
    "tabletText": "Das Tablet hängt an der Wand im Wohnraum. Durch Doppeltippen aktivieren Sie es und steuern Heizung und Licht.",
    "littleExtras": "KLEINE FREUDEN",
    "makeYours": "Urlaub nach Ihrem Geschmack.",
    "fireplace": "Ein Abend am Kamin",
    "fireplaceText": "Brennholz ist im Preis enthalten. Es liegt im Holzschuppen unter dem Hauptparkplatz bei Apartment 3. Die Asche müssen Sie nicht täglich entfernen — das übernehmen wir.",
    "fireplacePrice": "20 EUR / Tag",
    "dog": "Mit vierbeinigem Begleiter",
    "dogText": "Bitte melden Sie Ihren Hund beim Gastgeber an.",
    "dogPrice": "50 EUR / Aufenthalt",
    "untilNext": "BIS ZUM NÄCHSTEN MAL",
    "checkoutText": "Bitte verlassen Sie das Apartment bis 10:00 Uhr. Prüfen Sie die Fenster und schließen Sie die Türen.",
    "hereForYou": "WIR SIND FÜR SIE DA",
    "helpTitle": "Können wir Ihnen helfen?",
    "contactMissing": "Die Kontakte der Betreuung vor Ort werden noch bestätigt. Nutzen Sie vorerst den Kontakt in Ihrer Buchungsbestätigung.",
    "contactReady": "Die Betreuung vor Ort hilft Ihnen bei der Anreise und während Ihres Aufenthalts.",
    "call": "Anrufen",
    "whatsapp": "WhatsApp",
    "help": "Hilfe",
    "prototype": "Portalvorschau · Hillside 18",
    "mapMissing": "Die genaue Adresse und Anfahrt finden Sie in Ihrer Buchungsbestätigung.",
    "wallet": "Kontaktkarte · Vorschau ↗",
    "parkingCaption": "Von links: APT 3 · APT 2 · APT 1 · P. Entlang der Mauer: APT 1.",
    "parkingLabel": "STELLPLÄTZE NACH APARTMENT",
    "parkingAlt": "Orientierungsplan des Parkplatzes oberhalb des Hauses: vier Querstellplätze von links APT 3, APT 2, APT 1 und P; der fünfte Stellplatz längs der Mauer gehört zu APT 1.",
    "entranceTip": "Vertippt? Drücken Sie * und warten Sie 5 Sekunden vor der erneuten Eingabe. Nach dem Schließen verriegelt sich die Tür automatisch.",
    "keypadCaption": "Tastatur am Eingang · nach der Codeeingabe auf grünes Licht warten",
    "keypadAlt": "Tastatur am Eingang mit Ziffern und Sterntaste.",
    "skiTip": "Bitte nehmen Sie Ski und Snowboards nicht mit ins Apartment. Im Skiraum steht ein Schuhtrockner, der in Intervallen läuft.",
    "skiCaption": "Vom Pavillon die Treppe hinunter, dann links durch den Durchgang",
    "skiAlt": "Treppe und Durchgang zum Skiraum. Ein grünes Skisymbol mit einer Hinweislinie markiert den Eingang.",
    "busSchedule": "Fahrplan der Linie C ↗",
    "busMap": "Streckenkarte der Linie C ↗",
    "tabletTip": "Lüften Sie kurz und kräftig. Bei geöffneten Fenstern heizt das System nicht.",
    "fireplaceWarning": "Wenn Sie keine Erfahrung mit einem Kamin haben, heizen Sie bitte nicht damit. Es besteht Brandgefahr.",
    "checkoutPayment": "Bitte begleichen Sie alle Zahlungen und Restbeträge online über Alfred oder das Zahlungsportal. Eine Zahlung vor Ort ist nicht möglich.",
    "reception": "Rezeption · +420 840 113 114",
    "exploreEyebrow": "MEHR AUS DEM URLAUB MACHEN",
    "exploreTitle": "Wohin geht es heute?",
    "exploreText": "Praktische Links für Ihre Tagesplanung, direkt vom Skigebiet.",
    "resort": "Skigebiet Klínovec",
    "resortSub": "Offizielle Informationen und Neuigkeiten",
    "webcams": "Webcams",
    "webcamsSub": "Ein Blick auf die Bedingungen am Hang",
    "slopes": "Pisten und Lifte",
    "slopesSub": "Aktueller Betriebsstatus",
    "resortMap": "Karte des Skigebiets",
    "resortMapSub": "Planen Sie Ihre Route",
    "food": "Restaurants und Imbisse",
    "foodSub": "Essen im Skigebiet",
    "skipass": "Skipässe online",
    "skipassSub": "Offizieller Shop des Skigebiets",
    "zoom": "Foto vergrößern",
    "close": "Foto schließen",
    "reservation": "Buchung in Alfred öffnen ↗"
  }
};
let current;
const $ = id => document.getElementById(id);
const safeHttps = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
function notify(message) { $('toast').textContent = message; clearTimeout(notify.timer); notify.timer = setTimeout(() => $('toast').textContent = '', 4500); }
async function copy(value) { try { await navigator.clipboard.writeText(value); notify(translations[current.lang].copied); } catch { notify(translations[current.lang].copyFailed); } }
function render() {
  current = HillsidePortal.parseLink(location.href, C.alfredHosts);
  const s = current, t = JSON.parse(JSON.stringify(translations[s.lang]));
  if (s.state === 'checkin' && s.paid) {
    const paidCopy = {
      cs:['Zaplaceno · zbývá check-in','Platba je vyřízena. Zbývá check-in.','Dokončete online check-in za všechny hosty v Alfrédovi. Platbu už máte vyřízenou.','Kód ke vstupu obdržíte po dokončení check-inu.'],
      en:['Paid · check-in pending','Payment complete. Just check in.','Complete online check-in for all guests in Alfred. Your payment is already complete.','You will receive your access code after completing check-in.'],
      de:['Bezahlt · Check-in ausstehend','Bezahlt. Jetzt noch einchecken.','Schließen Sie den Online-Check-in für alle Gäste in Alfred ab. Ihre Zahlung ist bereits erledigt.','Sie erhalten Ihren Zugangscode nach Abschluss des Check-ins.']
    }[s.lang];
    t.badges.checkin=paidCopy[0]; t.titles.checkin=paidCopy[1]; t.descriptions.checkin=paidCopy[2]; t.actionNote=paidCopy[3]; t.locked=paidCopy[3];
  }
  const parkingPhoto = document.querySelector('.arrival-photo [data-photo]');
  const parkingSource = {cs:'assets/parking-guide-v7-apartments.png',en:'assets/parking-guide-en.png',de:'assets/parking-guide-de.png'}[s.lang];
  parkingPhoto.dataset.photo = parkingSource;
  parkingPhoto.querySelector('img').src = parkingSource;
  document.documentElement.lang = s.lang;
  document.body.dataset.state = s.state;
  document.title = 'Hillside 18 · ' + (s.apartment ? t.apartment + ' ' + s.apartment : t.stay);
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t[el.dataset.i18n]);
  document.querySelectorAll('[data-alt]').forEach(el => el.alt = t[el.dataset.alt]);
  document.querySelectorAll('[data-photo]').forEach(el => el.setAttribute('aria-label',t.zoom + ': ' + t[el.dataset.caption]));
  $('close-photo').textContent = t.close + ' ×';
  document.querySelectorAll('[data-lang]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.lang === s.lang)));
  $('apartment').textContent = s.apartment ? t.apartment + ' ' + s.apartment : t.unknownApartment;
  $('status').dataset.state = s.state;
  $('state-badge').textContent = t.badges[s.state];
  $('status-title').textContent = t.titles[s.state];
  $('status-description').textContent = t.descriptions[s.state];
  $('steps').replaceChildren(...t.steps.map((label, i) => { const li = document.createElement('li'); const level = {checkin:0,payment:1,ready:3}[s.state]; const complete = i < level || (i === 1 && s.paid); li.textContent = (complete ? '✓ ' : (i + 1) + ' · ') + label; li.className = complete ? 'complete' : i === level ? 'active' : ''; if (i === level) li.setAttribute('aria-current','step'); return li; }));
  const action = $('state-action');
  action.textContent = t.actions[s.state];
  action.href = s.state === 'ready' ? '#arrival' : s.alfred || 'https://alfred.previo.app/';
  action.rel = 'noreferrer noopener';
  action.target = s.state === 'ready' ? '_self' : '_blank';
  const sticky = $('bottom-state-action');
  sticky.hidden = s.state === 'ready';
  sticky.textContent = t.actions[s.state]; sticky.href = action.href;
  $('reservation-link').href = s.alfred || 'https://alfred.previo.app/';
  $('action-note').textContent = s.state === 'ready' ? '' : s.alfred ? t.actionNote : t.missingAlfred;
  $('door-code').textContent = s.door || '••••';
  $('code-note').textContent = s.door ? t.codeNote : s.state === 'ready' ? t.codeMissing : t.locked;
  $('copy-code').hidden = !s.door;
  $('arrival-time').textContent = C.checkinTime || t.perReservation;
  $('checkout-time').textContent = C.checkoutTime || t.perReservation;
  $('wifi-info').textContent = C.wifiName && C.wifiPassword ? t.wifiNetwork + ': ' + C.wifiName + '\n' + t.wifiPassword + ': ' + C.wifiPassword : t.wifiPlaceholder;
  $('copy-wifi').hidden = !(C.wifiName && C.wifiPassword);
  $('map-link').href = safeHttps(C.mapUrl) || '#contact';
  $('map-link').rel = 'noreferrer noopener';
  const phone = /^\+[1-9]\d{6,14}$/.test(C.phone) ? C.phone : '';
  const wa = /^\+[1-9]\d{6,14}$/.test(C.whatsapp) ? C.whatsapp : '';
  $('contact-note').textContent = phone || wa ? t.contactReady + (phone ? ' ' + phone.replace(/^(\+\d{3})(\d{3})(\d{3})(\d{3})$/,'$1 $2 $3 $4') : '') : t.contactMissing;
  document.querySelectorAll('.call-link').forEach(el => { el.href = phone ? 'tel:' + phone : '#contact'; el.onclick = phone ? null : () => notify(t.contactMissing); });
  document.querySelectorAll('.whatsapp-link').forEach(el => { el.href = wa ? 'https://wa.me/' + wa.slice(1) : '#contact'; el.rel = 'noreferrer noopener'; el.onclick = wa ? null : () => notify(t.contactMissing); });
  $('map-link').onclick = safeHttps(C.mapUrl) ? null : () => notify(t.mapMissing);
  $('bus-link').href = {cs:'https://klinovec.cz/skibus/#linka-C',en:'https://klinovec.cz/en/skibuses/#bus-line-C',de:'https://klinovec.cz/de/skibus-2/#buslinie-C'}[s.lang];
  let wallet = $('wallet-preview');
  if (!wallet) { wallet = document.createElement('a'); wallet.id='wallet-preview'; wallet.className='text-link'; $('contact-note').after(wallet); }
  const walletParams = new URLSearchParams({lang:s.lang});
  if (s.apartment) walletParams.set('apt',s.apartment);
  if (s.alfred) walletParams.set('alf',s.alfred);
  if (s.state === 'ready') walletParams.set('done','1');
  if (s.state === 'payment') walletParams.set('unpaid','1');
  if (s.paid) walletParams.set('paid','1');
  if (s.door) walletParams.set('door',s.door);
  wallet.replaceChildren();
  const walletLogo = document.createElement('img'); walletLogo.src='assets/google-wallet.svg'; walletLogo.alt='Google Wallet'; walletLogo.width=155; walletLogo.height=29;
  const walletLabel = document.createElement('span'); walletLabel.textContent={cs:'Karta pobytu · náhled ↗',en:'Stay card · preview ↗',de:'Aufenthaltskarte · Vorschau ↗'}[s.lang];
  wallet.append(walletLogo,walletLabel); wallet.href = 'wallet-preview.html?' + walletParams;
  wallet.hidden = !C.walletPreviewEnabled;
}
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('lang',button.dataset.lang); history.replaceState(null,'',u); render(); }));
$('copy-code').onclick = () => { if (current.door) copy(current.door); };
$('copy-wifi').onclick = () => copy(C.wifiPassword);
window.addEventListener('popstate',render);
window.addEventListener('hashchange',render);
// In-page navigation must not overwrite the legacy #apt= fallback.
document.addEventListener('click', event => {
  const anchor = event.target.closest('a[href^="#"]');
  if (!anchor) return;
  const target = document.getElementById(anchor.getAttribute('href').slice(1));
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  target.setAttribute('tabindex','-1');
  target.focus({preventScroll:true});
});
render();

const photoDialog = $('photo-dialog');
document.querySelectorAll('[data-photo]').forEach(button => button.addEventListener('click', () => {
 const t = translations[current.lang];
 $('photo-full').src = button.dataset.photo;
 $('photo-full').alt = t[button.dataset.caption];
 $('photo-caption').textContent = t[button.dataset.caption];
 photoDialog.showModal();
}));
$('close-photo').onclick = () => photoDialog.close();
photoDialog.addEventListener('click',e => { if(e.target===photoDialog) photoDialog.close(); });
