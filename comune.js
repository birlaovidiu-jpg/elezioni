// Parti in comune tra le pagine: chi vota (index.html), il segretario (segretario.html), la proiezione (proiezione.html).
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword,
         signOut, onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider, inMemoryPersistence, setPersistence }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { initializeFirestore, connectFirestoreEmulator, doc, getDoc }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { FIREBASE } from './config.js?v=12';

export * from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// Sul Mac (localhost) il programma usa il simulatore di Firebase, per le prove.
export const PROVA = ['localhost', '127.0.0.1'].includes(location.hostname);
export const COLLEGATO = PROVA || !!FIREBASE.apiKey;
const CONFIG = PROVA ? { apiKey: 'prova', projectId: 'demo-elezioni', appId: 'prova' } : FIREBASE;

let app, auth, db;
function collegaAuth(a) { if (PROVA) connectAuthEmulator(a, `http://${location.hostname}:9099`, { disableWarnings: true }); }
if (COLLEGATO) {
  app = initializeApp(CONFIG);
  auth = getAuth(app);
  // Collegamento «a richieste brevi» invece del canale continuo: con alcuni browser e reti (Safari,
  // antivirus, router) il canale continuo restava fermo anche 30 secondi prima di consegnare i cambiamenti.
  db = initializeFirestore(app, { experimentalForceLongPolling: true });
  collegaAuth(auth);
  if (PROVA) connectFirestoreEmulator(db, location.hostname, 8080);
}
export { db, auth };

// ---------- Versione: se su Internet ce n'è una più nuova, la pagina si ricarica da sola ----------
// (va cambiata insieme a versione.txt e ai «?v=» delle pagine a ogni pubblicazione)
export const VERSIONE = '12';
export async function controllaVersione() {
  try {
    const r = await fetch('versione.txt?x=' + Date.now(), { cache: 'no-store' });
    const nuova = (await r.text()).trim();
    if (!nuova || nuova === VERSIONE) return;
    // Una volta sola per versione, così non gira in tondo se qualcosa va storto.
    if (sessionStorage.getItem('aggiornato') === nuova) return;
    sessionStorage.setItem('aggiornato', nuova);
    const u = new URL(location.href); u.searchParams.set('agg', nuova);
    location.replace(u.href);
  } catch (e) { /* senza rete: si riprova la prossima volta */ }
}

// ---------- La chiesa (carta intestata, pagina di accesso) ----------
export const CHIESA = {
  denominazione: 'Chiesa Avventista del 7° Giorno — Movimento di Riforma',
  campo: 'Campo Italiano',
  indirizzo: 'Via Piero della Francesca, 7 — 52010 Capolona (AR)',
  programma: 'Elezioni e Votazioni'
};

// ---------- Tipi di sessione ----------
export const TIPI = {
  assemblea: { nome: 'Assemblea dei delegati', breve: 'Assemblea', em: '🏛️', esempio: 'es. Campo Italiano', etichetta: 'Nome dell\'assemblea' },
  chiesa:    { nome: 'Raduno di chiesa',       breve: 'Chiesa',    em: '⛪', esempio: 'es. Casentino',      etichetta: 'Nome della chiesa' },
  comitato:  { nome: 'Comitato',               breve: 'Comitato',  em: '👥', esempio: 'es. Campo',          etichetta: 'Nome del comitato' },
  consiglio: { nome: 'Consiglio',              breve: 'Consiglio', em: '🗂️', esempio: 'es. Campo',          etichetta: 'Nome del consiglio' }
};
// «Votazione Chiesa Casentino», «Votazione Comitato Campo», «Votazione Assemblea Campo Italiano»…
export function nomeVotazione(s) {
  if (!s) return 'Votazione';
  if (s.nome && TIPI[s.tipo]) return `Votazione ${TIPI[s.tipo].breve} ${s.nome}`;
  return 'Votazione ' + (s.titolo || '');   // sessioni fatte prima dei tipi nuovi
}
export const TUTTI_I_TIPI = Object.keys(TIPI);

// ---------- Chi vota: un numero anonimo, niente password ----------
// Se il numero c'è già (salvato nel browser) si usa subito, senza chiedere niente a Internet.
let _entrato = null;
export function entra() {
  return _entrato ??= (async () => {
    await auth.authStateReady();
    if (auth.currentUser) return auth.currentUser.uid;
    return (await signInAnonymously(auth)).user.uid;
  })();
}

// ---------- Segretari e Direttore: nome utente + password ----------
// Il nome utente diventa un indirizzo interno (ovidio → ovidio@elezioni-sdarm.firebaseapp.com).
const DOMINIO = 'elezioni-sdarm.firebaseapp.com';
export const DIRETTORE = 'ovidio';
export const pulisciUtente = u => String(u || '').trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');
export const emailDi = u => pulisciUtente(u) + '@' + DOMINIO;
export const utenteDa = email => String(email || '').split('@')[0];

