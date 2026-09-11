#!/usr/bin/env python3
"""
KomfyEdit - Lightweight OpenAI-compatible Whisper server
Uses faster-whisper (CTranslate2) optimized for macOS Apple Silicon and standard CPUs.
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import sys
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional, Union

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel

import faster_whisper

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("whisper-server")

# Global state
MODEL_INSTANCES: dict[str, faster_whisper.WhisperModel] = {}
DEFAULT_MODEL_NAME = os.environ.get("MODEL", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "auto")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
CACHE_DIR = os.environ.get(
    "WHISPER_CACHE_DIR",
    str(Path(__file__).resolve().parent / ".mac_whisper" / "models"),
)


def get_model(requested_model: Optional[str] = None) -> faster_whisper.WhisperModel:
    model_name = requested_model or DEFAULT_MODEL_NAME
    # Map generic OpenAI model name 'whisper-1' to the default model
    if model_name in ("whisper-1", "", None):
        model_name = DEFAULT_MODEL_NAME

    if model_name in MODEL_INSTANCES:
        return MODEL_INSTANCES[model_name]

    logger.info(
        f"Loading model '{model_name}' (device={DEVICE}, compute_type={COMPUTE_TYPE}, cache={CACHE_DIR})..."
    )
    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        model = faster_whisper.WhisperModel(
            model_name,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=CACHE_DIR,
        )
        MODEL_INSTANCES[model_name] = model
        logger.info(f"Model '{model_name}' loaded successfully.")
        return model
    except Exception as e:
        logger.error(f"Failed to load model '{model_name}': {e}")
        # If requested was specific and failed, fallback to default if different
        if model_name != DEFAULT_MODEL_NAME and DEFAULT_MODEL_NAME in MODEL_INSTANCES:
            logger.warning(f"Falling back to default model '{DEFAULT_MODEL_NAME}'")
            return MODEL_INSTANCES[DEFAULT_MODEL_NAME]
        raise HTTPException(
            status_code=500, detail=f"Failed to load Whisper model '{model_name}': {e}"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload default model on startup
    logger.info(f"Preloading default Whisper model: '{DEFAULT_MODEL_NAME}'...")
    try:
        get_model(DEFAULT_MODEL_NAME)
    except Exception as e:
        logger.warning(f"Could not preload model '{DEFAULT_MODEL_NAME}': {e}")
    yield
    MODEL_INSTANCES.clear()


app = FastAPI(
    title="KomfyEdit Whisper Server",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "loaded_models": list(MODEL_INSTANCES.keys())}


@app.get("/")
def root():
    return {
        "service": "KomfyEdit Whisper Server",
        "default_model": DEFAULT_MODEL_NAME,
        "endpoints": [
            "/health",
            "/v1/models",
            "/v1/audio/transcriptions",
        ],
    }


def list_models():
    known = [
        "whisper-1",
        DEFAULT_MODEL_NAME,
        "tiny",
        "base",
        "small",
        "medium",
        "large-v3",
    ]
    seen = set()
    model_list = []
    for m in known:
        if m and m not in seen:
            seen.add(m)
            model_list.append({"id": m, "object": "model", "owned_by": "openai"})
    return {"object": "list", "data": model_list}


@app.get("/v1/models")
def v1_models():
    return list_models()


@app.get("/models")
def root_models():
    return list_models()


def format_timestamp(seconds: float, srt: bool = False) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    msecs = int((seconds - int(seconds)) * 1000)
    sep = "," if srt else "."
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{sep}{msecs:03d}"


@app.post("/v1/audio/transcriptions")
@app.post("/audio/transcriptions")
async def transcriptions(
    request: Request,
    file: UploadFile = File(...),
    model: Optional[str] = Form(None),
    model_name: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    prompt: Optional[str] = Form(None),
    response_format: Optional[str] = Form("json"),
    temperature: Optional[float] = Form(0.0),
):
    selected_model = model or model_name or DEFAULT_MODEL_NAME
    whisper_model = get_model(selected_model)

    # Inspect form data to see if word timestamps were requested
    form_data = await request.form()
    granularities = form_data.getlist("timestamp_granularities[]")
    if not granularities:
        granularities = form_data.getlist("timestamp_granularities")
    
    # Enable word timestamps by default or when verbose_json / granularities requested
    format_type = (response_format or "json").lower()
    enable_word_timestamps = (
        format_type in ("verbose_json", "srt", "vtt")
        or "word" in granularities
        or len(granularities) > 0
    )

    # Save uploaded file to a temporary file
    suffix = Path(file.filename or "audio.mp3").suffix or ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        shutil.copyfileobj(file.file, tmp)

    try:
        lang_arg = (
            language.strip()
            if (language and language.strip().lower() != "auto")
            else None
        )
        prompt_arg = prompt.strip() if (prompt and prompt.strip()) else None
        temp_arg = float(temperature) if temperature is not None else 0.0

        segments_iter, info = whisper_model.transcribe(
            tmp_path,
            task="transcribe",
            language=lang_arg,
            initial_prompt=prompt_arg,
            temperature=temp_arg,
            word_timestamps=enable_word_timestamps,
        )

        segments_list = []
        full_text_parts = []
        for i, seg in enumerate(segments_iter):
            seg_dict = {
                "id": i,
                "seek": getattr(seg, "seek", 0),
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text,
                "tokens": getattr(seg, "tokens", []),
                "temperature": getattr(seg, "temperature", temp_arg),
                "avg_logprob": getattr(seg, "avg_logprob", 0.0),
                "compression_ratio": getattr(seg, "compression_ratio", 1.0),
                "no_speech_prob": getattr(seg, "no_speech_prob", 0.0),
            }
            if enable_word_timestamps and getattr(seg, "words", None):
                seg_dict["words"] = [
                    {
                        "word": w.word,
                        "start": round(w.start, 3),
                        "end": round(w.end, 3),
                        "probability": round(w.probability, 3)
                        if getattr(w, "probability", None) is not None
                        else 1.0,
                    }
                    for w in seg.words
                ]
            segments_list.append(seg_dict)
            full_text_parts.append(seg.text)

        full_text = "".join(full_text_parts).strip()

        if format_type == "verbose_json":
            return JSONResponse(
                content={
                    "task": "transcribe",
                    "language": info.language,
                    "duration": round(info.duration, 3),
                    "text": full_text,
                    "segments": segments_list,
                }
            )
        elif format_type == "text":
            return PlainTextResponse(full_text)
        elif format_type == "srt":
            srt_lines = []
            for idx, s in enumerate(segments_list, 1):
                start = format_timestamp(s["start"], srt=True)
                end = format_timestamp(s["end"], srt=True)
                srt_lines.append(f"{idx}\n{start} --> {end}\n{s['text'].strip()}\n")
            return PlainTextResponse("\n".join(srt_lines))
        elif format_type == "vtt":
            vtt_lines = ["WEBVTT\n"]
            for s in segments_list:
                start = format_timestamp(s["start"], srt=False)
                end = format_timestamp(s["end"], srt=False)
                vtt_lines.append(f"{start} --> {end}\n{s['text'].strip()}\n")
            return PlainTextResponse("\n".join(vtt_lines))
        else:
            # Default OpenAI json response
            return JSONResponse(content={"text": full_text})

    except Exception as e:
        logger.error(f"Transcription error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Whisper transcription failed: {e}"
        )
    finally:
        try:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        except OSError:
            pass


def main():
    global DEFAULT_MODEL_NAME, DEVICE, COMPUTE_TYPE

    parser = argparse.ArgumentParser(description="KomfyEdit Whisper Server")
    parser.add_argument(
        "--host", default="0.0.0.0", help="Host address to bind (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT", "8000")),
        help="Port to bind (default: 8000)",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL_NAME,
        help="Default model to load (default: small)",
    )
    parser.add_argument(
        "--device",
        default=DEVICE,
        help="Device to use ('auto', 'cpu', 'cuda') (default: auto)",
    )
    parser.add_argument(
        "--compute-type",
        default=COMPUTE_TYPE,
        help="Compute type ('int8', 'float16', 'float32', 'default') (default: int8)",
    )

    args = parser.parse_args()
    DEFAULT_MODEL_NAME = args.model
    DEVICE = args.device
    COMPUTE_TYPE = args.compute_type

    logger.info(
        f"Starting Whisper Server on http://{args.host}:{args.port} (Model: {DEFAULT_MODEL_NAME}, Device: {DEVICE}, Compute: {COMPUTE_TYPE})"
    )
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
