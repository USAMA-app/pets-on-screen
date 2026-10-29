"""Pets On Screen - design your own desktop pets and let them roam your Windows screen.

    python pet.py            run your pets (opens the designer if you have none)
    python pet.py --design   open the designer as well
    python pet.py --test     self-check

Pets: click = pet it, stroke it with the mouse = purr, drag = pick up, double-click = jump,
right-click = menu (feed, play, sleep, edit design, new pet...).
"""
import colorsys
import ctypes
import json
import math
import os
import random
import sys
import tkinter as tk
from tkinter import colorchooser, ttk

SAVE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pets.json")
KEY = "#ff00fe"      # transparent colour of pet windows
BW, BH, M = 120, 100, 30  # pet drawing box, plus top margin for hearts / speech
TICK = 40            # ms per frame
SPEED = 2.5          # px per frame at size 1
STYLES = ["3D", "Flat", "Cartoon"]

SPECIES = {
    "cat":   dict(ears="pointy", tail="curl", snout=False, sound="Meow!",
                  colors=dict(body="#f4a340", belly="#ffe2b8", accent="#ff9aa8", eyes="#2e7d32")),
    "dog":   dict(ears="floppy", tail="wag", snout=True, sound="Woof!",
                  colors=dict(body="#c28b5c", belly="#f3e0c6", accent="#7a4f2e", eyes="#3b2414")),
    "bunny": dict(ears="long", tail="puff", snout=False, sound="*squeak*", hop=True,
                  colors=dict(body="#ececf2", belly="#ffffff", accent="#ffb3c6", eyes="#c2185b")),
    "fox":   dict(ears="pointy", tail="bushy", snout=True, sound="Yip!", dark_limbs=True,
                  colors=dict(body="#e8702a", belly="#fff6ee", accent="#3a2a20", eyes="#5d3a00")),
    "panda": dict(ears="round", tail="puff", snout=False, sound="*munch*", dark_limbs=True, patches=True,
                  colors=dict(body="#f7f7f7", belly="#ffffff", accent="#262626", eyes="#111111")),
}


def new_design(species="cat"):
    return dict(name=species.title(), species=species, style="3D", size=1.0, **SPECIES[species]["colors"])


def load():
    try:
        with open(SAVE) as f:
            data = json.load(f)
    except (OSError, ValueError):
        return []
    return [{**new_design(d["species"]), **d} for d in data if d.get("species") in SPECIES]


def save(designs):
    with open(SAVE, "w") as f:
        json.dump(designs, f, indent=2)


def work_area():
    """Screen rect minus the taskbar: (left, top, right, bottom)."""
    r = (ctypes.c_long * 4)()
    ctypes.windll.user32.SystemParametersInfoW(0x30, 0, r, 0)  # SPI_GETWORKAREA
    return tuple(r)


def step(x, d, speed, lo, hi):
    """Move x by speed in direction d, bouncing off [lo, hi]. Returns (x, d)."""
    x += d * speed
    if x <= lo or x >= hi:
        d = -d
        x = max(lo, min(x, hi))
    return x, d


def shade(col, f):
    """f < 1 darkens towards black, f > 1 lightens towards white (2 = white)."""
    rgb = [int(col[i:i + 2], 16) for i in (1, 3, 5)]
    rgb = [v * f if f < 1 else v + (255 - v) * min(f - 1, 1) for v in rgb]
    return "#%02x%02x%02x" % tuple(int(v) for v in rgb)


