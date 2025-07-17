#!/usr/bin/env python3
"""
Background removal utilities using rembg.

Features
--------
- Single-image function: remove_bg_single()
- Batch folder function: remove_bg_batch()
- Model selection (u2net, isnet-general-use, ...)
- Optional alpha matting controls
- Optional halo cleanup (alpha shrink, decontaminate edge colors)
- Skip already-transparent images

Example CLI usage
-----------------
# Basic batch (default model=u2net)
python bg_tools.py batch -i acero -o transparent/acero

# Use isnet-general-use model (better for thin jewelry)
python bg_tools.py batch -i acero -o transparent/acero --model isnet-general-use

# Enable alpha matting tuned for fine detail
python bg_tools.py batch -i jewelry -o transparent/jewelry --model isnet-general-use \
    --matting --mat-foreground 255 --mat-background 5 --mat-erode 1

# Clean halos (contract 1px, fill edge rgb with fg median)
python bg_tools.py batch -i acero -o transparent/acero --clean-halo 1

# Process one image
python bg_tools.py single -s input.jpg -d output.png --model isnet-general-use --matting
"""
from __future__ import annotations

import argparse
import os
from io import BytesIO
from pathlib import Path
from typing import Iterable, Optional, Tuple

from PIL import Image, ImageChops, ImageFilter, ImageStat
from rembg import remove, new_session


# -----------------------------------------------------------
# Utility: detect transparency
# -----------------------------------------------------------
def is_transparent(img: Image.Image, any_alpha_lt_255: bool = True) -> bool:
    """
    True if the image has an alpha channel and (optionally) any pixel < 255.
    """
    if img.mode in ("RGBA", "LA"):
        alpha = img.getchannel("A")
        if not any_alpha_lt_255:
            return True
        lo, hi = alpha.getextrema()
        return lo < 255
    return False


# -----------------------------------------------------------
# Halo cleanup helpers
# -----------------------------------------------------------
def shrink_alpha(alpha: Image.Image, pixels: int) -> Image.Image:
    """
    Contract the alpha mask by N pixels using erosion (MinFilter).
    """
    if pixels <= 0:
        return alpha
    for _ in range(pixels):
        alpha = alpha.filter(ImageFilter.MinFilter(3))
    return alpha


def expand_alpha(alpha: Image.Image, pixels: int) -> Image.Image:
    """
    Dilate alpha mask by N pixels (MaxFilter).
    """
    if pixels <= 0:
        return alpha
    for _ in range(pixels):
        alpha = alpha.filter(ImageFilter.MaxFilter(3))
    return alpha

### NEW ###
def feather_alpha(alpha: Image.Image, radius: float) -> Image.Image:
    """
    Blur alpha edges for smoother compositing.
    radius ~1-2 is usually enough.
    """
    if radius <= 0:
        return alpha
    # Because alpha might be 0/255 hard edge, blur then scale
    blurred = alpha.filter(ImageFilter.GaussianBlur(radius))
    return blurred


def premultiply_rgba(img: Image.Image) -> Image.Image:
    """
    Multiply RGB by alpha/255 to eliminate bright halo when composited over dark backgrounds.
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    r, g, b, a = img.split()
    # Convert channels to "L" mode raw bytes, scale via point
    def scale_channel(ch):
        # Use alpha as lookup table; we need elementwise multiply
        lut = []
        a_data = list(a.getdata())
        c_data = list(ch.getdata())
        # Compute scaled per-pixel (fast enough for moderate images; could use numpy if needed)
        lut = [int((c * aa) / 255) for c, aa in zip(c_data, a_data)]
        out = Image.new("L", img.size)
        out.putdata(lut)
        return out
    r2 = scale_channel(r)
    g2 = scale_channel(g)
    b2 = scale_channel(b)
    return Image.merge("RGBA", (r2, g2, b2, a))


def color_decontaminate_edge(
    img: Image.Image,
    alpha: Image.Image,
    edge_band: int = 2,
    method: str = "median",
) -> Image.Image:
    """
    Replace RGB fringe colors near the transparent edge with dominant foreground color.

    Parameters
    ----------
    img : RGBA or RGB
    alpha : Single-channel, same size
    edge_band : how far inside opaque regions to sample
    method : 'median' | 'mean'

    Returns
    -------
    New RGBA image with updated RGB fringe.
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    # Build a mask for "solid interior" (alpha >= 255 - 5)
    solid = alpha.point(lambda a: 255 if a > 250 else 0)
    # Erode to stay well inside object
    for _ in range(edge_band):
        solid = solid.filter(ImageFilter.MinFilter(3))

    # Sample color stats from interior
    interior = Image.composite(img, Image.new("RGBA", img.size, (0, 0, 0, 0)), solid)
    stat = ImageStat.Stat(interior, mask=solid)

    if method == "median":
        r, g, b = (int(c) for c in stat.median[:3])
    else:
        r, g, b = (int(c) for c in stat.mean[:3])

    # Build fringe region = object minus eroded interior
    dilated = solid
    for _ in range(edge_band):
        dilated = dilated.filter(ImageFilter.MaxFilter(3))
    fringe = ImageChops.subtract(dilated, solid)

    # Paint fringe RGB to sampled color, keep original alpha
    painted = Image.new("RGBA", img.size, (r, g, b, 255))
    cleaned = Image.composite(painted, img, fringe)

    # restore original alpha
    cleaned.putalpha(alpha)
    return cleaned


