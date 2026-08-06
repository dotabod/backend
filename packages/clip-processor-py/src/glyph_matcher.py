"""Font-exact text recognition for fixed UI regions.

Use when the font file and render size are known/knowable and the string format is
constrained (a small alphabet + a bounded set of valid values). Under those conditions
you can *render the answer* and compare pixels, which beats general OCR outright on
small text -- Tesseract's own docs warn that below ~10px x-height accuracy collapses,
and no amount of preprocessing recovers information the rasteriser never wrote.

Two primitives, both needed:

  find_anchor()  locates a constant substring (e.g. a "Rank"/"Score" label) to
                 establish the PEN ORIGIN -- the exact sub-pixel spot the game's text
                 layout started from. Everything downstream keys off this.

  read_glyphs()  walks the variable part one glyph at a time, advancing the pen by the
                 font's real advance width and re-locking within a small jitter budget.

Why per-glyph rather than rendering whole candidate strings and taking the argmax:
a whole-string template has to stay aligned across the entire span, so a half-pixel
error in the origin smears the tail and the match degrades. Re-locking on every glyph
bounds that error. Measured on real frames: whole-string 35%, per-glyph 100%.

See references/pitfalls.md for the five bugs that make naive implementations silently
wrong. They are not obvious and every one of them cost real debugging time.
"""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Templates are drawn at this inset so a glyph's bearings/overhang are never clipped
# and offsets relative to the pen origin stay measurable.
PAD = 20


def text_signal(img_bgr, box=None, blur_sigma=4.0):
    """Isolate text ink from a coloured/gradient background.

    Game UI text usually sits on a gradient plate, so a global threshold either eats
    the text at one end of the plate or floods it at the other. Subtracting a heavily
    blurred copy removes any background that varies slowly in space while keeping the
    high-frequency glyph strokes, which is exactly the separation we want.

    Returns a float32 array normalised to [0,1]. Works for light-on-dark; for
    dark-on-light pass the inverted image.
    """
    if box is not None:
        x0, y0, x1, y1 = box
        img_bgr = img_bgr[y0:y1, x0:x1]
    if img_bgr.ndim == 3:
        g = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    else:
        g = img_bgr
    g = g.astype(np.float32)
    bg = cv2.GaussianBlur(g, (0, 0), blur_sigma)
    s = np.clip(g - bg, 0, None)
    return s / (s.max() + 1e-6)


