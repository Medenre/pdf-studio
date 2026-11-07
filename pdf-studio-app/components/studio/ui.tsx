"use client";
import { useEffect, useRef } from "react";
import { X, FileText, LoaderCircle } from "lucide-react";
import {
  acquireThumbnailPreview,
  loadPreview,
  paintMark,
  type StudioDocument,
} from "@/lib/studio";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-icon">
        <FileText size={23} strokeWidth={1.8} />
      </span>
      {!compact && (
        <span>
          pdf<span className="brand-light">studio</span>
          <span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
export function Spinner() {
  return <LoaderCircle className="spin" size={20} />;
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      className={`modal ${wide ? "wide" : ""}`}
      ref={dialog}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fermer">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function PdfThumbnail({
  doc,
  page = 0,
}: {
  doc: StudioDocument;
  page?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let gone = false;
    const acquired = acquireThumbnailPreview(doc.bytes);
    if (canvas.current) delete canvas.current.dataset.ready;
    let loaded: Awaited<ReturnType<typeof loadPreview>> | undefined;
    let task: { cancel: () => void } | undefined;
    (async () => {
      try {
        loaded = await acquired.promise;
        if (gone) return;
        const pdfPage = await loaded.getPage(page + 1);
        const viewport = pdfPage.getViewport({
          scale: 220 / pdfPage.getViewport({ scale: 1 }).width,
        });
        const el = canvas.current;
        if (!el || gone) return;
        el.width = viewport.width;
        el.height = viewport.height;
        const ctx = el.getContext("2d")!;
        const render = pdfPage.render({
          canvas: el,
          canvasContext: ctx,
          viewport,
        });
        task = render;
        await render.promise;
        if (!gone) {
          ctx.save();
          ctx.scale(viewport.scale, viewport.scale);
          for (const m of doc.marks.filter((x) => x.page === page))
            await paintMark(
              ctx,
              m,
              viewport.width / viewport.scale,
              viewport.height / viewport.scale,
            );
          ctx.restore();
          el.dataset.ready = "true";
        }
      } catch (e) {
        if (!gone) console.warn("Aperçu indisponible", e);
      }
    })();
    return () => {
      gone = true;
      task?.cancel();
      acquired.release();
    };
  }, [doc.bytes, doc.marks, page]);
  return (
    <canvas
      ref={canvas}
      width={220}
      height={311}
      className="pdf-thumbnail"
      aria-label={`Aperçu de ${doc.name}, page ${page + 1}`}
    />
  );
}
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={28} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
