#!/usr/bin/env python3
"""Builds the MyBook.pk favicon set from the header brand mark: a green (#01411c) circle with a gold
(#c9a227) ring and a white five-pointed star. Run from the repo root: python3 scripts/make-favicons.py"""
import math
from PIL import Image, ImageDraw

GREEN, GOLD, WHITE, CREAM = (1, 65, 28, 255), (201, 162, 39, 255), (255, 255, 255, 255), (247, 244, 238, 255)
SS = 8  # supersampling factor

def star_points(cx, cy, R, r):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rad = R if i % 2 == 0 else r
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts

def mark(size, bg=None, scale=1.0, ring=0.075, star=0.33):
    """size: output px; bg: square background colour or None (transparent); scale: circle diameter / size."""
    S = size * SS
    img = Image.new("RGBA", (S, S), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    D = S * scale
    c = S / 2
    d.ellipse([c - D / 2, c - D / 2, c + D / 2, c + D / 2], fill=GOLD)
    inner = D / 2 * (1 - 2 * ring)
    d.ellipse([c - inner, c - inner, c + inner, c + inner], fill=GREEN)
    R = D * star
    d.polygon(star_points(c, c + 0.0955 * R, R, R * 0.40), fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)

def small(size):
    # thicker ring and a slightly larger star so the mark stays readable at 16-48 px
    return mark(size, ring=0.10 if size <= 32 else 0.085, star=0.36)

if __name__ == "__main__":
    for n in (48, 96, 192, 512):
        (small(n) if n == 48 else mark(n)).save(f"favicon-{n}x{n}.png", optimize=True)
    mark(192).save("android-chrome-192x192.png", optimize=True)
    mark(512).save("android-chrome-512x512.png", optimize=True)
    mark(512, bg=GREEN, scale=0.78).save("android-chrome-maskable-512x512.png", optimize=True)
    mark(180, bg=CREAM, scale=0.84).save("apple-touch-icon.png", optimize=True)
    mark(512).save("images/mybook-pk-logo-512.png", optimize=True)
    ico = [small(16), small(32), small(48)]
    ico[2].save("favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
