"""Chart-image rendering for report exports.

Renders the report's data-viz layouts (radar, heatmap, bar) to PNG bytes with
matplotlib so PDF/DOCX/PPTX can embed the same visuals the on-screen report
shows. All functions are best-effort: any failure returns None and the caller
falls back to a table, so an export never breaks on a chart.
"""
from __future__ import annotations

import io
from typing import Any

# Consulting-deck palette (matches the on-screen light report).
_INK = "#0f172a"
_MUTED = "#64748b"
_LINE = "#e2e8f0"
_BLUE = "#1d4ed8"
_BLUE_FILL = "#3b82f6"
_AMBER = "#f59e0b"


def _fig_to_png(fig) -> bytes | None:
    try:
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=200, bbox_inches="tight", facecolor="white")
        buf.seek(0)
        return buf.getvalue()
    except Exception:  # noqa: BLE001
        return None
    finally:
        try:
            import matplotlib.pyplot as plt

            plt.close(fig)
        except Exception:  # noqa: BLE001
            pass


def radar_png(data: dict[str, Any]) -> bytes | None:
    """Radar/spider chart: axes + one or more series."""
    try:
        import math

        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        axes = [str(a) for a in (data.get("axes") or [])]
        series = data.get("series") or []
        if len(axes) < 3 or not series:
            return None
        n = len(axes)
        angles = [i / n * 2 * math.pi for i in range(n)]
        angles += angles[:1]
        vmax = float(data.get("max") or 5)

        fig, ax = plt.subplots(figsize=(5.2, 5.2), subplot_kw=dict(polar=True))
        palette = [_BLUE, _AMBER, "#059669", "#dc2626"]
        for i, s in enumerate(series):
            vals = [float(v) for v in (s.get("values") or [])][:n]
            if len(vals) < n:
                vals += [0] * (n - len(vals))
            vals += vals[:1]
            color = s.get("color") or palette[i % len(palette)]
            ax.plot(angles, vals, color=color, linewidth=2, label=str(s.get("name") or f"Series {i+1}"))
            ax.fill(angles, vals, color=color, alpha=0.12)
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(axes, fontsize=9, color=_INK)
        ax.set_ylim(0, vmax)
        ax.set_yticks([vmax * f for f in (0.25, 0.5, 0.75, 1.0)])
        ax.set_yticklabels([f"{vmax * f:.0f}" for f in (0.25, 0.5, 0.75, 1.0)], fontsize=7, color=_MUTED)
        ax.grid(color=_LINE)
        ax.spines["polar"].set_color(_LINE)
        if len(series) > 1:
            ax.legend(loc="upper right", bbox_to_anchor=(1.25, 1.1), fontsize=8, frameon=False)
        return _fig_to_png(fig)
    except Exception:  # noqa: BLE001
        return None


def heatmap_png(data: dict[str, Any]) -> bytes | None:
    """Heatmap: rows x cols matrix of 0-1 (or scaled) values."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib.colors import LinearSegmentedColormap

        rows = [str(r) for r in (data.get("rows") or [])]
        cols = [str(c) for c in (data.get("cols") or [])]
        values = data.get("values") or []
        if not rows or not cols or not values:
            return None
        # Normalise to a clean matrix.
        matrix = []
        for r in range(len(rows)):
            row = values[r] if r < len(values) else []
            matrix.append([float(row[c]) if c < len(row) and isinstance(row[c], (int, float)) else 0.0 for c in range(len(cols))])

        pct = str(data.get("valueFormat")) == "percent"
        vmax = 1.0 if pct else max((max(r) for r in matrix if r), default=1.0) or 1.0

        cmap = LinearSegmentedColormap.from_list("rp", ["#fee2e2", "#fef3c7", "#dcfce7"])
        fig, ax = plt.subplots(figsize=(min(1.1 * len(cols) + 2, 9), min(0.6 * len(rows) + 1.5, 8)))
        im = ax.imshow(matrix, cmap=cmap, vmin=0, vmax=vmax, aspect="auto")
        ax.set_xticks(range(len(cols)))
        ax.set_xticklabels(cols, rotation=30, ha="right", fontsize=8, color=_INK)
        ax.set_yticks(range(len(rows)))
        ax.set_yticklabels(rows, fontsize=8, color=_INK)
        for i in range(len(rows)):
            for j in range(len(cols)):
                v = matrix[i][j]
                label = f"{v*100:.0f}%" if pct else (f"{v:.0f}" if v == int(v) else f"{v:.1f}")
                ax.text(j, i, label, ha="center", va="center", fontsize=7.5, color=_INK)
        ax.set_xticks([x - 0.5 for x in range(1, len(cols))], minor=True)
        ax.set_yticks([y - 0.5 for y in range(1, len(rows))], minor=True)
        ax.grid(which="minor", color="white", linewidth=2)
        ax.tick_params(which="minor", length=0)
        for spine in ax.spines.values():
            spine.set_visible(False)
        return _fig_to_png(fig)
    except Exception:  # noqa: BLE001
        return None


def bar_png(data: dict[str, Any]) -> bytes | None:
    """Horizontal bar chart with optional benchmark markers."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        items = data.get("items") or []
        if not items:
            return None
        labels = [str(it.get("label") or "") for it in items]
        vals = [float(it.get("value") or 0) for it in items]
        sent = [str(it.get("sentiment") or "neutral") for it in items]
        color_map = {"good": "#059669", "warning": _AMBER, "bad": "#dc2626", "neutral": _BLUE_FILL}
        colors = [color_map.get(s, _BLUE_FILL) for s in sent]

        fig, ax = plt.subplots(figsize=(7, max(2.2, 0.5 * len(items) + 1)))
        y = range(len(items))
        ax.barh(list(y), vals, color=colors, height=0.6)
        for i, it in enumerate(items):
            bench = it.get("benchmark")
            if isinstance(bench, (int, float)):
                ax.plot([bench, bench], [i - 0.35, i + 0.35], color=_INK, linewidth=1.5)
        ax.set_yticks(list(y))
        ax.set_yticklabels(labels, fontsize=9, color=_INK)
        ax.invert_yaxis()
        vmax = float(data.get("max") or (max(vals + [1]) * 1.15))
        ax.set_xlim(0, vmax)
        for i, v in enumerate(vals):
            ax.text(v + vmax * 0.01, i, f"{v:g}", va="center", fontsize=8, color=_MUTED)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.spines["left"].set_color(_LINE)
        ax.spines["bottom"].set_color(_LINE)
        ax.tick_params(colors=_MUTED)
        return _fig_to_png(fig)
    except Exception:  # noqa: BLE001
        return None


def chart_png_for(layout: str, data: dict[str, Any]) -> bytes | None:
    """Dispatch a section layout to its chart renderer, or None if not a chart."""
    if layout in ("radar_chart", "radar"):
        return radar_png(data)
    if layout in ("heatmap", "maturity_heatmap"):
        return heatmap_png(data)
    if layout in ("bar_chart", "horizontal_bar_chart", "bar"):
        return bar_png(data)
    return None