class Pen:
    """Draws styled primitives in the pet's local coords (facing right), mirrored when facing left."""

    def __init__(self, c, style, facing, k, dy=0):
        self.c, self.style, self.f, self.k, self.dy = c, style, facing, k, dy

    def p(self, x, y):
        return (x if self.f > 0 else BW - x) * self.k, (y + M + self.dy) * self.k

    def box(self, x0, y0, x1, y1):
        (a, b), (c, d) = self.p(x0, y0), self.p(x1, y1)
        return min(a, c), b, max(a, c), d

    def edge(self, col):
        if self.style == "Cartoon":
            return dict(outline="#111", width=max(2, 2.5 * self.k))
        return dict(outline=shade(col, .6), width=1)

    def oval(self, x0, y0, x1, y1, col):
        x0, y0, x1, y1 = self.box(x0, y0, x1, y1)
        if self.style != "3D":
            self.c.create_oval(x0, y0, x1, y1, fill=col, **self.edge(col))
            return
        w, h = x1 - x0, y1 - y0
        for i in range(6):  # rings shrinking towards a top-left light
            t = i / 6
            ix, iy, ox, oy = w * t * .38, h * t * .38, -w * t * .12, -h * t * .14
            self.c.create_oval(x0 + ix + ox, y0 + iy + oy, x1 - ix + ox, y1 - iy + oy,
                               fill=shade(col, .72 + t * .5), outline="")
        self.c.create_oval(x0 + w * .22, y0 + h * .14, x0 + w * .42, y0 + h * .3, fill=shade(col, 1.6), outline="")

    def poly(self, pts, col):
        q = [v for x, y in pts for v in self.p(x, y)]
        if self.style != "3D":
            self.c.create_polygon(q, fill=col, **self.edge(col))
            return
        self.c.create_polygon(q, fill=shade(col, .75), outline="")
        cx, cy = sum(q[::2]) / len(pts), sum(q[1::2]) / len(pts)
        inner = [v for x, y in zip(q[::2], q[1::2]) for v in (cx + (x - cx) * .7, cy + (y - cy) * .7 - 1.5 * self.k)]
        self.c.create_polygon(inner, fill=shade(col, 1.12), outline="")

    def line(self, pts, col, w, smooth=False):
        q = [v for x, y in pts for v in self.p(x, y)]
        w *= self.k
        kw = dict(capstyle="round", joinstyle="round", smooth=smooth)
        if self.style == "3D":
            self.c.create_line(q, fill=shade(col, .7), width=w, **kw)
            self.c.create_line([v - w * .1 for v in q], fill=col, width=w * .7, **kw)
            self.c.create_line([v - w * .2 for v in q], fill=shade(col, 1.3), width=w * .3, **kw)
            return
        self.c.create_line(q, width=w + (4 * self.k if self.style == "Cartoon" else 2),
                           fill="#111" if self.style == "Cartoon" else shade(col, .6), **kw)
        self.c.create_line(q, fill=col, width=w, **kw)

    def text(self, x, y, s, col, size):
        return self.c.create_text(*self.p(x, y), text=s, fill=col, font=("Segoe UI", -int(size * self.k), "bold"))