// Chi è entrato: { uid, utente, nome, direttore } oppure null.
export async function chiSono(u) {
  if (!u || u.isAnonymous || !u.email) return null;
  const utente = utenteDa(u.email);
  if (utente === DIRETTORE) return { uid: u.uid, utente, nome: 'Ovidio Birla', direttore: true, tipi: TUTTI_I_TIPI };
  const d = await getDoc(doc(db, 'utenti', u.uid)).catch(() => null);
  if (!d?.exists() || d.data().attivo !== true) return null;
  // Su cosa può lavorare (scelto dal Direttore); chi è stato creato prima dei permessi può tutto.
  const tipi = Array.isArray(d.data().tipi) ? d.data().tipi.filter(t => TIPI[t]) : TUTTI_I_TIPI;
  return { uid: u.uid, utente, nome: d.data().nome || utente, direttore: false, tipi };
}
export function quandoCambiaAccesso(fn) { return onAuthStateChanged(auth, fn); }
export async function accedi(utente, password) {
  const c = await signInWithEmailAndPassword(auth, emailDi(utente), password);
  return c.user;
}
// Solo la prima volta: il Direttore sceglie la sua password.
export async function creaDirettore(password) {
  const c = await createUserWithEmailAndPassword(auth, emailDi(DIRETTORE), password);
  return c.user;
}
export function esci() { _entrato = null; return signOut(auth); }
export async function cambiaPassword(vecchia, nuova) {
  const u = auth.currentUser;
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, vecchia));
  await updatePassword(u, nuova);
}
// Il Direttore crea l'account di un'altra persona senza uscire dal suo:
// si usa una seconda copia di Firebase solo per questo, poi si chiude.
export async function creaAccount(utente, password) {
  const a2 = initializeApp(CONFIG, 'nuovo-' + Date.now());
  try {
    const au2 = getAuth(a2); collegaAuth(au2);
    await setPersistence(au2, inMemoryPersistence);
    const c = await createUserWithEmailAndPassword(au2, emailDi(utente), password);
    const uid = c.user.uid;
    await signOut(au2);
    return uid;
  } finally { deleteApp(a2).catch(() => {}); }
}
export function messaggioErrore(e) {
  const c = e?.code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return 'Nome utente o password sbagliati.';
  if (/email-already-in-use/.test(c)) return 'Questo nome utente esiste già.';
  if (/weak-password/.test(c)) return 'La password è troppo corta: almeno 6 caratteri.';
  if (/too-many-requests/.test(c)) return 'Troppi tentativi. Aspetta qualche minuto e riprova.';
  if (/network/.test(c)) return 'Manca la connessione a Internet.';
  if (/requires-recent-login/.test(c)) return 'Esci e rientra, poi riprova.';
  return 'Qualcosa non ha funzionato. Riprova.';
}

// ---------- Piccoli aiuti ----------
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
export function dataBella(d) {
  if (!d) return '';
  const [y, m, g] = d.split('-').map(Number);
  return new Date(y, m - 1, g).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}
// Il ruolo come lo vedono tutti: «Delegato chiesa Casentino», «Membro chiesa Casentino», «Presidente · chiesa Firenze».
export function ruoloCompleto(r) {
  if (r.ruolo === 'Delegato' || r.ruolo === 'Membro') return `${r.ruolo} chiesa ${r.chiesa}`;
  return r.chiesa ? `${r.ruolo} · chiesa ${r.chiesa}` : r.ruolo;
}

// Conta le schede: vince chi ha più della metà dei votanti (schede bianche comprese).
// I votanti sono il numero scritto dal segretario; se non l'ha scritto, le schede arrivate.
// Se restano posti senza vincitore: vanno al ballottaggio i primi due (il doppio dei posti rimasti),
// con tutti quelli a pari voti sull'ultimo posto; gli altri sono fuori.
export function conta(votazione, schede) {
  const n = votazione.candidati.length;
  const voti = new Array(n).fill(0);
  let bianche = 0, nulle = 0, contrari = 0;
  for (const s of schede) {
    if (s && s.b === true) { bianche++; continue; }
    // Con un solo nome si vota Sì o No: il No conta come voto dato, ma contro.
    if (s && s.no === true) { if (n === 1) contrari++; else nulle++; continue; }
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
  return { voti, bianche, nulle, contrari, arrivate, votanti, maggioranza, vinti, parita, ballottaggio, fuori, posti: rimasti };
}

// Le righe dei risultati, uguali per segretario, proiezione e PDF.
// Con più nomi: dal più votato. Con un solo nome: «Sì — Nome» e «No».
export function righeRisultato(v, r) {
  const perc = n => r.votanti ? Math.round(n / r.votanti * 1000) / 10 : 0;
  if (v.candidati.length === 1) {
    const si = r.voti[0], no = r.contrari || 0;
    return [
      { nome: 'Sì — ' + v.candidati[0], voti: si, perc: perc(si), esito: r.vinti.includes(0) ? 'vinto' : '', si: true },
      { nome: 'No', voti: no, perc: perc(no), esito: '', no: true }
    ];
  }
  const ballo = r.ballottaggio || [], fuori = r.fuori || [];
  return v.candidati.map((_, i) => i).sort((a, b) => r.voti[b] - r.voti[a]).map(i => ({
    nome: v.candidati[i], voti: r.voti[i], perc: perc(r.voti[i]),
    esito: r.vinti.includes(i) ? 'vinto' : ballo.includes(i) ? 'ballo' : fuori.includes(i) ? 'fuori' : ''
  }));
}
// Quando nessuno è eletto (e non c'è ballottaggio).
export function notaNessuno(v, r) {
  if (v.candidati.length === 1) return `${v.candidati[0]} non è eletto: servivano ${r.maggioranza} Sì.`;
  return `Nessuno ha raggiunto la maggioranza (servivano ${r.maggioranza} voti).`;
}

// Colori dei pulsanti dei candidati (uguali sul telefono e in proiezione).
export const COLORI = [
  ['#2563eb', '#1e3a8a'], ['#7c3aed', '#4c1d95'], ['#db2777', '#831843'], ['#ea580c', '#9a3412'],
  ['#0891b2', '#155e75'], ['#059669', '#065f46'], ['#ca8a04', '#854d0e'], ['#4f46e5', '#312e81'],
  ['#e11d48', '#881337'], ['#0d9488', '#134e4a']
];
