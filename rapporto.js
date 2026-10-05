// Rapporto PDF delle votazioni su carta intestata (come nel programma delle Pubblicazioni):
// fascia blu con il logo bianco, la chiesa a sinistra e il nome del foglio a destra.
import { CHIESA, nomeVotazione, dataBella, righeRisultato, notaNessuno } from './comune.js?v=10';

let pronto = null;
function caricaScript(src) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
}
async function base64(url) {
  const b = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
// Il logo ridipinto di bianco (per la fascia blu) e di blu scuro (per le pagine dopo la prima).
function logoTinto(img, colore) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = colore; x.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
function prepara() {
  return pronto ??= (async () => {
    if (!window.jspdf) await caricaScript('lib/jspdf.umd.min.js');
    const [reg, bold] = await Promise.all([base64('lib/Inter-Regular.ttf'), base64('lib/Inter-Bold.ttf')]);
    const img = new Image(); img.src = 'logo.png'; await img.decode();
    return { reg, bold, bianco: logoTinto(img, '#ffffff'), ratio: img.naturalWidth / img.naturalHeight };
  })();
}

const BLU1 = [15, 36, 56], BLU2 = [38, 85, 124], TITOLI = [15, 31, 77], GRIGIO = [107, 112, 132], LINEA = [226, 221, 208];
const VERDE = [21, 128, 61], ARANCIO = [196, 120, 20], ROSSO = [138, 36, 51];

export async function creaRapporto({ codice, sessione, iscritti, votazioni, risultati, segretario }) {
  const R = await prepara();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.addFileToVFS('Inter-Regular.ttf', R.reg); pdf.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  pdf.addFileToVFS('Inter-Bold.ttf', R.bold); pdf.addFont('Inter-Bold.ttf', 'Inter', 'bold');
  const W = 210, H = 297, M = 16, BASSO = H - 20;
  const nomeV = nomeVotazione(sessione);
  let y = 0;

  const font = (peso, pt, colore = [27, 34, 56]) => { pdf.setFont('Inter', peso); pdf.setFontSize(pt); pdf.setTextColor(...colore); };
  const testo = (t, x, yy, o = {}) => pdf.text(String(t ?? ''), x, yy, o);
  const taglia = (t, larg) => { let s = String(t ?? ''); while (s.length > 1 && pdf.getTextWidth(s) > larg) s = s.slice(0, -2) + '…'; return s; };

  // Fascia blu sfumata (tante strisce sottili).
  function fascia(alta) {
    const n = 70;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), c = BLU1.map((v, k) => Math.round(v + (BLU2[k] - v) * t));
      pdf.setFillColor(...c); pdf.rect(W * i / n, 0, W / n + 0.6, alta, 'F');
    }
  }
  function intestazione() {
    const h = 44; fascia(h);
    const lh = 26, lw = lh * R.ratio;
    pdf.addImage(R.bianco, 'PNG', M, 9, lw, lh);
    const tx = M + lw + 6, larg = 112 - lw;
    // Prima riga: «Elezioni e Votazioni | Campo Italiano», separati da una linea.
    font('bold', 17, [255, 255, 255]); testo(CHIESA.programma, tx, 16);
    const xLinea = tx + pdf.getTextWidth(CHIESA.programma) + 4;
    pdf.setDrawColor(190, 205, 228); pdf.setLineWidth(0.4); pdf.line(xLinea, 11, xLinea, 17.2);
    font('bold', 11, [255, 255, 255]); testo(CHIESA.campo, xLinea + 4, 16);
    font('normal', 8.6, [225, 232, 245]); testo(taglia(CHIESA.denominazione, larg + 10), tx, 23);
    font('normal', 8.2, [215, 225, 240]); testo(taglia(CHIESA.indirizzo, larg + 10), tx, 29.5);
    // A destra, più in basso, per non toccare la prima riga.
    font('bold', 13, [255, 255, 255]); testo('Rapporto delle votazioni', W - M, 28, { align: 'right' });
    font('normal', 9, [225, 232, 245]); testo(taglia(nomeV, 64), W - M, 34, { align: 'right' });
    testo(dataBella(sessione.data), W - M, 39.5, { align: 'right' });
    y = h + 10;
  }
  function intestazionePiccola() {
    const h = 14; fascia(h);
    pdf.addImage(R.bianco, 'PNG', M, 3, 8 * R.ratio, 8);
    font('bold', 10, [255, 255, 255]); testo(CHIESA.programma, M + 8 * R.ratio + 4, 8.8);
    font('normal', 8.5, [225, 232, 245]); testo(taglia(`${sessione.raduno || ''} · ${nomeV}`, 100), W - M, 8.8, { align: 'right' });
    y = h + 9;
  }
  function spazio(h) { if (y + h > BASSO) { pdf.addPage(); intestazionePiccola(); } }
  function titoloSezione(t) {
    spazio(18);
    font('bold', 13, TITOLI); testo(t, M, y);
    pdf.setDrawColor(...TITOLI); pdf.setLineWidth(0.6); pdf.line(M, y + 1.8, M + pdf.getTextWidth(t), y + 1.8);
    y += 9;
  }
  // Tabella semplice: colonne [{t, w, allinea}] e righe di celle {t, peso, colore}.
  function tabella(colonne, righe, opz = {}) {
    const alto = opz.alto || 7.2;
    const testa = () => {
      pdf.setFillColor(238, 241, 249); pdf.rect(M, y - 4.8, W - 2 * M, alto, 'F');
      font('bold', 8.3, TITOLI);
      let x = M + 2; colonne.forEach(c => { testo(c.t.toUpperCase(), c.allinea === 'right' ? x + c.w - 2 : x, y, c.allinea === 'right' ? { align: 'right' } : {}); x += c.w; });
      y += alto;
    };
    spazio(alto * 2 + 2); testa();
    righe.forEach((r, i) => {
      if (y + alto > BASSO) { pdf.addPage(); intestazionePiccola(); testa(); }
      if (r.sfondo) { pdf.setFillColor(...r.sfondo); pdf.rect(M, y - 4.8, W - 2 * M, alto, 'F'); }
      else if (i % 2) { pdf.setFillColor(250, 249, 246); pdf.rect(M, y - 4.8, W - 2 * M, alto, 'F'); }
      let x = M + 2;
      r.celle.forEach((c, k) => {
        const col = colonne[k];
        font(c.peso || 'normal', c.pt || 9.3, c.colore || [27, 34, 56]);
        const t = taglia(c.t, col.w - 3);
        testo(t, col.allinea === 'right' ? x + col.w - 2 : x, y, col.allinea === 'right' ? { align: 'right' } : {});
        x += col.w;
      });
      y += alto;
    });
    pdf.setDrawColor(...LINEA); pdf.setLineWidth(0.3); pdf.line(M, y - 4.8, W - M, y - 4.8);
    y += 4;
  }

  // ---------- Pagina 1 ----------
  intestazione();
  // Riquadro del raduno
  pdf.setFillColor(246, 248, 252); pdf.setDrawColor(...LINEA); pdf.setLineWidth(0.3);
  pdf.roundedRect(M, y - 6, W - 2 * M, 36, 3, 3, 'FD');
  font('bold', 16, TITOLI); testo(taglia(sessione.raduno || nomeV, W - 2 * M - 10), M + 6, y + 2);
  font('normal', 10.5, GRIGIO); testo(nomeV, M + 6, y + 9);
  const dati = [
    ['Data', dataBella(sessione.data) || '—'], ['Codice', codice],
    ['Votanti', sessione.votanti > 0 ? String(sessione.votanti) : '—'], ['Registrati', String(iscritti.length)],
    ['Votazioni', String(votazioni.length)], ['Segretario', segretario || '—']
  ];
  dati.forEach(([k, v], i) => {
    const cx = M + 6 + (i % 3) * 60, cy = y + 17 + Math.floor(i / 3) * 8;
    font('normal', 8, GRIGIO); testo(k.toUpperCase(), cx, cy);
    font('bold', 9.5); testo(taglia(v, 40), cx + pdf.getTextWidth(k.toUpperCase()) + 2.5, cy);
  });
  y += 40;

  // ---------- Chi c'era ----------
  const intestazioni = { comitato: 'Composizione del comitato', consiglio: 'Composizione del consiglio', assemblea: 'Delegati presenti', chiesa: 'Membri presenti' };
  titoloSezione(intestazioni[sessione.tipo] || 'Partecipanti');
  const persone = [...iscritti].sort((a, b) => (a.cognome + a.nome).localeCompare(b.cognome + b.nome, 'it'));
  const conIncarico = sessione.tipo === 'comitato' || sessione.tipo === 'consiglio';
  if (persone.length) {
    tabella([{ t: 'N.', w: 12 }, { t: 'Nome e cognome', w: 70 }, { t: conIncarico ? 'Incarico' : 'Ruolo', w: 50 }, { t: 'Chiesa', w: W - 2 * M - 132 }],
      persone.map((p, i) => ({ celle: [{ t: String(i + 1), colore: GRIGIO }, { t: `${p.nome} ${p.cognome}`, peso: 'bold' }, { t: p.ruolo }, { t: p.chiesa || '—' }] })));
  } else { font('normal', 10, GRIGIO); testo('Nessun registrato.', M, y); y += 8; }

  // ---------- Risultati ----------
  titoloSezione('Risultati delle votazioni');
  if (!votazioni.length) { font('normal', 10, GRIGIO); testo('Nessuna votazione chiusa.', M, y); y += 8; }
  for (const v of votazioni) {
    const r = risultati[v.id]; if (!r) continue;
    const ballo = r.ballottaggio || [], arrivate = r.arrivate ?? r.votanti;
    spazio(30);
    font('bold', 11.5, TITOLI); testo(`${v.n}. ${v.titolo}`, M, y); y += 5.5;
    font('normal', 8.6, GRIGIO);
    testo([`Votanti ${r.votanti}`, v.votanti ? `schede arrivate ${arrivate}` : '', `maggioranza ${r.maggioranza} voti`, `bianche ${r.bianche}`,
      r.nulle ? `non valide ${r.nulle}` : '', v.candidati.length === 1 ? 'votazione Sì / No' : v.scelte > 1 ? `fino a ${v.scelte} nomi a testa` : 'un nome a testa'].filter(Boolean).join('  ·  '), M, y);
    y += 6;
    const sino = v.candidati.length === 1;
    tabella([{ t: sino ? '' : 'Pos.', w: 14 }, { t: sino ? 'Voto' : 'Candidato', w: 86 }, { t: 'Voti', w: 20, allinea: 'right' }, { t: '%', w: 22, allinea: 'right' }, { t: 'Esito', w: W - 2 * M - 142 }],
      righeRisultato(v, r).map((x, k) => {
        const vinto = x.esito === 'vinto', alBallo = x.esito === 'ballo';
        const perc = r.votanti ? x.perc.toLocaleString('it-IT') + '%' : '—';
        const esito = { vinto: ['HA VINTO', VERDE], ballo: ['BALLOTTAGGIO', ARANCIO], fuori: ['FUORI', GRIGIO], '': ['', GRIGIO] }[x.esito];
        return { sfondo: vinto ? [220, 252, 231] : alBallo ? [255, 243, 220] : null,
          celle: [{ t: sino ? '' : String(k + 1), colore: GRIGIO }, { t: x.nome, peso: vinto ? 'bold' : 'normal', colore: vinto ? VERDE : x.no ? ROSSO : undefined },
            { t: String(x.voti), peso: 'bold' }, { t: perc }, { t: esito[0], peso: 'bold', colore: esito[1], pt: 8.5 }] };
      }));
    let nota = '';
    if (!arrivate) nota = 'Nessuno ha votato.';
    else if (ballo.length) nota = `Va al ballottaggio: ${ballo.map(i => v.candidati[i]).join(', ')}.`;
    else if (!r.vinti.length) nota = notaNessuno(v, r);
    if (r.parita?.length) nota += ` Parità tra ${r.parita.map(i => v.candidati[i]).join(', ')}.`;
    if (nota) { spazio(7); font('bold', 9, ballo.length ? ARANCIO : ROSSO); testo(nota.trim(), M, y - 1); y += 6; }
    y += 2;
  }

  // ---------- Riepilogo degli eletti ----------
  const finali = votazioni.filter(v => !votazioni.some(x => x.ballottaggioDi === v.id));
  if (finali.length) {
    titoloSezione('Riepilogo degli eletti');
    tabella([{ t: 'Per cosa si è votato', w: 80 }, { t: 'Eletto', w: W - 2 * M - 80 }],
      finali.map(v => {
        const r = risultati[v.id];
        const nomi = (r?.vinti || []).map(i => v.candidati[i]);
        const ballo = (r?.ballottaggio || []).map(i => v.candidati[i]);
        return { celle: [{ t: v.titolo.replace(/^Ballottaggio – /, ''), peso: 'bold' },
          nomi.length ? { t: nomi.join(', '), peso: 'bold', colore: VERDE }
            : { t: ballo.length ? 'Nessuno — ballottaggio: ' + ballo.join(', ') : 'Nessuno eletto', colore: GRIGIO }] };
      }));
  }

  // ---------- Firma ----------
  spazio(34);
  y += 8;
  font('normal', 9.5, GRIGIO); testo(`${CHIESA.campo}, ${dataBella(sessione.data) || ''}`, M, y);
  font('normal', 9.5, GRIGIO); testo('Il Segretario', W - M - 60, y);
  y += 16;
  pdf.setDrawColor(...GRIGIO); pdf.setLineWidth(0.3); pdf.line(W - M - 60, y, W - M, y);
  font('bold', 10); testo(segretario || '', W - M - 60, y + 5);

  // ---------- Piè di pagina su tutte le pagine ----------
  const pagine = pdf.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(...LINEA); pdf.setLineWidth(0.3); pdf.line(M, H - 13, W - M, H - 13);
    font('normal', 7.8, GRIGIO);
    testo(taglia(`${CHIESA.programma} · ${nomeV}${sessione.raduno ? ' · ' + sessione.raduno : ''}`, 140), M, H - 8.5);
    testo(`Pagina ${p} di ${pagine}`, W - M, H - 8.5, { align: 'right' });
  }

  const pulito = t => String(t || '').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  pdf.save(pulito(`Rapporto ${sessione.raduno || nomeV} ${sessione.data || ''}`) + '.pdf');
}
