# Rig Book

Un'app web per segnare il tuo gear musicale e da studio: chitarre, bassi, ampli, pedali, schede audio, outboard (preamp, compressori, EQ…), monitor, cuffie, microfoni, computer.

Per chitarre e bassi puoi segnare scalatura, corde, accordatura e la data dell'ultimo cambio corde: l'app ti avvisa quando sono passati più di 4 mesi.

- Funziona anche offline e si installa sul telefono ("Aggiungi alla schermata Home").
- I dati restano sul tuo dispositivo. Con "Collega" (facoltativo) li sincronizzi tra telefono e PC: sull'altro dispositivo inquadri un QR o scrivi un codice di 8 caratteri. Niente email né password.
- Nessuna libreria esterna caricata da altri siti (font e QR inclusi).
- Con "Esporta backup" salvi un file `.json`, con "Importa backup" lo ricarichi su un altro dispositivo. L'app ti ricorda di fare un backup ogni 30 giorni.
- Prezzi scritti all'italiana ("1.450", "89,90"), ricerca su tutto, ordinamento, annulla dopo l'eliminazione.
- **Check-up Logic**: se Logic crasha o si blocca, un comando da incollare nel Terminale del Mac (`checkup.js`, solo lettura) legge plugin Audio Unit, driver audio/MIDI, spazio, dispositivi audio e crash recenti; incollando il risultato l'app spiega cosa può dare fastidio (plugin doppi, solo Intel, senza firma, crash con il plugin colpevole…). L'analisi è tutta nel browser (`doctor.js`).
- Quando esce una nuova versione compare un avviso con il pulsante Aggiorna.

Sito statico: `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`. Nessuna build.
Per pubblicare un aggiornamento cambia `VERSION` in `sw.js`.

Sincronizzazione: server in `functions/` (Cloudflare Pages Functions + database D1 collegato come `DB`).
L'indirizzo del server va in `SYNC_API` in `app.js` (e in `connect-src` nella CSP di `index.html`); se è vuoto il pulsante Collega non compare.
Il primo dispositivo crea un conto anonimo e riceve un token (sul server solo l'impronta SHA-256); gli altri si collegano con un codice
di 10 minuti, monouso. Ogni pezzo è una riga `items`; vince la modifica più recente e le eliminazioni restano come lapidi.

Librerie incluse: qrcode-generator (MIT, Kazuhiko Arase) in `qr.js`.
