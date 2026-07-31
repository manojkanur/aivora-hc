"""White, dashboard-style LinkedIn poster renderer (Deloitte/EY consulting look).

Draws a 1200x1200 multi-panel infographic on a WHITE background from a typed
data model - deterministic (no AI-image garbled text). The AI composes the data;
this module renders it as a clean consulting one-pager:

  [ brand header + eyebrow ]
  [ big title ]
  [ hero stat  |  3 KPI tiles ]
  [ bar panel  |  donut panel ]
  [ insight callout ]
  [ footer: aivora.hc  ·  tag ]

Data model (all optional except title):
{
  "eyebrow": "Workforce Planning",
  "title": "Align talent strategy with business goals",
  "hero": {"value": "85%", "label": "improved planning accuracy",
           "note": "Organisations with mature workforce planning"},
  "kpis": [{"value": "3.2x", "label": "faster to fill critical roles"}, ...],   # up to 3
  "bars": [{"label": "Sourcing", "value": 42}, ...],   # 3-5, values 0-100
  "donut": {"percent": 62, "label": "internal fill rate",
            "points": ["...", "...", "..."]},
  "insight": "One sharp takeaway sentence.",
  "tag": "Human Capital, elevated"
}
"""

from __future__ import annotations

import io
import math
from typing import Any

# ── Light "consulting" palette ───────────────────────────────────────────────
BG = (255, 255, 255)
INK = (15, 23, 42)          # slate-900 - headlines
BODY = (71, 85, 105)        # slate-600 - body
MUTED = (148, 163, 184)     # slate-400 - captions
LINE = (226, 232, 240)      # slate-200 - hairlines
PANEL = (248, 250, 252)     # slate-50 - panel fill
ACCENT = (37, 99, 235)      # blue-600
ACCENT_2 = (59, 130, 246)   # blue-500
GOOD = (16, 185, 129)       # emerald-500
AMBER = (245, 158, 11)
VIOLET = (139, 92, 246)
TRACK = (226, 232, 240)     # bar track

W = H = 1200
PAD = 80

_BAR_PALETTE = [ACCENT, VIOLET, GOOD, AMBER, ACCENT_2]


