"""Crop, grade and export Rock Park photos for the website.

Crop boxes are fractions (x0, y0, x1, y1) of the oriented 5120px source and are chosen so
price signs fall outside the frame (no blur patches). Small price stickers on stones are
inpainted. Theatre specimens are tight spotlight crops; CSS fades them into the dark stage.

Run from the repo root:  tools/.venv/Scripts/python tools/process_images.py [--only name,...]
"""
import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

try:
    import pillow_avif  # noqa: F401  registers AVIF with Pillow
    HAS_AVIF = True
except ImportError:
    HAS_AVIF = False

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "rock park"
OUT = ROOT / "site" / "assets" / "img"
WIDTHS = (640, 1280, 2000)
MIN_SRC_W = 1600  # never upscale: a crop must carry this many source pixels

# name: (source number, crop box)
CROPS = {
    # atmosphere
    "hall-rafters":     (1,  (0.30, 0.42, 0.92, 1.00)),
    "hall-stock":       (5,  (0.40, 0.06, 1.00, 0.76)),
    "hall-aisle":       (2,  (0.00, 0.00, 1.00, 0.50)),
    "storefront":       (27, (0.07, 0.08, 0.73, 0.72)),
    "storefront-angle": (25, (0.00, 0.00, 0.62, 1.00)),
    # collection
    "amethyst-cathedrals": (6,  (0.00, 0.42, 1.00, 1.00)),
    "celestite":        (26, (0.60, 0.36, 1.00, 1.00)),
    "septarian":        (19, (0.60, 0.30, 1.00, 1.00)),
    "labradorite":      (15, (0.00, 0.44, 0.90, 1.00)),
    "amazonite":        (18, (0.62, 0.00, 1.00, 0.42)),
    "flower-agate":     (21, (0.00, 0.46, 1.00, 1.00)),
    "pyrite":           (12, (0.00, 0.40, 1.00, 0.86)),
    "rose-quartz":      (11, (0.10, 0.50, 0.62, 1.00)),
    "chevron-amethyst": (14, (0.00, 0.48, 0.70, 1.00)),
    "quartz-points":    (22, (0.00, 0.25, 1.00, 1.00)),
    "towers":           (9,  (0.00, 0.50, 0.60, 1.00)),
    "spheres":          (24, (0.10, 0.30, 1.00, 1.00)),
    "blue-apatite":     (10, (0.22, 0.52, 0.70, 1.00)),
    "raw-minerals":     (17, (0.00, 0.55, 1.00, 1.00)),
    "carvings":         (8,  (0.00, 0.40, 1.00, 1.00)),
    "coprolite":        (23, (0.03, 0.32, 0.97, 1.00)),
}

# Macro details for the warehouse band (honest close-ups of the stock, no fluorescent rooms)
MACROS = {
    "macro-amethyst":    (6,  (0.53, 0.705, 0.76, 0.91)),
    "macro-pyrite":      (12, (0.22, 0.45, 0.78, 0.70)),
    "macro-labradorite": (15, (0.12, 0.47, 0.50, 0.68)),
    "macro-celestite":   (26, (0.70, 0.74, 0.96, 1.00)),
}
# Room shots get a darker, warmer "cinematic" grade so fluorescent light and clutter recede
CINEMATIC = {"hall-rafters", "storefront", "storefront-angle"}
GAIN = {"macro-amethyst": 1.45}  # very dark crops get a gentle exposure lift

# Tight 4:5 spotlight crops of single specimens for the theatre; CSS fades their edges into the dark stage.
SPOTLIGHTS = {
    "spot-amethyst":  (6,  (0.15, 0.69, 0.35, 1.00)),
    "spot-celestite": (26, (0.69, 0.533, 0.97, 1.00)),
    "spot-septarian": (19, (0.70, 0.47, 0.988, 0.95)),
    "spot-heart":     (15, (0.08, 0.42, 0.52, 0.83)),
    "spot-sphere":    (24, (0.33, 0.38, 0.654, 0.92)),
}

# Price-sticker colour ranges in OpenCV HSV (H 0-180): (lo, hi) pairs.
STICKER_HSV = {
    "yellow": [((18, 90, 120), (38, 255, 255))],
    "yellow-strict": [((18, 140, 160), (36, 255, 255))],  # for warm/orange stones
    "red":    [((0, 170, 140), (6, 255, 255)), ((172, 170, 140), (180, 255, 255))],
    "green":  [((38, 80, 100), (85, 255, 255))],
    "orange": [((8, 150, 170), (18, 255, 255))],
    "pink":   [((150, 90, 170), (172, 255, 255))],
}
RETOUCH = {
    "macro-amethyst": ("yellow", "green", "pink", "orange"),
    "amethyst-cathedrals": ("yellow", "green", "pink", "orange"),
    "spot-amethyst": ("yellow", "green", "pink", "orange"),
    "celestite": ("yellow",),
    "labradorite": ("yellow",),
    "spot-heart": ("yellow",),
    "septarian": ("yellow-strict",),
    "flower-agate": ("yellow-strict", "red"),
    "amazonite": ("yellow", "red"),
}
# Leftovers the colour mask misses (white tags etc): (x, y, radius) as fractions of the CROP.
SPOTS = {
    "spheres": [(0.37, 0.49, 0.025)],
    "spot-sphere": [(0.31, 0.48, 0.075)],
    "spot-heart": [(0.052, 0.844, 0.095)],
}