def draw_pet(c, d, st):
    """Draw design d on canvas c. st: k, facing, frame, pose, look, ground, hearts, bubble, treat."""
    c.delete("all")
    sp = SPECIES[d["species"]]
    k, fr, pose, style = st["k"], st["frame"], st["pose"], d["style"]
    body, belly, acc = d["body"], d["belly"], d["accent"]
    limb = acc if sp.get("dark_limbs") else body
    hopping = sp.get("hop") and pose == "walk"
    dy = 0
    if hopping:
        dy = -abs(math.sin(fr * .25)) * 12
    elif pose == "happy":
        dy = -abs(math.sin(fr * .4)) * 8
    elif pose == "sleep":
        dy = 4
    G = Pen(c, style, st["facing"], k)      # ground-anchored things
    P = Pen(c, style, st["facing"], k, dy)  # the pet itself

    if style == "3D" and st.get("ground", True):
        c.create_oval(*G.box(24, BH - 6, 98, BH), fill="#333", outline="")

    # tail
    wag = math.sin(fr * (.9 if pose == "happy" else .3))
    tail = sp["tail"]
    if tail == "curl":
        P.line([(26, 62), (8, 46 + 4 * wag), (14, 28)], body, 7, True)
    elif tail == "wag":
        P.line([(26, 58), (12, 48 + 6 * wag), (10, 36 + 8 * wag)], body, 8, True)
    elif tail == "bushy":
        P.line([(28, 62), (10, 54 + 3 * wag), (6, 38 + 4 * wag)], body, 15, True)
        P.oval(0, 24 + 4 * wag, 13, 40 + 4 * wag, belly)
    else:
        P.oval(12, 52, 30, 70, belly)

    # legs
    legs = ((36, 1), (50, -1), (72, -1), (86, 1))
    if pose in ("sit", "sleep", "eat", "happy") or hopping:
        for lx, _ in legs:
            P.oval(lx - 7, 86, lx + 7, 98, limb)
    else:
        swing = 7 * math.sin(fr * .45) if pose == "walk" else 4 * math.sin(fr * .3)
        drop = 4 if pose == "drag" else 0
        for lx, s in legs:
            P.line([(lx, 70), (lx + s * swing, 94 + drop)], limb, 8)

    # body
    P.oval(20, 46, 94, 84, body)
    P.oval(38, 62, 84, 84, belly)

    # ears behind the head
    ears = sp["ears"]
    if ears == "pointy":
        for outer, inner in (([(79, 30), (83, 5), (94, 22)], [(82, 26), (84, 12), (91, 22)]),
                             ([(99, 22), (110, 5), (113, 30)], [(102, 22), (109, 12), (110, 26)])):
            P.poly(outer, body)
            P.poly(inner, acc)
    elif ears == "long":
        for x in (82, 99):
            P.oval(x, -14, x + 12, 30, body)
            P.oval(x + 3, -8, x + 9, 26, acc)
    elif ears == "round":
        P.oval(74, 16, 88, 30, acc)
        P.oval(104, 16, 118, 30, acc)

    P.oval(76, 20, 116, 60, body)  # head

    if ears == "floppy":
        P.oval(72, 26, 84, 56, acc)
        P.oval(108, 26, 120, 56, acc)

    # face
    eyes = (91, 105)
    if sp.get("patches"):
        for ex in eyes:
            P.oval(ex - 6, 32, ex + 6, 46, acc)
    for ex in eyes:
        x, y = P.p(ex, 38)
        if pose in ("sleep", "happy", "eat"):
            r = 4 * k
            c.create_arc(x - r, y - r, x + r, y + r, start=200 if pose == "sleep" else 20, extent=140,
                         style="arc", outline="#222", width=max(1.5, 1.6 * k))
            continue
        r = 4.2 * k * (1.25 if pose == "drag" else 1)
        c.create_oval(x - r, y - r, x + r, y + r, fill="white", outline="#222")
        lx, ly = st.get("look", (0, 0))
        px, py, pr = x + lx * 1.6 * k, y + ly * 1.6 * k, 2.6 * k
        c.create_oval(px - pr, py - pr, px + pr, py + pr, fill=d["eyes"], outline="")
        c.create_oval(px - pr * .7, py - pr * .7, px - pr * .1, py - pr * .1, fill="white", outline="")
    if sp["snout"]:
        P.oval(96, 44, 118, 56, belly)
        P.oval(112, 44, 119, 49, "#222222")
        if pose == "happy":
            P.oval(104, 53, 111, 61, "#ff6f8a")  # tongue
    else:
        P.oval(96, 44, 101, 48, "#e46a7a")
    if d["species"] == "cat":
        for wy in (44, 49):
            c.create_line(*P.p(102, 47), *P.p(118, wy), fill="#555", width=1)

    # extras
    if pose == "eat" and st.get("treat"):
        r = 7 * st["treat"]
        P.oval(114 - r, 56 - r, 114 + r, 56 + r, "#b07a3c")
    if pose == "sleep":
        for i in range(3):
            P.text(112 + i * 6, 12 - i * 9 - (fr % 30) / 6, "z", "#5b7fff", 9 + i * 3)
    for hx, hy, _ in st.get("hearts", ()):
        G.text(hx, hy, "♥", "#ff4d6d", 14)
    if st.get("bubble"):
        t = G.text(96, -18, st["bubble"], "#222", 11)
        x0, y0, x1, y1 = c.bbox(t)
        c.create_rectangle(x0 - 5, y0 - 2, x1 + 5, y1 + 2, fill="white", outline="#444")
        c.tag_raise(t)


