"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  degrees,
} from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileImage,
  FilePlus2,
  FileText,
  FormInput,
  Highlighter,
  ImagePlus,
  Maximize,
  MessageSquare,
  Minus,
  MousePointer2,
  PanelLeftClose,
  PenLine,
  Plus,
  Printer,
  Redo2,
  RotateCw,
  Search,
  Square,
  Star,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import {
  cleanName,
  downloadBytes,
  exportDocument,
  formatSize,
  getPdfJs,
  loadPreview,
  paintMark,
  uid,
  type Mark,
  type StudioDocument,
} from "@/lib/studio";
import { Brand, EmptyState, Modal, PdfThumbnail, Spinner } from "./ui";

type Tool = "select" | Mark["type"];
type Point = { x: number; y: number };
type Field = {
  name: string;
  type: "text" | "check" | "select";
  value: string | boolean;
  options?: string[];
};
const toolItems = [
  { id: "select", icon: MousePointer2, label: "Sélectionner" },
  { id: "text", icon: Type, label: "Ajouter du texte" },
  { id: "highlight", icon: Highlighter, label: "Surligner" },
  { id: "draw", icon: PenLine, label: "Dessiner" },
  { id: "rectangle", icon: Square, label: "Rectangle" },
  { id: "note", icon: MessageSquare, label: "Commenter" },
  { id: "signature", icon: PenLine, label: "Signer" },
  { id: "image", icon: ImagePlus, label: "Ajouter une image" },
] as const;
const colors = [
  "#7657d6",
  "#202536",
  "#e7ba35",
  "#52a184",
  "#dd7167",
  "#477ecd",
];

