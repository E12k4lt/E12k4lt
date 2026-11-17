# Card QR Scanner

Offline-Web-App (PWA): Foto der Tabelle „HW - Config“ aufnehmen, Rahmen um die Spalten
**Card 0** und **Card 1** ziehen. Die Werte werden direkt auf dem Handy erkannt
(Tesseract OCR, kein Internet nötig) und als QR-Codes angezeigt.

## Schnelltest ohne Installation: `test.html`
`test.html` ist die komplette App in **einer Datei** (Texterkennung, Sprachdaten und ein Beispielfoto
eingebettet, ca. 14 MB). Aufs Handy kopieren und im Browser öffnen (Chrome: `file://`-Pfad bzw.
über einen Dateimanager „Öffnen mit Chrome“). Kein Server, kein Internet nötig.
Mit „🧪 Beispielfoto“ lässt sich die Erkennung sofort ausprobieren.
Neu erzeugen nach Änderungen: `node tools/build-test.js`.

## Keine Online-Daten
Die App lädt nichts aus dem Internet. Die in tesseract.js eingebauten CDN-Standardadressen
(jsdelivr) wurden in `vendor/tesseract.min.js` und `vendor/worker.min.js` durch lokale Pfade ersetzt.

## Installation aufs Handy
1. Die App einmal über HTTPS öffnen (z. B. GitHub Pages, siehe unten).
2. Warten bis oben „Offline bereit“ steht.
3. Browser-Menü → „Zum Startbildschirm hinzufügen“ (Android/Chrome) bzw. Teilen → „Zum Home-Bildschirm“ (iPhone/Safari).
4. Danach funktioniert die App komplett offline.

## Hosting über GitHub Pages
Repository → Settings → Pages → „Deploy from a branch“ → Branch auswählen, Ordner `/ (root)`.

## Aufbau
- `index.html` – App (Kamera, Rahmen, Erkennung, QR-Codes)
- `js/cells.js` – Zerlegt den Ausschnitt in Zeilen/Spalten, Vorverarbeitung und Abstimmung mehrerer OCR-Durchläufe
- `test.html` – Einzeldatei-Version zum Testen (erzeugt von `tools/build-test.js`)
- `test/beispiel.jpg` – Beispielfoto für den Test
- `sw.js` – Service Worker, cached alles für Offline-Betrieb
- `vendor/` – tesseract.js 5.1.1, tesseract.js-core (LSTM), qrcode-generator 1.4.4
- `lang/eng.traineddata.gz` – Tesseract-Sprachdaten (best_int)