def _font(size: int, bold: bool = False, black: bool = False):
    from PIL import ImageFont
    reg = [
        "/usr/share/fonts/opentype/inter/Inter-Regular.otf",
        "/usr/share/fonts/truetype/inter/Inter-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    bd = [
        "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
        "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf",
        "/usr/share/fonts/truetype/inter/Inter-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for p in (bd if (bold or black) else reg):
        try:
            return ImageFont.truetype(p, size)
        except (OSError, IOError):
            continue
    from PIL import ImageFont as _IF
    return _IF.load_default()


def _tw(draw, text: str, font) -> int:
    b = draw.textbbox((0, 0), text, font=font)
    return b[2] - b[0]


def _wrap(draw, text: str, font, max_w: int) -> list[str]:
    words = str(text).split()
    lines: list[str] = []
    cur = ""
    for w in words:
        t = (cur + " " + w).strip()
        if _tw(draw, t, font) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _str(x: Any, default: str = "") -> str:
    return str(x).strip() if x is not None else default


def render_poster(data: dict[str, Any]) -> bytes:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    eyebrow = _str(data.get("eyebrow"), "AIVORA HC INSIGHT").upper()[:48]
    title = _str(data.get("title"), "Human Capital, elevated")
    hero = data.get("hero") if isinstance(data.get("hero"), dict) else {}
    kpis = [k for k in (data.get("kpis") or []) if isinstance(k, dict)][:3]
    bars = [b for b in (data.get("bars") or []) if isinstance(b, dict)][:5]
    donut = data.get("donut") if isinstance(data.get("donut"), dict) else None
    insight = _str(data.get("insight"))
    tag = _str(data.get("tag"), "Human Capital, elevated")

    # ── Header ────────────────────────────────────────────────────────────
    y = PAD
    # accent tick + brand
    d.rounded_rectangle((PAD, y + 4, PAD + 34, y + 12), radius=4, fill=ACCENT)
    ey_font = _font(24, bold=True)
    d.text((PAD + 48, y - 4), eyebrow, font=ey_font, fill=ACCENT)
    brand_font = _font(24, bold=True)
    brand = "AIVORA HC"
    d.text((W - PAD - _tw(d, brand, brand_font), y - 4), brand, font=brand_font, fill=INK)
    y += 40

    # ── Title ─────────────────────────────────────────────────────────────
    title_font = _font(60, black=True)
    for line in _wrap(d, title, title_font, W - 2 * PAD)[:3]:
        d.text((PAD, y), line, font=title_font, fill=INK)
        y += 70
    y += 24

    # ── Hero stat + KPI tiles row ─────────────────────────────────────────
    row_h = 260
    hero_w = 520
    hx0, hx1 = PAD, PAD + hero_w
    hy0, hy1 = y, y + row_h
    # Hero panel (accent-tinted)
    d.rounded_rectangle((hx0, hy0, hx1, hy1), radius=28, fill=(239, 246, 255))
    hval = _str(hero.get("value"), "")[:7]
    if hval:
        val_font = _font(150, black=True)
        d.text((hx0 + 40, hy0 + 30), hval, font=val_font, fill=ACCENT)
        lbl_font = _font(28, bold=True)
        lbl_lines = _wrap(d, _str(hero.get("label")).upper(), lbl_font, hero_w - 80)[:2]
        ly = hy0 + 190
        for ln in lbl_lines:
            d.text((hx0 + 40, ly), ln, font=lbl_font, fill=INK)
            ly += 32
    else:
        # No hero value: use the panel for the note only.
        note_font = _font(30, bold=True)
        for ln in _wrap(d, _str(hero.get("label"), title), note_font, hero_w - 80)[:4]:
            d.text((hx0 + 40, hy0 + 40), ln, font=note_font, fill=INK)

    # KPI tiles column (right of hero)
    kx0 = hx1 + 32
    kx1 = W - PAD
    if kpis:
        n = len(kpis)
        gap = 20
        tile_h = (row_h - (n - 1) * gap) // n
        ky = hy0
        for i, k in enumerate(kpis):
            d.rounded_rectangle((kx0, ky, kx1, ky + tile_h), radius=22, fill=PANEL)
            kv_font = _font(min(54, tile_h - 20), black=True)
            kv = _str(k.get("value"))[:8]
            d.text((kx0 + 28, ky + tile_h // 2 - 34), kv, font=kv_font, fill=_BAR_PALETTE[i % len(_BAR_PALETTE)])
            kl_font = _font(24, bold=False)
            kl_lines = _wrap(d, _str(k.get("label")), kl_font, kx1 - kx0 - 220)[:2]
            lyy = ky + tile_h // 2 - (len(kl_lines) * 15)
            for ln in kl_lines:
                d.text((kx0 + 210, lyy), ln, font=kl_font, fill=BODY)
                lyy += 30
            ky += tile_h + gap
    y = hy1 + 40

    # ── Bars panel + Donut panel row ──────────────────────────────────────
    p_h = 300
    py0, py1 = y, y + p_h
    has_bars = len(bars) >= 2
    has_donut = bool(donut and isinstance(donut.get("percent"), (int, float)))

    if has_bars and has_donut:
        bx0, bx1 = PAD, PAD + 560
        dx0, dx1 = bx1 + 32, W - PAD
    elif has_bars:
        bx0, bx1 = PAD, W - PAD
        dx0 = dx1 = 0
    elif has_donut:
        dx0, dx1 = PAD, W - PAD
        bx0 = bx1 = 0
    else:
        bx0 = bx1 = dx0 = dx1 = 0

    if has_bars:
        d.rounded_rectangle((bx0, py0, bx1, py1), radius=24, fill=PANEL)
        vals = [float(_num(b.get("value"))) for b in bars]
        mx = max(vals + [1])
        n = len(bars)
        inner_top = py0 + 40
        inner_bottom = py1 - 36
        avail = inner_bottom - inner_top
        row = avail / n
        bar_x0 = bx0 + 200
        bar_x1 = bx1 - 90
        lab_font = _font(22, bold=True)
        val_font = _font(22, bold=True)
        for i, b in enumerate(bars):
            ry = inner_top + i * row + row / 2
            lbl = _str(b.get("label"))[:20]
            d.text((bx0 + 28, ry - 12), lbl, font=lab_font, fill=INK)
            frac = min(1.0, vals[i] / mx)
            fill_w = int((bar_x1 - bar_x0) * frac)
            d.rounded_rectangle((bar_x0, ry - 11, bar_x1, ry + 11), radius=11, fill=TRACK)
            if fill_w > 6:
                d.rounded_rectangle((bar_x0, ry - 11, bar_x0 + fill_w, ry + 11), radius=11,
                                    fill=_BAR_PALETTE[i % len(_BAR_PALETTE)])
            unit = _str(b.get("unit"))
            vtxt = _fmt_num(vals[i]) + unit
            d.text((bar_x1 + 12, ry - 12), vtxt, font=val_font, fill=INK)

    if has_donut:
        d.rounded_rectangle((dx0, py0, dx1, py1), radius=24, fill=PANEL)
        pct = max(0, min(100, float(_num(donut.get("percent")))))
        cx = dx0 + 120
        cy = py0 + p_h // 2
        r = 84
        # track ring
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=TRACK)
        sweep = 360 * (pct / 100)
        if sweep > 0:
            d.pieslice((cx - r, cy - r, cx + r, cy + r), start=-90, end=-90 + sweep, fill=ACCENT)
        d.ellipse((cx - r + 30, cy - r + 30, cx + r - 30, cy + r - 30), fill=PANEL)
        pf = _font(46, black=True)
        pt = f"{int(round(pct))}%"
        d.text((cx - _tw(d, pt, pf) / 2, cy - 26), pt, font=pf, fill=INK)
        # label + points
        lx = cx + r + 40
        dl_font = _font(22, bold=True)
        lyy = py0 + 34
        for ln in _wrap(d, _str(donut.get("label")).upper(), dl_font, dx1 - lx - 20)[:2]:
            d.text((lx, lyy), ln, font=dl_font, fill=INK)
            lyy += 28
        pts = [p for p in (donut.get("points") or []) if _str(p)][:3]
        ppy = lyy + 14
        pf2 = _font(22)
        for p in pts:
            d.ellipse((lx, ppy + 8, lx + 10, ppy + 18), fill=ACCENT)
            for j, ln in enumerate(_wrap(d, _str(p), pf2, dx1 - lx - 40)[:2]):
                d.text((lx + 24, ppy + j * 26), ln, font=pf2, fill=BODY)
            ppy += 56
    y = py1 + 40

    # ── Insight callout ───────────────────────────────────────────────────
    if insight:
        ins_font = _font(30, bold=True)
        lines = _wrap(d, insight, ins_font, W - 2 * PAD - 60)[:3]
        box_h = 40 + len(lines) * 40
        d.rounded_rectangle((PAD, y, W - PAD, y + box_h), radius=22, fill=(240, 249, 255))
        d.rounded_rectangle((PAD, y, PAD + 8, y + box_h), radius=4, fill=ACCENT)
        iy = y + 24
        for ln in lines:
            d.text((PAD + 36, iy), ln, font=ins_font, fill=INK)
            iy += 40
        y += box_h + 32

    # ── Footer ────────────────────────────────────────────────────────────
    fy = H - PAD - 6
    d.line((PAD, fy - 24, W - PAD, fy - 24), fill=LINE, width=2)
    f_font = _font(24, bold=True)
    d.text((PAD, fy), "aivora.hc", font=f_font, fill=INK)
    t_font = _font(22)
    tt = tag[:48]
    d.text((W - PAD - _tw(d, tt, t_font), fy + 2), tt, font=t_font, fill=MUTED)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _num(x: Any) -> float:
    try:
        if isinstance(x, (int, float)):
            return float(x)
        s = "".join(c for c in str(x) if c.isdigit() or c in ".-")
        return float(s) if s else 0.0
    except (ValueError, TypeError):
        return 0.0


def _fmt_num(v: float) -> str:
    if math.isclose(v, round(v)):
        return str(int(round(v)))
    return f"{v:.1f}"
