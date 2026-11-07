import { chromium, expect } from "@playwright/test";
import { PDFDocument, PDFTextField, StandardFonts, degrees } from "pdf-lib";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";

await mkdir("outputs", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe")
    ? {
        executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const passed = [];
async function check(name, action) {
  await action();
  passed.push(name);
  console.log(`PASS ${name}`);
}
async function ready() {
  await expect(page.locator(".page-stage")).toBeVisible();
  await expect(page.locator(".page-loading")).toHaveCount(0, {
    timeout: 30000,
  });
  await expect(page.locator(".page-error")).toHaveCount(0);
}
async function savedDoc() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("pdf-studio-local", 1);
        r.onsuccess = () => {
          const db = r.result;
          const request = db
            .transaction("documents")
            .objectStore("documents")
            .getAll();
          request.onsuccess = () => {
            db.close();
            resolve(
              request.result.map((d) => ({ ...d, bytes: Array.from(d.bytes) })),
            );
          };
          request.onerror = reject;
        };
        r.onerror = reject;
      }),
  );
}
async function downloadFrom(action) {
  const event = page.waitForEvent("download");
  await action();
  const download = await event;
  assert.equal(await download.failure(), null);
  return new Uint8Array(await readFile(await download.path()));
}
try {
  await check("Accueil, aperçus et recherche", async () => {
    const res = await page.goto(
      process.env.PDF_STUDIO_URL || "http://127.0.0.1:5173/",
      { waitUntil: "networkidle" },
    );
    assert.equal(res.status(), 200);
    await expect(page.locator(".document-card")).toHaveCount(3);
    await expect(page.locator('.pdf-thumbnail[data-ready="true"]')).toHaveCount(
      3,
    );
    await page
      .getByRole("textbox", { name: "Rechercher un document" })
      .fill("atlas");
    await expect(page.locator(".document-card")).toHaveCount(1);
    await page
      .getByRole("textbox", { name: "Rechercher un document" })
      .fill("");
    await expect(page.locator(".document-card")).toHaveCount(3);
    await page.screenshot({
      path: "outputs/dashboard-desktop.png",
      fullPage: true,
    });
  });
  await check("Lecture et annotation texte persistante", async () => {
    await page
      .getByRole("button", {
        name: "Ouvrir Projet Atlas — Présentation.pdf",
        exact: true,
      })
      .click();
    await ready();
    assert.ok((await page.locator(".textLayer span").count()) > 0);
    await page
      .getByRole("button", { name: "Ajouter du texte", exact: true })
      .click();
    await page.locator(".page-stage").click({ position: { x: 90, y: 100 } });
    await page
      .getByRole("textbox", { name: "Texte", exact: true })
      .fill("Annotation de contrôle — été 2026");
    await page
      .getByRole("button", { name: "Ajouter au document", exact: true })
      .click();
    await expect(page.locator(".annotation-list button")).toHaveCount(1);
    await expect
      .poll(async () => {
        const docs = await savedDoc();
        return docs.find((d) => d.cover === "atlas")?.marks.length;
      })
      .toBe(1);
  });
  await check("Surlignage, dessin, annulation et rétablissement", async () => {
    const box = await page.locator(".page-stage").boundingBox();
    await page.getByRole("button", { name: "Surligner", exact: true }).click();
    await page.mouse.move(box.x + 60, box.y + 220);
    await page.mouse.down();
    await page.mouse.move(box.x + 330, box.y + 243, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator(".annotation-list button")).toHaveCount(2);
    await page.getByRole("button", { name: "Dessiner", exact: true }).click();
    await page.mouse.move(box.x + 90, box.y + 280);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 305, { steps: 10 });
    await page.mouse.move(box.x + 260, box.y + 275, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator(".annotation-list button")).toHaveCount(3);
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(page.locator(".annotation-list button")).toHaveCount(2);
    await page.getByRole("button", { name: "Rétablir", exact: true }).click();
    await expect(page.locator(".annotation-list button")).toHaveCount(3);
  });
  let annotated;
  await check(
    "Téléchargement PDF réel avec annotations vectorielles",
    async () => {
      annotated = await downloadFrom(() =>
        page
          .getByRole("button", { name: "Télécharger le PDF", exact: true })
          .click(),
      );
      const pdf = await PDFDocument.load(annotated);
      assert.equal(pdf.getPageCount(), 5);
      assert.ok(annotated.length > 5000);
      await writeFile("outputs/annotated.pdf", annotated);
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const preview = await getDocument({ data: annotated.slice() }).promise;
      const text = await (await preview.getPage(1)).getTextContent();
      assert.match(
        text.items.map((x) => x.str || "").join(" "),
        /Annotation de contrôle/,
      );
      await preview.destroy();
    },
  );
  await check("Rotation, duplication, déplacement et extraction", async () => {
    await page
      .getByRole("button", { name: "Organiser les pages", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Tourner de 90°", exact: true })
      .click();
    await ready();
    await expect
      .poll(() =>
        page
          .locator(".page-stage")
          .evaluate((el) => el.clientWidth > el.clientHeight),
      )
      .toBe(true);
    const rotated = await downloadFrom(() =>
      page
        .getByRole("button", { name: "Télécharger le PDF", exact: true })
        .click(),
    );
    assert.equal(
      (await PDFDocument.load(rotated)).getPage(0).getRotation().angle,
      90,
    );
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await ready();
    await page
      .getByRole("button", { name: "Dupliquer la page", exact: true })
      .click();
    await ready();
    await expect(page.locator(".page-miniature")).toHaveCount(6);
    await page.getByRole("button", { name: "Descendre", exact: true }).click();
    await ready();
    await expect(
      page.getByRole("spinbutton", { name: "Aller à la page" }),
    ).toHaveValue("3");
    const one = await downloadFrom(() =>
      page
        .getByRole("button", { name: "Extraire cette page", exact: true })
        .click(),
    );
    assert.equal((await PDFDocument.load(one)).getPageCount(), 1);
    await page
      .getByRole("button", { name: "Supprimer la page", exact: true })
      .click();
    await ready();
    await expect(page.locator(".page-miniature")).toHaveCount(5);
  });
  await check("Recherche dans le PDF et conversion PNG", async () => {
    await page
      .getByRole("button", { name: "Rechercher dans le document", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Texte à rechercher" })
      .fill("atlas");
    await page.getByRole("button", { name: "Rechercher", exact: true }).click();
    await expect(page.locator(".find-bar")).toContainText("1 / 1 pages");
    await ready();
    await page.getByRole("button", { name: "Fermer la recherche" }).click();
    await page.getByRole("button", { name: "Exporter", exact: true }).click();
    await page.getByRole("button", { name: /Image PNG/ }).click();
    const png = await downloadFrom(() =>
      page
        .getByRole("button", { name: "Exporter le document", exact: true })
        .click(),
    );
    assert.deepEqual(
      Array.from(png.slice(0, 8)),
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    assert.ok(png.length > 15000);
  });
  await check("Persistance après rechargement", async () => {
    await page.getByRole("button", { name: "Retour à l’atelier" }).click();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".document-card")).toHaveCount(3);
    const docs = await savedDoc();
    assert.equal(docs.find((d) => d.cover === "atlas").pages, 5);
  });
  await check("Créer un document et signer", async () => {
    await page.getByRole("button", { name: /Créer un document/ }).click();
    await page
      .getByRole("textbox", { name: "Nom du document", exact: true })
      .fill("Contrat test");
    await page
      .getByRole("button", { name: "Créer mon PDF", exact: true })
      .click();
    await ready();
    await page.getByRole("button", { name: "Signer", exact: true }).click();
    await page.locator(".page-stage").click({ position: { x: 90, y: 180 } });
    await page
      .getByRole("textbox", { name: "Votre nom", exact: true })
      .fill("Marie Dupont");
    await page
      .getByRole("button", { name: "Ajouter au document", exact: true })
      .click();
    await expect(page.locator(".annotation-list button")).toContainText(
      "Marie Dupont",
    );
    const pdf = await PDFDocument.load(
      await downloadFrom(() =>
        page
          .getByRole("button", { name: "Télécharger le PDF", exact: true })
          .click(),
      ),
    );
    assert.equal(pdf.getPageCount(), 1);
    await page.getByRole("button", { name: "Retour à l’atelier" }).click();
  });
  await check("Import et remplissage de formulaire interactif", async () => {
    const fixture = await PDFDocument.create();
    const fp = fixture.addPage();
    const font = await fixture.embedFont(StandardFonts.Helvetica);
    fp.drawText("Formulaire de test", { x: 50, y: 760, font });
    const form = fixture.getForm();
    const name = form.createTextField("Votre nom");
    name.addToPage(fp, { x: 50, y: 650, width: 250, height: 30 });
    const consent = form.createCheckBox("Accord");
    consent.addToPage(fp, { x: 50, y: 600, width: 15, height: 15 });
    const dropdown = form.createDropdown("Département");
    dropdown.addOptions(["Design", "Produit"]);
    dropdown.addToPage(fp, { x: 50, y: 550, width: 250, height: 30 });
    form.updateFieldAppearances(font);
    await page
      .locator('input[type="file"][accept="application/pdf,.pdf"]')
      .setInputFiles({
        name: "Formulaire test.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await fixture.save()),
      });
    await ready();
    await page
      .locator(".properties-sidebar")
      .getByRole("button", { name: /Remplir un formulaire/ })
      .click();
    await page
      .getByRole("textbox", { name: "Votre nom", exact: true })
      .fill("Élodie Martin");
    await page.getByRole("checkbox", { name: "Accord", exact: true }).check();
    await page
      .getByRole("combobox", { name: "Département", exact: true })
      .selectOption("Design");
    await page
      .getByRole("button", { name: "Enregistrer le formulaire", exact: true })
      .click();
    await ready();
    const result = await PDFDocument.load(
      await downloadFrom(() =>
        page
          .getByRole("button", { name: "Télécharger le PDF", exact: true })
          .click(),
      ),
    );
    assert.equal(
      result.getForm().getTextField("Votre nom").getText(),
      "Élodie Martin",
    );
    assert.ok(result.getForm().getCheckBox("Accord").isChecked());
    assert.deepEqual(
      result.getForm().getDropdown("Département").getSelected(),
      ["Design"],
    );
    await page.getByRole("button", { name: "Retour à l’atelier" }).click();
  });
  await check(
    "Fusion de deux PDF et conservation du formulaire rempli",
    async () => {
      await page
        .locator(".tool-card")
        .filter({ hasText: "Fusionner des PDF" })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /Formulaire test.pdf/ })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /Devis — Identité visuelle.pdf/ })
        .click();
      await page
        .getByRole("button", { name: "Fusionner les PDF", exact: true })
        .click();
      await ready();
      const result = await PDFDocument.load(
        await downloadFrom(() =>
          page
            .getByRole("button", { name: "Télécharger le PDF", exact: true })
            .click(),
        ),
      );
      assert.equal(result.getPageCount(), 3);
      await expect(page.locator(".page-miniature")).toHaveCount(3);
      await page.getByRole("button", { name: "Retour à l’atelier" }).click();
    },
  );
  await check("Corbeille, restauration et favoris", async () => {
    const card = page
      .locator(".document-card")
      .filter({ hasText: "Contrat test.pdf" });
    await card
      .getByRole("button", { name: "Ajouter aux favoris", exact: true })
      .click();
    await card
      .getByRole("button", { name: "Options pour Contrat test.pdf" })
      .click();
    await page
      .getByRole("button", { name: "Mettre à la corbeille", exact: true })
      .click();
    await expect(card).toHaveCount(0);
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Corbeille", exact: true })
      .click();
    await expect(page.locator(".document-card")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Options pour Contrat test.pdf" })
      .click();
    await page.getByRole("button", { name: "Restaurer", exact: true }).click();
    await expect(page.locator(".document-card")).toHaveCount(0);
    await page
      .locator(".sidebar")
      .getByRole("button", { name: /Favoris/ })
      .click();
    await expect(page.locator(".document-card")).toHaveCount(2);
  });
  await check(
    "Placement des annotations sur les pages recadrées à 0°, 90°, 180° et 270°",
    async () => {
      const fixture = await PDFDocument.create();
      for (const angle of [0, 90, 180, 270]) {
        const p = fixture.addPage([700, 900]);
        p.setCropBox(50, 75, 500, 700);
        p.setRotation(degrees(angle));
      }
      await page
        .locator('input[type="file"][accept="application/pdf,.pdf"]')
        .setInputFiles({
          name: "Pages recadrées.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from(await fixture.save()),
        });
      await ready();
      for (let i = 0; i < 4; i++) {
        await page
          .getByRole("spinbutton", { name: "Aller à la page" })
          .fill(String(i + 1));
        await ready();
        await page
          .getByRole("button", { name: "Surligner", exact: true })
          .click();
        const box = await page.locator(".page-stage").boundingBox();
        await page.mouse.move(
          box.x + box.width * 0.2,
          box.y + box.height * 0.25,
        );
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width * 0.4,
          box.y + box.height * 0.35,
          { steps: 8 },
        );
        await page.mouse.up();
        await expect(page.locator(".annotation-list button")).toHaveCount(1);
      }
      const bytes = await downloadFrom(() =>
        page
          .getByRole("button", { name: "Télécharger le PDF", exact: true })
          .click(),
      );
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const { createCanvas } = await import("@napi-rs/canvas");
      const preview = await getDocument({ data: bytes.slice() }).promise;
      for (let i = 1; i <= 4; i++) {
        const p = await preview.getPage(i);
        const viewport = p.getViewport({ scale: 1 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext("2d");
        await p.render({ canvas, canvasContext: ctx, viewport }).promise;
        const pixel = ctx.getImageData(
          Math.round(viewport.width * 0.3),
          Math.round(viewport.height * 0.3),
          1,
          1,
        ).data;
        assert.ok(
          pixel[0] > 240 && pixel[1] > 220 && pixel[2] < 230,
          `Page ${i}: surlignage absent à la position attendue (${pixel})`,
        );
      }
      await preview.destroy();
      await page.getByRole("button", { name: "Retour à l’atelier" }).click();
    },
  );
  await check(
    "Interface mobile, ajustement du PDF et outils de pages",
    async () => {
      await page
        .locator(".sidebar")
        .getByRole("button", { name: "Vue d’ensemble", exact: true })
        .click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: "outputs/dashboard-mobile.png",
        fullPage: true,
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
      await page
        .getByRole("button", { name: "Ouvrir Contrat test.pdf", exact: true })
        .click();
      await ready();
      await expect
        .poll(() =>
          page.locator(".page-stage").evaluate((el) => el.clientWidth < 300),
        )
        .toBe(true);
      await page.screenshot({
        path: "outputs/editor-mobile.png",
        fullPage: true,
      });
      const organizer = page.getByRole("button", {
        name: "Organiser les pages",
        exact: true,
      });
      await organizer.scrollIntoViewIfNeeded();
      await organizer.click();
      await expect(page.getByRole("dialog")).toContainText(
        "Chaque page à sa place",
      );
      await page.getByRole("button", { name: "Terminer", exact: true }).click();
    },
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({ passed: passed.length, checks: passed, errors }, null, 2),
  );
  await writeFile(
    "outputs/qa-results.json",
    JSON.stringify({ passed: passed.length, checks: passed, errors }, null, 2),
  );
} catch (error) {
  await page.screenshot({ path: "outputs/qa-failure.png", fullPage: true });
  console.error(error);
  console.error("Browser errors", errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
