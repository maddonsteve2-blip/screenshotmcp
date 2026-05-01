// Round 7: .com + .io ONLY. Best names. Gold hunt.
import dns from "node:dns/promises";

async function checkCom(name) {
  const d = `${name}.com`;
  try {
    const r = await fetch(`https://rdap.verisign.com/com/v1/domain/${d}`, { signal: AbortSignal.timeout(5000) });
    return { domain: d, available: r.status === 404 };
  } catch (e) { return { domain: d, available: e.message?.includes("404") || false }; }
}

async function checkIo(name) {
  const d = `${name}.io`;
  try { await dns.resolveNs(d); return { domain: d, available: false }; }
  catch (e) {
    if (e.code === "ENOTFOUND" || e.code === "ENODATA") return { domain: d, available: true };
    return { domain: d, available: "unknown" };
  }
}

const names = [
  // ===================================================
  // RE-VERIFY: The -syte gems + browsifi + best from all rounds
  // ===================================================

  // === THE -SYTE FAMILY (Tier S from earlier) ===
  "deepsyte",   // #1 pick — deep + sight + site
  "keensyte",   // keen sight — sharp, perceptive
  "realsyte",   // real sight — "browser truth"
  "puresyte",   // pure sight — unfiltered truth
  "topsyte",    // top sight — best-in-class
  "fullsyte",   // full sight — complete picture
  "clearsyte",  // clear sight
  "truesyte",   // true sight — truth
  "widesyte",   // wide sight — panoramic view
  "farsyte",    // far sight — foresight
  "sharpsyte",  // sharp sight
  "quicksyte",  // quick sight
  "surestyle",  // sure sight
  "firstsyte",  // first sight — love at first sight
  "freshsyte",  // fresh sight
  "brightsyte", // bright sight
  "smartsyte",  // smart sight
  "fastsyte",   // fast sight
  "finesyte",   // fine sight

  // === THE -IFI/-IFY FAMILY ===
  "browsifi",   // Shopify/Spotify pattern — browse + ify
  "auditifi",   // audit + ify
  "screenifi",  // screen + ify
  "scanifi",    // scan + ify
  "checkifi",   // check + ify
  "testifi",    // test + ify (also "testify"!)
  "proofifi",   // proof + ify
  "verifi",     // verify shortened
  "siteifi",    // site + ify
  "pageifi",    // page + ify
  "webifi",     // web + ify
  "browsify",   // alternate spelling

  // === KEEN- FAMILY ===
  "keencheck",  // keen + check
  "keenlook",   // keen + look
  "keenvue",    // keen + vue
  "keeneye",    // keen + eye
  "keenscan",   // keen + scan
  "keenview",   // keen + view

  // === BEST .io finds (re-verify) ===
  "observe",
  "herald",
  "glyph",
  "flag",
  "shrike",
  "ferret",
];

const unique = [...new Set(names)];
console.log(`=== CHECKING ${unique.length} names: .com (RDAP) + .io (DNS) ===\n`);

const comHits = [], ioHits = [], bothHits = [];

for (let i = 0; i < unique.length; i += 8) {
  const batch = unique.slice(i, i + 8);
  const results = await Promise.all(batch.map(async (name) => {
    const [com, io] = await Promise.all([checkCom(name), checkIo(name)]);
    return { name, com: com.available, io: io.available };
  }));

  for (const r of results) {
    const c = r.com === true ? "✅" : "❌";
    const o = r.io === true ? "✅" : r.io === "unknown" ? "❓" : "❌";
    if (r.com === true && r.io === true) {
      bothHits.push(r.name);
      console.log(`🏆 ${r.name} — .com ${c} .io ${o} — BOTH AVAILABLE`);
    } else if (r.com === true) {
      comHits.push(r.name);
      console.log(`   ${r.name} — .com ${c} .io ${o}`);
    } else if (r.io === true) {
      ioHits.push(r.name);
      console.log(`   ${r.name} — .com ${c} .io ${o}`);
    }
  }
  const done = Math.min(i + 8, unique.length);
  if (done % 40 === 0) console.log(`   ... ${done}/${unique.length} checked`);
  if (i + 8 < unique.length) await new Promise(r => setTimeout(r, 300));
}

console.log(`\n${"=".repeat(60)}`);
console.log(`\n🏆 BOTH .com + .io (${bothHits.length}):`);
bothHits.forEach(n => console.log(`  ${n}.com + ${n}.io`));
console.log(`\n✅ .com ONLY (${comHits.length}):`);
comHits.forEach(n => console.log(`  ${n}.com`));
console.log(`\n✅ .io ONLY (${ioHits.length}):`);
ioHits.forEach(n => console.log(`  ${n}.io`));
console.log(`\nTotal: ${unique.length}`);