class Pet:
    def __init__(self, app, d):
        self.app, self.d = app, d
        self.win = tk.Toplevel(app.root)
        self.win.overrideredirect(True)
        self.win.wm_attributes("-topmost", True, "-transparentcolor", KEY)
        self.c = tk.Canvas(self.win, bg=KEY, highlightthickness=0)
        self.c.pack()
        self.lo, _, self.right, self.bottom = work_area()
        self.resize()
        self.x, self.y, self.vy, self.dir = random.randint(self.lo, self.hi), self.ground(), 0, random.choice((-1, 1))
        self.state, self.timer, self.frame = "walk", 0, 0
        self.hearts, self.bubble, self.bubble_t, self.treat = [], None, 0, 0
        self.press, self.drag, self.rub, self.last_mx = None, None, 0, None
        self.chase = tk.BooleanVar(value=False)

        self.menu = m = tk.Menu(self.win, tearoff=0)
        m.add_command(label="", state="disabled")
        m.add_separator()
        for label, cmd in (("Pet", self.pet), ("Feed", self.feed), ("Jump", self.jump),
                           ("Sit", lambda: self.set("sit", 150)), ("Sleep", lambda: self.set("sleep", 600))):
            m.add_command(label=label, command=cmd)
        m.add_checkbutton(label="Play: chase my cursor", variable=self.chase)
        m.add_separator()
        m.add_command(label="Edit design...", command=lambda: Designer(app, self))
        m.add_command(label="New pet...", command=lambda: Designer(app))
        m.add_command(label="Remove this pet", command=lambda: app.remove(self))
        m.add_command(label="Quit Pets On Screen", command=app.root.destroy)

        self.c.bind("<Button-3>", self.show_menu)
        self.c.bind("<ButtonPress-1>", self.on_press)
        self.c.bind("<B1-Motion>", self.on_drag)
        self.c.bind("<ButtonRelease-1>", self.on_release)
        self.c.bind("<Double-Button-1>", lambda e: self.jump())
        self.c.bind("<Motion>", self.on_hover)
        self.tick()

    def resize(self):
        self.k = self.d["size"]
        self.w, self.h = int(BW * self.k), int((BH + M) * self.k)
        self.c.config(width=self.w, height=self.h)
        self.hi = self.right - self.w
        self.y = self.ground()

    def ground(self):
        return self.bottom - self.h

    # --- interaction ---
    def show_menu(self, e):
        self.menu.entryconfig(0, label=f"{self.d['name']} the {self.d['species']}")
        self.menu.tk_popup(e.x_root, e.y_root)

    def on_press(self, e):
        self.press, self.drag = (e.x, e.y, e.x_root, e.y_root), None

    def on_drag(self, e):
        if not self.press:
            return
        ox, oy, sx, sy = self.press
        if self.drag or abs(e.x_root - sx) + abs(e.y_root - sy) > 5:
            self.drag = (ox, oy)
            self.x, self.y = e.x_root - ox, e.y_root - oy

    def on_release(self, _):
        if self.drag:
            self.vy, self.state = 0, "walk"
        elif self.press:
            self.pet()
        self.press = self.drag = None

    def on_hover(self, e):
        if self.last_mx is not None:
            self.rub += abs(e.x - self.last_mx)
        self.last_mx = e.x
        if self.rub > 400 * self.k:  # stroked back and forth
            self.rub = 0
            self.pet("Purr...")

    def say(self, text, ticks=40):
        self.bubble, self.bubble_t = text, ticks

    def love(self, n=3):
        self.hearts += [[random.uniform(70, 110), random.uniform(10, 30), -i * 6] for i in range(n)]

    def set(self, state, ticks):
        self.state, self.timer = state, ticks

    def pet(self, text=None):
        if self.state == "sleep":
            self.say("!", 25)
            self.set("sit", 40)
            return
        self.say(text or SPECIES[self.d["species"]]["sound"])
        self.love()
        self.set("happy", 45)

    def feed(self):
        self.treat = 1
        self.say("Yum!")
        self.set("eat", 75)

    def jump(self):
        if self.y >= self.ground():
            self.vy = -13 * self.k

    # --- behaviour ---
    def pointer(self):
        return self.win.winfo_pointerxy()

    def look(self):
        mx, my = self.pointer()
        hx = self.x + (96 if self.dir > 0 else BW - 96) * self.k
        hy = self.y + (40 + M) * self.k
        dx, dy = mx - hx, my - hy
        dist = math.hypot(dx, dy) or 1
        s = min(1, dist / 40) / dist
        return dx * s, dy * s

    def behave(self):
        if self.timer:
            self.timer -= 1
        s = self.state
        if s == "eat":
            self.treat = self.timer / 75
            if self.timer % 25 == 0:
                self.love(1)
        if s != "walk":
            if self.timer == 0:
                if s == "eat":
                    self.love()
                    self.set("happy", 30)
                else:
                    self.state = "walk"
            elif s in ("sit", "happy"):  # turn to face the cursor
                mx = self.pointer()[0] - self.x - self.w / 2
                if abs(mx) > 20:
                    self.dir = 1 if mx > 0 else -1
            return s
        if self.chase.get():
            mx = self.pointer()[0] - self.x - self.w / 2
            if abs(mx) < 15:
                if random.random() < .02:
                    self.love(1)
                return "sit"
            self.dir = 1 if mx > 0 else -1
            self.x, _ = step(self.x, self.dir, SPEED * 1.8 * self.k, self.lo, self.hi)
            return "walk"
        self.x, self.dir = step(self.x, self.dir, SPEED * self.k, self.lo, self.hi)
        r = random.random()
        if r < .004:
            self.set("sit", random.randint(60, 200))
        elif r < .005:
            self.set("sleep", random.randint(300, 700))
        elif r < .008:
            self.dir = -self.dir
        return "walk"

    def tick(self):
        if not self.win.winfo_exists():
            return
        self.frame += 1
        g = self.ground()
        if self.drag:
            pose = "drag"
        elif self.y < g or self.vy < 0:  # falling or jumping
            self.vy += 1.4 * self.k
            self.y = min(self.y + self.vy, g)
            if self.y >= g:
                self.vy = 0
            pose = "drag"
        else:
            pose = self.behave()
        self.rub *= .97
        self.hearts = [[x + math.sin(a * .3), y - 1.2, a + 1] for x, y, a in self.hearts if a < 40]
        if self.bubble_t:
            self.bubble_t -= 1
        draw_pet(self.c, self.d, dict(
            k=self.k, facing=self.dir, frame=self.frame, pose=pose, look=self.look(), ground=self.y >= g,
            hearts=[h for h in self.hearts if h[2] >= 0], bubble=self.bubble if self.bubble_t else None,
            treat=self.treat))
        self.win.geometry(f"+{int(self.x)}+{int(self.y)}")
        self.win.after(TICK, self.tick)


