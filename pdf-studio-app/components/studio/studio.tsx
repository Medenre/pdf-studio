"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  CloudOff,
  Combine,
  Ellipsis,
  FileImage,
  FilePlus2,
  FileStack,
  FileText,
  FolderClosed,
  Grid2X2,
  House,
  LayoutGrid,
  List,
  LockKeyhole,
  Menu,
  PanelTop,
  PenLine,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  cleanName,
  createDocument,
  createSamples,
  documentFromFile,
  downloadBytes,
  exportDocument,
  formatSize,
  readDocuments,
  removeDocument,
  storeDocument,
  uid,
  type StudioDocument,
} from "@/lib/studio";
import { Brand, EmptyState, Modal, PdfThumbnail, Spinner } from "./ui";
import Editor from "./editor";

type View = "home" | "documents" | "starred" | "trash" | "tools";
type Tool = "edit" | "merge" | "organize" | "sign" | "convert";
const tools = [
  {
    id: "edit" as Tool,
    name: "Modifier un PDF",
    description: "Vos idées, directement sur la page",
    icon: PenLine,
    color: "purple",
  },
  {
    id: "merge" as Tool,
    name: "Fusionner des PDF",
    description: "Plusieurs fichiers, un seul document",
    icon: Combine,
    color: "blue",
  },
  {
    id: "organize" as Tool,
    name: "Organiser les pages",
    description: "Réorganisez. Tournez. Simplifiez.",
    icon: FileStack,
    color: "orange",
  },
  {
    id: "sign" as Tool,
    name: "Remplir et signer",
    description: "La touche finale à vos documents",
    icon: PenLine,
    color: "green",
  },
  {
    id: "convert" as Tool,
    name: "Convertir un PDF",
    description: "Passez du PDF à l’image ou au texte",
    icon: FileImage,
    color: "pink",
  },
];
export default function Studio() {
  const [documents, setDocuments] = useState<StudioDocument[]>([]),
    [loaded, setLoaded] = useState(false),
    [storageOk, setStorageOk] = useState(true),
    [view, setView] = useState<View>("home"),
    [active, setActive] = useState<string | null>(null);
  const [search, setSearch] = useState(""),
    [layout, setLayout] = useState("grid"),
    [sort, setSort] = useState("recent"),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState("");
  const [modal, setModal] = useState<
      "new" | "merge" | "help" | "settings" | "pick" | null
    >(null),
    [tool, setTool] = useState<Tool>("edit"),
    [newName, setNewName] = useState("Mon nouveau document"),
    [format, setFormat] = useState("a4");
  const [mergeIds, setMergeIds] = useState<string[]>([]),
    [mergeName, setMergeName] = useState("Documents fusionnés"),
    [drag, setDrag] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [menu, setMenu] = useState<string | null>(null),
    [rename, setRename] = useState<StudioDocument | null>(null);
  const input = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    intent = useRef<Tool | null>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        let docs = await readDocuments();
        if (!docs.length && !localStorage.getItem("pdf-studio-initialized")) {
          docs = await createSamples();
          await Promise.all(docs.map(storeDocument));
          localStorage.setItem("pdf-studio-initialized", "1");
        }
        if (mounted) setDocuments(docs);
      } catch {
        setStorageOk(false);
        notify(
          "Le stockage local est indisponible. Pensez à télécharger vos documents.",
        );
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [notify]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".file-menu-wrap")
      )
        setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const save = useCallback(
    async (doc: StudioDocument) => {
      setDocuments((ds) =>
        ds.some((d) => d.id === doc.id)
          ? ds.map((d) => (d.id === doc.id ? doc : d))
          : [doc, ...ds],
      );
      try {
        await storeDocument(doc);
        setStorageOk(true);
      } catch {
        setStorageOk(false);
        notify(
          "Sauvegarde locale impossible : téléchargez votre PDF pour le conserver.",
        );
      }
    },
    [notify],
  );
  const current = documents.find((d) => d.id === active);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "n" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !current &&
        !modal &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setModal("new");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, modal]);
  const live = documents.filter((d) => !d.trashed);
  const visible = useMemo(
    () =>
      documents
        .filter(
          (d) =>
            (view === "trash" ? d.trashed : !d.trashed) &&
            (view !== "starred" || d.starred) &&
            d.name
              .toLocaleLowerCase("fr")
              .includes(search.toLocaleLowerCase("fr")),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name, "fr")
            : sort === "size"
              ? b.bytes.length - a.bytes.length
              : b.modifiedAt - a.modifiedAt,
        ),
    [documents, view, search, sort],
  );
  async function importFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    setBusy(true);
    const imported: StudioDocument[] = [];
    for (const file of Array.from(files)) {
      try {
        if (!file.name.toLowerCase().endsWith(".pdf"))
          throw new Error("format");
        const doc = await documentFromFile(file);
        await save(doc);
        imported.push(doc);
      } catch {
        notify(
          `Impossible d’ouvrir « ${file.name} ». Vérifiez qu’il s’agit d’un PDF valide et non protégé par mot de passe.`,
        );
      }
    }
    setBusy(false);
    setDrag(false);
    if (imported.length) {
      if (modal === "merge") {
        setMergeIds((ids) => [...ids, ...imported.map((d) => d.id)]);
      } else {
        setActive(imported[0].id);
        if (intent.current) setTool(intent.current);
        setModal(null);
      }
      notify(
        `${imported.length} document${imported.length > 1 ? "s" : ""} importé${imported.length > 1 ? "s" : ""}`,
      );
    }
    intent.current = null;
  }
  async function create() {
    setBusy(true);
    try {
      const doc = await createDocument(newName, format);
      await save(doc);
      setTool("edit");
      setActive(doc.id);
      setModal(null);
      notify("Votre nouveau document est prêt");
    } catch {
      notify("La création du document a échoué.");
    } finally {
      setBusy(false);
    }
  }
  function launchTool(id: Tool) {
    setTool(id);
    if (id === "merge") {
      setMergeIds([]);
      setModal("merge");
    } else setModal("pick");
  }
  async function merge() {
    if (mergeIds.length < 2) return;
    setBusy(true);
    try {
      const pdf = await PDFDocument.create();
      for (const id of mergeIds) {
        const doc = documents.find((d) => d.id === id)!;
        const source = await PDFDocument.load(await exportDocument(doc));
        if (source.getForm().getFields().length) source.getForm().flatten();
        for (const p of await pdf.copyPages(source, source.getPageIndices()))
          pdf.addPage(p);
      }
      const first = await createDocument(mergeName);
      const doc = {
        ...first,
        bytes: await pdf.save(),
        pages: pdf.getPageCount(),
      };
      await save(doc);
      setActive(doc.id);
      setModal(null);
      setTool("organize");
      notify(`${mergeIds.length} documents fusionnés`);
    } catch {
      notify("La fusion a échoué. Vérifiez vos documents.");
    } finally {
      setBusy(false);
    }
  }
  async function imageToPdf(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const pdf = await PDFDocument.create();
      let bytes = new Uint8Array(await file.arrayBuffer());
      let image;
      if (file.type === "image/png") image = await pdf.embedPng(bytes);
      else if (file.type === "image/jpeg") image = await pdf.embedJpg(bytes);
      else {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
        bitmap.close();
        bytes = new Uint8Array(
          await (await fetch(canvas.toDataURL("image/png"))).arrayBuffer(),
        );
        image = await pdf.embedPng(bytes);
      }
      const page = pdf.addPage([595.28, 841.89]);
      const ratio = Math.min(515.28 / image.width, 761.89 / image.height);
      page.drawImage(image, {
        x: (595.28 - image.width * ratio) / 2,
        y: (841.89 - image.height * ratio) / 2,
        width: image.width * ratio,
        height: image.height * ratio,
      });
      const doc = {
        ...(await createDocument(file.name.replace(/\.[^.]+$/, ""))),
        bytes: await pdf.save(),
      };
      await save(doc);
      setActive(doc.id);
      setModal(null);
      setTool("edit");
      notify("Image convertie en PDF");
    } catch {
      notify("Cette image n’a pas pu être convertie.");
    } finally {
      setBusy(false);
    }
  }
  function navigate(v: View) {
    setView(v);
    setSearch("");
    setMobileNav(false);
  }
  const totalSize = live.reduce((n, d) => n + d.bytes.length, 0);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          void importFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          void imageToPdf(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {current ? (
        <Editor
          key={current.id}
          doc={current}
          initialTool={tool}
          storageOk={storageOk}
          onChange={save}
          onClose={() => setActive(null)}
          notify={notify}
        />
      ) : (
        <div className="app-shell">
          {mobileNav && (
            <div className="nav-backdrop" onClick={() => setMobileNav(false)} />
          )}
          <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
            <div className="sidebar-brand">
              <Brand />
              <span className="edition">PERSONNEL</span>
            </div>
            <button
              className="btn primary sidebar-create"
              onClick={() => setModal("new")}
            >
              <Plus size={18} /> Créer un document{" "}
              <span className="keycap">N</span>
            </button>
            <span className="nav-label">VOTRE ESPACE</span>
            <nav>
              {(
                [
                  { id: "home", label: "Vue d’ensemble", icon: House },
                  {
                    id: "documents",
                    label: "Mes documents",
                    icon: FolderClosed,
                  },
                  { id: "starred", label: "Favoris", icon: Star },
                  { id: "trash", label: "Corbeille", icon: Trash2 },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${view === item.id ? "active" : ""}`}
                  onClick={() => navigate(item.id)}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                  {item.id === "documents" && <small>{live.length}</small>}
                  {item.id === "starred" &&
                    live.filter((d) => d.starred).length > 0 && (
                      <small>{live.filter((d) => d.starred).length}</small>
                    )}
                </button>
              ))}
            </nav>
            <div className="nav-divider" />
            <div className="nav-label-row">
              <span className="nav-label">LES ESSENTIELS</span>
              <span className="tiny-pill">5 outils</span>
            </div>
            <nav>
              {tools.slice(0, 4).map((t) => (
                <button
                  className="nav-item"
                  key={t.id}
                  onClick={() => launchTool(t.id)}
                >
                  <t.icon size={18} />
                  <span>
                    {t.id === "edit"
                      ? "Modifier un PDF"
                      : t.id === "merge"
                        ? "Fusionner des PDF"
                        : t.id === "organize"
                          ? "Organiser les pages"
                          : "Remplir et signer"}
                  </span>
                </button>
              ))}
              <button
                className={`nav-item ${view === "tools" ? "active" : ""}`}
                onClick={() => navigate("tools")}
              >
                <LayoutGrid size={18} />
                <span>Tous les outils</span>
                <ArrowUpRight size={14} />
              </button>
            </nav>
            <div className="sidebar-bottom">
              <div className="privacy-card">
                <div className="privacy-icon">
                  <ShieldCheck size={21} />
                </div>
                <h4>Vos documents. Votre espace.</h4>
                <p>
                  Vos fichiers restent sur votre appareil, en toute
                  confidentialité.
                </p>
                <span>
                  <span className="status-dot" /> Stockage local activé
                </span>
              </div>
              <div className="bottom-links">
                <button onClick={() => setModal("help")}>
                  <CircleHelp size={17} /> Aide et raccourcis
                </button>
                <button
                  onClick={() => setModal("settings")}
                  aria-label="Paramètres"
                >
                  <Settings2 size={17} />
                </button>
              </div>
              <div className="sidebar-version">
                PDF Studio <span>Fait pour vos idées.</span>
              </div>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <div className="breadcrumb">
                <button
                  className="icon-btn mobile-menu"
                  aria-label="Ouvrir le menu"
                  onClick={() => setMobileNav(true)}
                >
                  <Menu size={20} />
                </button>
                <PanelTop size={17} />
                <span>Espace personnel</span>
                <ChevronRight size={13} />
                <strong>
                  {view === "home"
                    ? "Vue d’ensemble"
                    : view === "documents"
                      ? "Mes documents"
                      : view === "starred"
                        ? "Favoris"
                        : view === "trash"
                          ? "Corbeille"
                          : "Tous les outils"}
                </strong>
              </div>
              <div className="topbar-right">
                <div className="local-indicator">
                  <span className="status-dot" />{" "}
                  {storageOk
                    ? "Enregistré sur cet appareil"
                    : "Sauvegarde locale indisponible"}
                </div>
                <span className="topbar-divider" />
                <button
                  className="icon-btn"
                  onClick={() => setModal("help")}
                  aria-label="Aide"
                >
                  <CircleHelp size={19} />
                </button>
                <button
                  className="avatar"
                  onClick={() => setModal("settings")}
                  aria-label="Espace personnel"
                >
                  M
                </button>
              </div>
            </header>
            <main className="dashboard">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span /> VOTRE ATELIER NUMÉRIQUE
                  </div>
                  <h1>
                    {view === "home" ? (
                      <>
                        De belles idées.
                        <br className="mobile-break" /> De beaux documents
                        <span>.</span>
                      </>
                    ) : view === "documents" ? (
                      "Tous vos documents."
                    ) : view === "starred" ? (
                      "Gardez l’essentiel à portée de main."
                    ) : view === "trash" ? (
                      "Une seconde chance pour vos fichiers."
                    ) : (
                      "Un outil pour chaque idée."
                    )}
                  </h1>
                  <p>
                    {view === "home"
                      ? "Un espace simple pour créer, modifier et donner vie à vos PDF."
                      : view === "documents"
                        ? `${live.length} documents, réunis dans votre espace personnel.`
                        : view === "starred"
                          ? "Retrouvez ici les documents que vous avez ajoutés aux favoris."
                          : view === "trash"
                            ? "Restaurez vos documents ou supprimez-les définitivement."
                            : "Tout ce qu’il vous faut pour travailler vos PDF, simplement."}
                  </p>
                </div>
                <button
                  className="btn outline heading-action"
                  onClick={() => {
                    intent.current = null;
                    input.current?.click();
                  }}
                >
                  <Upload size={16} /> Importer un PDF
                </button>
              </div>
              {view === "home" && (
                <section
                  className={`upload-hero ${drag ? "dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node))
                      setDrag(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    void importFiles(e.dataTransfer.files);
                  }}
                >
                  <div className="hero-grid" />
                  <div className="hero-content">
                    <div className="hero-tag">
                      <Sparkles size={13} /> PLACE À VOS IDÉES
                    </div>
                    <h2>
                      Votre prochain document
                      <br />
                      commence ici.
                    </h2>
                    <p>
                      Glissez votre PDF dans cet espace.
                      <br />
                      On s’occupe de lui donner de nouvelles possibilités.
                    </p>
                    <div className="hero-actions">
                      <button
                        className="btn primary"
                        onClick={() => {
                          intent.current = null;
                          input.current?.click();
                        }}
                        disabled={busy}
                      >
                        {busy ? <Spinner /> : <Plus size={17} />} Ouvrir un
                        document
                      </button>
                      <span>
                        ou{" "}
                        <button onClick={() => setModal("new")}>
                          partir d’une page blanche <ArrowRight size={13} />
                        </button>
                      </span>
                    </div>
                    <span className="hero-note">
                      <LockKeyhole size={11} /> 100 % sur votre appareil. Vos
                      fichiers restent les vôtres.
                    </span>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <span className="art-orbit orbit-one" />
                    <span className="art-orbit orbit-two" />
                    <span className="art-spark spark-one">✧</span>
                    <span className="art-spark spark-two">+</span>
                    <div className="art-paper back">
                      <div className="art-line" />
                      <div className="art-line short" />
                      <div className="art-square" />
                    </div>
                    <div className="art-paper front">
                      <div className="paper-icon">
                        <FileText size={21} />
                        <span>PDF</span>
                      </div>
                      <div className="art-line" />
                      <div className="art-line" />
                      <div className="art-line short" />
                      <div className="art-chart">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="art-line" />
                      <div className="art-line short" />
                    </div>
                    <span className="art-badge">
                      <Check size={14} />
                    </span>
                    <span className="art-pill">
                      <PenLine size={13} /> À vous de créer
                    </span>
                  </div>
                </section>
              )}
              {(view === "home" || view === "tools") && (
                <section className="tools-section">
                  <div className="section-title">
                    <h2>
                      {view === "home"
                        ? "Les bons outils, au bon endroit"
                        : "Votre boîte à outils"}
                    </h2>
                    {view === "home" && (
                      <button
                        className="text-button"
                        onClick={() => navigate("tools")}
                      >
                        Tous les outils <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                  <div
                    className={`tools-grid ${view === "tools" ? "expanded" : ""}`}
                  >
                    {tools.map((t) => (
                      <button
                        className="tool-card"
                        key={t.id}
                        onClick={() => launchTool(t.id)}
                      >
                        <span className={`tool-icon ${t.color}`}>
                          <t.icon size={21} strokeWidth={1.7} />
                        </span>
                        <ArrowUpRight className="tool-arrow" size={15} />
                        <h3>{t.name}</h3>
                        <p>{t.description}</p>
                      </button>
                    ))}
                    {view === "tools" && (
                      <button
                        className="tool-card"
                        onClick={() => imageInput.current?.click()}
                      >
                        <span className="tool-icon blue">
                          <FilePlus2 size={21} />
                        </span>
                        <ArrowUpRight className="tool-arrow" size={15} />
                        <h3>Image vers PDF</h3>
                        <p>Transformez une image en document A4</p>
                      </button>
                    )}
                  </div>
                </section>
              )}
              {view !== "tools" && (
                <section className="documents-section">
                  <div className="section-title">
                    <div className="section-title-with-count">
                      <h2>
                        {view === "home"
                          ? "Vos derniers documents"
                          : view === "starred"
                            ? "Vos favoris"
                            : view === "trash"
                              ? "Documents supprimés"
                              : "Votre bibliothèque"}
                      </h2>
                      <span className="count-badge">{visible.length}</span>
                    </div>
                    {view === "home" && (
                      <button
                        className="text-button"
                        onClick={() => navigate("documents")}
                      >
                        Tout voir <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                  <div className="document-toolbar">
                    <div className="document-tabs">
                      <button
                        className="selected"
                        onClick={() => {
                          if (view === "home") setSort("recent");
                        }}
                      >
                        <Clock3 size={14} />
                        {view === "home" ? "Récents" : "Tous les fichiers"}
                      </button>
                      {view === "home" && (
                        <button onClick={() => navigate("starred")}>
                          <Star size={14} />
                          Favoris
                        </button>
                      )}
                    </div>
                    <div className="document-controls">
                      <div className="search-box">
                        <Search size={15} />
                        <input
                          aria-label="Rechercher un document"
                          placeholder="Rechercher un document…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                          <button
                            className="icon-btn"
                            onClick={() => setSearch("")}
                            aria-label="Effacer la recherche"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                        aria-label="Trier les documents"
                      >
                        <option value="recent">Dernière modification</option>
                        <option value="name">Nom du document</option>
                        <option value="size">Taille du fichier</option>
                      </select>
                      <div className="view-toggle">
                        <button
                          className={layout === "grid" ? "selected" : ""}
                          onClick={() => setLayout("grid")}
                          aria-label="Vue en grille"
                        >
                          <Grid2X2 size={16} />
                        </button>
                        <button
                          className={layout === "list" ? "selected" : ""}
                          onClick={() => setLayout("list")}
                          aria-label="Vue en liste"
                        >
                          <List size={17} />
                        </button>
                      </div>
                    </div>
                  </div>
                  {!loaded ? (
                    <div className="loading-docs">
                      <Spinner />
                      <span>Votre atelier se prépare…</span>
                    </div>
                  ) : !visible.length ? (
                    <EmptyState
                      icon={
                        view === "trash"
                          ? Trash2
                          : view === "starred"
                            ? Star
                            : FileText
                      }
                      title={
                        search
                          ? "Aucun document trouvé"
                          : view === "trash"
                            ? "Votre corbeille est vide"
                            : view === "starred"
                              ? "Une place pour vos favoris"
                              : "Votre première page vous attend"
                      }
                      description={
                        search
                          ? "Essayez un autre nom de document."
                          : view === "starred"
                            ? "Cliquez sur l’étoile d’un document pour le retrouver ici."
                            : view === "trash"
                              ? "Les documents supprimés apparaîtront ici."
                              : "Importez un PDF ou créez un document pour commencer."
                      }
                    >
                      {!search && view !== "trash" && view !== "starred" && (
                        <button
                          className="btn primary"
                          onClick={() => input.current?.click()}
                        >
                          <Plus size={16} />
                          Importer un PDF
                        </button>
                      )}
                    </EmptyState>
                  ) : (
                    <div
                      className={`document-grid ${layout === "list" ? "list-view" : ""}`}
                    >
                      {visible
                        .slice(0, view === "home" ? 6 : undefined)
                        .map((doc) => (
                          <article className="document-card" key={doc.id}>
                            <button
                              className={`document-cover cover-${doc.cover}`}
                              onClick={() => {
                                if (view !== "trash") {
                                  setActive(doc.id);
                                  setTool("edit");
                                }
                              }}
                              aria-label={`Ouvrir ${doc.name}`}
                              disabled={view === "trash"}
                            >
                              <PdfThumbnail doc={doc} />
                              <span className="pdf-label">PDF</span>
                              <span className="cover-open">
                                Ouvrir le document <ArrowUpRight size={15} />
                              </span>
                            </button>
                            <div className="document-info">
                              <div className="file-title">
                                <span className="file-type">
                                  <FileText size={17} />
                                </span>
                                <button
                                  onClick={() => {
                                    if (view !== "trash") {
                                      setTool("edit");
                                      setActive(doc.id);
                                    }
                                  }}
                                  title={doc.name}
                                >
                                  {doc.name}
                                </button>
                                <div className="file-menu-wrap">
                                  <button
                                    className="icon-btn"
                                    aria-label={`Options pour ${doc.name}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMenu(menu === doc.id ? null : doc.id);
                                    }}
                                  >
                                    <Ellipsis size={18} />
                                  </button>
                                  {menu === doc.id && (
                                    <div
                                      className="dropdown-menu"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {doc.trashed ? (
                                        <>
                                          <button
                                            onClick={() => {
                                              void save({
                                                ...doc,
                                                trashed: false,
                                              });
                                              setMenu(null);
                                              notify("Document restauré");
                                            }}
                                          >
                                            <ArrowUpRight size={15} />
                                            Restaurer
                                          </button>
                                          <button
                                            className="danger-text"
                                            onClick={() => {
                                              void removeDocument(doc.id)
                                                .then(() => {
                                                  setDocuments((ds) =>
                                                    ds.filter(
                                                      (d) => d.id !== doc.id,
                                                    ),
                                                  );
                                                  notify(
                                                    "Document supprimé définitivement",
                                                  );
                                                })
                                                .catch(() =>
                                                  notify(
                                                    "Suppression impossible.",
                                                  ),
                                                );
                                              setMenu(null);
                                            }}
                                          >
                                            <Trash2 size={15} />
                                            Supprimer définitivement
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => {
                                              setRename(doc);
                                              setMenu(null);
                                            }}
                                          >
                                            <PenLine size={15} />
                                            Renommer
                                          </button>
                                          <button
                                            onClick={() => {
                                              setMenu(null);
                                              void exportDocument(doc)
                                                .then((b) =>
                                                  downloadBytes(b, doc.name),
                                                )
                                                .catch(() =>
                                                  notify(
                                                    "Le téléchargement a échoué.",
                                                  ),
                                                );
                                            }}
                                          >
                                            <ArrowDownToLine size={15} />
                                            Télécharger
                                          </button>
                                          <button
                                            onClick={() => {
                                              void save({
                                                ...doc,
                                                id: uid(),
                                                name: `${cleanName(doc.name)} — copie.pdf`,
                                                modifiedAt: Date.now(),
                                              });
                                              setMenu(null);
                                              notify("Document dupliqué");
                                            }}
                                          >
                                            <FileStack size={15} />
                                            Dupliquer
                                          </button>
                                          <div className="menu-separator" />
                                          <button
                                            className="danger-text"
                                            onClick={() => {
                                              void save({
                                                ...doc,
                                                trashed: true,
                                              });
                                              setMenu(null);
                                              notify(
                                                "Document déplacé dans la corbeille",
                                              );
                                            }}
                                          >
                                            <Trash2 size={15} />
                                            Mettre à la corbeille
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="file-meta">
                                <span>
                                  {doc.pages} page{doc.pages > 1 ? "s" : ""}
                                  <i />
                                  {formatSize(doc.bytes.length)}
                                </span>
                                <button
                                  className={`star-btn ${doc.starred ? "is-starred" : ""}`}
                                  onClick={() =>
                                    void save({ ...doc, starred: !doc.starred })
                                  }
                                  aria-label={
                                    doc.starred
                                      ? "Retirer des favoris"
                                      : "Ajouter aux favoris"
                                  }
                                >
                                  <Star
                                    size={15}
                                    fill={doc.starred ? "currentColor" : "none"}
                                  />
                                </button>
                              </div>
                              <div className="file-date">
                                <Clock3 size={11} />
                                {Date.now() - doc.modifiedAt < 86400000
                                  ? "Modifié aujourd’hui"
                                  : `Modifié le ${new Date(doc.modifiedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
                              </div>
                            </div>
                          </article>
                        ))}
                    </div>
                  )}
                </section>
              )}
              <footer className="dashboard-footer">
                <span>
                  <ShieldCheck size={14} /> Un atelier privé. Des possibilités
                  infinies.
                </span>
                <span>
                  Créé avec soin, pour créer en toute simplicité.
                  <span className="footer-flower">✳</span>
                </span>
              </footer>
            </main>
          </div>
        </div>
      )}
      {modal === "new" && (
        <Modal
          title="Une nouvelle page commence."
          subtitle="Choisissez un nom et un format. Le reste vous appartient."
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label className="field-label">
              Nom du document
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                maxLength={150}
              />
            </label>
            <label className="field-label">
              Format de la page
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="a4">A4 portrait — 210 × 297 mm</option>
                <option value="landscape">A4 paysage — 297 × 210 mm</option>
                <option value="letter">Lettre — 216 × 279 mm</option>
              </select>
            </label>
            <div className="new-page-preview">
              <div
                className={`blank-page ${format === "landscape" ? "landscape" : ""}`}
              >
                <Plus size={20} />
              </div>
              <span>
                Une page blanche.
                <br />
                Toutes vos possibilités.
              </span>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn outline"
                onClick={() => {
                  setModal(null);
                  imageInput.current?.click();
                }}
              >
                <FileImage size={16} />À partir d’une image
              </button>
              <button
                className="btn primary"
                disabled={busy || !newName.trim()}
              >
                {busy ? <Spinner /> : <Plus size={16} />}Créer mon PDF
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "pick" && (
        <Modal
          title={
            tools.find((t) => t.id === tool)?.name || "Choisir un document"
          }
          subtitle="Ouvrez un PDF de votre atelier ou importez-en un nouveau."
          onClose={() => setModal(null)}
        >
          <button
            className="import-choice"
            onClick={() => {
              intent.current = tool;
              input.current?.click();
            }}
          >
            <Upload size={23} />
            <strong>Importer un PDF</strong>
            <span>Parcourir les fichiers de votre appareil</span>
            <Plus size={19} />
          </button>
          <div className="pick-list">
            {live.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setActive(d.id);
                  setModal(null);
                }}
              >
                <span className="file-type">
                  <FileText size={19} />
                </span>
                <span>
                  <strong>{d.name}</strong>
                  <small>
                    {d.pages} pages · {formatSize(d.bytes.length)}
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
            {!live.length && (
              <p>Aucun document dans votre atelier pour le moment.</p>
            )}
          </div>
        </Modal>
      )}
      {modal === "merge" && (
        <Modal
          title="Ensemble, c’est encore mieux."
          subtitle="Sélectionnez au moins deux PDF, dans l’ordre de votre choix."
          onClose={() => setModal(null)}
        >
          <label className="field-label">
            Nom du fichier final
            <input
              value={mergeName}
              onChange={(e) => setMergeName(e.target.value)}
            />
          </label>
          <div className="merge-list">
            {live.map((d) => (
              <button
                key={d.id}
                className={mergeIds.includes(d.id) ? "selected" : ""}
                onClick={() =>
                  setMergeIds((ids) =>
                    ids.includes(d.id)
                      ? ids.filter((id) => id !== d.id)
                      : [...ids, d.id],
                  )
                }
              >
                <span className="merge-check">
                  {mergeIds.includes(d.id) ? (
                    mergeIds.indexOf(d.id) + 1
                  ) : (
                    <Plus size={14} />
                  )}
                </span>
                <FileText size={18} />
                <span>
                  {d.name}
                  <small>{d.pages} pages</small>
                </span>
                {mergeIds.includes(d.id) && <Check size={17} />}
              </button>
            ))}
          </div>
          <button
            className="text-button"
            onClick={() => input.current?.click()}
          >
            <Upload size={15} />
            Importer d’autres PDF
          </button>
          <div className="modal-actions">
            <span className="muted">
              {mergeIds.length} fichiers sélectionnés
            </span>
            <button
              className="btn primary"
              disabled={mergeIds.length < 2 || busy}
              onClick={() => void merge()}
            >
              {busy ? <Spinner /> : <Combine size={16} />}Fusionner les PDF
            </button>
          </div>
          <p className="form-note">
            Les pages sont réunies dans un nouveau document. Les champs de
            formulaire deviennent des pages statiques.
          </p>
        </Modal>
      )}
      {rename && (
        <Modal title="Un nouveau nom." onClose={() => setRename(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save({ ...rename, name: `${cleanName(rename.name)}.pdf` });
              setRename(null);
              notify("Document renommé");
            }}
          >
            <label className="field-label">
              Nom du document
              <input
                autoFocus
                value={cleanName(rename.name)}
                required
                onChange={(e) => setRename({ ...rename, name: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button className="btn primary">Enregistrer</button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="Votre atelier, en quelques gestes."
          subtitle="Tout ce qu’il faut pour bien commencer."
          onClose={() => setModal(null)}
        >
          <div className="help-content">
            <div>
              <Upload />
              <span>
                <strong>Ouvrir et créer</strong>
                <p>
                  Glissez un PDF dans l’accueil, ou commencez avec une page
                  blanche. Les trois documents d’exemple sont là pour essayer.
                </p>
              </span>
            </div>
            <div>
              <PenLine />
              <span>
                <strong>Ajouter votre touche</strong>
                <p>
                  Dans le lecteur, choisissez un outil puis cliquez sur la page.
                  Texte, surlignage, dessin, image et signature sont intégrés au
                  PDF téléchargé.
                </p>
              </span>
            </div>
            <div>
              <FileStack />
              <span>
                <strong>Organiser vos documents</strong>
                <p>
                  Ajoutez, tournez, dupliquez et déplacez vos pages. Extrayez
                  une page ou fusionnez plusieurs PDF.
                </p>
              </span>
            </div>
            <div>
              <LockKeyhole />
              <span>
                <strong>Un espace privé</strong>
                <p>
                  Les fichiers sont conservés dans ce navigateur. Téléchargez
                  vos PDF pour les garder si vous effacez ses données ou changez
                  d’appareil.
                </p>
              </span>
            </div>
            <div className="shortcut-row">
              <kbd>Ctrl / ⌘ + S</kbd>
              <span>Télécharger le PDF</span>
            </div>
            <div className="shortcut-row">
              <kbd>Ctrl / ⌘ + Z</kbd>
              <span>Annuler la dernière modification</span>
            </div>
            <p className="form-note">
              L’atelier ajoute du contenu aux pages et remplit les formulaires
              existants. La réécriture du texte original, l’OCR et les
              signatures avec certificat ne sont pas disponibles.
            </p>
          </div>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal
          title="Votre espace personnel."
          subtitle="Un atelier léger, qui vous appartient."
          onClose={() => setModal(null)}
        >
          <div className="settings-profile">
            <span className="avatar">M</span>
            <div>
              <strong>Espace personnel</strong>
              <p>Stockage sur cet appareil</p>
            </div>
            <span className="local-badge">Local</span>
          </div>
          <div className="storage-details">
            <span>
              Documents enregistrés<strong>{live.length} fichiers</strong>
            </span>
            <span>
              Espace utilisé<strong>{formatSize(totalSize)}</strong>
            </span>
            <span>
              Confidentialité
              <strong>
                <ShieldCheck size={14} /> Traitement local
              </strong>
            </span>
          </div>
          <p className="settings-note">
            <CloudOff size={20} />
            Les PDF ne sont pas envoyés à un serveur. Cet espace est propre à
            votre navigateur ; les téléchargements sont vos copies de
            sauvegarde.
          </p>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={15} />
          </span>
          {toast}
          <button
            aria-label="Fermer la notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
