/*
 * Builds the completed new-patient packet as a PDF, entirely in the browser (jsPDF, vendored locally).
 * Reads the same schema + policy text as the on-screen form so the two always match.
 */
window.IntakePDF = (function () {
  'use strict';
  const S = window.INTAKE_SCHEMA, POL = window.INTAKE_POLICIES;

  const OLIVE = [57, 74, 39], AMBER = [224, 160, 58], INK = [36, 43, 28], MUTED = [95, 102, 80],
        LINE = [226, 220, 201], CREAM = [247, 242, 232], WILLOW = [232, 237, 214], WHITE = [255, 255, 255];
  const PW = 612, PH = 792, M = 48, CW = PW - 2 * M, TOP = 80, BOT = PH - 56;

  // keep to characters the built-in PDF fonts can draw
  const T = s => String(s == null ? '' : s).replace(/[^ -~ -ÿ‘’“”–—•…]/g, '?');

  // How some steps are printed: which fields are folded into combined cells
  const COMPOSE = {
    you: {
      skip: ['lastName', 'firstName', 'mi', 'dob', 'address', 'city', 'state', 'zip'],
      first: d => [
        { l: 'Name (last, first, MI)', v: `${d.lastName || ''}, ${d.firstName || ''} ${d.mi || ''}`.trim() },
        { l: 'Date of birth', v: d.dob || '' },
        { l: 'Address', v: [d.address, [d.city, d.state].filter(Boolean).join(', '), d.zip].filter(Boolean).join(' · '), full: true }
      ]
    },
    spouse: {
      skip: ['hasSpouse', 'spLast', 'spFirst', 'spMi', 'spDob'],
      first: d => [
        { l: 'Name (last, first, MI)', v: `${d.spLast || ''}, ${d.spFirst || ''} ${d.spMi || ''}`.trim() },
        { l: 'Date of birth', v: d.spDob || '' }
      ]
    },
    insurance: { skip: ['noIns'], first: () => [] }
  };
  const SECTION_TITLES = { you: 'Patient information', spouse: 'Spouse / partner', insurance: 'Dental insurance', medical: 'Medical health', dental: 'Dental health' };

  function newId() {
    const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = new Uint32Array(6); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => r[i] = Math.random() * 1e9);
    return Array.from(r, n => a[n % a.length]).join('');
  }

  function build(data, sig, CFG, sigRatio) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
    const id = newId();
    const now = new Date();
    const dateLong = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const dateTime = dateLong + ', ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const patient = [data.firstName, data.lastName].filter(Boolean).join(' ');
    let y = TOP;

    doc.setProperties({ title: 'New Patient Forms - ' + patient, subject: 'Completed new patient packet', author: CFG.practiceName, creator: 'Willow Run Dental online intake' });

    /* ---- primitives ---- */
    const color = c => doc.setTextColor(c[0], c[1], c[2]);
    const fill = c => doc.setFillColor(c[0], c[1], c[2]);
    const stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
    const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };
    const wrap = (text, w, style, size) => { font(style || 'normal', size); return doc.splitTextToSize(T(text), w); };

    function header() {
      fill(OLIVE); doc.rect(0, 0, PW, 52, 'F');
      fill(AMBER); doc.rect(0, 52, PW, 3, 'F');
      color(WHITE); font('bold', 15); doc.text(T(CFG.practiceName), M, 31);
      font('normal', 8.5); doc.text(T(`${CFG.practiceAddress}  ·  ${CFG.practicePhone}`), M, 43);
      font('bold', 9); doc.text('NEW PATIENT FORMS', PW - M, 31, { align: 'right' });
    }
    function newPage() { doc.addPage(); header(); y = TOP; }
    function ensure(h) { if (y + h > BOT) newPage(); }
    function pageBreakIfLow(h) { if (y + h > BOT) newPage(); }

    function para(text, o = {}) {
      const size = o.size || 9.5, lh = size * (o.lh || 1.38), w = o.w || CW, x = o.x || M;
      const ls = wrap(text, w, o.style, size); color(o.color || INK); font(o.style || 'normal', size);
      ls.forEach(l => { ensure(lh); doc.text(l, x, y + size); y += lh; });
      y += o.gap == null ? 6 : o.gap;
    }
    function title(t) {
      ensure(96); y += 6;
      fill(AMBER); doc.rect(M, y, 4, 15, 'F');
      color(OLIVE); font('bold', 12.5); doc.text(T(t), M + 11, y + 12);
      y += 20; stroke(LINE); doc.setLineWidth(.7); doc.line(M, y, PW - M, y); y += 10;
    }
    function subtitle(t) { ensure(66); y += 4; color(MUTED); font('bold', 8.5); doc.text(T(t.toUpperCase()), M, y + 8); y += 16; }

    /* ---- label/value grid ---- */
    function cellRow(cs) {
      const gap = 16, colW = (CW - gap) / 2;
      const w = cs.length === 1 && cs[0].full ? CW : colW;
      const prepared = cs.map(c => ({ ...c, ls: wrap(c.v === '' || c.v == null ? '—' : c.v, w - 4, 'normal', 10) }));
      const h = 11 + Math.max(...prepared.map(c => c.ls.length)) * 12.4 + 7;
      ensure(h);
      prepared.forEach((c, i) => {
        const x = M + i * (colW + gap);
        color(MUTED); font('normal', 7.6); doc.text(T(c.l.replace(/\s*\(optional\)/i, '')), x, y + 8);
        color(c.v === '' || c.v == null ? MUTED : INK); font('normal', 10);
        c.ls.forEach((l, j) => doc.text(l, x, y + 20 + j * 12.4));
        stroke(LINE); doc.setLineWidth(.5); doc.line(x, y + h - 3, x + w, y + h - 3);
      });
      y += h;
    }
    function grid(cells) {
      let buf = [];
      cells.forEach(c => {
        if (c.full) { if (buf.length) { cellRow(buf); buf = []; } cellRow([c]); }
        else { buf.push(c); if (buf.length === 2) { cellRow(buf); buf = []; } }
      });
      if (buf.length) cellRow(buf);
      y += 4;
    }

    /* ---- yes/no list ---- */
    function ynList(items) {
      items.forEach(([q, v], i) => {
        const ls = wrap(q, CW - 80, 'normal', 9.6); const h = Math.max(20, ls.length * 12.2 + 9);
        ensure(h);
        if (i % 2 === 0) { fill(CREAM); doc.rect(M, y, CW, h, 'F'); }
        color(INK); font('normal', 9.6); ls.forEach((l, j) => doc.text(l, M + 8, y + 13 + j * 12.2));
        const mid = y + h / 2;
        if (v === 'Yes') { fill(OLIVE); doc.roundedRect(PW - M - 46, mid - 8, 38, 16, 8, 8, 'F'); color(WHITE); font('bold', 9); doc.text('YES', PW - M - 27, mid + 3.2, { align: 'center' }); }
        else if (v === 'No') { stroke(LINE); doc.setLineWidth(.8); fill(WHITE); doc.roundedRect(PW - M - 46, mid - 8, 38, 16, 8, 8, 'FD'); color(MUTED); font('normal', 9); doc.text('NO', PW - M - 27, mid + 3.2, { align: 'center' }); }
        else { color(MUTED); font('normal', 9); doc.text('—', PW - M - 27, mid + 3.2, { align: 'center' }); }
        y += h;
      });
      y += 8;
    }

    /* ---- conditions (3-up) ---- */
    function conditions(f, v) {
      const sel = Array.isArray(v) ? v : []; const none = sel.includes('__none__');
      subtitle('Have you ever been treated for…');
      const cols = 3, colW = CW / cols, rowH = 18;
      S.CONDITIONS.forEach((name, i) => {
        if (i % cols === 0) ensure(rowH);
        const x = M + (i % cols) * colW, yes = !none && sel.includes(name);
        if (yes) { fill(OLIVE); doc.rect(x, y + 3, 9, 9, 'F'); stroke(WHITE); doc.setLineWidth(1.2); doc.line(x + 2, y + 7.5, x + 4, y + 10); doc.line(x + 4, y + 10, x + 7.5, y + 4.8); }
        else { stroke(MUTED); doc.setLineWidth(.7); fill(WHITE); doc.rect(x, y + 3, 9, 9, 'FD'); }
        color(yes ? INK : MUTED); font(yes ? 'bold' : 'normal', 9.4); doc.text(T(name), x + 15, y + 11);
        if (i % cols === cols - 1 || i === S.CONDITIONS.length - 1) y += rowH;
      });
      color(MUTED); font('italic', 8.2); doc.text(none ? 'Patient indicated none of the above.' : 'Checked boxes indicate conditions the patient has been treated for.', M, y + 8); y += 18;
    }

    /* ---- one schema step ---- */
    function printStep(step) {
      const comp = COMPOSE[step.id] || { skip: [], first: () => [] };
      title(SECTION_TITLES[step.id] || step.title);
      let firstDone = false;
      step.blocks.forEach(b => {
        if (b.heading && step.id === 'medical' || (b.heading && step.id === 'dental')) { if (!b.fields.some(f => f.t === 'chips')) subtitle(b.heading); }
        let cells = [], yns = [];
        if (!firstDone) { cells.push(...comp.first(data)); firstDone = true; }
        const flushC = () => { if (cells.length) { grid(cells); cells = []; } };
        const flushY = () => { if (yns.length) { ynList(yns); yns = []; } };
        b.fields.forEach(f => {
          if (f.showIf && !f.showIf(data)) return;
          if (comp.skip.includes(f.k) || f.t === 'check') return;
          const v = data[f.k];
          if (f.t === 'yn') { flushC(); yns.push([f.l, v || '']); return; }
          if (f.t === 'chips') { flushC(); flushY(); conditions(f, v); return; }
          flushY();
          const sv = Array.isArray(v) ? v.join(', ') : (v || '');
          cells.push({ l: f.l, v: sv, full: f.t === 'area' || String(sv).length > 34 || f.l.length > 44 });
        });
        flushC(); flushY();
      });
      if (step.id === 'insurance' && data.noIns) para('Patient reports no dental insurance.', { color: MUTED, style: 'italic' });
    }

    /* ---- signature ---- */
    function signature(label) {
      const ratio = sigRatio || 240 / 900, imgH = 58, imgW = Math.min(230, imgH / ratio);
      ensure(imgH + 62); y += 6;
      if (sig) { try { doc.addImage(sig, 'PNG', M, y, imgW, imgW * ratio); } catch (e) { /* ignore bad image */ } }
      const ly = y + imgH + 4; stroke(INK); doc.setLineWidth(.8); doc.line(M, ly, M + 250, ly); doc.line(M + 290, ly, M + 450, ly);
      color(MUTED); font('normal', 8); doc.text(T(label || 'Signature'), M, ly + 11); doc.text('Date', M + 290, ly + 11);
      color(INK); font('normal', 10); doc.text(dateLong, M + 292, ly - 4);
      color(MUTED); font('italic', 8); doc.text(T(`Signed electronically by ${data.sigName || patient} (${(data.sigRel || 'the patient').toLowerCase()}) on ${dateTime}`), M, ly + 23);
      y = ly + 34;
    }
    function initialsLine(text, ini) {
      ensure(30); fill(WILLOW); doc.roundedRect(M, y, CW, 24, 4, 4, 'F');
      color(INK); font('normal', 9.4); doc.text(T(text), M + 10, y + 15);
      if (ini !== null) { font('bold', 11); doc.text(T('Initials: ' + (ini || '')), PW - M - 10, y + 15.5, { align: 'right' }); } y += 34;
    }

    /* ========== PAGE 1 ========== */
    header();
    color(OLIVE); font('bold', 22); doc.text('Patient Health Record', M, y + 14); y += 28;
    color(MUTED); font('normal', 9); doc.text(T(`Submitted electronically on ${dateTime}   ·   Reference ${id}`), M, y + 4); y += 18;
    fill(WILLOW); doc.roundedRect(M, y, CW, 50, 6, 6, 'F');
    color(MUTED); font('normal', 7.6); doc.text('PATIENT', M + 14, y + 15); doc.text('DATE OF BIRTH', M + 270, y + 15); doc.text('PHONE', M + 390, y + 15);
    color(INK); font('bold', 13); doc.text(T(patient || '—'), M + 14, y + 36); font('bold', 11); doc.text(T(data.dob || '—'), M + 270, y + 35); doc.text(T(data.cellPhone || data.homePhone || '—'), M + 390, y + 35);
    y += 66;

    S.steps.forEach(step => {
      if (step.id === 'spouse' && data.hasSpouse !== 'Yes') return;
      printStep(step);
    });

    /* ========== AGREEMENTS ========== */
    newPage();
    title('Insurance filing permission');
    if (data.noIns) para('Not applicable: the patient reports no dental insurance.', { color: MUTED, style: 'italic' });
    else para(`I, ${patient}, ${POL.insuranceFiling}`, { size: 10.2 });
    y += 4;

    // Financial policy
    const fin = POL.financial; pageBreakIfLow(200);
    title(fin.title);
    fin.sections.forEach(s => { ensure(34); para(s.h + ':', { style: 'bold', size: 9.6, gap: 2 }); s.p.forEach(t => para(t, { size: 9.2, gap: 5 })); });
    para(fin.ack, { style: 'bold', size: 9.6, gap: 8 });
    initialsLine('Financial policy acknowledged.', data.initFin);
    signature('Signature (financial policy)');

    // Privacy notice
    newPage();
    const pr = POL.privacy; title('Willow Run Dental ' + pr.title);
    para(pr.lead, { style: 'bold', size: 9.4, gap: 6 });
    pr.p.forEach(t => para(t, { size: 9.2, gap: 5 }));
    initialsLine('Notice of Privacy Practices acknowledged.', data.initPriv);
    signature('Signature (privacy notice)');

    // Authorization to release
    if (data.wantRecords === 'Yes') {
      newPage();
      const R = POL.release; title(R.title);
      grid([
        { l: 'Date', v: dateLong }, { l: 'Patient', v: patient },
        { l: 'Relationship to patient', v: data.relPatient || 'Self' }, { l: 'Date of birth', v: data.dob },
        { l: 'Records are being requested from', v: data.prevDentist, full: true },
        { l: 'Their fax number or email', v: data.prevContact, full: true }
      ]);
      para(R.sendTo, { size: 9.6 });
      para('Additional information to be released: ' + R.additional, { size: 9.6 });
      para(R.pleaseEmail, { size: 9.6, gap: 10 });
      para('Authorization:', { style: 'bold', size: 10, gap: 2 });
      para(R.authorization, { style: 'bold', size: 9.4, gap: 10 });
      initialsLine('Patient checked the box authorizing release of the records described above.', null);
      signature('Patient signature');
    }

    /* ---- footers ---- */
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); stroke(LINE); doc.setLineWidth(.6); doc.line(M, PH - 40, PW - M, PH - 40);
      color(MUTED); font('normal', 7.8);
      doc.text(T(`${CFG.practiceName}  ·  Confidential patient health information`), M, PH - 27);
      doc.text(`Page ${i} of ${n}   ·   Ref ${id}`, PW - M, PH - 27, { align: 'right' });
    }

    const safe = s => String(s || '').replace(/[^A-Za-z0-9]+/g, '');
    const filename = `New-Patient-Forms_${safe(data.lastName) || 'Patient'}-${safe(data.firstName) || 'New'}_${now.toISOString().slice(0, 10)}.pdf`;
    const base64 = doc.output('datauristring').split(',').pop();
    return { doc, id, filename, base64, blob: doc.output('blob') };
  }

  return { build };
})();
