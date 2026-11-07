import { assetUrl } from "./asset-url";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from "pdf-lib";
export type Mark = {
  id: string;
  page: number;
  type:
    | "text"
    | "highlight"
    | "draw"
    | "rectangle"
    | "signature"
    | "image"
    | "note";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text?: string;
  size?: number;
  points?: { x: number; y: number }[];
  data?: string;
};
export type StudioDocument = {
  id: string;
  name: string;
  bytes: Uint8Array;
  pages: number;
  createdAt: number;
  modifiedAt: number;
  starred: boolean;
  trashed: boolean;
  cover: "atlas" | "quote" | "guide" | "blank";
  marks: Mark[];
};
export const uid = () => crypto.randomUUID();
export const formatSize = (n: number) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} Ko`
    : `${(n / 1024 / 1024).toFixed(1)} Mo`;
export const cleanName = (name: string) => name.replace(/\.pdf$/i, "");
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("pdf-studio-local", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("documents", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return dbPromise;
}
export async function readDocuments(): Promise<StudioDocument[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("documents")
      .objectStore("documents")
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function storeDocument(doc: StudioDocument) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite");
    tx.objectStore("documents").put(doc);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function removeDocument(id: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite");
    tx.objectStore("documents").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function documentFromFile(file: File): Promise<StudioDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  return {
    id: uid(),
    name: file.name,
    bytes,
    pages: pdf.getPageCount(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    starred: false,
    trashed: false,
    cover: "blank",
    marks: [],
  };
}
export async function createDocument(
  name: string,
  format = "a4",
): Promise<StudioDocument> {
  const pdf = await PDFDocument.create();
  pdf.addPage(
    format === "landscape"
      ? [841.89, 595.28]
      : format === "letter"
        ? [612, 792]
        : [595.28, 841.89],
  );
  pdf.setTitle(cleanName(name));
  pdf.setCreator("PDF Studio");
  return {
    id: uid(),
    name: `${cleanName(name) || "Sans titre"}.pdf`,
    bytes: await pdf.save(),
    pages: 1,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    starred: false,
    trashed: false,
    cover: "blank",
    marks: [],
  };
}
export async function createSamples(): Promise<StudioDocument[]> {
  const result: StudioDocument[] = [];
  const ink = rgb(0.13, 0.15, 0.19),
    purple = rgb(0.43, 0.31, 0.7),
    light = rgb(0.95, 0.94, 0.98),
    muted = rgb(0.48, 0.49, 0.54);
  for (const [index, cover] of (
    ["atlas", "quote", "guide"] as const
  ).entries()) {
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const title =
      cover === "atlas"
        ? "Projet Atlas"
        : cover === "quote"
          ? "Devis créatif"
          : "Bienvenue au studio";
    const count = cover === "atlas" ? 5 : cover === "quote" ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const page = pdf.addPage([595.28, 841.89]);
      page.drawText("STUDIO / DOCUMENTS", {
        x: 48,
        y: 784,
        size: 9,
        font: bold,
        color: purple,
      });
      page.drawLine({
        start: { x: 48, y: 762 },
        end: { x: 548, y: 762 },
        thickness: 0.7,
        color: rgb(0.87, 0.86, 0.9),
      });
      if (i === 0 && cover === "atlas") {
        page.drawText("ATLAS", {
          x: 47,
          y: 635,
          size: 70,
          font: bold,
          color: ink,
        });
        page.drawText("Donner une nouvelle dimension", {
          x: 50,
          y: 591,
          size: 20,
          font: regular,
          color: ink,
        });
        page.drawText("à vos idées.", {
          x: 50,
          y: 561,
          size: 20,
          font: regular,
          color: ink,
        });
        page.drawRectangle({
          x: 48,
          y: 213,
          width: 500,
          height: 285,
          color: light,
        });
        page.drawCircle({
          x: 290,
          y: 355,
          size: 100,
          color: rgb(0.78, 0.73, 0.89),
        });
        page.drawCircle({ x: 364, y: 330, size: 79, color: purple });
        page.drawRectangle({
          x: 120,
          y: 252,
          width: 155,
          height: 112,
          color: rgb(0.88, 0.86, 0.94),
          rotate: degrees(10),
        });
        page.drawText("STRATÉGIE & DIRECTION CRÉATIVE", {
          x: 50,
          y: 163,
          size: 10,
          font: bold,
          color: purple,
        });
        page.drawText("Présentation du projet / Novembre 2026", {
          x: 50,
          y: 140,
          size: 11,
          font: regular,
          color: muted,
        });
      } else if (i === 0 && cover === "quote") {
        page.drawText("Faisons de belles", {
          x: 48,
          y: 690,
          size: 36,
          font: bold,
          color: ink,
        });
        page.drawText("choses ensemble.", {
          x: 48,
          y: 644,
          size: 36,
          font: bold,
          color: purple,
        });
        page.drawText("DEVIS N° 2026-042", {
          x: 48,
          y: 586,
          size: 11,
          font: bold,
          color: muted,
        });
        page.drawText("Identité visuelle & design de marque", {
          x: 48,
          y: 538,
          size: 16,
          font: bold,
          color: ink,
        });
        [
          "Recherche & direction artistique",
          "Création de l'identité visuelle",
          "Charte graphique & livrables",
        ].forEach((s, j) => {
          const y = 458 - j * 65;
          page.drawText(s, { x: 60, y, size: 12, font: regular, color: ink });
          page.drawText(["850,00 EUR", "1 200,00 EUR", "450,00 EUR"][j], {
            x: 430,
            y,
            size: 11,
            font: bold,
            color: ink,
          });
          page.drawLine({
            start: { x: 48, y: y - 22 },
            end: { x: 548, y: y - 22 },
            color: rgb(0.9, 0.9, 0.92),
            thickness: 0.6,
          });
        });
        page.drawRectangle({
          x: 48,
          y: 206,
          width: 500,
          height: 68,
          color: light,
        });
        page.drawText("TOTAL HT", {
          x: 65,
          y: 233,
          size: 11,
          font: bold,
          color: purple,
        });
        page.drawText("2 500,00 EUR", {
          x: 395,
          y: 231,
          size: 18,
          font: bold,
          color: purple,
        });
        page.drawText("Bon pour accord :", {
          x: 48,
          y: 150,
          size: 11,
          font: regular,
          color: muted,
        });
      } else {
        page.drawText(
          i === 0
            ? "Un bel espace"
            : i === 1
              ? "Des idées aux documents"
              : "À vous de jouer.",
          { x: 48, y: 690, size: 35, font: bold, color: ink },
        );
        page.drawText(i === 0 ? "pour vos idées." : "Tout commence ici.", {
          x: 48,
          y: 642,
          size: 35,
          font: bold,
          color: purple,
        });
        const sections =
          i === 0
            ? [
                "01  Prenez vos repères",
                "02  Créez sans contrainte",
                "03  Partagez vos projets",
              ]
            : [
                "Notre approche",
                "Une expérience simple",
                "Les prochaines étapes",
              ];
        sections.forEach((s, j) => {
          const y = 548 - j * 126;
          page.drawText(s, { x: 48, y, size: 16, font: bold, color: ink });
          page.drawText("Un espace pensé pour vous accompagner au quotidien.", {
            x: 48,
            y: y - 30,
            size: 12,
            font: regular,
            color: muted,
          });
          page.drawText(
            "Rassemblez vos idées et donnez vie à vos projets, simplement.",
            { x: 48, y: y - 51, size: 12, font: regular, color: muted },
          );
        });
      }
      page.drawLine({
        start: { x: 48, y: 75 },
        end: { x: 548, y: 75 },
        thickness: 0.7,
        color: rgb(0.89, 0.89, 0.91),
      });
      page.drawText("PDF STUDIO  /  DOCUMENT DE DÉMONSTRATION", {
        x: 48,
        y: 52,
        size: 8,
        font: regular,
        color: muted,
      });
      page.drawText(`${i + 1} / ${count}`, {
        x: 520,
        y: 52,
        size: 9,
        font: regular,
        color: muted,
      });
    }
    pdf.setTitle(title);
    pdf.setCreator("PDF Studio");
    result.push({
      id: uid(),
      name: [
        "Projet Atlas — Présentation.pdf",
        "Devis — Identité visuelle.pdf",
        "Guide de bienvenue.pdf",
      ][index],
      bytes: await pdf.save(),
      pages: count,
      createdAt: Date.now() - (index + 1) * 86400000,
      modifiedAt: Date.now() - index * 3600000,
      starred: index === 0,
      trashed: false,
      cover,
      marks: [],
    });
  }
  return result;
}
export function downloadBytes(
  bytes: Uint8Array,
  name: string,
  type = "application/pdf",
) {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
let pdfJsPromise: Promise<typeof import("pdfjs-dist")> | undefined;
let sharedWorker: import("pdfjs-dist").PDFWorker | undefined;
export function getPdfJs() {
  if (!pdfJsPromise)
    pdfJsPromise = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = assetUrl("pdf.worker.min.mjs");
      return lib;
    });
  return pdfJsPromise;
}
export async function loadPreview(bytes: Uint8Array) {
  const lib = await getPdfJs();
  if (!sharedWorker) sharedWorker = new lib.PDFWorker();
  return lib.getDocument({
    worker: sharedWorker,
    data: bytes.slice(),
    cMapUrl: assetUrl("cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: assetUrl("standard_fonts/"),
    wasmUrl: assetUrl("wasm/"),
  }).promise;
}
const thumbnailPreviews = new WeakMap<
  Uint8Array,
  { promise: ReturnType<typeof loadPreview>; references: number }
>();
export function acquireThumbnailPreview(bytes: Uint8Array) {
  let entry = thumbnailPreviews.get(bytes);
  if (!entry) {
    entry = { promise: loadPreview(bytes), references: 0 };
    thumbnailPreviews.set(bytes, entry);
  }
  const current = entry;
  current.references++;
  return {
    promise: current.promise,
    release: () => {
      current.references--;
      setTimeout(() => {
        if (
          current.references === 0 &&
          thumbnailPreviews.get(bytes) === current
        ) {
          thumbnailPreviews.delete(bytes);
          void current.promise.then((pdf) => pdf.destroy()).catch(() => {});
        }
      }, 100);
    },
  };
}
// Work in displayed page coordinates, reversing the original crop and rotation.
// Text and shapes stay vector based; unsupported Unicode falls back to a bitmap.
export async function exportDocument(doc: StudioDocument): Promise<Uint8Array> {
  if (!doc.marks.length) return doc.bytes;
  const pdf = await PDFDocument.load(doc.bytes);
  const preview = await loadPreview(doc.bytes);
  try {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    for (let i = 0; i < pdf.getPageCount(); i++) {
      const marks = doc.marks.filter((m) => m.page === i);
      if (!marks.length) continue;
      const source = await preview.getPage(i + 1);
      const viewport = source.getViewport({ scale: 1 });
      const page = pdf.getPage(i);
      const angle = ((page.getRotation().angle % 360) + 360) % 360;
      const [left, bottom, right, top] = source.view;
      page.pushOperators(
        pushGraphicsState(),
        angle === 90
          ? concatTransformationMatrix(0, 1, -1, 0, right, bottom)
          : angle === 180
            ? concatTransformationMatrix(-1, 0, 0, -1, right, top)
            : angle === 270
              ? concatTransformationMatrix(0, -1, 1, 0, left, top)
              : concatTransformationMatrix(1, 0, 0, 1, left, bottom),
      );
      for (const m of marks) {
        const x = m.x * viewport.width,
          y = (1 - m.y - m.h) * viewport.height,
          width = m.w * viewport.width,
          height = m.h * viewport.height;
        const color = rgb(
          parseInt(m.color.slice(1, 3), 16) / 255,
          parseInt(m.color.slice(3, 5), 16) / 255,
          parseInt(m.color.slice(5, 7), 16) / 255,
        );
        if (m.type === "highlight")
          page.drawRectangle({ x, y, width, height, color, opacity: 0.3 });
        else if (m.type === "rectangle")
          page.drawRectangle({
            x,
            y,
            width,
            height,
            borderColor: color,
            borderWidth: 2,
          });
        else if (m.type === "draw" && m.points) {
          for (let j = 1; j < m.points.length; j++)
            page.drawLine({
              start: {
                x: m.points[j - 1].x * viewport.width,
                y: (1 - m.points[j - 1].y) * viewport.height,
              },
              end: {
                x: m.points[j].x * viewport.width,
                y: (1 - m.points[j].y) * viewport.height,
              },
              color,
              thickness: 2,
            });
        } else if (m.type === "image" && m.data) {
          const canvas = document.createElement("canvas");
          const image = new Image();
          image.src = m.data;
          await image.decode();
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext("2d")!.drawImage(image, 0, 0);
          page.drawImage(await pdf.embedPng(canvas.toDataURL("image/png")), {
            x,
            y,
            width,
            height,
          });
        } else {
          const chosenFont = m.type === "signature" ? italic : font;
          let encodable = true;
          try {
            chosenFont.encodeText(m.text || "");
          } catch {
            encodable = false;
          }
          if (encodable) {
            if (m.type === "note")
              page.drawRectangle({
                x,
                y,
                width,
                height,
                color: rgb(1, 0.953, 0.741),
              });
            const size = m.size || 14;
            page.drawText(m.text || "", {
              x: x + (m.type === "note" ? 8 : 0),
              y:
                (1 - m.y) * viewport.height -
                size -
                (m.type === "note" ? 8 : 0),
              size,
              font: chosenFont,
              color: m.type === "note" ? rgb(0.37, 0.29, 0.13) : color,
              lineHeight: size * 1.35,
            });
          } else {
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width * 2);
            canvas.height = Math.ceil(viewport.height * 2);
            const ctx = canvas.getContext("2d")!;
            ctx.scale(2, 2);
            await paintMark(ctx, m, viewport.width, viewport.height);
            page.drawImage(await pdf.embedPng(canvas.toDataURL("image/png")), {
              x: 0,
              y: 0,
              width: viewport.width,
              height: viewport.height,
            });
          }
        }
      }
      page.pushOperators(popGraphicsState());
    }
    pdf.setModificationDate(new Date());
    return await pdf.save();
  } finally {
    await preview.destroy();
  }
}
export async function paintMark(
  ctx: CanvasRenderingContext2D,
  m: Mark,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.fillStyle = m.color;
  ctx.strokeStyle = m.color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const x = m.x * width,
    y = m.y * height,
    w = m.w * width,
    h = m.h * height;
  if (m.type === "highlight") {
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x, y, w, h);
  } else if (m.type === "rectangle") ctx.strokeRect(x, y, w, h);
  else if (m.type === "draw" && m.points?.length) {
    ctx.beginPath();
    m.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x * width, p.y * height);
      else ctx.lineTo(p.x * width, p.y * height);
    });
    ctx.stroke();
  } else if (m.type === "image" && m.data) {
    const img = new Image();
    img.src = m.data;
    await img.decode();
    ctx.drawImage(img, x, y, w, h);
  } else {
    if (m.type === "note") {
      ctx.fillStyle = "#fff3bd";
      ctx.fillRect(x, y, w || 160, h || 65);
      ctx.fillStyle = "#5f4a20";
    }
    ctx.font = `${m.type === "signature" ? "italic " : ""}${m.size || 14}px ${m.type === "signature" ? "Georgia, serif" : "Arial, sans-serif"}`;
    ctx.textBaseline = "top";
    (m.text || "")
      .split("\n")
      .forEach((line, i) =>
        ctx.fillText(
          line,
          x + (m.type === "note" ? 8 : 0),
          y + i * (m.size || 14) * 1.35 + (m.type === "note" ? 8 : 0),
        ),
      );
  }
  ctx.restore();
}
