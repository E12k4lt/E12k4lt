// Splits a user-selected crop (Card 0 + Card 1 values) into rows and two columns
// using the bright text pixels. Pure JS on grayscale Uint8 data (app + node tests).
(function(root){
  function boxBlur(src, w, h, r){
    const tmp = new Float32Array(w*h), out = new Uint8ClampedArray(w*h), n = 2*r+1;
    for(let y=0;y<h;y++){ let s=0; const o=y*w;
      for(let x=-r;x<=r;x++) s+=src[o+Math.min(w-1,Math.max(0,x))];
      for(let x=0;x<w;x++){ tmp[o+x]=s/n; s+=src[o+Math.min(w-1,x+r+1)]-src[o+Math.max(0,x-r)]; } }
    for(let x=0;x<w;x++){ let s=0;
      for(let y=-r;y<=r;y++) s+=tmp[Math.min(h-1,Math.max(0,y))*w+x];
      for(let y=0;y<h;y++){ out[y*w+x]=s/n; s+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x]; } }
    return out;
  }
  function otsu(g){
    const hist=new Array(256).fill(0); for(let i=0;i<g.length;i++) hist[g[i]]++;
    let sum=0; for(let i=0;i<256;i++) sum+=i*hist[i];
    let sB=0,wB=0,max=0,t=128; const tot=g.length;
    for(let i=0;i<256;i++){ wB+=hist[i]; if(!wB) continue; const wF=tot-wB; if(!wF) break;
      sB+=i*hist[i]; const mB=sB/wB, mF=(sum-sB)/wF, v=wB*wF*(mB-mF)*(mB-mF); if(v>max){max=v;t=i;} }
    return t;
  }
  function smooth(a, r){ const o=new Float32Array(a.length); for(let i=0;i<a.length;i++){ let s=0,n=0; for(let k=i-r;k<=i+r;k++) if(k>=0&&k<a.length){s+=a[k];n++;} o[i]=s/n; } return o; }
  function runs(prof, thr, minLen){ const out=[]; let s=-1;
    for(let i=0;i<=prof.length;i++){ const on = i<prof.length && prof[i]>thr;
      if(on && s<0) s=i; if(!on && s>=0){ if(i-s>=minLen) out.push([s,i-1]); s=-1; } }
    return out; }

  // gray: Uint8 (w*h) of the crop. Returns {rows:[{y0,y1,cells:[{x0,x1}|null,{x0,x1}|null]}], text:Uint8 mask}
  function splitTable(gray, w, h){
    const g = boxBlur(gray, w, h, Math.max(1, Math.round(w/500)));
    // text = brightest class; take a high threshold so cell background / grid lines drop out
    const t0 = otsu(g);
    const hi=[]; for(let i=0;i<g.length;i++) if(g[i]>t0) hi.push(g[i]);
    const t = hi.length ? Math.max(t0, otsu(Uint8Array.from(hi))-5) : t0;
    const text = new Uint8Array(w*h); for(let i=0;i<w*h;i++) text[i] = g[i] > t ? 1 : 0;
    // remove long straight lines (table grid): horizontal runs > 35% width, vertical runs > 12% height
    const hl = Math.round(w*0.35), vl = Math.max(8, Math.round(h*0.12));
    const kill = new Uint8Array(w*h);
    for(let y=0;y<h;y++){ let s=-1; for(let x=0;x<=w;x++){ const on=x<w&&text[y*w+x]; if(on&&s<0)s=x; if(!on&&s>=0){ if(x-s>hl) for(let k=s;k<x;k++){ kill[y*w+k]=1; if(y>0)kill[(y-1)*w+k]=1; if(y<h-1)kill[(y+1)*w+k]=1; } s=-1; } } }
    for(let x=0;x<w;x++){ let s=-1; for(let y=0;y<=h;y++){ const on=y<h&&text[y*w+x]; if(on&&s<0)s=y; if(!on&&s>=0){ if(y-s>vl) for(let k=s;k<y;k++){ kill[k*w+x]=1; if(x>0)kill[k*w+x-1]=1; if(x<w-1)kill[k*w+x+1]=1; } s=-1; } } }
    for(let i=0;i<w*h;i++) if(kill[i]) text[i]=0;

    // rows: horizontal projection of text pixels
    const rp = new Float32Array(h); for(let y=0;y<h;y++){ let s=0; for(let x=0;x<w;x++) s+=text[y*w+x]; rp[y]=s/w; }
    const rps = smooth(rp, 1), rmax = Math.max(...rps);
    let lines = runs(rps, rmax*0.12, Math.max(4, h*0.02));
    if(!lines.length) return {rows:[], text};
    const lh = lines.map(l=>l[1]-l[0]+1).sort((a,b)=>a-b)[Math.floor(lines.length/2)];
    // drop lines that are much thinner than the typical text height, or cut by the crop edge
    lines = lines.filter(l => (l[1]-l[0]+1) > lh*0.6 && l[0] > 0 && l[1] < h-1);

    // columns: vertical projection over all text lines; the gap closest to the middle splits Card 0 | Card 1
    const cp = new Float32Array(w);
    lines.forEach(([a,b]) => { for(let x=0;x<w;x++){ let s=0; for(let y=a;y<=b;y++) s+=text[y*w+x]; cp[x]+=s; } });
    const cps = smooth(cp, Math.max(2, Math.round(lh*0.4)));
    let split = Math.round(w/2), best = Infinity;
    for(let x=Math.round(w*0.3); x<Math.round(w*0.7); x++){ const v = cps[x] + Math.abs(x-w/2)*1e-3; if(v<best){best=v;split=x;} }

    const rows = lines.map(([y0,y1]) => {
      const pad = Math.round((y1-y0+1)*0.35);
      const Y0 = Math.max(0,y0-pad), Y1 = Math.min(h-1,y1+pad);
      const cells = [[0,split],[split,w-1]].map(([a,b]) => {
        // text columns in this half, grouped into words (gaps < 0.9 * text height); keep the widest word
        const col = []; for(let x=a;x<=b;x++){
          let s=0; for(let y=y0;y<=y1;y++) s+=text[y*w+x];
          // a grid line also lights up above and below the text band
          let up=0, dn=0; for(let y=Math.max(0,y0-pad);y<y0-1;y++) up+=text[y*w+x]; for(let y=y1+2;y<=Math.min(h-1,y1+pad);y++) dn+=text[y*w+x];
          const lineX = up > pad*0.4 && dn > pad*0.4;
          if(lineX){ col.push(0); if(col.length>1) col[col.length-2]=0; } else col.push(s); }
        const groups=[]; let gs=-1, last=-1e9;
        col.forEach((v,i) => { if(!v) return; if(gs>=0 && i-last > lh*0.9){ groups.push([gs,last]); gs=-1; } if(gs<0) gs=i; last=i; });
        if(gs>=0) groups.push([gs,last]);
        if(!groups.length) return null;
        const g0 = groups.reduce((m,g) => (g[1]-g[0]) > (m[1]-m[0]) ? g : m);
        if(g0[1]-g0[0] < lh*2) return null;        // too short to be a serial number
        const p = Math.round(lh*0.6);
        return {x0:Math.max(a,a+g0[0]-p), x1:Math.min(b,a+g0[1]+p), y0:Y0, y1:Y1};
      });
      return {y0:Y0, y1:Y1, cells};
    }).filter(r => r.cells[0] || r.cells[1]);
    return {rows, text, split, threshold:t};
  }
  root.CellFinder = { splitTable, boxBlur };
})(typeof window!=="undefined"?window:globalThis);
// Cell preprocessing for OCR: crop, upscale (bilinear) to target text height, blur, stretch, invert, optional binarize.
(function(root){
  function prepCell(gray, W, H, box, opt){
    const {x0,x1,y0,y1} = box, cw=x1-x0+1, ch=y1-y0+1;
    const sc = (opt.height||96)/ch, w=Math.max(1,Math.round(cw*sc)), h=Math.max(1,Math.round(ch*sc));
    let out = new Uint8ClampedArray(w*h);
    for(let y=0;y<h;y++){ const sy=Math.min(ch-1.001,Math.max(0,(y+0.5)/sc-0.5)), iy=Math.floor(sy), fy=sy-iy;
      for(let x=0;x<w;x++){ const sx=Math.min(cw-1.001,Math.max(0,(x+0.5)/sc-0.5)), ix=Math.floor(sx), fx=sx-ix;
        const p=(y0+iy)*W+(x0+ix);
        const v=gray[p]*(1-fx)*(1-fy)+gray[p+1]*fx*(1-fy)+gray[p+W]*(1-fx)*fy+gray[p+W+1]*fx*fy;
        out[y*w+x]=v; } }
    if(opt.blur) out = root.CellFinder.boxBlur(root.CellFinder.boxBlur(out,w,h,opt.blur),w,h,opt.blur);
    let mn=255,mx=0; const hist=[]; for(let i=0;i<out.length;i+=3) hist.push(out[i]); hist.sort((a,b)=>a-b);
    mn=hist[Math.floor(hist.length*0.05)]; mx=hist[Math.floor(hist.length*0.97)]; const rg=Math.max(1,mx-mn);
    // add white border (after invert) so tesseract sees margins
    const B=Math.round(h*0.25), W2=w+2*B, H2=h+2*B, res=new Uint8ClampedArray(W2*H2).fill(255);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      let v=(out[y*w+x]-mn)/rg*255; v=255-v;
      if(opt.bin) v = v < opt.bin ? 0 : 255;
      res[(y+B)*W2+x+B]=v; }
    return {data:res, width:W2, height:H2};
  }
  root.CellFinder.prepCell = prepCell;
})(typeof window!=="undefined"?window:globalThis);
// Combine several OCR readings of one cell: prefer readings with the most common length, then vote per position.
(function(root){
  // B&R serial numbers: 4 hex characters followed by 7 decimal digits (e.g. B0BF0868946)
  const DIGIT = {B:"8", D:"0", O:"0", Q:"0", I:"1", L:"1", S:"5", Z:"2", G:"6", T:"7"};
  function normalize(r, digitsTail){
    r = r.toUpperCase().replace(/[^0-9A-Z]/g,"");
    if(digitsTail && r.length===11) r = r.slice(0,4) + r.slice(4).replace(/[A-Z]/g, c => DIGIT[c] || c);
    return r;
  }
  function vote(readings, opts){
    const digitsTail = !opts || opts.digitsTail !== false;
    const PAT = /^[0-9A-F]{4}[0-9]{7}$/;
    const rs = readings.map(r => {
      r = r.toUpperCase().replace(/[^0-9A-Z]/g,"");
      // stray characters from grid lines at the cell edges: cut an 11-character serial out of a longer reading
      if(r.length > 11 && r.length <= 13){
        const subs=[]; for(let i=0;i+11<=r.length;i++) subs.push(r.slice(i,i+11));
        const ok = subs.filter(x => PAT.test(normalize(x, true)));
        r = ok.length ? (ok.length>1 && /^[17I|]/.test(r) ? ok[1] : ok[0]) : (r.length===12 && /^[17I|]/.test(r) ? r.slice(1) : r);
      }
      return normalize(r, digitsTail);
    }).filter(r => r.length >= 4);
    if(!rs.length) return {text:"", agree:0};
    const lc={}; rs.forEach(r => lc[r.length]=(lc[r.length]||0)+1);
    let L = +Object.keys(lc).sort((a,b)=>lc[b]-lc[a])[0];
    if((lc[11]||0) >= 2) L = 11;
    const same = rs.filter(r => r.length===L);
    let text="", agree=1;
    for(let i=0;i<L;i++){ const c={}; same.forEach(r => c[r[i]]=(c[r[i]]||0)+1);
      const best=Object.keys(c).sort((a,b)=>c[b]-c[a])[0]; text+=best; agree=Math.min(agree, c[best]/same.length); }
    return {text, agree: agree * same.length/rs.length, n: rs.length, pattern: PAT.test(text)};
  }

  function lev(a,b){ const d=[]; for(let j=0;j<=b.length;j++) d[j]=j;
    for(let i=1;i<=a.length;i++){ let p=d[0]; d[0]=i; for(let j=1;j<=b.length;j++){ const t=d[j]; d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1)); p=t; } }
    return d[b.length]; }
  // Known fixed beginnings (e.g. A37D02, 894309, B0BF08): only the remaining digits are read.
  // Each reading is matched to the closest prefix (allowing a stray character at the start);
  // readings that do not fit are dropped, then prefix and digits are voted on.
  function voteWithPrefixes(readings, prefixes, total){
    total = total || 11;
    const cand = [];
    readings.forEach(raw => {
      const r = raw.toUpperCase().replace(/[^0-9A-Z]/g,"");
      let best = null;
      prefixes.forEach(P => {
        const tl = total - P.length;
        for(let k=0;k<=2;k++){
          if(r.length < k + P.length + tl) continue;
          const d = lev(r.slice(k, k+P.length), P) + k*0.6 + Math.abs(r.length-k-total)*0.4;
          if(!best || d < best.d) best = {d, P, tail: r.slice(k+P.length, k+P.length+tl)};
        }
      });
      if(!best || best.d > 2.6) return;
      const tail = best.tail.replace(/[A-Z]/g, c => DIGIT[c] || "?");
      if(tail.includes("?")) return;
      cand.push({P: best.P, tail});
    });
    if(!cand.length) return {text:"", agree:0, n:0};
    const pc = {}; cand.forEach(c => pc[c.P] = (pc[c.P]||0)+1);
    const P = Object.keys(pc).sort((a,b)=>pc[b]-pc[a])[0];
    const same = cand.filter(c => c.P === P);
    let tail = "", agree = 1;
    for(let i=0;i<total-P.length;i++){ const c={}; same.forEach(x => c[x.tail[i]]=(c[x.tail[i]]||0)+1);
      const b=Object.keys(c).sort((x,y)=>c[y]-c[x])[0]; tail+=b; agree=Math.min(agree, c[b]/same.length); }
    return {text: P + tail, agree: agree * Math.min(1, same.length/3), n: same.length, prefix: P, pattern: true};
  }
  root.CellFinder.voteWithPrefixes = voteWithPrefixes;
  root.CellFinder.vote = vote;
  root.CellFinder.VARIANTS = [{height:48,blur:1},{height:64,blur:2},{height:96,blur:3},{height:96,blur:4},{height:128,blur:5},{height:64,blur:2,bin:128},{height:80,blur:2}];
})(typeof window!=="undefined"?window:globalThis);
