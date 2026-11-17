// Template matching for the fixed-width HMI font: a cell is cut into 11 character slots,
// every slot is compared with averaged glyph images (templates) by normalized correlation.
(function(root){
  const C = { gw: 16, gh: 24, blurDiv: 20, shift: 0.4 };   // glyph size, smoothing, slot search
  const CF = () => root.CellFinder;

  function otsuRange(g, W, box){
    const hist = new Array(256).fill(0); let n=0;
    for(let y=box.y0;y<=box.y1;y++) for(let x=box.x0;x<=box.x1;x++){ hist[g[y*W+x]]++; n++; }
    let sum=0; for(let i=0;i<256;i++) sum+=i*hist[i];
    let sB=0,wB=0,max=0,t=128;
    for(let i=0;i<256;i++){ wB+=hist[i]; if(!wB) continue; const wF=n-wB; if(!wF) break;
      sB+=i*hist[i]; const mB=sB/wB, mF=(sum-sB)/wF, v=wB*wF*(mB-mF)*(mB-mF); if(v>max){max=v;t=i;} }
    return t;
  }

  // tight box around the serial number text inside a cell box
  function textBox(g, W, H, box, opts){
    const t = otsuRange(g, W, box);
    const bw = box.x1-box.x0+1, bh = box.y1-box.y0+1;
    const rp = []; for(let y=box.y0;y<=box.y1;y++){ let s=0; for(let x=box.x0;x<=box.x1;x++) if(g[y*W+x]>t) s++; rp.push(s/bw); }
    const rmax = Math.max(...rp);
    // largest run of rows with enough bright pixels
    let best=null, s=-1;
    for(let i=0;i<=rp.length;i++){ const on = i<rp.length && rp[i] > rmax*0.25;
      if(on && s<0) s=i; if(!on && s>=0){ if(!best || i-s > best[1]-best[0]) best=[s,i]; s=-1; } }
    if(!best) return null;
    const y0 = box.y0+best[0], y1 = box.y0+best[1]-1, th = y1-y0+1;
    // columns with ink inside the text band; grid lines (bright above AND below the band) are ignored
    const pad = Math.max(2, Math.round(th*0.25));
    const cp = [];
    for(let x=box.x0;x<=box.x1;x++){
      let s=0; for(let y=y0;y<=y1;y++) if(g[y*W+x]>t) s++;
      let up=0, dn=0, nu=0, nd=0;
      for(let y=Math.max(box.y0,y0-pad*2); y<y0-2; y++){ nu++; if(g[y*W+x]>t) up++; }
      for(let y=y1+3; y<=Math.min(box.y1,y1+pad*2); y++){ nd++; if(g[y*W+x]>t) dn++; }
      const line = nu>0 && nd>0 && up/nu > 0.6 && dn/nd > 0.6;
      cp.push(line ? 0 : s/th);
    }
    // the text is the longest run of ink columns with gaps shorter than ~0.35 x height
    const groups=[]; let gs=-1, last=-1e9;
    cp.forEach((v,i) => { if(v < 0.12) return; if(gs>=0 && i-last > th*0.35){ groups.push([gs,last]); gs=-1; } if(gs<0) gs=i; last=i; });
    if(gs>=0) groups.push([gs,last]);
    if(!groups.length) return null;
    // join neighbouring groups while the total stays plausible for 11 characters (~0.72 x height each)
    groups.sort((p,q) => (q[1]-q[0])-(p[1]-p[0]));
    let [gx0, gx1] = groups[0];
    const maxW = th*0.8*(opts && opts.n || 11);
    groups.slice(1).sort((p,q) => Math.min(Math.abs(p[0]-gx1),Math.abs(gx0-p[1])) - Math.min(Math.abs(q[0]-gx1),Math.abs(gx0-q[1]))).forEach(q => {
      const nx0 = Math.min(gx0,q[0]), nx1 = Math.max(gx1,q[1]);
      const gap = q[0] > gx1 ? q[0]-gx1 : gx0-q[1];
      if(nx1-nx0 <= maxW && gap < th*0.6){ gx0=nx0; gx1=nx1; }
    });
    return {x0: box.x0+gx0, x1: box.x0+gx1, y0, y1, thr: t};
  }

  // sample a glyph (bilinear) from x-range [a,b) and y-range [c,d) into GWxGH, zero mean / unit norm
  function sample(g, W, H, a, b, c, d){
    const out = new Float32Array(C.gw*C.gh);
    for(let j=0;j<C.gh;j++){ const sy = c + (j+0.5)*(d-c)/C.gh - 0.5;
      for(let i=0;i<C.gw;i++){ const sx = a + (i+0.5)*(b-a)/C.gw - 0.5;
        const x = Math.min(W-2, Math.max(0, sx)), y = Math.min(H-2, Math.max(0, sy));
        const ix = Math.floor(x), iy = Math.floor(y), fx = x-ix, fy = y-iy, p = iy*W+ix;
        out[j*C.gw+i] = g[p]*(1-fx)*(1-fy) + g[p+1]*fx*(1-fy) + g[p+W]*(1-fx)*fy + g[p+W+1]*fx*fy; } }
    return norm(out);
  }
  function norm(v){ let m=0; for(const x of v) m+=x; m/=v.length; let s=0; for(let i=0;i<v.length;i++){ v[i]-=m; s+=v[i]*v[i]; } s=Math.sqrt(s)||1; for(let i=0;i<v.length;i++) v[i]/=s; return v; }
  const dot = (a,b) => { let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; };

  // slot k of a text box, optionally shifted by dx/dy (in fractions of the pitch / height) and scaled
  function slot(g, W, H, tb, k, n, dx, dy, sc){
    const pitch = (tb.x1-tb.x0+1)/n, h = tb.y1-tb.y0+1;
    const cx = tb.x0 + (k+0.5)*pitch + dx*pitch, cy = (tb.y0+tb.y1)/2 + dy*h;
    const hw = pitch*0.5*sc, hh = h*0.5*sc*1.08;
    return sample(g, W, H, cx-hw, cx+hw, cy-hh, cy+hh);
  }

  let SHIFTS = [];
  function setup(){ SHIFTS = []; const d=C.shift; for(const dx of [-d,-d/2,0,d/2,d]) for(const dy of [-0.06,0,0.06]) for(const sc of [0.95,1.05]) SHIFTS.push([dx,dy,sc]); }
  setup();

  // scores of one slot against all templates (best over small shifts); keeps the samples for the pair check
  function scoreSlot(g, W, H, tb, k, n, templates, chars){
    const res = {}, at = {};
    const samples = SHIFTS.map(([dx,dy,sc]) => slot(g, W, H, tb, k, n, dx, dy, sc));
    for(const ch of chars){ const T = templates[ch]; if(!T) continue;
      let best=-1, bi=0; samples.forEach((s,i) => { const v=dot(s,T); if(v>best){ best=v; bi=i; } }); res[ch]=best; at[ch]=bi; }
    Object.defineProperty(res, "_samples", {value: samples}); Object.defineProperty(res, "_at", {value: at});
    return res;
  }
  // decide between the two best characters using only the pixels where their templates differ
  function pairCheck(slotRes, a, b, templates){
    const Ta = templates[a], Tb = templates[b];
    const s = slotRes._samples[slotRes[a] >= slotRes[b] ? slotRes._at[a] : slotRes._at[b]];
    let num=0, den=0;
    for(let i=0;i<Ta.length;i++){ const d = Ta[i]-Tb[i]; num += (s[i] - (Ta[i]+Tb[i])/2) * d; den += d*d; }
    return den ? num/Math.sqrt(den) : 0;      // > 0: looks like a, < 0: looks like b
  }

  // Reads one cell: picks the best fitting prefix, then the best digit for every remaining slot.
  // Returns {text, prefix, digits:[{ch, score, second, alt}], minMargin}
  // smooth away the screen's dot raster (radius relative to the cell height)
  function smoothCell(g, W, H, box){
    const r = Math.max(1, Math.round((box.y1-box.y0+1)/C.blurDiv));
    return CF().boxBlur(CF().boxBlur(g, W, H, r), W, H, r);
  }
  function readCell(g0, W, H, box, templates, prefixes, total){
    total = total || 11;
    const g = smoothCell(g0, W, H, box);
    const tb = textBox(g, W, H, box);
    if(!tb || (tb.x1-tb.x0) < (tb.y1-tb.y0)*3) return null;
    const chars = Object.keys(templates);
    const slots = []; for(let k=0;k<total;k++) slots.push(scoreSlot(g, W, H, tb, k, total, templates, chars));
    let P = "", pScore = -1e9;
    prefixes.forEach(p => { if(p.length >= total) return; let s=0;
      for(let k=0;k<p.length;k++) s += slots[k][p[k]] ?? -1;
      s /= p.length; if(s > pScore){ pScore = s; P = p; } });
    const digits = [];
    for(let k=P.length;k<total;k++){
      const ranked = "0123456789".split("").filter(c => slots[k][c] !== undefined).sort((a,b) => slots[k][b]-slots[k][a]);
      let ch = ranked[0], alt = ranked[1];
      const pc = pairCheck(slots[k], ch, alt, templates);
      if(pc < 0){ const t = ch; ch = alt; alt = t; }
      digits.push({ch, alt, score: slots[k][ch], margin: Math.abs(pc), pair: Math.abs(pc)});
    }
    const text = P + digits.map(d => d.ch).join("");
    return {text, prefix: P, prefixScore: pScore, digits, minMargin: Math.min(...digits.map(d => d.margin)), minScore: Math.min(...digits.map(d => d.score)), tb};
  }

  // Training helper: glyph samples of a cell whose text is known
  function glyphs(g0, W, H, box, text){
    const g = smoothCell(g0, W, H, box);
    const tb = textBox(g, W, H, box); if(!tb) return [];
    return text.split("").map((ch,k) => ({ch, v: slot(g, W, H, tb, k, text.length, 0, 0, 1)}));
  }
  // average several samples per char, aligning each sample to the running mean by small shifts
  function buildTemplates(samples){
    const by = {}; samples.forEach(s => (by[s.ch] = by[s.ch] || []).push(s.v));
    const out = {};
    for(const ch in by){ const m = new Float32Array(C.gw*C.gh); by[ch].forEach(v => { for(let i=0;i<m.length;i++) m[i]+=v[i]; }); out[ch] = norm(m); }
    return out;
  }
  // learning: sums of normalized samples per character (so new samples can be added later)
  function addSamples(sums, samples){
    samples.forEach(({ch, v}) => { const e = sums[ch] || (sums[ch] = {n:0, s:new Array(v.length).fill(0)}); e.n++; for(let i=0;i<v.length;i++) e.s[i]+=v[i]; });
    return sums;
  }
  function templatesFromSums(...sumSets){
    const out = {};
    sumSets.forEach(S => { for(const ch in S){ const o = out[ch] || (out[ch] = new Float32Array(S[ch].s.length)); for(let i=0;i<o.length;i++) o[i]+=S[ch].s[i]; } });
    for(const ch in out) norm(out[ch]);
    return out;
  }
  function encode(templates){ const o={}; for(const ch in templates) o[ch] = Array.from(templates[ch], v => Math.round(v*2000)); return o; }
  function decode(obj){ const o={}; for(const ch in obj) o[ch] = norm(Float32Array.from(obj[ch])); return o; }

  root.Digits = { textBox, readCell, glyphs, buildTemplates, addSamples, templatesFromSums, encode, decode, config: (o) => { Object.assign(C, o||{}); setup(); return C; } };
})(typeof window!=="undefined"?window:globalThis);
