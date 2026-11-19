# Rig Book

Un'app web per segnare il tuo gear musicale e da studio: chitarre, bassi, ampli, pedali, schede audio, outboard (preamp, compressori, EQ…), monitor, cuffie, microfoni, computer.

Per chitarre e bassi puoi segnare scalatura, corde, accordatura e la data dell'ultimo cambio corde: l'app ti avvisa quando sono passati più di 4 mesi.

- Funziona anche offline e si installa sul telefono ("Aggiungi alla schermata Home").
- Senza account i dati restano solo sul tuo dispositivo. Con un account (email e password, facoltativo) i pezzi si sincronizzano tra telefono e PC.
- Nessuna libreria esterna (anche il font è incluso). L'unico servizio esterno è Firebase, usato solo se accedi.
- Con "Esporta backup" salvi un file `.json`, con "Importa backup" lo ricarichi su un altro dispositivo. L'app ti ricorda di fare un backup ogni 30 giorni.
- Prezzi scritti all'italiana ("1.450", "89,90"), ricerca su tutto, ordinamento, annulla dopo l'eliminazione.
- Quando esce una nuova versione compare un avviso con il pulsante Aggiorna.

Sito statico: `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`. Nessuna build.
Per pubblicare un aggiornamento cambia `VERSION` in `sw.js`.

Account e sincronizzazione: Firebase Authentication (email/password) e Firestore, chiamati via REST da `app.js`.
La configurazione (`apiKey` e `projectId`, valori pubblici) è in `FIREBASE` in cima alla sezione "account e sincronizzazione";
se è vuota il pulsante Accedi non compare. Le regole di sicurezza sono in `firestore.rules`.
Ogni pezzo è un documento `users/{uid}/items/{id}`; vince la modifica più recente e le eliminazioni restano come lapidi.

Font: Rubik, licenza SIL Open Font License 1.1 (testo in `fonts/`).
