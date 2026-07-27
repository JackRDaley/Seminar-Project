import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const outDir = "C:/Users/jrd20/Code/Seminar-Project/output/slideshow-shock-tiktok";
const slideDir = path.join(outDir, "slides");
const finalPptx = path.join(outDir, "saturn-tiktok-shock-slideshow.pptx");
const renderDir = path.join(outDir, "rendered");

async function readImageBlob(imagePath) {
  const bytes = await fs.readFile(imagePath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

const slideFiles = [
  "01-190-visits.png",
  "02-seven-minutes.png",
  "03-counting-checks.png",
  "04-blocked.png",
  "05-saturn-cta.png",
];

await fs.mkdir(renderDir, { recursive: true });

const presentation = Presentation.create({
  slideSize: { width: 1080, height: 1080 },
});

for (const file of slideFiles) {
  const slide = presentation.slides.add();
  slide.background.fill = "#130704";
  slide.images.add({
    blob: await readImageBlob(path.join(slideDir, file)),
    contentType: "image/png",
    alt: `Saturn TikTok shock-stat slideshow slide ${file.slice(0, 2)}`,
    fit: "cover",
    position: { left: 0, top: 0, width: 1080, height: 1080 },
  });
}

for (const [index, slide] of presentation.slides.items.entries()) {
  const png = await presentation.export({ slide, format: "png", scale: 1 });
  await writeBlob(path.join(renderDir, `slide-${String(index + 1).padStart(2, "0")}.png`), png);
}

const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
await writeBlob(path.join(outDir, "pptx-montage.webp"), montage);

const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(finalPptx);

console.log(finalPptx);
