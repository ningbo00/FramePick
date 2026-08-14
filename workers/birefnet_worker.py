import argparse
import json
import os
import sys
from pathlib import Path

from PIL import Image
from rembg import new_session


def process_image(input_path: str, output_path: str, session) -> None:
    image = Image.open(input_path).convert("RGBA")
    mask = session.predict(image)[0].convert("L")
    result = image.copy()
    result.putalpha(mask)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    result.save(output_path, format="PNG")


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    model_path = Path(args.model).resolve()
    if not model_path.is_file():
        print(f"BiRefNet model not found: {model_path}", file=sys.stderr, flush=True)
        return 2
    os.environ.setdefault("U2NET_HOME", str(model_path.parent))
    try:
        session = new_session("birefnet-general", providers=["CPUExecutionProvider"])
    except Exception as error:
        print(f"BiRefNet session initialization failed: {error}", file=sys.stderr, flush=True)
        return 3
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = None
        try:
            request = json.loads(line)
            if request.get("command") != "remove-background":
                raise ValueError("unsupported worker command")
            process_image(request["imagePath"], request["outputPath"], session)
            emit({"id": request.get("id"), "ok": True, "outputPath": request["outputPath"]})
        except Exception as error:
            emit({"id": request.get("id") if isinstance(request, dict) else None, "ok": False, "error": str(error)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