def halo_cleanup(
    rgba: Image.Image,
    contract_px: int = 1,
    decontaminate: bool = True,
    edge_band: int = 2,
    feather_px: float = 0.0,       ### NEW ###
    premultiply: bool = False,     ### NEW ###
) -> Image.Image:
    """
    Convenience wrapper: shrink alpha + optionally decontaminate fringe colors.
    """
    if rgba.mode != "RGBA":
        rgba = rgba.convert("RGBA")
    alpha = rgba.getchannel("A")

    # 1. contract
    alpha = shrink_alpha(alpha, contract_px)

    # 2. feather soften edge
    if feather_px > 0:
        alpha = feather_alpha(alpha, feather_px)

    # 3. recompose & decontam fringe color
    if decontaminate:
        rgba = color_decontaminate_edge(rgba, alpha, edge_band=edge_band)
    else:
        rgba.putalpha(alpha)

    # 4. premultiply edge color (kills white glow)
    if premultiply:
        rgba = premultiply_rgba(rgba)

    return rgba

# -----------------------------------------------------------
# Core removal (single image)
# -----------------------------------------------------------
def remove_bg_single(
    src_path: Path,
    dst_path: Path,
    *,
    session=None,
    alpha_matting: bool = False,
    mat_foreground: int = 240,
    mat_background: int = 10,
    mat_erode: int = 10,
    halo_contract: int = 0,
    halo_decontaminate: bool = False,
    halo_edge_band: int = 2,
    feather_px: float = 0.0,          ### NEW ###
    premultiply: bool = False,        ### NEW ###
    skip_if_transparent: bool = True,
    upscale: int = 1,
) -> bool:
    """
    Remove background from a single image.

    Returns True if processed (file written), False if skipped or failed.
    """
    try:
        with Image.open(src_path) as im:
            if skip_if_transparent and is_transparent(im):
                print(f"🟡  Skip (already transparent): {src_path.name}")
                return False

            if upscale > 1:
                w, h = im.size
                im = im.resize((w * upscale, h * upscale), Image.LANCZOS)

            buf = BytesIO()
            im.save(buf, format="PNG")
            result = remove(
                buf.getvalue(),
                session=session,
                alpha_matting=alpha_matting,
                alpha_matting_foreground_threshold=mat_foreground,
                alpha_matting_background_threshold=mat_background,
                alpha_matting_erode_size=mat_erode,
            )

        out_im = Image.open(BytesIO(result)).convert("RGBA")

        if halo_contract or halo_decontaminate or feather_px > 0 or premultiply:
            out_im = halo_cleanup(
                out_im,
                contract_px=halo_contract,
                decontaminate=halo_decontaminate,
                edge_band=halo_edge_band,
                feather_px=feather_px,
                premultiply=premultiply,
            )

        if upscale > 1:
            with Image.open(src_path) as im_check:
                out_im = out_im.resize(im_check.size, Image.LANCZOS)

        dst_path.parent.mkdir(parents=True, exist_ok=True)
        out_im.save(dst_path, format="PNG")
        print(f"✅  {src_path.name} -> {dst_path.name}")
        return True

    except Exception as exc:
        print(f"❌  {src_path.name}: {exc}")
        return False


# -----------------------------------------------------------
# Batch removal
# -----------------------------------------------------------
def iter_images(folder: Path, recursive: bool = False) -> Iterable[Path]:
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    if recursive:
        yield from (p for p in folder.rglob("*") if p.suffix.lower() in exts)
    else:
        yield from (p for p in folder.iterdir() if p.suffix.lower() in exts and p.is_file())


