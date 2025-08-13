#!/usr/bin/env python3
"""
Batch-remove backgrounds with rembg.
Usage:
    python remove_backgrounds.py -i test -o transparent/diesel
"""
import argparse
from io import BytesIO
from pathlib import Path

from PIL import Image
from rembg import remove
from tqdm import tqdm


def is_transparent(img: Image.Image) -> bool:
    """Return True if image already has transparency."""
    if img.mode in ("RGBA", "LA"):
        alpha = img.getchannel("A")
        return alpha.getextrema()[0] < 255
    return False


def process_image(src: Path, dst: Path) -> None:
    """Run rembg and save PNG with alpha."""
    with src.open("rb") as f:
        result = remove(f.read())
    with Image.open(BytesIO(result)).convert("RGBA") as out_im:
        out_im.save(dst, format="PNG")


def main() -> None:
    p = argparse.ArgumentParser(description="Batch background remover")
    p.add_argument("-i", "--input", required=True, help="Input folder")
    p.add_argument("-o", "--output", required=True, help="Output folder")
    args = p.parse_args()

    in_dir = Path(args.input)
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    images = [p for p in in_dir.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png")]

    for img_path in tqdm(images, desc="Processing"):
        out_path = out_dir / img_path.with_suffix(".png").name
        if out_path.exists():
            continue
        try:
            with Image.open(img_path) as im:
                if is_transparent(im):
                    print(f"🟡  Skipping (already transparent): {img_path.name}")
                    continue
            process_image(img_path, out_path)
        except Exception as exc:
            print(f"❌  {img_path.name}: {exc}")


if __name__ == "__main__":
    main()
