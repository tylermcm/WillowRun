/*
 * Step-by-step new patient intake wizard: many short screens, arrow navigation.
 * Everything stays in this browser tab: nothing is saved to the site, localStorage or cookies.
 * The PDF is generated on the patient's device (pdf.js) and only leaves it when the patient presses Send.
 */
(function () {
  'use strict';
  const CFG = window.INTAKE_CONFIG, SCHEMA = window.INTAKE_SCHEMA, POL = window.INTAKE_POLICIES;
  const digits = SCHEMA.digits;

  const data = {};            // answers, keyed by field key
  let sig = null;             // signature as a PNG data URL
  let sigRatio = 240 / 900;   // height / width of the signature image
  let cur = 0, maxReached = 0, done = false, result = null;

  /* ---------- small helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(c => n.append(c instanceof Node ? c : document.createTextNode(c)));
    return n;
  }
  const arrow = dir => `<svg class="ic arr ${dir}" aria-hidden="true"><use href="#i-right"/></svg>`;
  const fmtPhone = s => { const d = digits(s).slice(0, 10); return d.length < 4 ? d : d.length < 7 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };
  const fmtDate = s => { const d = digits(s).slice(0, 8); return d.length < 3 ? d : d.length < 5 ? `${d.slice(0, 2)}/${d.slice(2)}` : `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`; };
  const fmtSsn = s => { const d = digits(s).slice(0, 9); return d.length < 4 ? d : d.length < 6 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`; };
  function validDate(s) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || ''); if (!m) return false;
    const [mo, da, yr] = [+m[1], +m[2], +m[3]]; const d = new Date(yr, mo - 1, da);
    return yr >= 1900 && d.getFullYear() === yr && d.getMonth() === mo - 1 && d.getDate() === da && d <= new Date();
  }
  const visible = f => !f.showIf || f.showIf(data);
  const blank = v => v == null || v === '' || (Array.isArray(v) && !v.length);
  const fullName = () => [data.firstName, data.lastName].filter(Boolean).join(' ');

  /* ---------- screens ---------- */
  const SCREENS = [{ id: 'welcome', chapter: 'Welcome', title: 'Welcome', render: renderWelcome }];
  SCHEMA.steps.forEach(step => step.blocks.forEach(b => SCREENS.push({
    id: step.id + '-' + SCREENS.length, stepId: step.id, chapter: step.title, title: b.title, blurb: b.blurb, block: b
  })));
  SCREENS.push(
    { id: 'agree-ins', stepId: 'agree', chapter: 'Agreements', title: 'Filing your insurance', render: renderAgreeIns, validate: validateAgreeIns, skip: () => !!data.noIns },
    { id: 'agree-fin', stepId: 'agree', chapter: 'Agreements', title: 'Financial policy', render: renderAgreeFin, validate: validateAgreeFin },
    { id: 'agree-priv', stepId: 'agree', chapter: 'Agreements', title: 'Privacy notice', render: renderAgreePriv, validate: validateAgreePriv },
    { id: 'agree-sign', stepId: 'agree', chapter: 'Agreements', title: 'Sign your forms', render: renderSign, validate: validateSign },
    { id: 'records', stepId: 'records', chapter: 'Previous dentist', title: 'Your previous dentist', render: renderRecords, validate: validateRecords },
    { id: 'review', stepId: 'review', chapter: 'Review & send', title: 'Review & send', render: renderReview }
  );
  const CHAPTERS = [...new Set(SCREENS.map(s => s.chapter))];
  const isSkipped = s => !!(s.skip && s.skip());
  const active = () => SCREENS.filter(s => !isSkipped(s));
  const nextIdx = i => { let j = i + 1; while (j < SCREENS.length - 1 && isSkipped(SCREENS[j])) j++; return j; };
  const prevIdx = i => { let j = i - 1; while (j > 0 && isSkipped(SCREENS[j])) j--; return j; };

  const stepList = $('#stepList'), card = $('#card'), form = $('#stepForm'), titleEl = $('#stepTitle'),
        body = $('#stepBody'), errBox = $('#errSummary'), backBtn = $('#back'), nextBtn = $('#next'),
        mProg = $('#mobileProg'), mBar = $('#mobileBar'), kicker = $('#screenKicker'), topBar = $('#topBar');

  /* ---------- field rendering ---------- */
  function makeField(f) {
    if (data[f.k] === undefined && f.def !== undefined) data[f.k] = f.def;
    const id = 'f-' + f.k;
    const star = f.req ? el('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : '';
    const wrap = el(['radio', 'yn', 'chips'].includes(f.t) ? 'fieldset' : 'div', { class: `field t-${f.t}`, 'data-k': f.k });
    wrap.style.setProperty('--span', f.w || 12);
    const help = f.help ? el('p', { class: 'help', id: id + '-h' }, f.help) : null;
    const err = el('p', { class: 'err', id: id + '-e', role: 'alert' });
    const onChange = fn => e => { fn(e); clearErr(wrap); refresh(); };

    switch (f.t) {
      case 'text': case 'tel': case 'email': case 'date': case 'ssn': {
        const type = f.t === 'tel' ? 'tel' : f.t === 'email' ? 'email' : 'text';
        const inp = el('input', {
          id, name: f.k, type, autocomplete: f.ac || 'off', placeholder: f.ph || '', maxlength: f.max || false,
          inputmode: f.im || (f.t === 'tel' || f.t === 'date' || f.t === 'ssn' ? 'numeric' : false),
          'aria-required': f.req ? 'true' : false, 'aria-describedby': (help ? id + '-h ' : '') + id + '-e'
        });
        inp.value = data[f.k] || '';
        inp.addEventListener('input', onChange(() => {
          if (f.t === 'tel') inp.value = fmtPhone(inp.value);
          if (f.t === 'date') inp.value = fmtDate(inp.value);
          if (f.t === 'ssn') inp.value = fmtSsn(inp.value);
          data[f.k] = inp.value.trim();
        }));
        wrap.append(el('label', { for: id }, f.l, star), inp, help || '', err);
        break;
      }
      case 'area': {
        const ta = el('textarea', { id, name: f.k, rows: 3, 'aria-required': f.req ? 'true' : false, 'aria-describedby': id + '-e' });
        ta.value = data[f.k] || '';
        ta.addEventListener('input', onChange(() => { data[f.k] = ta.value; }));
        wrap.append(el('label', { for: id }, f.l, star), ta, err);
        break;
      }
      case 'select': {
        const sel = el('select', { id, name: f.k }, f.opts.map(o => el('option', { value: o }, o)));
        sel.value = data[f.k] || f.opts[0]; data[f.k] = sel.value;
        sel.addEventListener('change', onChange(() => { data[f.k] = sel.value; }));
        wrap.append(el('label', { for: id }, f.l, star), sel, err);
        break;
      }
      case 'check': {
        const cb = el('input', { type: 'checkbox', id, name: f.k });
        cb.checked = !!data[f.k];
        cb.addEventListener('change', onChange(() => { data[f.k] = cb.checked; }));
        wrap.append(el('label', { class: 'check', for: id }, cb, el('span', {}, f.l)), err);
        break;
      }
      case 'initials': {
        if (data[f.k] === undefined) data[f.k] = '';
        const inp = el('input', { id, name: f.k, maxlength: 4, autocomplete: 'off', class: 'initials', 'aria-required': 'true', 'aria-describedby': id + '-e' });
        inp.value = data[f.k];
        inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z.\- ]/g, ''); data[f.k] = inp.value.trim(); clearErr(wrap); });
        wrap.append(el('label', { for: id }, f.l, star), inp, err);
        break;
      }
      case 'radio': case 'yn': {
        const opts = f.t === 'yn' ? ['Yes', 'No'] : f.opts;
        wrap.append(el('legend', {}, f.l, star));
        const seg = el('div', { class: f.t === 'yn' ? 'seg' : 'seg wrap-seg' });
        opts.forEach((o, i) => {
          const rid = `${id}-${i}`;
          const r = el('input', { type: 'radio', id: rid, name: f.k, value: o });
          r.checked = data[f.k] === o;
          r.addEventListener('change', onChange(() => { data[f.k] = o; }));
          seg.append(r, el('label', { for: rid }, o));
        });
        wrap.append(seg, help || '', err);
        break;
      }
      case 'chips': {
        wrap.append(el('legend', {}, f.l, star));
        const box = el('div', { class: 'chips' });
        const have = () => (Array.isArray(data[f.k]) ? data[f.k] : []);
        const mk = (label, none) => {
          const cid = `${id}-${none ? 'none' : label.replace(/\W+/g, '')}`;
          const cb = el('input', { type: 'checkbox', id: cid, value: label, 'data-none': none ? '1' : false });
          cb.checked = none ? have().includes('__none__') : have().includes(label);
          cb.addEventListener('change', onChange(() => {
            let v = have().filter(x => x !== '__none__');
            if (none) v = cb.checked ? ['__none__'] : [];
            else { v = cb.checked ? [...v, label] : v.filter(x => x !== label); }
            data[f.k] = v;
            box.querySelectorAll('input').forEach(i => { i.checked = i.dataset.none ? v.includes('__none__') : v.includes(i.value); });
          }));
          return el('span', { class: 'chip' + (none ? ' chip-none' : '') }, cb, el('label', { for: cid }, label));
        };
        f.opts.forEach(o => box.append(mk(o, false)));
        box.append(mk(f.noneLabel || 'None of these', true));
        wrap.append(box, err);
        break;
      }
    }
    wrap._f = f;
    return wrap;
  }

  function refresh() {
    document.querySelectorAll('[data-k]').forEach(w => { const f = w._f; if (f && f.showIf) w.hidden = !visible(f); });
    const hint = $('#nameHint'); if (hint) hint.textContent = fullName() || 'your name';
  }
  function clearErr(w) { w.classList.remove('has-error'); const e = $('.err', w); if (e) e.textContent = ''; const i = $('input,select,textarea', w); if (i) i.removeAttribute('aria-invalid'); }
  function setErr(key, msg) {
    const w = body.querySelector(`[data-k="${key}"]`); if (!w) return;
    w.classList.add('has-error'); const e = $('.err', w); if (e) e.textContent = msg;
    const i = $('input,select,textarea', w); if (i) i.setAttribute('aria-invalid', 'true');
  }
  function fields(...list) { return el('div', { class: 'fgrid' }, list.map(makeField)); }

  /* ---------- validation ---------- */
  function validateFields(list) {
    const errs = {};
    list.forEach(f => {
      if (!visible(f)) return;
      const v = data[f.k];
      if (f.req && blank(v)) { errs[f.k] = f.t === 'yn' || f.t === 'radio' ? 'Please choose an answer.' : f.t === 'chips' ? 'Please choose at least one, or “None of these”.' : 'This is required.'; return; }
      if (blank(v)) return;
      if (f.t === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) errs[f.k] = 'That email doesn’t look right.';
      if (f.t === 'tel' && digits(v).length !== 10) errs[f.k] = 'Please enter a 10-digit phone number.';
      if (f.t === 'date' && !validDate(v)) errs[f.k] = 'Please use MM/DD/YYYY.';
      if (f.t === 'ssn' && digits(v).length !== 9) errs[f.k] = 'A Social Security number has 9 digits.';
      if (f.k === 'zip' && !/^\d{5}(-?\d{4})?$/.test(v)) errs[f.k] = 'Please enter a 5-digit zip code.';
    });
    return errs;
  }
  function validateScreen(s) {
    if (s.block) {
      const errs = validateFields(s.block.fields);
      if (s.block.validate) Object.assign(errs, s.block.validate(data));
      return errs;
    }
    return s.validate ? s.validate() : {};
  }
  function showErrors(errs) {
    const keys = Object.keys(errs);
    keys.forEach(k => setErr(k, errs[k]));
    if (!keys.length) { errBox.hidden = true; errBox.textContent = ''; return; }
    errBox.hidden = false; errBox.textContent = '';
    errBox.append(el('strong', {}, keys.length === 1 ? 'One thing needs your attention:' : `${keys.length} things need your attention:`));
    const ul = el('ul');
    keys.forEach(k => {
      const w = body.querySelector(`[data-k="${k}"]`);
      const lab = w ? ($('legend', w) || $('label', w) || {}).textContent : k;
      ul.append(el('li', {}, el('a', { href: '#f-' + k, onclick: e => { e.preventDefault(); focusKey(k); } }, (lab || k).replace(/\s*\*$/, '')), ': ' + errs[k]));
    });
    errBox.append(ul);
    focusKey(keys[0]);
  }
  function focusKey(k) {
    const w = body.querySelector(`[data-k="${k}"]`); if (!w) return;
    const t = $('input,select,textarea,canvas', w); if (t) { t.focus({ preventScroll: true }); w.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  /* ---------- screen renderers ---------- */
  function para(text, cls) { return el('p', { class: cls || 'blurb' }, text); }

  function renderWelcome() {
    body.append(
      para('This replaces the paper packet. It’s about 24 short screens and takes around 10 minutes. You can do it from your phone or computer before your visit.'),
      el('div', { class: 'need' },
        el('h3', {}, 'It helps to have'),
        el('ul', {}, ...['Your dental insurance card', 'A list of your current medications', 'Your physician’s name and phone number', 'The name of your previous dentist (if you’d like us to request your records)'].map(t => el('li', {}, t)))),
      el('div', { class: 'privacy-note' },
        el('strong', {}, 'Your privacy. '),
        'Nothing you type is saved on this website. Your answers stay in this browser tab until you press Send at the very end. If you close the tab before then, you’ll start over.'),
      el('p', { class: 'fine' }, 'Prefer paper? Call us at ' + CFG.practicePhone + ' or ', el('a', { href: 'new-patients.html' }, 'download the PDF forms'), '.')
    );
  }

  function policyBox(label, ...kids) { return el('div', { class: 'policy', tabindex: '0', role: 'region', 'aria-label': label }, ...kids); }

  function renderAgreeIns() {
    body.append(para('One quick permission so we can bill your insurance for you.'),
      el('div', { class: 'quote' }, 'I, ', el('strong', { id: 'nameHint' }, fullName() || 'your name'), ', ' + POL.insuranceFiling),
      fields({ k: 'fileIns', l: 'I give permission for the office to file my insurance.', t: 'check', w: 12, req: 1 }));
  }
  function validateAgreeIns() { return data.fileIns ? {} : { fileIns: 'Please check the box to let us file your insurance.' }; }

  function renderAgreeFin() {
    const fin = POL.financial;
    body.append(para('Please read our financial policy. Scroll the box if you need to.'),
      policyBox(fin.title, ...fin.sections.flatMap(s => [el('h4', {}, s.h), ...s.p.map(t => el('p', {}, t))])),
      fields({ k: 'ackFin', l: fin.ack, t: 'check', w: 12, req: 1 }, { k: 'initFin', l: 'Your initials', t: 'initials', w: 4, req: 1 }));
  }
  function validateAgreeFin() {
    const e = {}; if (!data.ackFin) e.ackFin = 'Please confirm you’ve read the financial policy.';
    if (!(data.initFin || '').trim()) e.initFin = 'Please add your initials.'; return e;
  }

  function renderAgreePriv() {
    const pr = POL.privacy;
    body.append(para('Here’s how we protect and use your health information.'),
      policyBox(pr.title, el('p', { class: 'lead-p' }, pr.lead), ...pr.p.map(t => el('p', {}, t))),
      fields({ k: 'ackPriv', l: 'I have read and understand the Notice of Privacy Practices for Willow Run Dental, P.C.', t: 'check', w: 12, req: 1 }, { k: 'initPriv', l: 'Your initials', t: 'initials', w: 4, req: 1 }));
  }
  function validateAgreePriv() {
    const e = {}; if (!data.ackPriv) e.ackPriv = 'Please confirm you’ve read the privacy notice.';
    if (!(data.initPriv || '').trim()) e.initPriv = 'Please add your initials.'; return e;
  }

  function renderSign() {
    if (!data.sigName) data.sigName = fullName();
    body.append(para('Last step before review. Your signature will be applied to every document in this packet: ' +
      (data.noIns ? '' : 'insurance filing permission, ') + 'financial policy, privacy notice' + (data.wantRecords === 'Yes' ? ', and the records release' : '') + '.'));
    body.append(fields({ k: 'esign', l: POL.esign, t: 'check', w: 12, req: 1 }));
    body.append(fields(
      { k: 'sigName', l: 'Printed name of person signing', t: 'text', w: 7, req: 1 },
      { k: 'sigRel', l: 'Signing as', t: 'select', w: 5, opts: ['The patient', 'Parent or legal guardian'], def: 'The patient' }));

    const pad = el('div', { class: 'field t-sig', 'data-k': 'signature' });
    pad.append(el('label', { id: 'sigLabel' }, 'Draw your signature below ', el('span', { class: 'req', 'aria-hidden': 'true' }, '*')));
    const sigH = window.matchMedia('(max-width: 640px)').matches ? 420 : 240;
    const canvas = el('canvas', { class: 'sig-canvas', width: 900, height: sigH, 'aria-labelledby': 'sigLabel', tabindex: '0' });
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b2a3a';
    if (sig) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, canvas.width, canvas.height); im.src = sig; }
    let drawing = false, last = null;
    const pos = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; };
    const store = () => { sig = canvas.toDataURL('image/png'); sigRatio = canvas.height / canvas.width; clearErr(pad); };
    canvas.addEventListener('pointerdown', e => { drawing = true; canvas.setPointerCapture(e.pointerId); last = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(last.x + .1, last.y + .1); ctx.stroke(); e.preventDefault(); });
    canvas.addEventListener('pointermove', e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; e.preventDefault(); });
    const end = () => { if (!drawing) return; drawing = false; store(); };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    const tools = el('div', { class: 'sig-tools' },
      el('button', { type: 'button', class: 'btn ghost btn-sm', onclick: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); sig = null; } }, 'Clear'),
      el('button', { type: 'button', class: 'btn ghost btn-sm', onclick: () => {
        const name = (data.sigName || fullName() || '').trim(); if (!name) { $('#f-sigName').focus(); return; }
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.fillStyle = '#1b2a3a';
        let size = 92; const setF = () => { ctx.font = `italic ${size}px Georgia, "Times New Roman", serif`; }; setF();
        while (ctx.measureText(name).width > canvas.width - 60 && size > 28) { size -= 4; setF(); }
        ctx.textBaseline = 'middle'; ctx.fillText(name, 30, canvas.height / 2); ctx.restore(); store();
      } }, 'Use my typed name instead'));
    pad.append(canvas, tools, el('p', { class: 'err', role: 'alert' }));
    body.append(pad, el('p', { class: 'fine' }, 'Date signed: ' + new Date().toLocaleDateString('en-US') + '.'));
  }
  function validateSign() {
    const e = {};
    if (!data.esign) e.esign = 'Please agree to sign electronically.';
    if (!(data.sigName || '').trim()) e.sigName = 'Please print your name.';
    if (!sig) e.signature = 'Please draw your signature (or use your typed name).';
    return e;
  }

  function renderRecords() {
    body.append(para('Switching dentists? We can ask your previous dentist to send us your X-rays and treatment notes. This is optional.'));
    body.append(fields(
      { k: 'wantRecords', l: 'Would you like us to request your records from a previous dentist?', t: 'yn', w: 12, req: 1 },
      { k: 'relPatient', l: 'Your relationship to the patient', t: 'select', w: 6, opts: ['Self', 'Parent or legal guardian', 'Other'], def: 'Self', showIf: d => d.wantRecords === 'Yes' },
      { k: 'prevDentist', l: 'Name of the dentist or office we’re requesting from', t: 'text', w: 12, req: 1, showIf: d => d.wantRecords === 'Yes' },
      { k: 'prevContact', l: 'Their fax number or email', t: 'text', w: 12, req: 1, showIf: d => d.wantRecords === 'Yes', help: 'If you don’t know it, give us the office’s name and city and we’ll look it up.' }));
    const R = POL.release;
    const box = el('div', { class: 'rel-box', 'data-k': 'relBox' },
      el('h3', {}, R.title),
      policyBox(R.title, el('p', {}, R.sendTo), el('p', {}, el('strong', {}, 'Additional information to be released: '), R.additional), el('p', {}, R.pleaseEmail), el('h4', {}, 'Authorization'), el('p', {}, R.authorization)),
      fields({ k: 'ackRelease', l: 'I authorize the release of the information described above.', t: 'check', w: 12, req: 1 }));
    box._f = { showIf: d => d.wantRecords === 'Yes' };
    body.append(box);
    refresh();
  }
  function validateRecords() {
    const e = {};
    if (!data.wantRecords) e.wantRecords = 'Please choose an answer.';
    if (data.wantRecords === 'Yes') {
      if (!(data.prevDentist || '').trim()) e.prevDentist = 'This is required.';
      if (!(data.prevContact || '').trim()) e.prevContact = 'This is required.';
      if (!data.ackRelease) e.ackRelease = 'Please check the box to authorize the release.';
    }
    return e;
  }

  /* ---------- review & send ---------- */
  const mask = s => s ? '•••-••-' + digits(s).slice(-4) : s;
  function summaryFor(step) {
    const rows = [];
    step.blocks.forEach(b => b.fields.forEach(f => {
      if (!visible(f)) return; const v = data[f.k]; if (blank(v) || v === false) return;
      let val = v;
      if (f.t === 'chips') val = v.includes('__none__') ? 'None' : v.join(', ');
      else if (f.t === 'ssn') val = mask(v);
      else if (f.t === 'check') val = 'Yes';
      rows.push([f.l.replace(/\?$/, '').replace(/…$/, ''), val]);
    }));
    return rows;
  }
  const firstScreenOf = stepId => SCREENS.findIndex(s => s.stepId === stepId && !isSkipped(s));
  function renderReview() {
    body.append(para('Take a quick look. Use Edit to change anything. When you press Send, your completed forms go to our office as a single PDF.'));
    SCHEMA.steps.forEach(step => {
      const rows = summaryFor(step); if (!rows.length) return;
      const dl = el('dl', {}, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))]));
      body.append(el('section', { class: 'sum' }, el('header', {}, el('h3', {}, step.title), el('button', { type: 'button', class: 'linkbtn', onclick: () => go(firstScreenOf(step.id)) }, 'Edit')), dl));
    });
    body.append(el('section', { class: 'sum' }, el('header', {}, el('h3', {}, 'Agreements & signature'), el('button', { type: 'button', class: 'linkbtn', onclick: () => go(firstScreenOf('agree')) }, 'Edit')),
      el('dl', {}, el('dt', {}, 'Signed by'), el('dd', {}, `${data.sigName} (${(data.sigRel || 'The patient').toLowerCase()})`), el('dt', {}, 'Documents'), el('dd', {}, (data.noIns ? '' : 'Insurance filing permission, ') + 'Financial Policy, Notice of Privacy Practices' + (data.wantRecords === 'Yes' ? ', Authorization to Release Dental Information' : '')))));
    body.append(el('div', { class: 'send-box' },
      el('p', {}, CFG.endpoint ? 'Sending is secure and goes straight to our office. We’ll see it right away.' : 'Press the button to create your completed PDF.'),
      el('div', { class: 'hp', 'aria-hidden': 'true' }, el('label', {}, 'Leave this empty', el('input', { name: 'website', tabindex: '-1', autocomplete: 'off', id: 'hp' }))),
      el('p', { id: 'sendStatus', class: 'status', role: 'status' })));
  }

  async function send() {
    const status = $('#sendStatus'); nextBtn.disabled = true; backBtn.disabled = true;
    const hp = $('#hp'); const bot = hp && hp.value;
    try {
      status.textContent = 'Preparing your PDF…';
      result = window.IntakePDF.build(data, sig, CFG, sigRatio);
      let sent = false;
      if (bot) { sent = true; }
      else if (CFG.endpoint) {
        status.textContent = 'Sending to our office…';
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 45000);
        const res = await fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctl.signal,
          body: JSON.stringify({ id: result.id, filename: result.filename, pdfBase64: result.base64 }) });
        clearTimeout(to);
        const j = await res.json();
        if (!j.ok) throw new Error('Office server declined the upload');
        sent = true;
      }
      finish(sent);
    } catch (err) {
      console.error(err);
      status.textContent = '';
      errBox.hidden = false; errBox.textContent = '';
      errBox.append(el('strong', {}, 'We couldn’t send your forms just now.'),
        el('p', {}, 'Nothing is lost. Download your completed PDF below and either email it to ' + CFG.practiceEmail + ' or bring it to your appointment. You can also call us at ' + CFG.practicePhone + '.'),
        result ? el('button', { type: 'button', class: 'btn btn-sm', onclick: download }, 'Download my PDF') : '');
      nextBtn.disabled = false; backBtn.disabled = false;
    }
  }
  function download() {
    const a = el('a', { href: URL.createObjectURL(result.blob), download: result.filename }); document.body.append(a); a.click(); a.remove();
  }
  function finish(sent) {
    done = true; card.classList.add('is-done'); const first = data.firstName || 'there';
    stepList.parentElement.hidden = true; mProg.hidden = true; form.hidden = true; topBar.hidden = true;
    const box = $('#doneBox'); box.hidden = false; box.textContent = '';
    box.append(
      el('div', { class: 'done-ic', 'aria-hidden': 'true' }, '✓'),
      el('h2', { tabindex: '-1', id: 'doneTitle' }, sent ? `Thank you, ${first}!` : `All set, ${first}!`),
      el('p', { class: 'lead' }, sent ? 'Your new patient forms are on their way to our office.' : 'Your completed forms are ready as a PDF.'),
      sent ? el('p', {}, 'Reference number: ', el('strong', {}, result.id), '. We’ll have your paperwork on file before your visit, and Christa may call if anything needs a second look.')
           : el('p', {}, 'Please email the PDF to ', el('a', { href: 'mailto:' + CFG.practiceEmail }, CFG.practiceEmail), ' or bring it to your appointment. Your answers aren’t stored anywhere else.'),
      el('div', { class: 'btns' }, el('button', { type: 'button', class: 'btn', onclick: download }, 'Download my copy (PDF)'), el('a', { class: 'btn ghost', href: 'index.html' }, 'Back to home')),
      el('p', { class: 'fine' }, 'Questions? Call us at ' + CFG.practicePhone + '.'));
    // wipe everything typed; only the generated file remains for download
    Object.keys(data).forEach(k => delete data[k]); sig = null;
    $('#doneTitle').focus(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- navigation ---------- */
  function go(i) {
    cur = Math.max(0, Math.min(i, SCREENS.length - 1)); maxReached = Math.max(maxReached, cur);
    const s = SCREENS[cur];
    titleEl.textContent = s.title; body.textContent = ''; errBox.hidden = true; errBox.textContent = '';
    const inChapter = SCREENS.filter(x => x.chapter === s.chapter && !isSkipped(x));
    kicker.textContent = inChapter.length > 1 ? `${s.chapter} · ${inChapter.indexOf(s) + 1} of ${inChapter.length}` : (cur === 0 ? '' : s.chapter);
    kicker.hidden = !kicker.textContent;
    if (s.block) { if (s.blurb) body.append(para(s.blurb)); body.append(el('div', { class: 'fgrid' }, s.block.fields.map(makeField))); }
    else s.render();
    refresh();
    backBtn.hidden = cur === 0;
    const last = s.id === 'review';
    nextBtn.innerHTML = (cur === 0 ? 'Get started' : last ? (CFG.endpoint ? 'Send my forms' : 'Create my PDF') : 'Continue') + (last ? '' : arrow('r'));
    backBtn.innerHTML = arrow('l') + 'Back';
    nextBtn.disabled = false; backBtn.disabled = false;
    drawProgress();
    titleEl.focus({ preventScroll: true });
    const top = card.getBoundingClientRect().top; if (top < 0 || top > 260) window.scrollTo({ top: window.scrollY + top - 110, behavior: 'smooth' });
  }
  function drawProgress() {
    const s = SCREENS[cur], act = active();
    stepList.textContent = '';
    CHAPTERS.forEach(ch => {
      const idxs = SCREENS.map((x, i) => (x.chapter === ch && !isSkipped(x) ? i : -1)).filter(i => i >= 0);
      const first = idxs[0], lastI = idxs[idxs.length - 1];
      const state = ch === s.chapter ? 'current' : lastI < cur ? 'done' : 'todo';
      const li = el('li', { class: state, 'aria-current': state === 'current' ? 'step' : false });
      const label = el('span', {}, ch, idxs.length > 1 ? el('small', {}, ` ${idxs.length} screens`) : '');
      li.append(el('button', { type: 'button', disabled: first > maxReached || false, onclick: () => { if (first <= maxReached) go(first); } },
        el('span', { class: 'dot' }, state === 'done' ? '✓' : String(CHAPTERS.indexOf(ch) + 1)), label));
      stepList.append(li);
    });
    const pos = act.indexOf(s) + 1;
    mProg.textContent = `Section ${CHAPTERS.indexOf(s.chapter) + 1} of ${CHAPTERS.length} · ${s.chapter}`;
    const pct = (pos / act.length * 100) + '%';
    mBar.style.width = pct; topBar.querySelector('span').style.width = pct;
    topBar.setAttribute('aria-valuenow', Math.round(pos / act.length * 100));
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const s = SCREENS[cur];
    if (s.id === 'review') {
      // make sure every screen is valid before building the PDF
      for (let i = 1; i < SCREENS.length - 1; i++) {
        if (isSkipped(SCREENS[i])) continue;
        const errs = validateScreen(SCREENS[i]);
        if (Object.keys(errs).length) { go(i); showErrors(errs); return; }
      }
      return send();
    }
    const errs = validateScreen(s);
    if (Object.keys(errs).length) return showErrors(errs);
    go(nextIdx(cur));
  });
  backBtn.addEventListener('click', () => go(prevIdx(cur)));

  window.addEventListener('beforeunload', e => {
    if (!done && Object.keys(data).some(k => k !== 'state' && k !== 'insRel' && k !== 'sigRel' && !blank(data[k]))) { e.preventDefault(); e.returnValue = ''; }
  });

  if (!CFG.endpoint && /^(localhost|127\.)/.test(location.hostname)) $('#devBanner').hidden = false;
  go(0);
})();
