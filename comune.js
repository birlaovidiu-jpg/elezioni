// Parti in comune tra la pagina di chi vota (index.html) e quella del segretario (segretario.html).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously, connectAuthEmulator }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { initializeFirestore, connectFirestoreEmulator }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { FIREBASE } from './config.js?v=3';

export * from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// Sul Mac (localhost) il programma usa il simulatore di Firebase, per le prove.
export const PROVA = ['localhost', '127.0.0.1'].includes(location.hostname);
export const COLLEGATO = PROVA || !!FIREBASE.apiKey;

let app, auth, db;
if (COLLEGATO) {
  app = initializeApp(PROVA ? { apiKey: 'prova', projectId: 'demo-elezioni', appId: 'prova' } : FIREBASE);
  auth = getAuth(app);
  // Collegamento «a richieste brevi» invece del canale continuo: con alcuni browser e reti (Safari,
  // antivirus, router) il canale continuo restava fermo anche 30 secondi prima di consegnare i cambiamenti.
  db = initializeFirestore(app, { experimentalForceLongPolling: true });
  if (PROVA) {
    connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, location.hostname, 8080);
  }
}
export { db };

// Ogni telefono/computer riceve un numero anonimo da Firebase (niente password).
// Se il numero c'è già (salvato nel browser) si usa subito, senza chiedere niente a Internet.
let _entrato = null;
export function entra() {
  return _entrato ??= (async () => {
    await auth.authStateReady();
    if (auth.currentUser) return auth.currentUser.uid;
    return (await signInAnonymously(auth)).user.uid;
  })();
}

// Codici a caso (senza lettere che si confondono: niente 0/O, 1/I/L).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function codice(n) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, x => ALFABETO[x % ALFABETO.length]).join('');
}
export function idCasuale() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

export function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function iniziali(nome) {
  const p = String(nome).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

// Il ruolo come lo vedono tutti: «Delegato chiesa Casentino», «Membro chiesa Casentino».
export function ruoloCompleto(r) {
  return `${r.ruolo} chiesa ${r.chiesa}`;
}

// Conta le schede: vince chi ha più della metà dei votanti (schede bianche comprese).
// I votanti sono il numero scritto dal segretario; se non l'ha scritto, le schede arrivate.
// Se restano posti senza vincitore: vanno al ballottaggio i primi due (il doppio dei posti rimasti),
// con tutti quelli a pari voti sull'ultimo posto; gli altri sono fuori.
export function conta(votazione, schede) {
  const n = votazione.candidati.length;
  const voti = new Array(n).fill(0);
  let bianche = 0, nulle = 0;
  for (const s of schede) {
    if (s && s.b === true) { bianche++; continue; }
    const scelte = Array.isArray(s?.c) ? [...new Set(s.c)] : [];
    if (!scelte.length || scelte.length > votazione.scelte ||
        scelte.some(i => !Number.isInteger(i) || i < 0 || i >= n)) { nulle++; continue; }
    scelte.forEach(i => voti[i]++);
  }
  const arrivate = schede.length;
  const votanti = votazione.votanti > 0 ? votazione.votanti : arrivate;
  const maggioranza = Math.floor(votanti / 2) + 1;
  const ordine = voti.map((v, i) => i).sort((a, b) => voti[b] - voti[a]);
  const sopra = ordine.filter(i => voti[i] >= maggioranza && votanti > 0);
  let vinti = sopra, parita = [];
  if (sopra.length > votazione.scelte) {
    // Più candidati sopra la maggioranza che posti: passano i più votati; a pari voti sul limite nessuno passa.
    const limite = voti[sopra[votazione.scelte - 1]];
    const oltre = voti[sopra[votazione.scelte]];
    vinti = sopra.filter(i => voti[i] > limite || (voti[i] === limite && limite !== oltre));
    if (limite === oltre) parita = sopra.filter(i => voti[i] === limite);
  }
  let ballottaggio = [], fuori = [];
  const rimasti = votazione.scelte - vinti.length;
  if (rimasti > 0 && arrivate > 0) {
    const altri = ordine.filter(i => !vinti.includes(i));
    const quanti = 2 * rimasti;
    if (altri.length > quanti) {
      const ultimo = voti[altri[quanti - 1]];
      ballottaggio = altri.filter(i => voti[i] >= ultimo);
    } else ballottaggio = altri;
    // Con un solo nome per un solo posto non c'è nessuno con cui fare il ballottaggio.
    if (ballottaggio.length > rimasti) fuori = altri.filter(i => !ballottaggio.includes(i));
    else ballottaggio = [];
  }
  return { voti, bianche, nulle, arrivate, votanti, maggioranza, vinti, parita, ballottaggio, fuori, posti: rimasti };
}
