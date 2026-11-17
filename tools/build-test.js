// Builds test.html: the complete app in ONE file (OCR engine, language data, example photo embedded).
// It can be copied to a phone and opened directly, without server and without internet.
// Usage: node tools/build-test.js
const fs = require("fs"), path = require("path");
const R = p => path.join(__dirname, "..", p);
const txt = p => fs.readFileSync(R(p), "utf8");
const b64 = p => fs.readFileSync(R(p)).toString("base64");

function rawBlock(id, p){
  const s = txt(p);
  if(/<\/script/i.test(s) || s.includes("<!--")) throw new Error(p + " cannot be embedded raw");
  return `<script type="text/plain" id="${id}">${s}</script>\n`;
}
function inlineScript(p){
  const s = txt(p);
  if(/<\/script/i.test(s)) throw new Error(p + " contains </script");
  return `<script>/* ${p} */\n${s}\n</script>`;
}

let html = txt("index.html");
// drop PWA-only head entries (not usable from a local file)
html = html.replace(/<link rel="manifest"[^>]*>\n/, "")
           .replace(/<link rel="icon"[^>]*>\n/, "")
           .replace(/<link rel="apple-touch-icon"[^>]*>\n/, "")
           .replace(/<meta name="apple-mobile-web-app-capable"[^>]*>\n/, "")
           .replace("<title>Card QR Scanner</title>", "<title>Card QR Scanner (Test)</title>");

const embed = `
${rawBlock("emb-worker", "vendor/worker.min.js")}
${rawBlock("emb-core-simd", "vendor/core/tesseract-core-simd-lstm.wasm.js")}
${rawBlock("emb-core", "vendor/core/tesseract-core-lstm.wasm.js")}
<script type="text/plain" id="emb-lang">${b64("lang/eng.traineddata.gz")}</script>
<script>
window.CARDQR_EMBED = (() => {
  // SIMD check (same bytes as wasm-feature-detect)
  const simd = () => { try{ return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])); }catch(e){ return false; } };
  return {
    // The worker gets the OCR core and the language data prepended, so it never loads anything:
    // its fetch() answers the request for "embedded/eng.traineddata.gz" from the embedded bytes.
    worker: () => URL.createObjectURL(new Blob([
      "const __LANG=\\"", document.getElementById("emb-lang").textContent.trim(), "\\";\\n",
      "(()=>{const f=self.fetch;self.fetch=(u,o)=>{if(String(u).endsWith('eng.traineddata.gz')){const s=atob(__LANG),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return Promise.resolve(new Response(a));}return f?f(u,o):Promise.reject(new Error('offline'));};})();\\n",
      document.getElementById(simd() ? "emb-core-simd" : "emb-core").textContent, "\\n",
      document.getElementById("emb-worker").textContent], {type:"application/javascript"})),
    core: async () => "embedded-core.js",
    langPath: "embedded",
    sample: "data:image/jpeg;base64,${b64("test/beispiel.jpg")}",
  };
})();
</script>
`;

html = html.replace('<script src="vendor/qrcode.js"></script>', () => embed + inlineScript("vendor/qrcode.js"))
           .replace('<script src="vendor/tesseract.min.js"></script>', () => inlineScript("vendor/tesseract.min.js"))
           .replace('<script src="js/cells.js"></script>', () => inlineScript("js/cells.js"));
if(/<script src=/.test(html)) throw new Error("external script left in test.html");
fs.writeFileSync(R("test.html"), html);
console.log("test.html written:", (fs.statSync(R("test.html")).size/1e6).toFixed(1), "MB");
