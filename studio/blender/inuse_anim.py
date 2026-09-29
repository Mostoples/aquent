# ---------------------------------------------------------------------------
# AQUENT "in use" explainer animation (exec'd from assets.py)
#   blender -b --factory-startup -P blender/assets.py -- <out_dir> inuse [preview]
# A clothed person showers; greywater drains into the floor, rises up the wall,
# is filtered in AQUENT's filtration columns (grey -> blue) and returns to the
# shower through a mixer that also takes a separate hot-water line.
# Scene units: 1 = 10 cm.
# ---------------------------------------------------------------------------
FPS_IU, DUR_IU = 30, 16.0
TRAY_H = 1.4
SX = -2.5  # shower / person / drain x


def poly_pipe(points, r, m, name="pipe"):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions, cu.bevel_depth, cu.bevel_resolution = "3D", r, 6
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, c in zip(sp.points, points):
        p.co = (c[0], c[1], c[2], 1)
    cu.materials.append(m)
    ob = link(bpy.data.objects.new(name, cu))
    for c in points[1:-1]:
        sphere(r * 1.01, m, c, seg=16, name=name + "_elbow")
    return ob


class Path:
    """Polyline with arclength parametrisation."""

    def __init__(self, pts):
        self.p = [Vector(x) for x in pts]
        self.cum = [0.0]
        for a, b in zip(self.p, self.p[1:]):
            self.cum.append(self.cum[-1] + (b - a).length)
        self.L = self.cum[-1]

    def at(self, s):
        s = max(0.0, min(self.L, s))
        for i in range(1, len(self.cum)):
            if s <= self.cum[i]:
                a, b = self.p[i - 1], self.p[i]
                seg = self.cum[i] - self.cum[i - 1]
                return a.lerp(b, (s - self.cum[i - 1]) / seg if seg else 0)
        return self.p[-1]


def tinted_glass(name, color):
    m = thin_glass()
    m.name = name
    m.node_tree.nodes["Transparent BSDF"].inputs["Color"].default_value = lin(color)
    return m