def remove_stickers(img: Image.Image, colours, spots=()) -> Image.Image:
    # Mask small, round, saturated blobs and inpaint them away.
    bgr = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    mask = np.zeros(hsv.shape[:2], np.uint8)
    max_area = (img.width * 0.1) ** 2
    for c in colours:  # per colour, so touching yellow+red dot pairs stay round
        raw = np.zeros_like(mask)
        for lo, hi in STICKER_HSV[c]:
            raw |= cv2.inRange(hsv, np.array(lo), np.array(hi))
        raw = cv2.morphologyEx(raw, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        n, labels, stats, _ = cv2.connectedComponentsWithStats(raw)
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            if 30 < area < max_area and 0.45 < w / h < 2.2 and area / float(w * h) > 0.5:
                mask[labels == i] = 255
    for fx, fy, fr in spots:
        cv2.circle(mask, (int(fx * img.width), int(fy * img.height)), int(fr * img.width), 255, -1)
    mask = cv2.dilate(mask, np.ones((9, 9), np.uint8))
    out = cv2.inpaint(bgr, mask, 15, cv2.INPAINT_NS)
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))


def grade(img: Image.Image) -> Image.Image:
    # One house curve: lifted blacks, gentle S-contrast, warm highlights, restrained saturation.
    a = np.asarray(img).astype(np.float32) / 255.0
    a = 0.02 + a * 0.98
    a = a + 0.10 * (a - 0.5) * (1 - np.abs(2 * a - 1))  # soft S
    lum = a.mean(axis=2, keepdims=True)
    a = lum + (a - lum) * 1.06
    a[..., 0] *= 1 + 0.025 * lum[..., 0]
    a[..., 2] *= 1 - 0.02 * lum[..., 0]
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def cinematic(img: Image.Image) -> Image.Image:
    a = np.asarray(img).astype(np.float32) / 255.0
    a = a ** 1.18 * 0.92                                   # pull exposure down, tame blown fluorescents
    a = a / (1 + a * 0.35) * 1.3                           # soft highlight roll-off
    a[..., 0] *= 1.04; a[..., 2] *= 0.93                   # warm
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    v = 1 - 0.45 * (((xx / w - 0.5) / 0.75) ** 2 + ((yy / h - 0.5) / 0.75) ** 2)  # vignette
    return Image.fromarray((np.clip(a * np.clip(v, 0.35, 1)[..., None], 0, 1) * 255).astype(np.uint8))


def load_crop(num: int, box: tuple, min_w: int = MIN_SRC_W) -> Image.Image:
    img = ImageOps.exif_transpose(Image.open(SRC / f"rock park ({num}).jpeg")).convert("RGB")
    w, h = img.size
    x0, y0, x1, y1 = box
    crop = img.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
    if crop.width < min_w and crop.height < min_w:
        raise ValueError(f"crop from #{num} is only {crop.size}; widen it instead of upscaling")
    return crop


def export(img: Image.Image, name: str, alpha=False) -> None:
    for old in OUT.glob(f"{name}-*.*"):
        old.unlink()
    widths = [w for w in WIDTHS if w <= img.width] or [img.width]
    for width in widths:  # true widths only, never a padded duplicate
        r = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
        r.save(OUT / f"{name}-{width}.webp", "WEBP", quality=82, method=6)
        if HAS_AVIF:
            r.save(OUT / f"{name}-{width}.avif", "AVIF", quality=60)
        if width == 1280 or width == widths[-1] and width < 1280:
            (r.convert("RGB") if alpha else r).save(OUT / f"{name}-{width}.jpg", "JPEG", quality=84, optimize=True, progressive=True)
    print(f"{name:22s} {img.width}x{img.height} -> {widths}")


def process(name: str, num: int, box: tuple, min_w: int = MIN_SRC_W) -> None:
    img = grade(load_crop(num, box, min_w))
    if img.width > WIDTHS[-1]:
        img = img.resize((WIDTHS[-1], round(img.height * WIDTHS[-1] / img.width)), Image.LANCZOS)
    if name in RETOUCH or name in SPOTS:
        img = remove_stickers(img, RETOUCH.get(name, ()), SPOTS.get(name, ()))
    if name in CINEMATIC:
        img = cinematic(img)
    if name in GAIN:
        a = np.asarray(img).astype(np.float32) / 255.0
        img = Image.fromarray((np.clip(1 - (1 - a) ** GAIN[name], 0, 1) * 255).astype(np.uint8))
    export(img, name)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    only = set(filter(None, ap.parse_args().only.split(",")))
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (num, box) in CROPS.items():
        if not only or name in only:
            process(name, num, box)
    for name, (num, box) in {**SPOTLIGHTS, **MACROS}.items():
        if not only or name in only:
            process(name, num, box, min_w=1060)  # displayed at most ~640px wide
