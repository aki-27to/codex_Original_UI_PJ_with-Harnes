#!/usr/bin/env python
"""Local KoeScribe transcription runner using faster-whisper.

This is intentionally a thin CLI over the local speech-to-text engine. The
same contract can later be wrapped by the KoeScribe UI backend or an MCP server.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


@dataclass
class Segment:
    index: int
    start: float
    end: float
    text: str


def safe_stem(path: Path) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", path.stem).strip("._-")
    return value or "media"


def timestamp_srt(seconds: float) -> str:
    millis = max(0, int(round(seconds * 1000)))
    hours, rem = divmod(millis, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{ms:03}"


def timestamp_vtt(seconds: float) -> str:
    return timestamp_srt(seconds).replace(",", ".")


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8", newline="\n")


def format_srt(segments: Iterable[Segment]) -> str:
    blocks = []
    for segment in segments:
        blocks.append(
            "\n".join(
                [
                    str(segment.index),
                    f"{timestamp_srt(segment.start)} --> {timestamp_srt(segment.end)}",
                    segment.text.strip(),
                ]
            )
        )
    return "\n\n".join(blocks).strip() + "\n"


def format_vtt(segments: Iterable[Segment]) -> str:
    blocks = ["WEBVTT", ""]
    for segment in segments:
        blocks.append(
            "\n".join(
                [
                    f"{timestamp_vtt(segment.start)} --> {timestamp_vtt(segment.end)}",
                    segment.text.strip(),
                ]
            )
        )
        blocks.append("")
    return "\n".join(blocks).strip() + "\n"


def format_markdown(media_path: Path, model_name: str, language: str, segments: list[Segment]) -> str:
    transcript = "\n".join(segment.text.strip() for segment in segments if segment.text.strip())
    lines = [
        f"# {media_path.name} transcript",
        "",
        f"- Source: `{media_path}`",
        f"- Engine: faster-whisper",
        f"- Model: `{model_name}`",
        f"- Language: `{language}`",
        f"- Segments: {len(segments)}",
        "",
        "## Full Transcript",
        "",
        transcript,
        "",
        "## Timestamped Segments",
        "",
    ]
    for segment in segments:
        lines.append(f"- `{timestamp_vtt(segment.start)}-{timestamp_vtt(segment.end)}` {segment.text.strip()}")
    return "\n".join(lines).strip() + "\n"


def transcribe_one(args: argparse.Namespace, model, media_path: Path) -> dict:
    output_dir = Path(args.output_dir).resolve() / safe_stem(media_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"[koe-scribe] transcribing: {media_path}", flush=True)

    kwargs = {
        "language": args.language,
        "beam_size": args.beam_size,
        "vad_filter": args.vad_filter,
        "condition_on_previous_text": False,
        "word_timestamps": False,
    }
    if args.initial_prompt:
        kwargs["initial_prompt"] = args.initial_prompt
    if args.max_seconds:
        kwargs["clip_timestamps"] = f"0,{args.max_seconds}"

    raw_segments, info = model.transcribe(str(media_path), **kwargs)
    segments: list[Segment] = []
    for index, raw in enumerate(raw_segments, start=1):
        text = str(raw.text or "").strip()
        if not text:
            continue
        segment = Segment(index=index, start=float(raw.start), end=float(raw.end), text=text)
        segments.append(segment)
        if index == 1 or index % args.progress_every == 0:
            print(
                f"[koe-scribe] {media_path.name}: segment={index} end={timestamp_vtt(segment.end)}",
                flush=True,
            )

    language = getattr(info, "language", None) or args.language
    stem = safe_stem(media_path)
    txt_path = output_dir / f"{stem}.txt"
    md_path = output_dir / f"{stem}.transcript.md"
    srt_path = output_dir / f"{stem}.srt"
    vtt_path = output_dir / f"{stem}.vtt"
    json_path = output_dir / f"{stem}.segments.json"

    transcript = "\n".join(segment.text for segment in segments).strip() + "\n"
    write_text(txt_path, transcript)
    write_text(md_path, format_markdown(media_path, args.model, language, segments))
    write_text(srt_path, format_srt(segments))
    write_text(vtt_path, format_vtt(segments))
    write_text(
        json_path,
        json.dumps(
            {
                "source": str(media_path),
                "engine": "faster-whisper",
                "model": args.model,
                "language": language,
                "duration": getattr(info, "duration", None),
                "language_probability": getattr(info, "language_probability", None),
                "segments": [asdict(segment) for segment in segments],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
    )

    result = {
        "source": str(media_path),
        "output_dir": str(output_dir),
        "txt": str(txt_path),
        "markdown": str(md_path),
        "srt": str(srt_path),
        "vtt": str(vtt_path),
        "json": str(json_path),
        "segments": len(segments),
        "duration": getattr(info, "duration", None),
        "language": language,
        "language_probability": getattr(info, "language_probability", None),
    }
    print(f"[koe-scribe] completed: {media_path.name} segments={len(segments)}", flush=True)
    return result


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe media files with local faster-whisper.")
    parser.add_argument("media", nargs="+", help="Media file path(s).")
    parser.add_argument("--output-dir", required=True, help="Directory for transcript artifacts.")
    parser.add_argument("--model", default="large-v3-turbo", help="faster-whisper model name.")
    parser.add_argument("--language", default="ja", help="Language hint.")
    parser.add_argument("--device", default="cpu", help="Device passed to WhisperModel.")
    parser.add_argument("--compute-type", default="int8", help="Compute type passed to WhisperModel.")
    parser.add_argument("--beam-size", type=int, default=5, help="Beam size.")
    parser.add_argument("--vad-filter", action="store_true", help="Enable VAD filtering.")
    parser.add_argument("--initial-prompt", default="", help="Domain glossary or style prompt.")
    parser.add_argument("--max-seconds", type=float, default=0, help="Smoke-test only: transcribe from 0 to N seconds.")
    parser.add_argument("--progress-every", type=int, default=10, help="Print progress every N raw segments.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    media_paths = [Path(item).resolve() for item in args.media]
    missing = [str(path) for path in media_paths if not path.exists()]
    if missing:
        print(f"missing media file(s): {missing}", file=sys.stderr)
        return 2

    # Keep model cache local to the ignored tooling tree unless the caller chose one.
    os.environ.setdefault("HF_HOME", str((Path.cwd() / ".tooling" / "huggingface").resolve()))

    from faster_whisper import WhisperModel

    print(
        f"[koe-scribe] loading model={args.model} device={args.device} compute_type={args.compute_type}",
        flush=True,
    )
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    results = [transcribe_one(args, model, media_path) for media_path in media_paths]
    summary_path = Path(args.output_dir).resolve() / "transcription-summary.json"
    write_text(summary_path, json.dumps({"results": results}, ensure_ascii=False, indent=2) + "\n")
    print(f"[koe-scribe] summary: {summary_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