def bead_set(path, spacing, radius, m, speed, fade=None, name="bead"):
    """Beads flowing along a path. fade=(s0, s1): shrink to 0 between s0..s1 (or grow if s0 > s1)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=radius)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(m)
    n = max(1, int(path.L / spacing))
    obs = [link(bpy.data.objects.new(name, me)) for _ in range(n)]
    return dict(path=path, obs=obs, spacing=path.L / n, speed=speed, fade=fade)


def update_beads(bs, t):
    P, sp, fade = bs["path"], bs["spacing"], bs["fade"]
    for i, ob in enumerate(bs["obs"]):
        s = (i * sp + t * bs["speed"]) % P.L
        ob.location = P.at(s)
        k = 1.0
        if fade:
            a, b = fade
            if a < b:
                k = 1.0 if s < a else max(0.0, 1 - (s - a) / (b - a))
            else:
                k = 0.0 if s < b else min(1.0, (s - b) / (a - b))
        ob.scale = (k, k, k)
        ob.hide_render = k < 0.02


def seg_to(ob, a, b, r):
    a, b = Vector(a), Vector(b)
    d = b - a
    ob.location = (a + b) / 2
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    ob.scale = (r, r, max(d.length, 1e-4) / 2)


def unit_cyl(m, name):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=1, radius2=1, depth=2)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(m)
    ob = link(bpy.data.objects.new(name, me))
    subsurf(ob, 1)
    return ob


def person(root):
    """Stylised clothed person (t-shirt + long trousers), facing local -Y."""
    skin = mat("skin", "#E6B48F", 0.55, spec=0.3)
    shirt = mat("shirt", "#4FA7C4", 0.8)
    pants = mat("pants", "#2C3A5E", 0.85)
    hair = mat("hair", "#2A1E1A", 0.6)
    shoe = mat("shoe", "#F2F2F2", 0.5)
    dark = mat("face", "#3A2A24", 0.5)
    P = {}
    # legs & shoes
    for sx in (-1, 1):
        cyl(0.55, 7.2, pants, (sx * 0.62, 0, 4.7), r2=0.5, seg=32, bevel=0.12, parent=root, name="leg")
        rbox(0.75, 1.6, 0.5, 0.2, shoe, (sx * 0.66, -0.35, 0.28), parent=root, name="shoe")
    # torso (t-shirt) + hem
    lathe([(0, 7.9), (1.32, 7.9), (1.36, 8.8), (1.24, 10.4), (1.42, 12.4), (1.3, 13.25), (0.55, 13.75), (0, 13.75)],
          shirt, (0, 0, 0), sub=2, parent=root, name="torso").scale = (1, 0.62, 1)
    cyl(0.46, 1.3, skin, (0, 0, 14.2), seg=24, parent=root, name="neck")
    head = sphere(1.05, skin, (0, 0, 15.6), scale=(0.93, 0.98, 1.08), parent=root, name="head")
    sphere(1.08, hair, (0, 0.2, 15.95), scale=(0.97, 0.98, 0.78), parent=root, name="hair")
    # closed eyes + smile (face looks towards -Y)
    for sx in (-1, 1):
        torus(0.13, 0.035, dark, (sx * 0.36, -0.97, 15.58), (90, 0, 0), arc=math.pi, parent=root, name="eye").rotation_euler = (math.radians(90), 0, 0)
    torus(0.24, 0.04, dark, (0, -0.99, 15.22), (90, 0, 0), arc=math.pi, parent=root, name="smile").rotation_euler = (math.radians(90), math.radians(180), 0)
    # arms: sleeve + upper arm + forearm + hand, driven every frame
    arms = []
    for sx in (-1, 1):
        a = dict(side=sx)
        a["sleeve"] = unit_cyl(shirt, "sleeve")
        a["upper"] = unit_cyl(skin, "upper")
        a["fore"] = unit_cyl(skin, "fore")
        a["hand"] = sphere(0.3, skin, (0, 0, 0), seg=24, name="hand")
        a["elbow"] = sphere(0.25, skin, (0, 0, 0), seg=24, name="elbowj")
        for k in ("sleeve", "upper", "fore", "hand", "elbow"):
            a[k].parent = root
        arms.append(a)
    P["arms"] = arms
    return P


def pose_arms(P, t):
    for a in P["arms"]:
        sx = a["side"]
        ph = 0 if sx < 0 else math.pi
        w = 2 * math.pi * 1.3 * t + ph
        sh = Vector((sx * 1.42, 0.05, 13.0))
        el = Vector((sx * 2.35, -0.3 + 0.1 * math.sin(w), 14.7 + 0.15 * math.cos(w)))
        hd = Vector((sx * 0.9, -0.15 + 0.22 * math.sin(w), 16.35 + 0.2 * math.cos(w)))
        seg_to(a["sleeve"], sh, sh.lerp(el, 0.42), 0.42)
        seg_to(a["upper"], sh, el, 0.27)
        seg_to(a["fore"], el, hd, 0.24)
        a["elbow"].location = el
        a["hand"].location = hd


def build_inuse():
    sc = bpy.context.scene
    sc.render.film_transparent = False
    for o in [o for o in sc.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o, do_unlink=True)
    sc.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    expo(-0.9)
    P = pm()
    # room
    rbox(40, 40, 0.2, 0.02, tile_mat("floor", ("X", "Y"), 1.4), (0, 0, -0.1), name="floor")
    rbox(40, 0.4, 27, 0.02, tile_mat("wall", ("X", "Z")), (0, 10.2, 13.5), name="wall")
    rbox(0.4, 40, 27, 0.02, tile_mat("wall2", ("Y", "Z")), (-10.2, 0, 13.5), name="wall2")
    # raised shower tray with glass sides (cut-away to show the drain pipe)
    rbox(17, 7, 0.26, 0.04, tile_mat("tray", ("X", "Y"), 3.0), (-0.5, 6.5, TRAY_H - 0.13), name="traytop")
    glass = tinted_glass("trayglass", "#FFFFFF")
    glass.node_tree.nodes["Layer Weight"].inputs["Blend"].default_value = 0.12
    rbox(17, 0.06, TRAY_H - 0.26, 0.01, glass, (-0.5, 3.03, (TRAY_H - 0.26) / 2), name="trayfront")
    rbox(0.06, 7, TRAY_H - 0.26, 0.01, glass, (7.97, 6.5, (TRAY_H - 0.26) / 2), name="trayside")
    rbox(17, 7, 0.05, 0.01, mat("traybase", "#3E4C60", 0.6), (-0.5, 6.5, 0.03), name="traybase")
    # drain grate + water film
    cyl(0.62, 0.04, P["chrome"], (SX + 0.4, 5.3, TRAY_H + 0.01), seg=48, name="drain")
    for i in range(-2, 3):
        rbox(0.8, 0.07, 0.05, 0.01, P["dark"], (SX + 0.4, 5.3 + i * 0.2, TRAY_H + 0.03), name="slot")
    film = tinted_glass("film", "#DDEEFF")
    cyl(1.6, 0.01, film, (SX + 0.4, 5.6, TRAY_H + 0.008), seg=64, name="film")

    # AQUENT on a wall shelf, high up
    root, parts = proto_unit(hose=False, head=False)
    root.location = (5.0, 8.7, 16.0)
    rbox(4.4, 2.9, 0.22, 0.05, mat("shelf", "#F4F6F9", 0.4), (5.0, 8.75, 15.89), name="shelf")
    for bx in (3.4, 6.6):
        rbox(0.2, 2.6, 1.4, 0.04, P["chrome"], (bx, 8.85, 15.1), name="bracket")
    bpy.context.view_layer.update()
    O = parts["panel"].matrix_world @ Vector((u(22), u(DIM["RECESS"]) - u(44), u(-116)))

    # pipes
    grey_glass = tinted_glass("pgrey", "#E9EDF2")
    blue_glass = tinted_glass("pblue", "#DCEBFF")
    red_glass = tinted_glass("pred", "#FFE3DC")
    col_top, col_bot = 24.2, 18.9
    ret = [(SX + 0.4, 5.3, TRAY_H), (SX + 0.4, 5.3, 0.55), (SX + 0.4, 9.6, 0.55), (7.6, 9.6, 0.55), (7.6, 9.6, 25.0), (7.6, 8.9, 25.0), (3.5, 8.9, 25.0)]
    poly_pipe(ret, 0.2, grey_glass, "return")
    for cx in (3.5, 6.5):
        poly_pipe([(cx, 8.9, 25.0), (cx, 8.9, col_top)], 0.2, grey_glass, "drop")
    mixer = Vector((SX, 9.55, 12.4))
    treated = [(O.x, O.y, O.z), (O.x, O.y - 0.35, O.z), (O.x, O.y - 0.35, 14.6), (O.x, 9.6, 14.6), (O.x, 9.6, mixer.z), (SX + 0.55, 9.6, mixer.z)]
    poly_pipe(treated, 0.2, blue_glass, "treated")
    hot = [(-9.0, 8.4, 13.6), (-9.0, 9.6, 13.6), (-9.0, 9.6, mixer.z), (SX - 0.55, 9.6, mixer.z)]
    poly_pipe(hot, 0.2, red_glass, "hot")
    rbox(0.9, 2.6, 3.6, 0.2, P["white_pvc"], (-9.55, 8.4, 15.2), name="heater")
    sphere(0.14, mat("heatled", "#FF5A3C", 0.3, emit="#FF5A3C", emit_str=6), (-9.08, 7.6, 16.3), seg=16, name="heatled")
    head_c = Vector((SX, 7.7, 20.3))
    supply = [(SX, 9.6, mixer.z + 0.2), (SX, 9.6, 20.9), (SX, 7.7, 20.9), (SX, 7.7, 20.5)]
    poly_pipe(supply, 0.17, P["chrome"], "supply")
    rbox(1.3, 0.6, 1.0, 0.18, P["chrome"], (SX, 9.55, mixer.z), name="mixer")
    for sx, c in ((-1, "#E0483C"), (1, "#2F7BFF")):
        cyl(0.2, 0.35, P["chrome"], (SX + sx * 0.38, 9.18, mixer.z), (90, 0, 0), seg=24, name="knob")
        cyl(0.21, 0.06, mat("knobc%d" % sx, c, 0.3, coat=1), (SX + sx * 0.38, 8.99, mixer.z), (90, 0, 0), seg=24, name="knobcap")
    # rain shower head (face points down)
    cyl(1.05, 0.14, P["chrome"], head_c, seg=64, bevel=0.04, name="rainhead")
    cyl(0.98, 0.02, P["face"], head_c - Vector((0, 0, 0.08)), seg=64, name="rainface")

    # person under the shower
    proot = empty("person", (SX, 6.1, TRAY_H), (0, 0, 24))
    PP = person(proot)

    # flow beads
    grey = mat("bgrey", "#7D7568", 0.3, emit="#9A8E7A", emit_str=2.0)
    blue = mat("bblue", "#2F8CFF", 0.25, emit="#3D95FF", emit_str=2.2)
    red = mat("bred", "#FF5A3C", 0.25, emit="#FF5A3C", emit_str=2.2)
    mix = mat("bmix", "#7FC2FF", 0.25, emit="#8CC8FF", emit_str=2.0)
    mid = (col_top + col_bot) / 2
    sets = []
    for cx in (6.5, 3.5):
        path = Path(ret[:-1] + ([(6.5, 8.9, 25.0)] if cx == 6.5 else [(3.5, 8.9, 25.0)]) + [(cx, 8.9, col_top), (cx, 8.9, col_bot - 0.5)])
        s_mid = path.L - (mid - (col_bot - 0.5))
        sets.append(bead_set(path, 0.6, 0.16, grey, 3.2, fade=(s_mid - 0.8, s_mid + 0.6), name="grey"))
        pb = Path([(cx, 8.9, mid + 0.8), (cx, 8.9, col_bot - 0.6)])
        sets.append(bead_set(pb, 0.45, 0.12, blue, 1.6, fade=(0.9, 0.0), name="blueC"))
    sets.append(bead_set(Path(treated), 0.4, 0.13, blue, 2.6, name="blueT"))
    sets.append(bead_set(Path(hot), 0.45, 0.13, red, 2.6, name="red"))
    sets.append(bead_set(Path(supply), 0.4, 0.12, mix, 3.0, name="mix"))

    # shower spray
    water = tinted_glass("spray", "#F2F9FF")
    wbright = mat("spraydot", "#BFDFFF", 0.1, emit="#CFE6FF", emit_str=2.2)
    rnd = random.Random(11)
    drops = []
    dme = bpy.data.meshes.new("drop")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.05)
    bm.to_mesh(dme)
    bm.free()
    dme.materials.append(wbright)
    for i in range(420):
        ang, rr = rnd.uniform(0, 6.283), 0.9 * math.sqrt(rnd.random())
        start = head_c + Vector((rr * math.cos(ang), rr * math.sin(ang), -0.12))
        v = Vector((rnd.uniform(-0.05, 0.05), -0.12 + rnd.uniform(-0.05, 0.05), -1.0)) * 28
        ob = link(bpy.data.objects.new("drop", dme))
        drops.append((ob, start, v, rnd.random()))

    # camera
    cd = bpy.data.cameras.new("cam")
    cam = link(bpy.data.objects.new("cam", cd))
    cd.lens = 30
    cd.clip_end = 400
    tgt = empty("camtarget")
    tc = cam.constraints.new("TRACK_TO")
    tc.target, tc.track_axis, tc.up_axis = tgt, "TRACK_NEGATIVE_Z", "UP_Y"
    sc.camera = cam
    keys = [  # (second, camera, target)
        (0.0, (15, -15, 13), (0.5, 6.5, 12.0)),
        (3.0, (12, -11, 12), (0.0, 6.5, 11.0)),
        (5.5, (SX + 2.5, -3.2, 1.3), (SX + 3.5, 8.0, 0.55)),
        (8.0, (14, 1.0, 9.0), (7.6, 9.4, 11.0)),
        (10.5, (9.0, 0.5, 21.5), (5.0, 8.8, 20.8)),
        (13.2, (5.5, 5.6, 13.8), (-1.4, 9.6, 12.8)),
        (16.0, (15, -15, 13), (0.5, 6.5, 12.0)),
    ]
    for sec, cl, tl in keys:
        f = int(round(sec * FPS_IU))
        cam.location, tgt.location = cl, tl
        cam.keyframe_insert("location", frame=f)
        tgt.keyframe_insert("location", frame=f)

    # lights
    light("ceiling", (1, 5, 30), 5200, 12, "#FFFFFF")
    light("fill", (18, -10, 16), 2600, 14, "#E6F0FF")
    light("rim", (-6, -8, 22), 900, 8, "#FFF4E8")
    return dict(sets=sets, drops=drops, person=PP, head=head_c, proot=proot)


def update_inuse(S, t):
    for bs in S["sets"]:
        update_beads(bs, t)
    pose_arms(S["person"], t)
    pr = S["proot"].location
    for ob, start, v, ph in S["drops"]:
        life = 0.62
        k = ((t / life) + ph) % 1.0
        tt = k * life
        p = start + v * tt + Vector((0, 0, -4.9 * tt * tt))
        # stop drops on the floor and on the person's head/shoulders
        dx, dy = p.x - pr.x, p.y - pr.y
        blocked = (dx * dx + dy * dy < 2.3 and p.z < TRAY_H + 16.8) or p.z < TRAY_H + 0.03
        ob.hide_render = blocked
        ob.location = p
        vel = v + Vector((0, 0, -9.8 * tt))
        ob.rotation_euler = vel.to_track_quat("Z", "Y").to_euler()
        ob.scale = (1, 1, 3.2)


def render_inuse(preview=False):
    reset()
    res = (1920, 1080)
    setup(res, 16 if preview else 28, transparent=False)
    sc = bpy.context.scene
    sc.render.use_persistent_data = False
    sc.cycles.use_auto_tile = True
    sc.cycles.tile_size = 512
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
        sc.cycles.denoising_use_gpu = True
    except Exception:
        pass
    sc.cycles.max_bounces = 8
    S = build_inuse()
    seq = os.path.join(OUT, "inuse")
    os.makedirs(seq, exist_ok=True)
    total = int(DUR_IU * FPS_IU)
    frames = [300] if preview else [f for f in range(total) if not os.path.exists(os.path.join(seq, "f_%04d.png" % f))]
    for f in frames:
        sc.frame_set(f)
        update_inuse(S, f / FPS_IU)
        sc.render.filepath = os.path.join(seq, "f_%04d.png" % f)
        bpy.ops.render.render(write_still=True)
        print("FRAME", f)
