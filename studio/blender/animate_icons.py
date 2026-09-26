# ---------------------------------------------------------------------------
# AQUENT — looping animations for every 3D icon (exec'd from assets.py)
#   blender -b --factory-startup -P blender/assets.py -- <out_dir> animicons [names...]
# Writes <out_dir>/<name>/f_0000.png ... (transparent). tools/pack_anim.py turns
# them into animated WebP (app) and GIF (PowerPoint).
# ---------------------------------------------------------------------------
TILT_RING = Vector((0, -math.sin(math.radians(62)), math.cos(math.radians(62))))

# name: (motion, amplitude, axis, frames, resolution, margin)
MOTION = {
    "unit_hero": ("spin", 360, "Z", 96, 640, 1.4),
    "unit_iso": ("swing", 22, "Z", 60, 420, 1.14),
    "unit_face": ("swing", 20, "Z", 60, 320, 1.14),
    "filter_stack": ("spin", 360, "Z", 72, 420, 1.12),
    "filter": ("swing", 28, "Z", 48, 256, 1.16),
    "drop": ("bounce", 0.35, "Z", 40, 256, 1.35),
    "deco_drops": ("swing", 16, "Z", 48, 256, 1.15),
    "robot": ("shake", 18, "Z", 56, 256, 1.2),
    "bell": ("ring", 16, "X", 40, 256, 1.2),
    "shield": ("swing", 30, "Z", 48, 256, 1.2),
    "recycle": ("spin", 120, TILT_RING, 48, 256, 1.12),
    "sun": ("spinpulse", 36, "Y", 48, 256, 1.12),
    "snow": ("spin", 60, "Y", 48, 256, 1.1),
    "sparkle": ("spinpulse", 90, "Y", 48, 256, 1.2),
    "globe": ("spin", 360, "Z", 72, 256, 1.15),
    "chlorine": ("spin", 360, "Z", 72, 256, 1.3),
    "ph": ("swing", 25, "Z", 48, 256, 1.18),
    "turbidity": ("swing", 25, "Z", 48, 256, 1.18),
    "temp": ("swing", 22, "Z", 48, 256, 1.18),
    "calendar": ("swing", 22, "Z", 48, 256, 1.18),
    "chart": ("swing", 25, "Z", 48, 256, 1.18),
    "home": ("swing", 25, "Z", 48, 256, 1.18),
    "user": ("swing", 28, "Z", 48, 256, 1.15),
    "leaf": ("swing", 25, "Z", 48, 256, 1.2),
    "tank": ("swing", 22, "Z", 48, 256, 1.18),
    "deco_sphere": ("bob", 0.0, "Z", 48, 200, 1.2),
    "deco_sphere_white": ("bob", 0.0, "Z", 48, 200, 1.2),
    "deco_torus": ("spin", 360, "Z", 72, 240, 1.15),
    "deco_ring": ("spin", 360, "Z", 72, 240, 1.15),
    "deco_pill": ("swing", 30, "Z", 48, 240, 1.2),
    "deco_bubbles": ("bob", 0.0, "Z", 48, 280, 1.2),
}


def _axis(a):
    return {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}[a] if isinstance(a, str) else Vector(a).normalized()


def wrap_root():
    """Parent every top-level scene object (except camera/lights) to one pivot at the bbox centre."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    tops = [o for o in bpy.context.scene.objects if o.parent is None and o.type in ("MESH", "CURVE", "EMPTY", "FONT")]
    for o in bpy.context.scene.objects:
        if o.type in ("MESH", "CURVE", "FONT"):
            oe = o.evaluated_get(dg)
            pts += [oe.matrix_world @ Vector(c) for c in oe.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    center = (lo + hi) / 2
    housing = bpy.context.scene.objects.get("housing")
    if housing:  # product: spin around the housing, not the hose/shower spread
        he = housing.evaluated_get(dg)
        hp = [he.matrix_world @ Vector(c) for c in he.bound_box]
        center.x = sum(p.x for p in hp) / len(hp)
        center.y = sum(p.y for p in hp) / len(hp)
    root = empty("anim_root", center)
    root.rotation_mode = "QUATERNION"
    bpy.context.view_layer.update()
    inv = root.matrix_world.inverted()
    for o in tops:
        mw = o.matrix_world.copy()
        o.parent = root
        o.matrix_parent_inverse = inv
        o.matrix_world = mw
    return root, (hi - lo)


def pose(root, base_loc, size, motion, amp, axis, t):
    s2 = math.sin(2 * math.pi * t)
    ax = _axis(axis)
    q = Quaternion((1, 0, 0, 0))
    loc = base_loc.copy()
    scl = Vector((1, 1, 1))
    bob = size.z * 0.035 * math.sin(2 * math.pi * t)
    if motion == "spin":
        q = Quaternion(ax, math.radians(amp * t))
    elif motion == "spinpulse":
        q = Quaternion(ax, math.radians(amp * t))
        k = 1 + 0.06 * math.sin(4 * math.pi * t)
        scl = Vector((k, k, k))
    elif motion == "swing":
        q = Quaternion(ax, math.radians(amp * s2))
        loc.z += bob
    elif motion == "shake":
        q = Quaternion(ax, math.radians(amp * s2)) @ Quaternion(Vector((0, 1, 0)), math.radians(6 * math.sin(4 * math.pi * t)))
        loc.z += bob
    elif motion == "ring":
        q = Quaternion(ax, math.radians(amp * s2) * (0.6 + 0.4 * abs(s2)))
    elif motion == "bob":
        loc.z += size.z * 0.08 * s2
    elif motion == "bounce":
        h = 4 * t * (1 - t)                       # parabola: floor at t=0/1, top at t=0.5
        loc.z += size.z * amp * h
        squash = max(0.0, 1 - h * 6)              # squash only near the floor
        scl = Vector((1 + 0.12 * squash, 1 + 0.12 * squash, 1 - 0.16 * squash))
    root.rotation_quaternion = q
    root.location = loc
    root.scale = scl


def animate_icons(names):
    todo = [n for n in (names or MOTION.keys()) if n in MOTION and n in ASSETS]
    for name in todo:
        fn, _res, _samples = ASSETS[name]
        motion, amp, axis, frames, res, margin = MOTION[name]
        reset()
        setup((res, res) if name not in ("filter_stack",) else (int(res * 0.7), res), 24)
        fn()
        cam = bpy.context.scene.camera
        root, size = wrap_root()
        if cam and cam.data.type == "ORTHO":
            cam.data.ortho_scale *= margin
        base = root.location.copy()
        seq = os.path.join(OUT, name)
        os.makedirs(seq, exist_ok=True)
        for f in range(frames):
            pose(root, base, size, motion, amp, axis, f / frames)
            bpy.context.scene.render.filepath = os.path.join(seq, "f_%04d.png" % f)
            bpy.ops.render.render(write_still=True)
        print("ANIMATED", name, frames)
