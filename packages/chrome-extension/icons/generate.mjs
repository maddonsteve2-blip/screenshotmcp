// Run: node generate.mjs
// Creates simple placeholder PNG icons for the Chrome extension
import { writeFileSync } from "fs";

// Minimal 1x1 green PNG as placeholder — replace with real icons later
// This creates valid but tiny PNGs. For real icons, use the generate-icons.html in a browser.
const sizes = [16, 48, 128];

for (const size of sizes) {
  // Create a simple SVG and note to replace
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#0a0a0f" rx="${size * 0.15}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${size*0.35}" fill="#00ff88"/>
    <circle cx="${size/2}" cy="${size/2}" r="${size*0.18}" fill="#0a0a0f"/>
    <circle cx="${size/2}" cy="${size/2}" r="${size*0.07}" fill="#00ff88"/>
  </svg>`;
  writeFileSync(`icon${size}.svg`, svg);
  console.log(`Created icon${size}.svg`);
}

console.log("\nSVGs created. To convert to PNG:");
console.log("  Open generate-icons.html in Chrome, right-click each canvas → Save image as");
console.log("  Or use: npx sharp-cli -i icon128.svg -o icon128.png resize 128 128");
