#!/usr/bin/env python
"""Apply light domain glossary corrections to KoeScribe transcript artifacts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REPLACEMENTS = [
    ("歩行", "補講"),
    ("渡航する", "得をする"),
    ("プロンプトシュー", "プロンプト集"),
    ("外利値", "返り値"),
    ("Aスキル", "Skill"),
    ("明々", "命名"),
    ("活動上点", "発動条件"),
    ("強化分離", "評価分離"),
    ("最多復習", "最短復習"),
    ("カート", "パート"),
    ("コプリフィックス", "5プレフィックス"),
    ("決定器", "決定木"),
    ("決定期", "決定木"),
    ("実践地ベース", "実践知ベース"),
    ("Fで始まるSkill", "refで始まるSkill"),
    ("エバリエーター", "エバリュエーター"),
    ("エスキル", "Skill"),
    ("設計部費", "設計部品"),
    ("SKILL、MD", "SKILL.md"),
    ("CLAUDE、MD", "CLAUDE.md"),
    ("CLA-UDE、MD", "CLAUDE.md"),
    ("CLAUD、MD", "CLAUDE.md"),
    ("アントHROPIC", "Anthropic"),
    ("クロンプト", "プロンプト"),
    ("下毒剤", "解毒剤"),
    ("ドックス", "docs"),
    ("トックス", "docs"),
    ("強化器", "評価器"),
    ("初形扱い", "初見扱い"),
    ("イスクリプション", "description"),
    ("ディスクリテーション", "description"),
]


def fix_text(value: str) -> str:
    result = value
    for before, after in REPLACEMENTS:
        result = result.replace(before, after)
    return result


def timestamp_srt(seconds: float) -> str:
    millis = max(0, int(round(float(seconds) * 1000)))
    hours, rem = divmod(millis, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{ms:03}"


def timestamp_vtt(seconds: float) -> str:
    return timestamp_srt(seconds).replace(",", ".")


def write_text(path: Path, value: str) -> None:
    path.write_text(value, encoding="utf-8", newline="\n")


def write_corrected(folder: Path) -> dict:
    stem = folder.name
    raw_json_path = folder / f"{stem}.segments.json"
    data = json.loads(raw_json_path.read_text(encoding="utf-8"))

    for segment in data["segments"]:
        segment["text"] = fix_text(str(segment.get("text", "")))

    transcript = "\n".join(
        str(segment["text"]).strip() for segment in data["segments"] if str(segment["text"]).strip()
    ).strip() + "\n"
    write_text(folder / f"{stem}.corrected.txt", transcript)

    srt_blocks = []
    for index, segment in enumerate(data["segments"], start=1):
        srt_blocks.append(
            "\n".join(
                [
                    str(index),
                    f"{timestamp_srt(segment['start'])} --> {timestamp_srt(segment['end'])}",
                    str(segment["text"]).strip(),
                ]
            )
        )
    write_text(folder / f"{stem}.corrected.srt", "\n\n".join(srt_blocks).strip() + "\n")

    vtt_blocks = ["WEBVTT", ""]
    for segment in data["segments"]:
        vtt_blocks.append(
            "\n".join(
                [
                    f"{timestamp_vtt(segment['start'])} --> {timestamp_vtt(segment['end'])}",
                    str(segment["text"]).strip(),
                ]
            )
        )
        vtt_blocks.append("")
    write_text(folder / f"{stem}.corrected.vtt", "\n".join(vtt_blocks).strip() + "\n")

    md_lines = [
        f"# {stem} corrected transcript",
        "",
        f"- Source: `{data['source']}`",
        "- Correction: light domain glossary replacement",
        "",
        "## Full Transcript",
        "",
        transcript,
        "## Timestamped Segments",
        "",
    ]
    for segment in data["segments"]:
        md_lines.append(
            f"- `{timestamp_vtt(segment['start'])}-{timestamp_vtt(segment['end'])}` {str(segment['text']).strip()}"
        )
    write_text(folder / f"{stem}.corrected.transcript.md", "\n".join(md_lines).strip() + "\n")
    write_text(
        folder / f"{stem}.corrected.segments.json",
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
    )
    return {
        "folder": str(folder),
        "segments": len(data["segments"]),
        "corrected_txt": str(folder / f"{stem}.corrected.txt"),
        "corrected_markdown": str(folder / f"{stem}.corrected.transcript.md"),
        "corrected_srt": str(folder / f"{stem}.corrected.srt"),
        "corrected_vtt": str(folder / f"{stem}.corrected.vtt"),
        "corrected_json": str(folder / f"{stem}.corrected.segments.json"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("transcripts_root")
    args = parser.parse_args()
    root = Path(args.transcripts_root).resolve()
    folders = [path for path in root.iterdir() if path.is_dir()]
    results = [write_corrected(folder) for folder in folders]
    write_text(root / "domain-correction-summary.json", json.dumps({"results": results}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"results": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
