# Elezioni e Votazioni

Programma di votazione segreta per chiese, assemblea dei delegati, comitati e consigli
(Chiesa Avventista del 7° Giorno — Movimento di Riforma, Campo Italiano).

- **Segretario / Direttore:** `segretario.html` (nome utente e password)
- **Chi vota:** inquadra il QR code della sessione → `index.html?s=CODICE`, oppure apre l'app e scrive il codice
- **Proiezione:** `proiezione.html?s=CODICE` (si apre dal pulsante «📺 Proiezione» della sessione)

I voti passano da Firebase (progetto `elezioni-sdarm`); le regole di sicurezza sono in `firestore.rules`.
Rapporto PDF con jsPDF (`lib/`, licenza MIT) e il carattere Inter (`lib/`, licenza SIL OFL 1.1).
