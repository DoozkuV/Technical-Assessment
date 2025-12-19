import { useEffect, useMemo, useRef, useState } from 'react';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';

const SEG_BASE_WIDTH = 320;
const MASK_BLUR_PX = 12;

type MaskState = {
  canvas: HTMLCanvasElement | null;
  updatedAt: number;
};

type SegmentationStatus = {
  ready: boolean;
  error: string | null;
};

type UsePreviewSegmentationArgs = {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  effectId: string;
  enabled: boolean;
};

const isFirefox = () => /firefox/i.test(navigator.userAgent);

export function usePreviewSegmentation({
  videoRef,
  canvasRef,
  effectId,
  enabled,
}: UsePreviewSegmentationArgs): SegmentationStatus {
  const segRef = useRef<SelfieSegmentation | null>(null);
  const rafRef = useRef<number | null>(null);
  const segBusyRef = useRef(false);
  const segFailedRef = useRef(false);
  const maskRef = useRef<MaskState>({ canvas: null, updatedAt: 0 });

  const filteredCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const personCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const maskFeatherRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const segInputRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  const [status, setStatus] = useState<SegmentationStatus>({ ready: false, error: null });

  const filterCss = useMemo(() => {
    const map: Record<string, string> = {
      none: 'none',
      bg_grayscale: 'grayscale(1)',
      bg_sepia: 'sepia(1)',
      bg_blur: `blur(${MASK_BLUR_PX}px)`,
    };
    return map[effectId] ?? 'none';
  }, [effectId]);

  useEffect(() => {
    let cancelled = false;
    const segmentation = new SelfieSegmentation({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });
    segmentation.setOptions({ modelSelection: 1 });
    segmentation.onResults((results) => {
      if (cancelled) {
        return;
      }
      maskRef.current = {
        canvas: results.segmentationMask as HTMLCanvasElement,
        updatedAt: performance.now(),
      };
      segBusyRef.current = false;
      segFailedRef.current = false;
      setStatus({ ready: true, error: null });
    });
    segmentation
      .initialize()
      .catch((err) => {
        console.error('Segmentation init failed', err);
        setStatus({ ready: false, error: 'Failed to load segmentation model.' });
      });
    segRef.current = segmentation;
    return () => {
      cancelled = true;
      segmentation.close();
      segRef.current = null;
    };
  }, []);

  useEffect(() => {
    const videoEl = videoRef.current;
    const outputCanvas = canvasRef.current;
    if (!videoEl || !outputCanvas) {
      return;
    }

    const filteredCanvas = filteredCanvasRef.current;
    const personCanvas = personCanvasRef.current;
    const maskFeatherCanvas = maskFeatherRef.current;
    const segInputCanvas = segInputRef.current;

    const filteredCtx = filteredCanvas.getContext('2d');
    const personCtx = personCanvas.getContext('2d');
    const outputCtx = outputCanvas.getContext('2d');
    const maskFeatherCtx = maskFeatherCanvas.getContext('2d');
    const segInputCtx = segInputCanvas.getContext('2d');

    if (!filteredCtx || !personCtx || !outputCtx || !maskFeatherCtx || !segInputCtx) {
      setStatus({ ready: false, error: 'Canvas rendering is not supported.' });
      return;
    }

    let lastWidth = 0;
    let lastHeight = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (!enabled) {
        outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        return;
      }
      if (isFirefox() && videoEl.currentSrc?.endsWith('.webm')) {
        setStatus({
          ready: false,
          error: 'Preview not available for WebM on Firefox.',
        });
        return;
      }
      if (!videoEl.videoWidth || !videoEl.videoHeight) {
        return;
      }

      const w = videoEl.videoWidth;
      const h = videoEl.videoHeight;

      if (w !== lastWidth || h !== lastHeight) {
        [outputCanvas, filteredCanvas, personCanvas, maskFeatherCanvas].forEach((c) => {
          c.width = w;
          c.height = h;
        });
        const segWidth = Math.min(SEG_BASE_WIDTH, w);
        const segHeight = Math.round((h / w) * segWidth);
        segInputCanvas.width = segWidth;
        segInputCanvas.height = segHeight;
        lastWidth = w;
        lastHeight = h;
      }

      try {
        filteredCtx.clearRect(0, 0, w, h);
        filteredCtx.filter = filterCss;
        filteredCtx.drawImage(videoEl, 0, 0, w, h);
        filteredCtx.filter = 'none';

        personCtx.clearRect(0, 0, w, h);
        personCtx.drawImage(videoEl, 0, 0, w, h);
      } catch (err) {
        setStatus({
          ready: false,
          error: 'Preview blocked by browser security (CORS).',
        });
        return;
      }

      if (maskRef.current.canvas) {
        maskFeatherCtx.clearRect(0, 0, w, h);
        maskFeatherCtx.filter = `blur(${MASK_BLUR_PX}px)`;
        maskFeatherCtx.drawImage(maskRef.current.canvas, 0, 0, w, h);
        maskFeatherCtx.filter = 'none';

        personCtx.globalCompositeOperation = 'destination-in';
        personCtx.drawImage(maskFeatherCanvas, 0, 0, w, h);
        personCtx.globalCompositeOperation = 'source-over';
      }

      outputCtx.clearRect(0, 0, w, h);
      outputCtx.drawImage(filteredCanvas, 0, 0, w, h);

      if (maskRef.current.canvas) {
        outputCtx.globalCompositeOperation = 'destination-out';
        outputCtx.drawImage(maskFeatherCanvas, 0, 0, w, h);
        outputCtx.globalCompositeOperation = 'source-over';
      }

      outputCtx.drawImage(personCanvas, 0, 0, w, h);

      if (!segBusyRef.current && segRef.current && !segFailedRef.current) {
        segBusyRef.current = true;
        segInputCtx.drawImage(videoEl, 0, 0, segInputCanvas.width, segInputCanvas.height);
        segRef.current
          .send({ image: segInputCanvas })
          .catch((err) => {
            console.error('Segmentation error', err);
            segBusyRef.current = false;
            segFailedRef.current = true;
            setStatus({
              ready: false,
              error: 'Segmentation failed for this source.',
            });
          });
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [canvasRef, enabled, filterCss, videoRef]);

  return status;
}
