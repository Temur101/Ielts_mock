import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure worker src if not already set
if (typeof window !== 'undefined' && pdfjsLib?.GlobalWorkerOptions) {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  }
}

// In-memory cache for rendered data URLs
const pageImageCache = new Map();

/**
 * Renders specified pages of a PDF to base64 PNG data URLs at specified scale (default 2x for retina crispness).
 * @param {string|File|Blob|ArrayBuffer|Uint8Array} source - PDF source URL, File, Blob, or Buffer
 * @param {number[]} pageNumbers - Array of 1-based page numbers to render
 * @param {number} scale - Viewport scale factor (default: 2.0 for sharp text)
 * @returns {Promise<Record<number, string>>} Object mapping page number to data URL
 */
export async function renderPdfPagesToDataUrls(source, pageNumbers = [1, 2], scale = 2.0) {
  if (!source) return {};

  const cacheKey = typeof source === 'string' 
    ? `${source}_scale_${scale}` 
    : (source && source.name ? `${source.name}_${source.size}_scale_${scale}` : null);

  if (cacheKey && pageImageCache.has(cacheKey)) {
    const cached = pageImageCache.get(cacheKey);
    const hasAll = pageNumbers.every(p => cached[p]);
    if (hasAll) {
      return cached;
    }
  }

  try {
    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    }

    let loadingTask;

    if (typeof source === 'string') {
      if (source.startsWith('data:application/pdf;base64,')) {
        const base64Data = source.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        loadingTask = pdfjsLib.getDocument({
          data: bytes,
          useSystemFonts: true,
          isEvalSupported: false,
        });
      } else {
        // Fetch ArrayBuffer first to avoid CORS or streaming issues with external URLs
        try {
          const resp = await fetch(source);
          if (resp.ok) {
            const arrayBuf = await resp.arrayBuffer();
            loadingTask = pdfjsLib.getDocument({
              data: new Uint8Array(arrayBuf),
              useSystemFonts: true,
              isEvalSupported: false,
            });
          } else {
            loadingTask = pdfjsLib.getDocument({
              url: source,
              useSystemFonts: true,
              isEvalSupported: false,
            });
          }
        } catch {
          loadingTask = pdfjsLib.getDocument({
            url: source,
            useSystemFonts: true,
            isEvalSupported: false,
          });
        }
      }
    } else if (source instanceof File || source instanceof Blob) {
      const arrayBuf = await source.arrayBuffer();
      loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuf),
        useSystemFonts: true,
        isEvalSupported: false,
      });
    } else if (source instanceof ArrayBuffer) {
      loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(source),
        useSystemFonts: true,
        isEvalSupported: false,
      });
    } else if (source instanceof Uint8Array) {
      loadingTask = pdfjsLib.getDocument({
        data: source,
        useSystemFonts: true,
        isEvalSupported: false,
      });
    } else {
      console.warn('[pdfRenderer] Unsupported PDF source:', source);
      return {};
    }

    const pdf = await loadingTask.promise;
    const results = {};

    for (const pageNum of pageNumbers) {
      if (pageNum < 1 || pageNum > pdf.numPages) continue;

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const context = canvas.getContext('2d', { alpha: false });
      if (!context) continue;

      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
      results[pageNum] = canvas.toDataURL('image/png');
    }

    if (cacheKey) {
      pageImageCache.set(cacheKey, {
        ...(pageImageCache.get(cacheKey) || {}),
        ...results,
      });
    }

    return results;
  } catch (err) {
    console.error('[pdfRenderer] Error rendering PDF to canvas:', err);
    return {};
  }
}
