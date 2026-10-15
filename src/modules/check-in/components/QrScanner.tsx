"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";
import jsQR from "jsqr";

interface QrScannerProps {
  /** Called once per analysed camera frame: the decoded text, or `null` when no QR was read. */
  onDecode: (text: string | null) => void;
}

type ScannerProblem = "insecure" | "no-camera" | "denied" | "failed";

const PROBLEM_MESSAGES: Record<ScannerProblem, string> = {
  insecure: "La cámara solo funciona en una conexión segura (HTTPS). Usa el ingreso manual.",
  "no-camera": "No encontramos una cámara en este dispositivo. Usa el ingreso manual.",
  denied: "Permiso de cámara denegado. Habilítalo en el navegador o usa el ingreso manual.",
  failed: "No pudimos iniciar la cámara. Usa el ingreso manual.",
};

/** Frames are analysed this far apart (about 8 per second), enough to catch a QR without draining the battery. */
const DECODE_INTERVAL_MS = 125;
/** The frame is downscaled to this width before decoding: jsQR cost grows with the pixel count. */
const MAX_DECODE_WIDTH = 640;

/** Client-only (reads `window`), so the lazy `ssr: false` import is what keeps it off the server. */
function detectUnsupported(): ScannerProblem | null {
  if (!window.isSecureContext) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia) return "no-camera";
  return null;
}

function toProblem(error: unknown): ScannerProblem {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-camera";
  return "failed";
}

/**
 * Rear-camera QR reader: opens the camera on mount, decodes frames with jsQR
 * and reports each one through `onDecode`. Closes the camera on unmount.
 */
export function QrScanner({ onDecode }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDecodeRef = useRef(onDecode);
  const [unsupported] = useState(detectUnsupported);
  const [startError, setStartError] = useState<ScannerProblem | null>(null);
  const problem = unsupported ?? startError;

  useEffect(() => {
    onDecodeRef.current = onDecode;
  });

  useEffect(() => {
    const element = videoRef.current;
    if (unsupported || !element) return;
    const video: HTMLVideoElement = element; // narrowed copy for the closures below

    let cancelled = false;
    let frameId = 0;
    let stream: MediaStream | undefined;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let lastDecodeAt = 0;

    function tick(now: number) {
      if (cancelled) return;
      frameId = requestAnimationFrame(tick);

      if (!context || now - lastDecodeAt < DECODE_INTERVAL_MS) return;
      if (video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0) return;
      lastDecodeAt = now;

      const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
      onDecodeRef.current(code?.data ?? null);
    }

    async function start() {
      try {
        const opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        // Unmounted (or StrictMode re-ran the effect) while the permission prompt was open.
        if (cancelled) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;
        video.srcObject = opened;
        await video.play();
        if (!cancelled) frameId = requestAnimationFrame(tick);
      } catch (error) {
        // `play()` is interrupted with an AbortError when the element goes away: not a camera problem.
        if (!cancelled) setStartError(toProblem(error));
      }
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }, [unsupported]);

  if (problem) {
    return (
      <div
        role="alert"
        className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-[20px] border border-border bg-muted p-6 text-center text-sm text-muted-foreground"
      >
        <CameraOff className="size-8" aria-hidden="true" />
        {PROBLEM_MESSAGES[problem]}
      </div>
    );
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[20px] bg-black">
      <video ref={videoRef} muted playsInline aria-label="Vista de la cámara" className="size-full object-cover" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[18%] rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
      />
    </div>
  );
}
