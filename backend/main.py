import os
import uuid
import logging

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from redis import Redis
from rq import Queue
from werkzeug.utils import secure_filename

from video_pipeline import process_video_job

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "jobs")
os.makedirs(DATA_DIR, exist_ok=True)

EFFECTS = [
    {
        "id": "none",
        "label": "None",
        "preview": {"cssFilter": "none"},
    },
    {
        "id": "bg_grayscale",
        "label": "Background Grayscale",
        "preview": {"cssFilter": "grayscale(1)"},
    },
    {
        "id": "bg_sepia",
        "label": "Background Sepia",
        "preview": {"cssFilter": "sepia(1)"},
    },
    {
        "id": "bg_blur",
        "label": "Background Blur",
        "preview": {"cssFilter": "blur(18px)"},
    },
]


def _redis_connection() -> Redis:
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return Redis.from_url(redis_url)


def _queue() -> Queue:
    return Queue(connection=_redis_connection())


@app.route("/hello-world", methods=["GET"])
def hello_world():
    try:
        return jsonify({"Hello": "World"}), 200
    except Exception as e:
        logger.error(f"Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({"ok": True}), 200


@app.route("/api/effects", methods=["GET"])
def api_effects():
    return jsonify({"default": "bg_grayscale", "effects": EFFECTS}), 200


@app.route("/api/jobs", methods=["POST"])
def create_job():
    if "video" not in request.files:
        return jsonify({"error": "Missing video file"}), 400

    effect_id = request.form.get("effect", "bg_grayscale")
    if effect_id not in {effect["id"] for effect in EFFECTS}:
        return jsonify({"error": "Invalid effect"}), 400

    upload = request.files["video"]
    if upload.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    job_id = str(uuid.uuid4())
    job_dir = os.path.join(DATA_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    filename = secure_filename(upload.filename)
    _, ext = os.path.splitext(filename)
    if not ext:
        ext = ".mp4"
    input_path = os.path.join(job_dir, f"input{ext}")
    upload.save(input_path)

    queue = _queue()
    job = queue.enqueue(process_video_job, job_id, input_path, effect_id, job_id=job_id)
    job.meta = {
        "status": "queued",
        "progress": 0,
        "error": None,
        "result_path": None,
    }
    job.save_meta()

    return jsonify({"jobId": job_id}), 202


@app.route("/api/jobs/<job_id>", methods=["GET"])
def get_job(job_id: str):
    job = _queue().fetch_job(job_id)
    if job is None:
        return jsonify({"error": "Job not found"}), 404

    meta = job.meta or {}
    status_map = {
        "queued": "queued",
        "started": "running",
        "finished": "done",
        "failed": "failed",
    }
    rq_status = status_map.get(job.get_status(), "queued")
    status = meta.get("status") or rq_status
    if rq_status in {"done", "failed"}:
        status = rq_status

    result_url = None
    if status == "done":
        result_url = f"/api/jobs/{job_id}/result"

    return jsonify(
        {
            "jobId": job_id,
            "status": status,
            "progress": int(meta.get("progress", 0)),
            "resultUrl": result_url,
            "error": meta.get("error"),
        }
    )


@app.route("/api/jobs/<job_id>/result", methods=["GET"])
def get_job_result(job_id: str):
    job_dir = os.path.join(DATA_DIR, job_id)
    output_path = os.path.join(job_dir, "output.mp4")
    if not os.path.isfile(output_path):
        return jsonify({"error": "Result not ready"}), 404

    return send_file(output_path, mimetype="video/mp4", as_attachment=False)



if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=True, use_reloader=False)
