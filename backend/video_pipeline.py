import os
import shutil
import subprocess
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np
from rq import get_current_job

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "jobs")
MAX_WIDTH = 1280

def _update_job_meta(job, status: Optional[str] = None, progress: Optional[int] = None,
                     error: Optional[str] = None, result_path: Optional[str] = None) -> None:
    if job is None:
        return
    meta = job.meta or {}
    if status is not None: meta["status"] = status
    if progress is not None: meta["progress"] = int(progress)
    if error is not None: meta["error"] = error
    if result_path is not None: meta["result_path"] = result_path
    job.meta = meta
    job.save_meta()

def _ensure_ffmpeg_available() -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is required but was not found on PATH.")

def _apply_sepia(frame_bgr: np.ndarray) -> np.ndarray:
    frame = frame_bgr.astype(np.float32)
    sepia_matrix = np.array(
        [[0.131, 0.534, 0.272], [0.168, 0.686, 0.349], [0.189, 0.769, 0.393]],
        dtype=np.float32,
    )
    sepia = frame @ sepia_matrix.T
    return np.clip(sepia, 0, 255).astype(np.uint8)

def _effect_background(frame_bgr: np.ndarray, effect_id: str) -> np.ndarray:
    if effect_id == "bg_grayscale":
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    if effect_id == "bg_sepia":
        return _apply_sepia(frame_bgr)
    if effect_id == "bg_blur":
        return cv2.GaussianBlur(frame_bgr, (0, 0), sigmaX=18)
    return frame_bgr

def process_video_job(job_id: str, input_path: str, effect_id: str) -> str:
    job = get_current_job()
    output_dir = os.path.join(DATA_DIR, job_id)
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "output.mp4")

    _update_job_meta(job, status="running", progress=5)
    _ensure_ffmpeg_available()

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError("Unable to open input video.")

    # Video Metadata
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Scaling Logic
    scale = 1.0
    if width > MAX_WIDTH:
        scale = MAX_WIDTH / float(width)
        width = int(width * scale)
        height = int(height * scale)

    # Initialize MediaPipe
    selfie = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)

    # --- FFmpeg Streaming Setup (video pipe + source audio) ---
    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{width}x{height}",
        "-pix_fmt", "bgr24",
        "-r", str(fps),
        "-i", "-",
        "-i", input_path,
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-shortest",
        "-loglevel", "error",
        output_path,
    ]

    # Open the process
    process = subprocess.Popen(
        ffmpeg_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    _update_job_meta(job, status="running", progress=15)
    frame_index = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if scale != 1.0:
                frame = cv2.resize(frame, (width, height))

            # Segmentation
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = selfie.process(rgb)
            mask = results.segmentation_mask
            
            if mask is None:
                mask = np.zeros((height, width), dtype=np.float32)
            elif mask.shape[:2] != (height, width):
                mask = cv2.resize(mask, (width, height))

            mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=2.0)
            mask = np.clip(mask, 0.0, 1.0)[:, :, None]

            # Apply Effects
            if effect_id == "none":
                output_frame = frame
            else:
                background = _effect_background(frame, effect_id)
                output_frame = (frame * mask + background * (1.0 - mask)).astype(np.uint8)

            # --- STREAM TO FFMPEG ---
            # Pipe the raw bytes of the frame directly to FFmpeg's stdin
            try:
                process.stdin.write(output_frame.tobytes())
            except BrokenPipeError:
                stderr = process.stderr.read().decode("utf-8", errors="ignore")
                raise RuntimeError(stderr or "FFmpeg pipe closed unexpectedly.")

            # Progress Reporting
            frame_index += 1
            if total_frames > 0 and frame_index % 30 == 0:
                progress = 15 + int(80 * (frame_index / float(total_frames)))
                _update_job_meta(job, status="running", progress=min(95, progress))

        # Close the pipe and wait for FFmpeg to wrap up the file
        process.stdin.close()
        return_code = process.wait(timeout=60)

        if return_code != 0:
            stderr = process.stderr.read().decode("utf-8", errors="ignore")
            raise RuntimeError(stderr or f"FFmpeg exited with error code {return_code}")

        _update_job_meta(job, status="done", progress=100, result_path=output_path)
        return output_path

    except Exception as exc:
        if 'process' in locals() and process.poll() is None:
            process.kill() # Ensure FFmpeg isn't left as a zombie
        _update_job_meta(job, status="failed", progress=100, error=str(exc))
        raise
    finally:
        cap.release()
        selfie.close()