class Designer:
    """Pick species, style, colours and size, with a live animated preview."""
    CW, CH = int(BW * 2.6), int((BH + M) * 2.6)

    def __init__(self, app, pet=None):
        self.app, self.pet = app, pet
        self.d = dict(pet.d) if pet else new_design(random.choice(list(SPECIES)))
        self.win = w = tk.Toplevel(app.root)
        w.title("Pets On Screen - Pet Designer")
        w.resizable(False, False)
        w.protocol("WM_DELETE_WINDOW", self.close)

        self.cv = tk.Canvas(w, width=self.CW, height=self.CH, bg="#e9eef6", highlightthickness=0)
        self.cv.grid(row=0, column=0, rowspan=9, padx=12, pady=12)
        self.cv.bind("<Button-1>", lambda e: setattr(self, "happy", 45))
        self.frame, self.happy = 0, 0

        f = ttk.Frame(w, padding=(0, 12, 12, 12))
        f.grid(row=0, column=1, sticky="n")
        row = iter(range(99))

        def label(text):
            r = next(row)
            ttk.Label(f, text=text).grid(row=r, column=0, sticky="w", pady=3)
            return r

        self.name = tk.StringVar(value=self.d["name"])
        ttk.Entry(f, textvariable=self.name, width=18).grid(row=label("Name"), column=1, sticky="we")
        self.species = tk.StringVar(value=self.d["species"])
        cb = ttk.Combobox(f, textvariable=self.species, values=list(SPECIES), state="readonly", width=16)
        cb.grid(row=label("Pet"), column=1, sticky="we")
        cb.bind("<<ComboboxSelected>>", self.on_species)
        self.style = tk.StringVar(value=self.d["style"])
        cb = ttk.Combobox(f, textvariable=self.style, values=STYLES, state="readonly", width=16)
        cb.grid(row=label("Style"), column=1, sticky="we")
        cb.bind("<<ComboboxSelected>>", lambda e: self.d.update(style=self.style.get()))

        self.swatches = {}
        for key in ("body", "belly", "accent", "eyes"):
            b = tk.Button(f, width=14, relief="groove", command=lambda key=key: self.pick(key))
            b.grid(row=label(key.title() + " colour"), column=1, sticky="we")
            self.swatches[key] = b
        self.size = tk.DoubleVar(value=self.d["size"])
        ttk.Scale(f, from_=.6, to=1.6, variable=self.size,
                  command=lambda v: self.d.update(size=float(v))).grid(row=label("Size"), column=1, sticky="we")

        r = next(row)
        ttk.Button(f, text="Randomize", command=self.randomize).grid(row=r, column=0, columnspan=2, sticky="we", pady=(10, 3))
        r = next(row)
        ttk.Button(f, text="Save changes" if pet else "Add to desktop", command=self.done).grid(
            row=r, column=0, columnspan=2, sticky="we")
        ttk.Label(f, text="Tip: click the preview to pet it", foreground="#777").grid(
            row=next(row), column=0, columnspan=2, pady=(8, 0))
        self.refresh()
        self.animate()

    def refresh(self):
        for key, b in self.swatches.items():
            b.config(bg=self.d[key], activebackground=self.d[key])

    def on_species(self, _):
        old = self.d["species"]
        self.d.update(species=self.species.get(), **SPECIES[self.species.get()]["colors"])
        if self.name.get() == old.title():
            self.name.set(self.species.get().title())
        self.refresh()

    def pick(self, key):
        col = colorchooser.askcolor(self.d[key], parent=self.win, title=f"{key.title()} colour")[1]
        if col:
            self.d[key] = col
            self.refresh()

    def randomize(self):
        h = random.random()
        hex_ = lambda h, l, s: "#%02x%02x%02x" % tuple(int(v * 255) for v in colorsys.hls_to_rgb(h % 1, l, s))
        self.d.update(body=hex_(h, .6, .7), belly=hex_(h, .9, .6), accent=hex_(h + .5, .55, .6),
                      eyes=hex_(random.random(), .3, .8), style=random.choice(STYLES))
        self.style.set(self.d["style"])
        self.refresh()

    def animate(self):
        if not self.win.winfo_exists():
            return
        self.frame += 1
        if self.happy:
            self.happy -= 1
        k = 1.6 * self.d["size"]
        pose = "happy" if self.happy else ("sleep" if self.frame % 300 > 240 else "walk")
        draw_pet(self.cv, self.d, dict(k=k, facing=1, frame=self.frame, pose=pose,
                                       look=(math.sin(self.frame * .05), 0),
                                       hearts=[[90, 25 - self.happy % 15 * 1.5, 0]] if self.happy else []))
        self.cv.move("all", (self.CW - BW * k) / 2, self.CH - 10 - (BH + M) * k)
        self.win.after(TICK, self.animate)

    def done(self):
        self.d["name"] = self.name.get().strip() or self.d["species"].title()
        if self.pet:
            self.app.update(self.pet, self.d)
        else:
            self.app.add(self.d)
        self.win.destroy()

    def close(self):
        self.win.destroy()
        if not self.app.pets:
            self.app.root.destroy()


