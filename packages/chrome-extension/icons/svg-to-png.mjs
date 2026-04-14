import sharp from "sharp";

for (const s of [16, 48, 128]) {
  await sharp(`icon${s}.svg`).resize(s, s).png().toFile(`icon${s}.png`);
  console.log(`Created icon${s}.png`);
}
