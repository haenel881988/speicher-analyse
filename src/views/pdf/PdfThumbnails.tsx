import { useRef, useEffect } from 'react';

export function BookmarkTree({ bookmarks, onNavigate }: { bookmarks: any[]; onNavigate: (page: number | null) => void }) {
  return (
    <ul className="pdf-bookmark-list">
      {bookmarks.map((bm, i) => (
        <li key={i}>
          <button type="button" className="pdf-bookmark-item" onClick={() => onNavigate(bm.page)} title={bm.page !== null ? `Seite ${bm.page + 1}` : ''}>
            {bm.title || '(Ohne Titel)'}
          </button>
          {bm.children && bm.children.length > 0 && (
            <BookmarkTree bookmarks={bm.children} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function ThumbCanvas({ pdfDoc, pageNum }: { pdfDoc: any; pageNum: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;
      const vp = page.getViewport({ scale: 0.2 });
      const canvas = canvasRef.current!;
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);
  return <canvas ref={canvasRef} className="pdf-thumb-canvas" />;
}