class App:
    def __init__(self):
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except (AttributeError, OSError):
            pass
        self.root = tk.Tk()
        self.root.withdraw()
        self.designs = load()
        self.pets = [Pet(self, d) for d in self.designs]
        if not self.pets or "--design" in sys.argv:
            Designer(self)
        self.root.mainloop()

    def add(self, d):
        self.designs.append(d)
        self.pets.append(Pet(self, d))
        save(self.designs)

    def update(self, pet, d):
        pet.d.update(d)
        pet.resize()
        save(self.designs)

    def remove(self, pet):
        self.designs = [d for d in self.designs if d is not pet.d]
        self.pets.remove(pet)
        pet.win.destroy()
        save(self.designs)
        if not self.pets:
            Designer(self)


def self_check():
    assert step(5, 1, 3, 0, 100) == (8, 1)
    assert step(99, 1, 3, 0, 100) == (100, -1)
    assert step(1, -1, 3, 0, 100) == (0, 1)
    assert shade("#808080", .5) == "#404040" and shade("#808080", 2) == "#ffffff"
    root = tk.Tk()
    c = tk.Canvas(root)
    for sp in SPECIES:  # every species x style x pose must draw without error
        for style in STYLES:
            for pose in ("walk", "sit", "sleep", "happy", "eat", "drag"):
                for facing in (1, -1):
                    draw_pet(c, {**new_design(sp), "style": style}, dict(
                        k=1.3, facing=facing, frame=7, pose=pose, look=(.5, -.5), hearts=[[90, 10, 1]],
                        bubble="Hi", treat=.5))
    root.destroy()
    print("ok")


if __name__ == "__main__":
    self_check() if "--test" in sys.argv else App()
