import { writeFileSync } from "fs";

const sizes = [16, 48, 128];

for (const s of sizes) {
  const rx = Math.round(s * 0.15);
  const cx = s / 2;
  const cy = s / 2;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">`,
    `  <rect width="${s}" height="${s}" fill="#0a0a0f" rx="${rx}"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${s * 0.35}" fill="#00ff88"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${s * 0.18}" fill="#0a0a0f"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${s * 0.07}" fill="#00ff88"/>`,
    `</svg>`,
  ].join("\n");
  writeFileSync(`icon${s}.svg`, svg);
  // Also write a PNG placeholder note
  writeFileSync(`icon${s}.png.txt`, `Replace this with a real ${s}x${s} PNG icon.\nOpen ../generate-icons.html in Chrome to create one.`);
  console.log(`Created icon${s}.svg`);
}

console.log("\nDone! Now open generate-icons.html in Chrome to get PNGs,");
console.log("or use any SVG→PNG converter.");
