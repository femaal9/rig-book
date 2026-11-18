# Rig Book

Un'app web per segnare il tuo gear musicale e da studio: chitarre, bassi, ampli, pedali, schede audio, outboard (preamp, compressori, EQ…), monitor, cuffie, microfoni, computer.

Per chitarre e bassi puoi segnare scalatura, corde, accordatura e la data dell'ultimo cambio corde: l'app ti avvisa quando sono passati più di 4 mesi.

- Funziona anche offline e si installa sul telefono ("Aggiungi alla schermata Home").
- I dati restano solo sul tuo dispositivo: nessun account, nessun server, nessuna richiesta a siti esterni (anche il font è incluso).
- Con "Esporta backup" salvi un file `.json`, con "Importa backup" lo ricarichi su un altro dispositivo. L'app ti ricorda di fare un backup ogni 30 giorni.
- Prezzi scritti all'italiana ("1.450", "89,90"), ricerca su tutto, ordinamento, annulla dopo l'eliminazione.
- Quando esce una nuova versione compare un avviso con il pulsante Aggiorna.

Sito statico: `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`. Nessuna build.
Per pubblicare un aggiornamento cambia `VERSION` in `sw.js`.

Font: Rubik, licenza SIL Open Font License 1.1 (testo in `fonts/`).