class GlyphMatcher:
    """Renders glyphs from a known font and matches them against a UI region."""

    def __init__(self, font_path, size):
        self.font_path = font_path
        self.size = int(size)
        self.font = ImageFont.truetype(font_path, self.size)
        self._tpl_cache = {}

    # ---------- rendering ----------

    def render(self, s, w=None, h=None):
        """Render `s` at the pen origin (PAD, PAD). Full canvas, not cropped."""
        w = w or (int(self.font.getlength(s)) + 4 * PAD)
        h = h or (self.size * 3 + 2 * PAD)
        im = Image.new("L", (w, h), 0)
        ImageDraw.Draw(im).text((PAD, PAD), s, font=self.font, fill=255)
        return np.array(im, dtype=np.float32) / 255.0

    def template(self, s, thresh=0.04):
        """Tight-cropped ink for `s` plus its offset from the pen origin.

        Returns (patch, dx, dy) where (dx,dy) is where the ink starts relative to the
        pen origin. Keeping that offset is what lets us convert a match position back
        into a pen origin, and vice versa.
        """
        if s in self._tpl_cache:
            return self._tpl_cache[s]
        a = self.render(s)
        ys, xs = np.nonzero(a > thresh)
        if len(ys) == 0:
            raise ValueError(f"{s!r} renders as blank at size {self.size}")
        out = (a[ys.min():ys.max() + 1, xs.min():xs.max() + 1],
               int(xs.min()) - PAD, int(ys.min()) - PAD)
        self._tpl_cache[s] = out
        return out

    def advance(self, s):
        """Real advance width in px, including kerning. Never use ink width for this:
        most UI fonts have PROPORTIONAL digits (Radiance's vary 483-549/1000em), so
        stepping the pen by ink width desynchronises after two or three glyphs."""
        return self.font.getlength(s)

    # ---------- matching ----------

    def find_anchor(self, band, candidates):
        """Locate a constant substring to fix the pen origin.

        `candidates` maps a label (often a language) to the literal text, e.g.
        {"eng": "Rank", "rus": "Ранг"}. The best-scoring one wins, which doubles as
        cheap language/variant detection.

        Returns (label, score, ox, oy) with (ox,oy) the PEN ORIGIN in band coords,
        or None if nothing fits.
        """
        best = None
        for label, text in candidates.items():
            patch, dx, dy = self.template(text)
            if patch.shape[0] > band.shape[0] or patch.shape[1] > band.shape[1]:
                continue
            _, score, _, loc = cv2.minMaxLoc(
                cv2.matchTemplate(band, patch, cv2.TM_CCOEFF_NORMED))
            if best is None or score > best[1]:
                best = (label, float(score), loc[0] - dx, loc[1] - dy)
        return best

    def match_glyph(self, band, alphabet, penx, oy, jitter=2):
        """Best glyph from `alphabet` at the current pen. Returns (score, glyph, dx).

        `dx` is the observed minus expected x offset. A large |dx| means the thing we
        found is not where this glyph should be -- usually the string already ended and
        we are drifting into neighbouring UI. Callers should treat that as a stop
        signal rather than accepting the glyph.
        """
        out = []
        for ch in alphabet:
            patch, gdx, gdy = self.template(ch)
            ex = int(round(penx + gdx))
            ey = int(round(oy + gdy))
            x0, y0 = max(0, ex - jitter), max(0, ey - jitter)
            x1 = min(band.shape[1], ex + patch.shape[1] + jitter)
            y1 = min(band.shape[0], ey + patch.shape[0] + jitter)
            win = band[y0:y1, x0:x1]
            if win.shape[0] < patch.shape[0] or win.shape[1] < patch.shape[1]:
                continue
            _, score, _, loc = cv2.minMaxLoc(
                cv2.matchTemplate(win, patch, cv2.TM_CCOEFF_NORMED))
            out.append((float(score), ch, (loc[0] + x0) - ex))
        if not out:
            return None
        out.sort(key=lambda t: -t[0])
        return out[0]

    def read_glyphs(self, band, penx, oy, alphabet, max_len,
                    min_score=0.55, jitter=2, pre_advance=None):
        """Greedily read up to `max_len` glyphs, advancing the pen by real metrics.

        `pre_advance` optionally maps a glyph index to extra advance to absorb before
        reading it -- used for separators the layout inserts (e.g. the thin space in
        a thousands-grouped number).

        Returns (string, [scores]). Stops early on a weak match or a drifted pen,
        which is how a 3-glyph value is distinguished from a 4-glyph one.
        """
        got, scores = [], []
        for k in range(max_len):
            if pre_advance and k in pre_advance:
                penx += pre_advance[k]
            m = self.match_glyph(band, alphabet, penx, oy, jitter)
            if m is None:
                break
            score, ch, dx = m
            if score < min_score or abs(dx) > jitter:
                break
            got.append(ch)
            scores.append(score)
            penx += dx + self.advance(ch)
        return "".join(got), scores

    def verify(self, band, ox, oy, candidates, span_text):
        """Rank whole-string candidates over ONE COMMON window.

        This exists because normalised cross-correlation is only comparable between
        candidates when they are scored over an identical window. Score each candidate
        over its own tight bounding box and a *shorter* string wins automatically --
        it is asked to explain fewer pixels, so "1" outscores the true "1 113". Sizing
        the window from `span_text` (the widest legal string) forces every candidate to
        account for the same pixels, including the ones it leaves blank.

        Returns [(score, candidate), ...] best first.
        """
        gh = int(np.ceil(self.size * 1.4))
        px1 = min(band.shape[1], ox + int(self.advance(span_text)) + 3)
        if oy < 0 or ox < 0 or oy + gh > band.shape[0] or px1 <= ox:
            return []
        w = band[oy:oy + gh, ox:px1]
        a = w - w.mean()
        na = float(np.sqrt((a * a).sum()))
        scored = []
        for cand in candidates:
            t = self.render(cand)
            u = t[PAD:PAD + gh, PAD:PAD + (px1 - ox)]
            if u.shape != w.shape:
                scored.append((0.0, cand))
                continue
            b = u - u.mean()
            nb = float(np.sqrt((b * b).sum()))
            scored.append(((float((a * b).sum() / (na * nb)) if na * nb > 1e-9 else 0.0), cand))
        scored.sort(key=lambda t: -t[0])
        return scored