def remove_bg_batch(
    input_dir: Path,
    output_dir: Path,
    *,
    model_name: str = "u2net",
    recursive: bool = False,
    alpha_matting: bool = False,
    mat_foreground: int = 240,
    mat_background: int = 10,
    mat_erode: int = 10,
    halo_contract: int = 0,
    halo_decontaminate: bool = False,
    halo_edge_band: int = 2,
    feather_px: float = 0.0,      ### NEW ###
    premultiply: bool = False,    ### NEW ###
    skip_if_transparent: bool = True,
    upscale: int = 1,
) -> None:
    """
    Batch process all images from input_dir -> output_dir using rembg session.
    """
    print(f"🔧 Model: {model_name}")
    session = new_session(model_name=model_name)

    images = list(iter_images(input_dir, recursive=recursive))
    if not images:
        print("No images found.")
        return

    from tqdm import tqdm

    for src in tqdm(images, desc="Processing"):
        rel = src.relative_to(input_dir) if recursive else src.name
        dst = output_dir / (rel if recursive else rel)
        if recursive and isinstance(rel, Path):
            dst = output_dir / rel
        dst = dst.with_suffix(".png")

        if dst.exists():
            continue

        remove_bg_single(
            src,
            dst,
            session=session,
            alpha_matting=alpha_matting,
            mat_foreground=mat_foreground,
            mat_background=mat_background,
            mat_erode=mat_erode,
            halo_contract=halo_contract,
            halo_decontaminate=halo_decontaminate,
            halo_edge_band=halo_edge_band,
            feather_px=feather_px,
            premultiply=premultiply,
            skip_if_transparent=skip_if_transparent,
            upscale=upscale,
        )

    print("🎉 Batch complete.")


# -----------------------------------------------------------
# CLI
# -----------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Background removal tools (single & batch).")
    sub = p.add_subparsers(dest="cmd", required=True)

    # single
    p_single = sub.add_parser("single", help="Process a single image.")
    p_single.add_argument("-s", "--src", required=True, help="Source image path.")
    p_single.add_argument("-d", "--dst", required=True, help="Destination path (.png).")
    _add_common_args(p_single)

    # batch
    p_batch = sub.add_parser("batch", help="Process a folder of images.")
    p_batch.add_argument("-i", "--input", required=True, help="Input folder.")
    p_batch.add_argument("-o", "--output", required=True, help="Output folder.")
    p_batch.add_argument("-r", "--recursive", action="store_true", help="Recurse into subfolders.")
    _add_common_args(p_batch)

    return p


def _add_common_args(sp: argparse.ArgumentParser) -> None:
    sp.add_argument("--model", default="u2net", help="Model name (u2net, isnet-general-use, ...).")
    sp.add_argument("--matting", action="store_true", help="Enable alpha matting refine.")
    sp.add_argument("--mat-foreground", type=int, default=240, help="Matting foreground threshold.")
    sp.add_argument("--mat-background", type=int, default=10, help="Matting background threshold.")
    sp.add_argument("--mat-erode", type=int, default=10, help="Matting erosion size (px).")
    sp.add_argument("--clean-halo", type=int, default=0, metavar="PX", help="Contract alpha by N px (halo cleanup).")
    sp.add_argument("--no-decontam", action="store_true", help="Disable fringe color decontamination.")
    sp.add_argument("--clean-halo-band", type=int, default=2, help="Edge band sampled for decontam color.")
    sp.add_argument("--feather", type=float, default=0.0, help="Feather alpha edge (px float).")   ### NEW ###
    sp.add_argument("--premultiply", action="store_true", help="Premultiply RGB by alpha (anti-halo).")  ### NEW ###
    sp.add_argument("--no-skip-transparent", action="store_true", help="Process even if already transparent.")
    sp.add_argument("--upscale", type=int, default=1, help="Upscale factor before removal (try 2 for thin jewelry).")


def main() -> None:
    p = build_parser()
    args = p.parse_args()

    # halo_decontaminate = not args.clean_halo_no_color
    decontam = (args.clean_halo > 0) and (not args.no_decontam)

    if args.cmd == "single":
        src = Path(args.src)
        dst = Path(args.dst)
        session = new_session(model_name=args.model)
        remove_bg_single(
            src, dst,
            session=session,
            alpha_matting=args.matting,
            mat_foreground=args.mat_foreground,
            mat_background=args.mat_background,
            mat_erode=args.mat_erode,
            halo_contract=args.clean_halo,
            halo_decontaminate=decontam,
            halo_edge_band=args.clean_halo_band,
            feather_px=args.feather,
            premultiply=args.premultiply,
            skip_if_transparent=not args.no_skip_transparent,
            upscale=args.upscale,
        )

    elif args.cmd == "batch":
        in_dir = Path(args.input)
        out_dir = Path(args.output)
        remove_bg_batch(
            in_dir, out_dir,
            model_name=args.model,
            recursive=args.recursive,
            alpha_matting=args.matting,
            mat_foreground=args.mat_foreground,
            mat_background=args.mat_background,
            mat_erode=args.mat_erode,
            halo_contract=args.clean_halo,
            halo_decontaminate=decontam,
            halo_edge_band=args.clean_halo_band,
            feather_px=args.feather,
            premultiply=args.premultiply,
            skip_if_transparent=not args.no_skip_transparent,
            upscale=args.upscale,
        )



if __name__ == "__main__":
    main()
