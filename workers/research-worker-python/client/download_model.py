#!/usr/bin/env python3
"""Databiomics Studio research worker client for local Llama model downloads.

MVP helper script used by admin workflow.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

SUPPORTED = {
    "llama-3.2-1b-instruct": "meta-llama/Llama-3.2-1B-Instruct",
    "llama-3.2-3b-instruct": "meta-llama/Llama-3.2-3B-Instruct",
}


def build_download_instructions(model_id: str, target_dir: Path) -> dict:
    repo_id = SUPPORTED[model_id]
    return {
        "model_id": model_id,
        "repo_id": repo_id,
        "target_dir": str(target_dir / model_id),
        "python_example": (
            "from huggingface_hub import snapshot_download\n"
            f"snapshot_download(repo_id='{repo_id}', local_dir='{target_dir / model_id}')"
        ),
        "cli_example": (
            f"huggingface-cli download {repo_id} --local-dir {target_dir / model_id}"
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Download helper for Llama 3.2 models")
    parser.add_argument("--model", required=True, choices=SUPPORTED.keys())
    parser.add_argument(
        "--target-dir",
        default="./.models",
        help="Directory where the model should be stored",
    )
    args = parser.parse_args()

    target_dir = Path(args.target_dir).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "ok": True,
        "message": "MVP helper generated. Execute one of the instructions to download.",
        "instructions": build_download_instructions(args.model, target_dir),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