export default function Editor({
  doc,
  onChange,
  onClose,
  notify,
  initialTool,
  storageOk,
}: {
  doc: StudioDocument;
  onChange: (doc: StudioDocument) => Promise<void>;
  onClose: () => void;
  notify: (message: string) => void;
  initialTool: string;
  storageOk: boolean;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(0),
    [zoom, setZoom] = useState(100),
    [tool, setTool] = useState<Tool>(
      initialTool === "sign" ? "signature" : "select",
    );
  const [color, setColor] = useState(colors[0]),
    [fontSize, setFontSize] = useState(16),
    [busy, setBusy] = useState(false),
    [rendering, setRendering] = useState(true),
    [error, setError] = useState("");
  const [sidebar, setSidebar] = useState(true),
    [panel, setPanel] = useState(
      initialTool === "organize" ? "pages" : "properties",
    ),
    [selected, setSelected] = useState<string | null>(null),
    [draft, setDraft] = useState<Mark | null>(null);
  const [dims, setDims] = useState({ width: 595.28, height: 841.89 }),
    [natural, setNatural] = useState({ width: 595.28, height: 841.89 });
  const [editMark, setEditMark] = useState<Mark | null>(null),
    [text, setText] = useState(""),
    [signatureTab, setSignatureTab] = useState("type"),
    [modal, setModal] = useState<"export" | "forms" | "pages" | null>(
      initialTool === "convert"
        ? "export"
        : initialTool === "organize" &&
            typeof window !== "undefined" &&
            window.innerWidth <= 780
          ? "pages"
          : null,
    ),
    [exportFormat, setExportFormat] = useState("pdf"),
    [fields, setFields] = useState<Field[]>([]);
  const [find, setFind] = useState(""),
    [searching, setSearching] = useState(false),
    [results, setResults] = useState<number[]>([]),
    [resultIndex, setResultIndex] = useState(0),
    [searchRan, setSearchRan] = useState(false),
    [showFind, setShowFind] = useState(false);
  const [history, setHistory] = useState<StudioDocument[]>([]),
    [future, setFuture] = useState<StudioDocument[]>([]),
    [saveState, setSaveState] = useState("Enregistré sur cet appareil");
  const canvas = useRef<HTMLCanvasElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    textLayer = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    workspace = useRef<HTMLDivElement>(null),
    appendInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    signatureCanvas = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<{ start: Point; mark: Mark; moving: boolean } | null>(
      null,
    ),
    signatureDrawing = useRef(false),
    signatureHasInk = useRef(false),
    docRef = useRef(doc),
    initialFit = useRef(false);
  docRef.current = doc;
  const commit = useCallback(
    async (next: StudioDocument) => {
      setHistory((h) => [...h.slice(-19), docRef.current]);
      setFuture([]);
      setSaveState("Enregistrement…");
      await onChange({ ...next, modifiedAt: Date.now() });
      setSaveState("Enregistré sur cet appareil");
    },
    [onChange],
  );
  const undo = useCallback(() => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setFuture((f) => [doc, ...f]);
    setHistory((h) => h.slice(0, -1));
    setPage((p) => Math.min(p, prev.pages - 1));
    void onChange(prev);
    setSelected(null);
  }, [doc, history, onChange]);
  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    setHistory((h) => [...h, doc]);
    setFuture((f) => f.slice(1));
    setPage((p) => Math.min(p, next.pages - 1));
    void onChange(next);
  }, [doc, future, onChange]);
  const download = useCallback(async () => {
    setBusy(true);
    try {
      downloadBytes(await exportDocument(docRef.current), docRef.current.name);
      notify("Votre PDF est prêt à être conservé");
    } catch {
      notify("Le téléchargement a échoué.");
    } finally {
      setBusy(false);
    }
  }, [notify]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void download();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key === "Escape") {
        setTool("select");
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [download, undo, redo]);
  useEffect(() => {
    let cancelled = false;
    let instance: PDFDocumentProxy | null = null;
    setError("");
    setRendering(true);
    setPdf(null);
    loadPreview(doc.bytes)
      .then((p) => {
        instance = p;
        if (cancelled) {
          void p.destroy();
          return;
        }
        setPdf(p);
      })
      .catch(() => {
        if (!cancelled) {
          setError("L’aperçu de ce PDF ne peut pas être affiché.");
          setRendering(false);
        }
      });
    return () => {
      cancelled = true;
      void instance?.destroy();
    };
  }, [doc.bytes]);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: { cancel: () => void } | undefined;
    let layer: { cancel: () => void } | undefined;
    setRendering(true);
    (async () => {
      try {
        const p = await pdf.getPage(page + 1);
        if (cancelled) return;
        const base = p.getViewport({ scale: 1 });
        if (!initialFit.current) {
          initialFit.current = true;
          if (window.innerWidth <= 780 && workspace.current) {
            setZoom(
              Math.max(
                25,
                Math.round(
                  ((workspace.current.clientWidth - 40) / base.width) * 100,
                ),
              ),
            );
            return;
          }
        }
        const viewport = p.getViewport({ scale: zoom / 100 });
        setNatural({ width: base.width, height: base.height });
        setDims({ width: viewport.width, height: viewport.height });
        const el = canvas.current;
        if (!el) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        el.width = Math.floor(viewport.width * ratio);
        el.height = Math.floor(viewport.height * ratio);
        const render = p.render({
          canvas: el,
          canvasContext: el.getContext("2d")!,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        task = render;
        await render.promise;
        if (cancelled) return;
        const container = textLayer.current;
        if (container) {
          container.innerHTML = "";
          container.style.setProperty("--scale-factor", String(viewport.scale));
          container.style.setProperty(
            "--total-scale-factor",
            String(viewport.scale),
          );
          const lib = await getPdfJs();
          const tl = new lib.TextLayer({
            textContentSource: p.streamTextContent(),
            container,
            viewport,
          });
          layer = tl;
          await tl.render();
        }
      } catch (e) {
        if (
          !cancelled &&
          !(e instanceof Error && e.name === "RenderingCancelledException")
        ) {
          setError("Le rendu de cette page a échoué.");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
    };
  }, [pdf, page, zoom]);
  useEffect(() => {
    let cancelled = false;
    const el = overlay.current;
    if (!el) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.floor(dims.width * ratio);
    el.height = Math.floor(dims.height * ratio);
    const ctx = el.getContext("2d")!;
    ctx.scale(
      (dims.width / natural.width) * ratio,
      (dims.height / natural.height) * ratio,
    );
    void (async () => {
      for (const m of [
        ...doc.marks.filter((m) => m.page === page && m.id !== draft?.id),
        ...(draft ? [draft] : []),
      ]) {
        if (cancelled) return;
        await paintMark(ctx, m, natural.width, natural.height);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.marks, page, draft, dims, natural]);
  useEffect(() => {
    if (!textLayer.current) return;
    for (const node of textLayer.current.querySelectorAll("span")) {
      node.classList.toggle(
        "search-match",
        !!find.trim() &&
          !!node.textContent
            ?.toLocaleLowerCase()
            .includes(find.trim().toLocaleLowerCase()) &&
          searchRan,
      );
    }
  }, [find, searchRan, rendering]);
  function getPoint(e: React.PointerEvent): Point {
    const rect = stage.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }
  function pointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || busy || rendering) return;
    const p = getPoint(e);
    if (tool === "select") {
      const hit = [...doc.marks]
        .reverse()
        .find(
          (m) =>
            m.page === page &&
            p.x >= m.x - 0.01 &&
            p.x <= m.x + m.w + 0.01 &&
            p.y >= m.y - 0.01 &&
            p.y <= m.y + m.h + 0.01,
        );
      setSelected(hit?.id || null);
      if (hit) {
        e.preventDefault();
        gesture.current = { start: p, mark: hit, moving: true };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    e.preventDefault();
    if (tool === "text" || tool === "note" || tool === "signature") {
      const m: Mark = {
        id: uid(),
        page,
        type: tool,
        ...p,
        w: 0.3,
        h: 0.08,
        color,
        size: tool === "signature" ? 30 : tool === "note" ? 11 : fontSize,
      };
      setText("");
      setEditMark(m);
      setSignatureTab("type");
      signatureHasInk.current = false;
      return;
    }
    if (tool === "image") {
      setEditMark({
        id: uid(),
        page,
        type: "image",
        ...p,
        w: 0.3,
        h: 0.2,
        color,
      });
      imageInput.current?.click();
      return;
    }
    const m: Mark = {
      id: uid(),
      page,
      type: tool,
      ...p,
      w: 0,
      h: 0,
      color: tool === "highlight" && color === colors[0] ? "#f6cf48" : color,
      points: tool === "draw" ? [p] : undefined,
    };
    gesture.current = { start: p, mark: m, moving: false };
    setDraft(m);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = getPoint(e);
    if (g.moving) {
      const dx = p.x - g.start.x,
        dy = p.y - g.start.y;
      const x = Math.max(0, Math.min(1 - g.mark.w, g.mark.x + dx)),
        y = Math.max(0, Math.min(1 - g.mark.h, g.mark.y + dy));
      setDraft({
        ...g.mark,
        x,
        y,
        points: g.mark.points?.map((q) => ({
          x: q.x + x - g.mark.x,
          y: q.y + y - g.mark.y,
        })),
      });
    } else if (g.mark.type === "draw") {
      g.mark = { ...g.mark, points: [...(g.mark.points || []), p] };
      setDraft(g.mark);
    } else
      setDraft({
        ...g.mark,
        x: Math.min(g.start.x, p.x),
        y: Math.min(g.start.y, p.y),
        w: Math.abs(p.x - g.start.x),
        h: Math.abs(p.y - g.start.y),
      });
  }
  function pointerUp() {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    let m = draft;
    setDraft(null);
    if (!m) return;
    if (m.type === "draw" && m.points?.length) {
      const xs = m.points.map((p) => p.x),
        ys = m.points.map((p) => p.y);
      m = {
        ...m,
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(0.005, Math.max(...xs) - Math.min(...xs)),
        h: Math.max(0.005, Math.max(...ys) - Math.min(...ys)),
      };
    }
    if (!g.moving && m.w < 0.003 && m.h < 0.003) return;
    void commit({
      ...doc,
      marks: g.moving
        ? doc.marks.map((a) => (a.id === m!.id ? m! : a))
        : [...doc.marks, m],
    });
    if (!g.moving) setSelected(m.id);
  }
  async function saveText() {
    if (!editMark || !text.trim()) return;
    const lines = text.split("\n");
    const size = editMark.type === "signature" ? 30 : editMark.size || fontSize;
    const maxWidth =
      (Math.max(...lines.map((x) => x.length)) * size * 0.57) / natural.width;
    const m = {
      ...editMark,
      text,
      color,
      size,
      w: editMark.type === "note" ? Math.max(0.28, maxWidth + 0.03) : maxWidth,
      h: Math.max(
        editMark.type === "note" ? 0.08 : 0,
        (lines.length * size * 1.35) / natural.height,
      ),
    };
    await commit({
      ...doc,
      marks: [...doc.marks.filter((a) => a.id !== m.id), m],
    });
    setEditMark(null);
    setSelected(m.id);
    setTool("select");
  }
  async function addImage(file: File | undefined) {
    if (!file || !editMark) return;
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      const data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      const image = new Image();
      image.src = data;
      await image.decode();
      const w = Math.min(0.35, 1 - editMark.x),
        h = Math.min(
          1 - editMark.y,
          (w * natural.width * image.height) / image.width / natural.height,
        );
      const m = { ...editMark, data, w, h };
      await commit({ ...doc, marks: [...doc.marks, m] });
      setSelected(m.id);
      setTool("select");
    } catch {
      notify("Cette image n’a pas pu être ajoutée.");
    } finally {
      setEditMark(null);
    }
  }
  async function pageAction(action: string) {
    setBusy(true);
    try {
      const bytes = await exportDocument(doc);
      const p = await PDFDocument.load(bytes);
      let targetPage = page;
      if (action === "rotate") {
        const item = p.getPage(page);
        item.setRotation(degrees((item.getRotation().angle + 90) % 360));
      }
      if (action === "add") {
        const { width, height } = p.getPage(page).getSize();
        p.insertPage(page + 1, [width, height]);
        targetPage++;
      }
      if (action === "duplicate") {
        const [copy] = await p.copyPages(p, [page]);
        p.insertPage(page + 1, copy);
        targetPage++;
      }
      if (action === "delete") {
        if (p.getPageCount() === 1) {
          notify("Le document doit conserver au moins une page.");
          return;
        }
        p.removePage(page);
        targetPage = Math.min(page, p.getPageCount() - 1);
      }
      if (action === "up" || action === "down") {
        targetPage = page + (action === "up" ? -1 : 1);
        if (targetPage < 0 || targetPage >= p.getPageCount()) return;
        const item = p.getPage(page);
        p.removePage(page);
        p.insertPage(targetPage, item);
      }
      await commit({
        ...doc,
        bytes: await p.save(),
        pages: p.getPageCount(),
        marks: [],
      });
      setPage(targetPage);
      setSelected(null);
      notify("Pages mises à jour");
    } catch {
      notify("Cette opération n’a pas pu être effectuée.");
    } finally {
      setBusy(false);
    }
  }
  async function append(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const p = await PDFDocument.load(await exportDocument(doc));
      for (const file of Array.from(files)) {
        const source = await PDFDocument.load(await file.arrayBuffer());
        if (source.getForm().getFields().length) source.getForm().flatten();
        for (const item of await p.copyPages(source, source.getPageIndices()))
          p.addPage(item);
      }
      await commit({
        ...doc,
        bytes: await p.save(),
        pages: p.getPageCount(),
        marks: [],
      });
      notify("Les pages ont été ajoutées au document");
    } catch {
      notify("Ajout impossible. Vérifiez que les PDF ne sont pas protégés.");
    } finally {
      setBusy(false);
    }
  }
  async function extract() {
    setBusy(true);
    try {
      const source = await PDFDocument.load(await exportDocument(doc));
      const p = await PDFDocument.create();
      const [item] = await p.copyPages(source, [page]);
      p.addPage(item);
      downloadBytes(
        await p.save(),
        `${cleanName(doc.name)} — page ${page + 1}.pdf`,
      );
      notify("Page extraite");
    } catch {
      notify("L’extraction a échoué.");
    } finally {
      setBusy(false);
    }
  }
  async function exportFile() {
    if (exportFormat === "pdf") {
      await download();
      setModal(null);
      return;
    }
    setBusy(true);
    let preview: PDFDocumentProxy | undefined;
    try {
      preview = await loadPreview(await exportDocument(doc));
      if (exportFormat === "txt") {
        let content = "";
        for (let i = 1; i <= preview.numPages; i++) {
          const p = await preview.getPage(i);
          const text = await p.getTextContent();
          content +=
            `Page ${i}\n` +
            text.items
              .map((item) =>
                "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
              )
              .join("") +
            "\n\n";
        }
        downloadBytes(
          new TextEncoder().encode(content),
          `${cleanName(doc.name)}.txt`,
          "text/plain;charset=utf-8",
        );
        notify("Texte extrait du document (hors annotations et scans)");
      } else {
        const p = await preview.getPage(page + 1);
        const viewport = p.getViewport({ scale: 2 });
        const el = document.createElement("canvas");
        el.width = viewport.width;
        el.height = viewport.height;
        await p.render({
          canvas: el,
          canvasContext: el.getContext("2d")!,
          viewport,
        }).promise;
        const mime = exportFormat === "png" ? "image/png" : "image/jpeg";
        const blob = await new Promise<Blob>((resolve, reject) =>
          el.toBlob((b) => (b ? resolve(b) : reject()), mime, 0.92),
        );
        downloadBytes(
          new Uint8Array(await blob.arrayBuffer()),
          `${cleanName(doc.name)} — page ${page + 1}.${exportFormat}`,
          mime,
        );
        notify("Page exportée en image haute résolution");
      }
      setModal(null);
    } catch {
      notify("L’export n’a pas pu aboutir.");
    } finally {
      await preview?.destroy();
      setBusy(false);
    }
  }
  async function print() {
    setBusy(true);
    try {
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(await exportDocument(doc))], {
          type: "application/pdf",
        }),
      );
      const frame = document.createElement("iframe");
      frame.className = "print-frame";
      frame.src = url;
      document.body.appendChild(frame);
      frame.onload = () => {
        setTimeout(() => {
          try {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          } catch {
            window.open(url, "_blank");
          }
        }, 700);
      };
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 120000);
    } catch {
      notify(
        "L’impression est indisponible. Téléchargez votre PDF pour l’imprimer.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openForms() {
    setBusy(true);
    try {
      const p = await PDFDocument.load(doc.bytes);
      const list: Field[] = [];
      for (const field of p.getForm().getFields()) {
        if (field instanceof PDFTextField)
          list.push({
            name: field.getName(),
            type: "text",
            value: field.getText() || "",
          });
        else if (field instanceof PDFCheckBox)
          list.push({
            name: field.getName(),
            type: "check",
            value: field.isChecked(),
          });
        else if (field instanceof PDFDropdown)
          list.push({
            name: field.getName(),
            type: "select",
            value: field.getSelected()[0] || "",
            options: field.getOptions(),
          });
        else if (field instanceof PDFRadioGroup)
          list.push({
            name: field.getName(),
            type: "select",
            value: field.getSelected() || "",
            options: field.getOptions(),
          });
      }
      setFields(list);
      setModal("forms");
    } catch {
      notify("Les champs du formulaire n’ont pas pu être lus.");
    } finally {
      setBusy(false);
    }
  }
  async function saveForms() {
    setBusy(true);
    try {
      const p = await PDFDocument.load(await exportDocument(doc));
      const form = p.getForm();
      for (const field of fields) {
        const f = form.getField(field.name);
        if (f instanceof PDFTextField) f.setText(String(field.value));
        else if (f instanceof PDFCheckBox) {
          if (field.value) f.check();
          else f.uncheck();
        } else if (
          (f instanceof PDFDropdown || f instanceof PDFRadioGroup) &&
          field.value
        )
          f.select(String(field.value));
      }
      form.updateFieldAppearances(await p.embedFont(StandardFonts.Helvetica));
      await commit({ ...doc, bytes: await p.save(), marks: [] });
      setModal(null);
      notify("Formulaire enregistré");
    } catch {
      notify(
        "Impossible d’enregistrer le formulaire. Certains caractères peuvent ne pas être pris en charge.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function runSearch() {
    if (!pdf || !find.trim()) return;
    setSearching(true);
    const found: number[] = [];
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        if (
          content.items
            .map((x) => ("str" in x ? x.str : ""))
            .join(" ")
            .toLocaleLowerCase()
            .includes(find.toLocaleLowerCase())
        )
          found.push(i - 1);
      }
      setResults(found);
      setResultIndex(0);
      setSearchRan(true);
      if (found.length) setPage(found[0]);
    } catch {
      notify("La recherche a échoué.");
    } finally {
      setSearching(false);
    }
  }
  const activeMark = doc.marks.find((m) => m.id === selected);
  const localMarks = doc.marks.filter((m) => m.page === page);
  const toolLabel = toolItems.find((t) => t.id === tool)?.label;
  const fit = () => {
    if (workspace.current)
      setZoom(
        Math.max(
          25,
          Math.min(
            200,
            Math.round(
              ((workspace.current.clientWidth - 90) / natural.width) * 100,
            ),
          ),
        ),
      );
  };
  function signaturePoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const node = e.currentTarget;
    const rect = node.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * node.width) / rect.width,
      y: ((e.clientY - rect.top) * node.height) / rect.height,
    };
  }
  async function saveSignature() {
    if (!signatureHasInk.current) {
      notify("Dessinez d’abord votre signature.");
      return;
    }
    if (!editMark || !signatureCanvas.current) return;
    const m: Mark = {
      ...editMark,
      type: "image",
      data: signatureCanvas.current.toDataURL(),
      w: 0.38,
      h: (0.38 * natural.width * (180 / 600)) / natural.height,
    };
    await commit({ ...doc, marks: [...doc.marks, m] });
    setEditMark(null);
    setTool("select");
  }
  return (
    <div className="editor-shell">
      <input
        hidden
        ref={appendInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={(e) => {
          void append(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          void addImage(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <header className="editor-header">
        <div className="editor-header-left">
          <button
            className="icon-btn back-button"
            onClick={onClose}
            aria-label="Retour à l’atelier"
          >
            <ArrowLeft size={20} />
          </button>
          <Brand compact />
          <span className="editor-header-divider" />
          <div className="editor-filename">
            <input
              aria-label="Nom du document"
              value={cleanName(doc.name)}
              onChange={(e) =>
                void onChange({
                  ...doc,
                  name: `${e.target.value}.pdf`,
                  modifiedAt: Date.now(),
                })
              }
            />
            <span>
              <span className="status-dot" />
              {storageOk
                ? saveState
                : "Téléchargez pour conserver vos modifications"}
            </span>
          </div>
          <button
            className={`star-btn ${doc.starred ? "is-starred" : ""}`}
            onClick={() => void onChange({ ...doc, starred: !doc.starred })}
            aria-label="Favori"
          >
            <Star size={16} fill={doc.starred ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="editor-header-actions">
          <button
            className="icon-btn"
            aria-label="Imprimer le PDF"
            onClick={() => void print()}
            disabled={busy}
          >
            <Printer size={19} />
          </button>
          <button className="btn outline" onClick={() => setModal("export")}>
            <ArrowUpRightIcon />
            Exporter
          </button>
          <button
            className="btn primary"
            onClick={() => void download()}
            disabled={busy}
          >
            {busy ? <Spinner /> : <Download size={16} />}
            <span>Télécharger le PDF</span>
          </button>
        </div>
      </header>
      <div className="editor-toolbar">
        <div className="editor-tool-group">
          <button
            className={`icon-btn ${sidebar ? "is-active" : ""}`}
            onClick={() => setSidebar(!sidebar)}
            aria-label="Afficher les miniatures"
          >
            <PanelLeftClose size={19} />
          </button>
          <span className="toolbar-divider" />
          <button
            className="icon-btn"
            onClick={undo}
            disabled={!history.length}
            aria-label="Annuler"
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-btn"
            onClick={redo}
            disabled={!future.length}
            aria-label="Rétablir"
          >
            <Redo2 size={18} />
          </button>
        </div>
        <div className="annotation-tools">
          {toolItems.map((t) => (
            <button
              key={t.id}
              className={`editor-tool ${tool === t.id ? "active" : ""}`}
              title={t.label}
              aria-label={t.label}
              onClick={() => {
                setTool(t.id);
                setSelected(null);
                setPanel("properties");
              }}
            >
              <t.icon size={18} />
              {(t.id === "text" || t.id === "signature") && (
                <span>{t.id === "text" ? "Texte" : "Signer"}</span>
              )}
            </button>
          ))}
        </div>
        <div className="editor-tool-group">
          <button
            className="icon-btn"
            aria-label="Organiser les pages"
            onClick={() => {
              if (window.innerWidth <= 780) setModal("pages");
              else setPanel("pages");
            }}
          >
            <Copy size={18} />
          </button>
          <button
            className="icon-btn compact-form-tool"
            aria-label="Remplir un formulaire"
            onClick={() => void openForms()}
          >
            <FormInput size={18} />
          </button>
          <button
            className={`icon-btn ${showFind ? "is-active" : ""}`}
            onClick={() => setShowFind(!showFind)}
            aria-label="Rechercher dans le document"
          >
            <Search size={18} />
          </button>
          <span className="toolbar-divider" />
          <button
            className="icon-btn"
            onClick={() => setZoom((z) => Math.max(25, z - 25))}
            aria-label="Réduire"
          >
            <Minus size={16} />
          </button>
          <select
            className="zoom-select"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
          >
            {Array.from(new Set([25, 50, 75, 100, 125, 150, 200, zoom]))
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n} %
                </option>
              ))}
          </select>
          <button
            className="icon-btn"
            onClick={() => setZoom((z) => Math.min(250, z + 25))}
            aria-label="Agrandir"
          >
            <Plus size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={fit}
            aria-label="Ajuster à la largeur"
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>
      {showFind && (
        <form
          className="find-bar"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <Search size={16} />
          <input
            autoFocus
            value={find}
            onChange={(e) => {
              setFind(e.target.value);
              setSearchRan(false);
            }}
            placeholder="Rechercher dans le texte du PDF…"
            aria-label="Texte à rechercher"
          />
          <button className="btn outline small" disabled={searching}>
            {searching ? <Spinner /> : "Rechercher"}
          </button>
          {searchRan && (
            <span>
              {results.length
                ? `${resultIndex + 1} / ${results.length} pages`
                : "Aucun résultat"}
            </span>
          )}
          {results.length > 0 && (
            <>
              <button
                className="icon-btn"
                type="button"
                aria-label="Résultat précédent"
                onClick={() => {
                  const n = (resultIndex - 1 + results.length) % results.length;
                  setResultIndex(n);
                  setPage(results[n]);
                }}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="icon-btn"
                type="button"
                aria-label="Résultat suivant"
                onClick={() => {
                  const n = (resultIndex + 1) % results.length;
                  setResultIndex(n);
                  setPage(results[n]);
                }}
              >
                <ChevronRight size={15} />
              </button>
            </>
          )}
          <button
            className="icon-btn"
            type="button"
            onClick={() => setShowFind(false)}
            aria-label="Fermer la recherche"
          >
            <X size={16} />
          </button>
        </form>
      )}
      <div className="editor-body">
        {sidebar && (
          <aside className="pages-sidebar">
            <div className="pages-sidebar-head">
              <h3>
                Pages <span>{doc.pages}</span>
              </h3>
              <button
                className="icon-btn"
                onClick={() => void pageAction("add")}
                aria-label="Ajouter une page"
                disabled={busy}
              >
                <Plus size={17} />
              </button>
            </div>
            <div className="pages-scroll">
              {Array.from({ length: doc.pages }, (_, i) => (
                <button
                  key={i}
                  className={`page-miniature ${page === i ? "active" : ""}`}
                  onClick={() => {
                    setPage(i);
                    setSelected(null);
                  }}
                >
                  <div>
                    <PdfThumbnail doc={doc} page={i} />
                    {doc.marks.some((m) => m.page === i) && (
                      <span className="page-mark-dot" />
                    )}
                  </div>
                  <span>{i + 1}</span>
                </button>
              ))}
            </div>
            <button
              className="add-pages"
              onClick={() => appendInput.current?.click()}
            >
              <FilePlus2 size={16} />
              Ajouter un PDF
            </button>
          </aside>
        )}
        <div className="workspace" ref={workspace}>
          <div className="canvas-scroller">
            <div
              className="page-stage"
              ref={stage}
              style={{
                width: dims.width,
                height: dims.height,
                cursor:
                  tool === "select"
                    ? "default"
                    : tool === "text"
                      ? "text"
                      : "crosshair",
                touchAction: tool === "select" ? "auto" : "none",
              }}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={() => {
                gesture.current = null;
                setDraft(null);
              }}
            >
              <canvas
                ref={canvas}
                style={{ width: dims.width, height: dims.height }}
              />
              <div
                ref={textLayer}
                className="textLayer"
                style={{
                  pointerEvents:
                    tool === "select" && !selected ? "auto" : "none",
                }}
              />
              <canvas
                ref={overlay}
                className="annotation-canvas"
                style={{ width: dims.width, height: dims.height }}
              />
              {activeMark && activeMark.page === page && (
                <div
                  className="mark-selection"
                  style={{
                    left: `${(draft?.id === activeMark.id ? draft.x : activeMark.x) * 100}%`,
                    top: `${(draft?.id === activeMark.id ? draft.y : activeMark.y) * 100}%`,
                    width: `${activeMark.w * 100}%`,
                    height: `${activeMark.h * 100}%`,
                  }}
                />
              )}
              {rendering && (
                <div className="page-loading">
                  <Spinner />
                </div>
              )}
              {error && (
                <div className="page-error">
                  <FileText size={30} />
                  <p>{error}</p>
                  <button
                    className="btn outline"
                    onClick={() => void download()}
                  >
                    Télécharger le document
                  </button>
                </div>
              )}
            </div>
            <div className="page-caption">
              {doc.name} <span>·</span> Page {page + 1} sur {doc.pages}
            </div>
          </div>
          <div className="floating-pagination">
            <button
              className="icon-btn"
              disabled={page === 0}
              onClick={() => {
                setPage((p) => p - 1);
                setSelected(null);
              }}
              aria-label="Page précédente"
            >
              <ChevronLeft size={18} />
            </button>
            <input
              aria-label="Aller à la page"
              type="number"
              min={1}
              max={doc.pages}
              value={page + 1}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n <= doc.pages) setPage(n - 1);
              }}
            />
            <span>/ {doc.pages}</span>
            <button
              className="icon-btn"
              disabled={page === doc.pages - 1}
              onClick={() => {
                setPage((p) => p + 1);
                setSelected(null);
              }}
              aria-label="Page suivante"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <aside className="properties-sidebar">
          <div className="properties-tabs">
            <button
              className={panel === "properties" ? "active" : ""}
              onClick={() => setPanel("properties")}
            >
              Outils
            </button>
            <button
              className={panel === "pages" ? "active" : ""}
              onClick={() => setPanel("pages")}
            >
              Pages
            </button>
          </div>
          <div className="properties-content">
            {panel === "properties" ? (
              <>
                <div className="current-tool">
                  <span className="tool-icon purple">
                    {tool === "select" ? (
                      <MousePointer2 size={21} />
                    ) : tool === "text" ? (
                      <Type size={21} />
                    ) : tool === "signature" ? (
                      <PenLine size={21} />
                    ) : tool === "highlight" ? (
                      <Highlighter size={21} />
                    ) : (
                      <PenLine size={21} />
                    )}
                  </span>
                  <h3>{toolLabel}</h3>
                  <p>
                    {tool === "select"
                      ? "Sélectionnez le texte du PDF ou cliquez sur une annotation pour la déplacer."
                      : tool === "highlight" || tool === "rectangle"
                        ? "Cliquez et glissez sur la page pour tracer une zone."
                        : tool === "draw"
                          ? "Dessinez librement sur votre document."
                          : "Cliquez sur la page pour ajouter votre contenu."}
                  </p>
                </div>
                <label className="property-label">Couleur</label>
                <div className="color-palette">
                  {colors.map((c) => (
                    <button
                      key={c}
                      style={{ background: c }}
                      className={color === c ? "selected" : ""}
                      aria-label={`Couleur ${c}`}
                      onClick={() => setColor(c)}
                    >
                      {color === c && <Check size={14} />}
                    </button>
                  ))}
                </div>
                {(tool === "text" || tool === "note") && (
                  <label className="field-label">
                    Taille du texte
                    <select
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                    >
                      {[10, 12, 14, 16, 20, 24, 32, 48].map((n) => (
                        <option key={n} value={n}>
                          {n} pt
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="property-separator" />
                <button
                  className="form-button"
                  onClick={() => void openForms()}
                  disabled={busy}
                >
                  <FormInput size={18} />
                  <span>
                    Remplir un formulaire
                    <small>Champs interactifs du PDF</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
                <div className="property-separator" />
                <div className="annotation-heading">
                  <h4>Sur cette page</h4>
                  <span>{localMarks.length}</span>
                </div>
                {!localMarks.length ? (
                  <div className="annotation-empty">
                    <MessageSquare size={23} />
                    <p>
                      Un espace pour vos remarques,
                      <br />
                      vos idées et votre signature.
                    </p>
                  </div>
                ) : (
                  <div className="annotation-list">
                    {localMarks.map((m, i) => (
                      <button
                        key={m.id}
                        className={selected === m.id ? "selected" : ""}
                        onClick={() => {
                          setSelected(m.id);
                          setTool("select");
                        }}
                      >
                        <span
                          className="annotation-number"
                          style={{ color: m.color }}
                        >
                          {i + 1}
                        </span>
                        <span>
                          {m.text ||
                            {
                              highlight: "Surlignage",
                              draw: "Dessin",
                              rectangle: "Rectangle",
                              image: "Image",
                              signature: "Signature",
                              text: "Texte",
                              note: "Commentaire",
                            }[m.type]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {activeMark && activeMark.page === page && (
                  <div className="selected-actions">
                    {activeMark.text && (
                      <button
                        className="btn outline small"
                        onClick={() => {
                          setEditMark(activeMark);
                          setText(activeMark.text || "");
                          setColor(activeMark.color);
                        }}
                      >
                        <PenLine size={14} />
                        Modifier
                      </button>
                    )}
                    <button
                      className="btn outline small danger-text"
                      onClick={() => {
                        void commit({
                          ...doc,
                          marks: doc.marks.filter((m) => m.id !== selected),
                        });
                        setSelected(null);
                      }}
                    >
                      <Trash2 size={14} />
                      Supprimer
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="panel-title">Organiser le document</h3>
                <p className="panel-description">
                  Page {page + 1} sélectionnée sur {doc.pages}
                </p>
                <div className="page-actions">
                  <button
                    onClick={() => void pageAction("rotate")}
                    disabled={busy}
                  >
                    <RotateCw size={18} />
                    Tourner de 90°
                  </button>
                  <button
                    onClick={() => void pageAction("duplicate")}
                    disabled={busy}
                  >
                    <Copy size={18} />
                    Dupliquer la page
                  </button>
                  <button
                    onClick={() => void pageAction("add")}
                    disabled={busy}
                  >
                    <Plus size={18} />
                    Insérer une page blanche
                  </button>
                  <button onClick={() => void extract()} disabled={busy}>
                    <Download size={18} />
                    Extraire cette page
                  </button>
                  <div className="page-move">
                    <button
                      onClick={() => void pageAction("up")}
                      disabled={busy || page === 0}
                    >
                      <ArrowUp size={17} />
                      Monter
                    </button>
                    <button
                      onClick={() => void pageAction("down")}
                      disabled={busy || page === doc.pages - 1}
                    >
                      <ArrowDown size={17} />
                      Descendre
                    </button>
                  </div>
                  <button
                    className="danger-text"
                    onClick={() => void pageAction("delete")}
                    disabled={busy || doc.pages === 1}
                  >
                    <Trash2 size={18} />
                    Supprimer la page
                  </button>
                </div>
                <div className="property-separator" />
                <button
                  className="btn outline full-width"
                  onClick={() => appendInput.current?.click()}
                >
                  <FilePlus2 size={17} />
                  Ajouter un autre PDF
                </button>
                <p className="form-note">
                  Les changements peuvent être annulés avec le bouton Annuler.
                </p>
              </>
            )}
          </div>
          <div className="editor-document-details">
            <FileText size={15} />
            <span>
              {doc.pages} pages · {formatSize(doc.bytes.length)}
            </span>
            <span className="local-badge">Local</span>
          </div>
        </aside>
      </div>
      <footer className="editor-status">
        <span>
          <span className="status-dot" />
          {storageOk
            ? "Vos modifications sont enregistrées sur cet appareil"
            : "Sauvegarde locale indisponible : téléchargez votre PDF"}
        </span>
        <span>
          {toolLabel}
          <i />
          PDF Studio
        </span>
      </footer>
      {editMark && editMark.type !== "image" && (
        <Modal
          title={
            editMark.type === "signature"
              ? "La touche finale, c’est vous."
              : editMark.type === "note"
                ? "Une idée à partager ?"
                : "Donnez des mots à vos idées."
          }
          subtitle={
            editMark.type === "signature"
              ? "Ajoutez une signature visuelle à votre document."
              : "Votre texte sera placé à l’endroit choisi sur la page."
          }
          onClose={() => setEditMark(null)}
        >
          {editMark.type === "signature" && (
            <div className="signature-tabs">
              <button
                className={signatureTab === "type" ? "active" : ""}
                onClick={() => setSignatureTab("type")}
              >
                <Type size={15} />
                Saisir
              </button>
              <button
                className={signatureTab === "draw" ? "active" : ""}
                onClick={() => setSignatureTab("draw")}
              >
                <PenLine size={15} />
                Dessiner
              </button>
            </div>
          )}
          {editMark.type !== "signature" || signatureTab === "type" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveText();
              }}
            >
              <label className="field-label">
                {editMark.type === "signature" ? "Votre nom" : "Texte"}
                <textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    editMark.type === "signature"
                      ? "Prénom Nom"
                      : "Écrivez quelque chose…"
                  }
                  rows={editMark.type === "signature" ? 1 : 4}
                  required
                  maxLength={3000}
                />
              </label>
              {editMark.type === "signature" && (
                <div className="signature-preview" style={{ color }}>
                  {text || "Votre signature"}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => setEditMark(null)}
                >
                  Annuler
                </button>
                <button className="btn primary" disabled={!text.trim()}>
                  <Check size={16} />
                  {doc.marks.some((m) => m.id === editMark.id)
                    ? "Enregistrer"
                    : "Ajouter au document"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="signature-pad-wrap">
                <canvas
                  width={600}
                  height={180}
                  ref={signatureCanvas}
                  className="signature-pad"
                  onPointerDown={(e) => {
                    const ctx = e.currentTarget.getContext("2d")!;
                    const p = signaturePoint(e);
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineWidth = 2.5;
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    ctx.strokeStyle = color;
                    signatureDrawing.current = true;
                    signatureHasInk.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!signatureDrawing.current) return;
                    const p = signaturePoint(e);
                    const ctx = e.currentTarget.getContext("2d")!;
                    ctx.lineTo(p.x, p.y);
                    ctx.stroke();
                  }}
                  onPointerUp={() => {
                    signatureDrawing.current = false;
                  }}
                  onPointerCancel={() => {
                    signatureDrawing.current = false;
                  }}
                />
                <span>Signez ici avec la souris ou votre doigt</span>
              </div>
              <div className="modal-actions">
                <button
                  className="btn outline"
                  onClick={() => {
                    signatureCanvas.current
                      ?.getContext("2d")
                      ?.clearRect(0, 0, 600, 180);
                    signatureHasInk.current = false;
                  }}
                >
                  Effacer
                </button>
                <button
                  className="btn primary"
                  onClick={() => void saveSignature()}
                >
                  <Check size={16} />
                  Ajouter ma signature
                </button>
              </div>
            </>
          )}
          <p className="form-note">
            Cette signature est visuelle. Elle n’utilise pas de certificat
            numérique.
          </p>
        </Modal>
      )}
      {modal === "export" && (
        <Modal
          title="Prêt à sortir de l’atelier ?"
          subtitle="Choisissez le format qui convient à votre prochaine étape."
          onClose={() => setModal(null)}
        >
          <div className="export-options">
            {[
              {
                id: "pdf",
                title: "Document PDF",
                desc: "Toutes les pages, avec vos annotations",
                icon: FileText,
              },
              {
                id: "png",
                title: "Image PNG",
                desc: `Page ${page + 1} · Haute résolution`,
                icon: FileImage,
              },
              {
                id: "jpg",
                title: "Image JPEG",
                desc: `Page ${page + 1} · Format léger`,
                icon: FileImage,
              },
              {
                id: "txt",
                title: "Texte brut",
                desc: "Texte sélectionnable du document original",
                icon: Type,
              },
            ].map((f) => (
              <button
                className={exportFormat === f.id ? "selected" : ""}
                key={f.id}
                onClick={() => setExportFormat(f.id)}
              >
                <f.icon size={23} />
                <span>
                  <strong>{f.title}</strong>
                  <small>{f.desc}</small>
                </span>
                <span className="radio-dot" />
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn outline" onClick={() => setModal(null)}>
              Annuler
            </button>
            <button
              className="btn primary"
              onClick={() => void exportFile()}
              disabled={busy}
            >
              {busy ? <Spinner /> : <Download size={16} />}Exporter le document
            </button>
          </div>
        </Modal>
      )}
      {modal === "pages" && (
        <Modal
          title="Chaque page à sa place."
          subtitle={`Page ${page + 1} sur ${doc.pages}`}
          onClose={() => setModal(null)}
        >
          <div className="page-actions">
            <button disabled={busy} onClick={() => void pageAction("rotate")}>
              <RotateCw size={18} />
              Tourner de 90°
            </button>
            <button
              disabled={busy}
              onClick={() => void pageAction("duplicate")}
            >
              <Copy size={18} />
              Dupliquer la page
            </button>
            <button disabled={busy} onClick={() => void pageAction("add")}>
              <Plus size={18} />
              Insérer une page blanche
            </button>
            <button disabled={busy} onClick={() => void extract()}>
              <Download size={18} />
              Extraire cette page
            </button>
            <div className="page-move">
              <button
                disabled={busy || page === 0}
                onClick={() => void pageAction("up")}
              >
                <ArrowUp size={17} />
                Monter
              </button>
              <button
                disabled={busy || page === doc.pages - 1}
                onClick={() => void pageAction("down")}
              >
                <ArrowDown size={17} />
                Descendre
              </button>
            </div>
            <button
              disabled={busy || doc.pages === 1}
              className="danger-text"
              onClick={() => void pageAction("delete")}
            >
              <Trash2 size={18} />
              Supprimer la page
            </button>
          </div>
          <div className="modal-actions">
            <button
              className="btn outline"
              onClick={() => appendInput.current?.click()}
            >
              <FilePlus2 size={16} />
              Ajouter un PDF
            </button>
            <button className="btn primary" onClick={() => setModal(null)}>
              Terminer
            </button>
          </div>
        </Modal>
      )}
      {modal === "forms" && (
        <Modal
          title="Complétez votre document."
          subtitle="Les champs interactifs de votre PDF, réunis au même endroit."
          onClose={() => setModal(null)}
        >
          {fields.length ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveForms();
              }}
            >
              <div className="form-fields">
                {fields.map((f, i) => (
                  <label
                    className={
                      f.type === "check" ? "checkbox-field" : "field-label"
                    }
                    key={f.name}
                  >
                    {f.type === "check" ? (
                      <>
                        <input
                          type="checkbox"
                          checked={!!f.value}
                          onChange={(e) =>
                            setFields((fs) =>
                              fs.map((v, j) =>
                                i === j ? { ...v, value: e.target.checked } : v,
                              ),
                            )
                          }
                        />
                        {f.name}
                      </>
                    ) : (
                      <>
                        {f.name}
                        {f.type === "text" ? (
                          <input
                            value={String(f.value)}
                            onChange={(e) =>
                              setFields((fs) =>
                                fs.map((v, j) =>
                                  i === j ? { ...v, value: e.target.value } : v,
                                ),
                              )
                            }
                          />
                        ) : (
                          <select
                            value={String(f.value)}
                            onChange={(e) =>
                              setFields((fs) =>
                                fs.map((v, j) =>
                                  i === j ? { ...v, value: e.target.value } : v,
                                ),
                              )
                            }
                          >
                            <option value="">Choisir une option</option>
                            {f.options?.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        )}
                      </>
                    )}
                  </label>
                ))}
              </div>
              <div className="modal-actions">
                <button className="btn primary" disabled={busy}>
                  {busy ? <Spinner /> : <Check size={16} />}Enregistrer le
                  formulaire
                </button>
              </div>
            </form>
          ) : (
            <EmptyState
              icon={FormInput}
              title="Aucun champ interactif"
              description="Utilisez l’outil Texte pour remplir visuellement ce document."
            >
              <button
                className="btn primary"
                onClick={() => {
                  setModal(null);
                  setTool("text");
                }}
              >
                Ajouter du texte
              </button>
            </EmptyState>
          )}
        </Modal>
      )}
    </div>
  );
}
function ArrowUpRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M14 4h6v6M20 4 10 14M10 4H4v16h16v-6" />
    </svg>
  );
}
