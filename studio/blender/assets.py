"""
AQUENT - 3D asset generator (Blender CLI)

Usage:
  blender -b --factory-startup -P blender/assets.py -- <out_dir> [asset names ...]
  blender -b --factory-startup -P blender/assets.py -- <out_dir> anim   (shower turntable sequence)

Renders every asset as a transparent PNG with a white / blue glossy look that
matches the neumorphism UI of the app.
"""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix, Euler, Quaternion

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(ARGS[0] if ARGS else "assets")
ONLY = set(ARGS[1:])
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- palette ---
def lin(h, a=1.0):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*c, a)

BLUE, DEEP, SKY, ICE, WHITE = "#2F7BFF", "#1646D6", "#8CC6FF", "#DDEBFF", "#F4F7FC"
NAVY, CYAN = "#0D1B3E", "#38E1FF"

# ------------------------------------------------------------- scene setup ---
_gpu_ready = False

def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras,
                 bpy.data.curves, bpy.data.worlds, bpy.data.textures, bpy.data.images):
        for b in list(coll):
            try:
                coll.remove(b)
            except Exception:
                pass

def setup(res=(512, 512), samples=96, transparent=True):
    global _gpu_ready
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    if not _gpu_ready:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        try:
            prefs.compute_device_type = "OPTIX"
            prefs.refresh_devices()
            for d in prefs.devices:
                d.use = d.type == "OPTIX"
        except Exception as e:
            print("GPU setup failed, CPU fallback:", e)
        _gpu_ready = True
    sc.cycles.device = "GPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = "OPTIX"
    except Exception:
        pass
    sc.cycles.max_bounces = 12
    sc.cycles.transmission_bounces = 12
    sc.render.film_transparent = transparent
    sc.cycles.film_transparent_glass = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    sc.view_settings.view_transform = "Standard"
    for look in ("None",):
        try:
            sc.view_settings.look = look
            break
        except Exception:
            pass
    sc.view_settings.exposure = -0.35

    # world: soft white-to-ice gradient so glossy surfaces get nice reflections
    w = bpy.data.worlds.new("world")
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    bg = nt.nodes.get("Background") or nt.nodes.new("ShaderNodeBackground")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = lin("#B9CFEE")
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = lin("#FFFFFF")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], ramp.inputs[0])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.9
    out = nt.nodes.get("World Output") or nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs[0])

    light("key", (4.5, -5, 7), 900, 6, "#FFFFFF")
    light("rim", (-6, 5, 4), 700, 5, "#CFE3FF")
    light("fill", (-5, -6, 1.5), 260, 7, "#FFFFFF")
    light("top", (0, 0, 9), 300, 8, "#FFFFFF")

def light(name, loc, energy, size, color):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy, ld.size, ld.color = energy, size, lin(color)[:3]
    ob = bpy.data.objects.new(name, ld)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob

# --------------------------------------------------------------- materials ---
def _set(node, name, val):
    if name in node.inputs:
        node.inputs[name].default_value = val

def mat(name, color=WHITE, rough=0.3, metal=0.0, coat=0.0, trans=0.0, ior=1.45,
        emit=None, emit_str=0.0, grad=None, grain=None, spec=0.5):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    _set(b, "Base Color", lin(color))
    _set(b, "Roughness", rough)
    _set(b, "Metallic", metal)
    _set(b, "Coat Weight", coat)
    _set(b, "Coat Roughness", 0.04)
    _set(b, "Transmission Weight", trans)
    _set(b, "IOR", ior)
    _set(b, "Specular IOR Level", spec)
    if emit:
        _set(b, "Emission Color", lin(emit))
        _set(b, "Emission Strength", emit_str)
    if grad:  # vertical gradient in object space: (bottom, top)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = lin(grad[0])
        ramp.color_ramp.elements[1].color = lin(grad[1])
        nt.links.new(tc.outputs["Generated"], sep.inputs[0])
        nt.links.new(sep.outputs["Z"], ramp.inputs[0])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    if grain:  # granular natural material: (second colour, scale)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = grain[1]
        nz.inputs["Detail"].default_value = 8
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.inputs[6].default_value = lin(color)
        mix.inputs[7].default_value = lin(grain[0])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.55
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        nt.links.new(nz.outputs["Fac"], mix.inputs[0])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
        nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

def M():
    """Fresh shared material set for the current scene."""
    return dict(
        white=mat("white", WHITE, 0.28, coat=0.4),
        ice=mat("ice", ICE, 0.25, coat=0.6),
        blue=mat("blue", BLUE, 0.16, coat=1.0, grad=(DEEP, SKY)),
        blue_flat=mat("blue_flat", BLUE, 0.18, coat=1.0),
        deep=mat("deep", DEEP, 0.2, coat=1.0),
        sky=mat("sky", SKY, 0.2, coat=1.0),
        chrome=mat("chrome", "#E9EEF6", 0.12, metal=1.0),
        glass=mat("glass", "#FFFFFF", 0.02, trans=1.0, ior=1.45),
        water=mat("water", "#6FB2FF", 0.03, trans=0.92, ior=1.33),
        navy=mat("navy", NAVY, 0.12, coat=1.0),
        glow=mat("glow", CYAN, 0.3, emit=CYAN, emit_str=6.0),
    )

# ---------------------------------------------------------------- geometry ---
def link(ob):
    bpy.context.collection.objects.link(ob)
    return ob

def mk(bm, name, m, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True, parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me))
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    ob.scale = scale
    if m:
        me.materials.append(m)
    if parent:
        ob.parent = parent
    return ob

def empty(name, loc=(0, 0, 0), rot=(0, 0, 0)):
    ob = link(bpy.data.objects.new(name, None))
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    return ob

def subsurf(ob, lvl=2):
    md = ob.modifiers.new("sub", "SUBSURF")
    md.levels = md.render_levels = lvl
    return ob

def sphere(r, m, loc=(0, 0, 0), scale=(1, 1, 1), seg=64, parent=None, name="sphere"):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    return mk(bm, name, m, loc, scale=scale, parent=parent)

def cyl(r, h, m, loc=(0, 0, 0), rot=(0, 0, 0), r2=None, seg=96, bevel=0.0, parent=None, name="cyl"):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r if r2 is None else r2, depth=h)
    ob = mk(bm, name, m, loc, rot, parent=parent)
    if bevel:
        bev(ob, bevel)
    return ob

def bev(ob, w, segs=8):
    md = ob.modifiers.new("bev", "BEVEL")
    md.width, md.segments, md.limit_method = w, segs, "ANGLE"
    md.angle_limit = math.radians(40)
    try:
        md.harden_normals = True
    except Exception:
        pass
    return ob

def rbox(sx, sy, sz, r, m, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, name="box"):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    ob = mk(bm, name, m, loc, rot, parent=parent)
    md = ob.modifiers.new("bev", "BEVEL")
    md.width, md.segments, md.limit_method = r, 10, "NONE"
    try:
        md.harden_normals = True
    except Exception:
        pass
    return ob

def torus(R, r, m, loc=(0, 0, 0), rot=(0, 0, 0), seg=96, rseg=32, parent=None, name="torus", arc=2 * math.pi):
    bm = bmesh.new()
    full = abs(arc - 2 * math.pi) < 1e-6
    n = seg if full else seg + 1
    rings = []
    for i in range(n):
        a = arc * i / seg
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            ring.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a),
                                      (R + r * math.cos(b)) * math.sin(a),
                                      r * math.sin(b))))
        rings.append(ring)
    for i in range(seg if full else seg):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(rseg):
            bm.faces.new((a[j], a[(j + 1) % rseg], b[(j + 1) % rseg], b[j]))
    if not full:
        for ring in (rings[0], rings[-1]):
            bm.faces.new(ring)
    bm.normal_update()
    return mk(bm, name, m, loc, rot, parent=parent)

def lathe(profile, m, loc=(0, 0, 0), rot=(0, 0, 0), steps=96, solid=0.0, sub=2, parent=None, name="lathe"):
    """profile: list of (radius, z) revolved around Z."""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in profile]
    for a, b in zip(vs, vs[1:]):
        bm.edges.new((a, b))
    ob = mk(bm, name, m, loc, rot, smooth=False, parent=parent)
    sc = ob.modifiers.new("screw", "SCREW")
    sc.axis, sc.steps, sc.render_steps = "Z", steps, steps
    sc.use_merge_vertices, sc.merge_threshold = True, 0.0005
    sc.use_normal_calculate = True
    sc.use_smooth_shade = True
    if solid:
        so = ob.modifiers.new("solid", "SOLIDIFY")
        so.thickness = solid
    if sub:
        subsurf(ob, sub)
    return ob

def pipe(points, r, m, parent=None, name="pipe"):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions, cu.bevel_depth, cu.bevel_resolution = "3D", r, 12
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    cu.materials.append(m)
    ob = link(bpy.data.objects.new(name, cu))
    if parent:
        ob.parent = parent
    return ob

def bond(a, b, r, m, parent=None):
    a, b = Vector(a), Vector(b)
    ob = cyl(r, (b - a).length, m, (a + b) / 2, seg=48, parent=parent, name="bond")
    ob.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    return ob

def drop_profile(h=1.9, n=28):
    pts = []
    for i in range(n + 1):
        a = math.pi * 0.6 * i / n
        pts.append((math.sin(a), -math.cos(a)))
    x0, z0 = pts[-1]
    for i in range(1, n + 1):
        t = i / n
        pts.append((x0 * (1 - t) ** 1.35, z0 + (h - z0) * t))
    pts[-1] = (0.0, h)
    return pts

def drop(scale, m, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    prof = [(r * scale, z * scale) for r, z in drop_profile()]
    return lathe(prof, m, loc, rot, steps=64, sub=1, parent=parent, name="drop")

def star(points, r_out, r_in, depth, m, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    bm = bmesh.new()
    top, bot = [], []
    for i in range(points * 2):
        a = math.pi * i / points + math.pi / 2
        rr = r_out if i % 2 == 0 else r_in
        top.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), depth / 2)))
        bot.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), -depth / 2)))
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    n = len(top)
    for i in range(n):
        bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
    bm.normal_update()
    ob = mk(bm, "star", m, loc, rot, parent=parent)
    md = ob.modifiers.new("bev", "BEVEL")
    md.width, md.segments = depth * 0.45, 6
    subsurf(ob, 2)
    return ob

# -------------------------------------------------------------- framing ---
def frame(az=32, el=22, pad=1.16, shadow=False, persp=False):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in bpy.context.scene.objects:
        if o.type in ("MESH", "CURVE") and not o.get("noframe"):
            oe = o.evaluated_get(dg)
            pts += [oe.matrix_world @ Vector(c) for c in oe.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    center = (lo + hi) / 2
    a, e = math.radians(az), math.radians(el)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    rot = (-d).to_track_quat("-Z", "Y")
    cd = bpy.data.cameras.new("cam")
    cam = link(bpy.data.objects.new("cam", cd))
    bpy.context.scene.camera = cam
    loc = center + d * 30
    mw = Matrix.Translation(loc) @ rot.to_matrix().to_4x4()
    local = [mw.inverted() @ p for p in pts]
    xs, ys = [p.x for p in local], [p.y for p in local]
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    rx, ry = bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y
    aspect = rx / ry
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    cd.type = "ORTHO"
    cd.ortho_scale = max(w, h * aspect) * pad if aspect >= 1 else max(h, w / aspect) * pad
    cd.clip_end = 200
    cam.location = loc + rot @ Vector((cx, cy, 0))
    cam.rotation_euler = rot.to_euler()
    if shadow:
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40)
        pl = mk(bm, "catcher", None, (center.x, center.y, lo.z - 0.002))
        pl.is_shadow_catcher = True
    return cam

def render(name):
    path = os.path.join(OUT, name + ".png")
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)

# ================================================================ ASSETS ===
ASSETS = {}

def asset(name, res=(512, 512), samples=96):
    def deco(fn):
        ASSETS[name] = (fn, res, samples)
        return fn
    return deco

def shower_head(m, parent=None, tilt=-46, drops=True, seed=4):
    head = empty("head", (0, 0, 0), (tilt, 0, 0))
    if parent:
        head.parent = parent
    prof = [(0, 0), (1.12, 0), (1.22, 0.03), (1.29, 0.12), (1.27, 0.24), (1.05, 0.36),
            (0.55, 0.48), (0.3, 0.6), (0.27, 0.78), (0, 0.78)]
    lathe(prof, m["white"], parent=head, name="shell")
    cyl(1.08, 0.05, m["ice"], (0, 0, -0.005), bevel=0.02, parent=head, name="face")
    torus(1.19, 0.035, m["glow"], (0, 0, 0.0), parent=head, name="led")
    bm = bmesh.new()
    for ring_r, count in ((0.0, 1), (0.28, 8), (0.52, 14), (0.76, 20), (0.96, 26)):
        for i in range(count):
            a = 2 * math.pi * i / count + ring_r
            bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.042,
                                      matrix=Matrix.Translation((ring_r * math.cos(a), ring_r * math.sin(a), -0.03)))
    mk(bm, "nozzles", m["blue_flat"], parent=head)
    torus(0.3, 0.05, m["blue_flat"], (0, 0, 0.66), parent=head, name="collar")
    bpy.context.view_layer.update()
    up = head.matrix_world.to_3x3() @ Vector((0, 0, 1))
    base = head.matrix_world @ Vector((0, 0, 0.72))
    pts = [base, base + up * 0.5, base + up * 0.9 + Vector((0, 0.45, 0.2)),
           base + Vector((0, 1.25, 1.05)), base + Vector((0, 1.95, 1.1))]
    p = pipe(pts, 0.14, m["chrome"])
    if parent:
        p.parent = parent
    fl = cyl(0.36, 0.12, m["white"], pts[-1], (90, 0, 0), bevel=0.04, name="flange")
    if parent:
        fl.parent = parent
    drop_objs = []
    if drops:
        rnd = random.Random(seed)
        down = -up
        for i in range(16):
            rr, aa = rnd.uniform(0.1, 0.95), rnd.uniform(0, 2 * math.pi)
            start = head.matrix_world @ Vector((rr * math.cos(aa), rr * math.sin(aa), -0.05))
            dist = rnd.uniform(0.45, 2.4)
            s = rnd.uniform(0.1, 0.19)
            ob = drop(s, m["blue"], start + down * dist)
            if parent:
                ob.parent = parent
            drop_objs.append((ob, start, down, dist, s))
    return head, drop_objs


AQUA = "#4EC0DE"

def ceiling_unit(m, water=True, seed=3, parent=None):
    """AQUENT housing: 360 x 360 x 149 mm, face (nozzles + light panel) points down (-Z)."""
    g = empty("unit")
    if parent:
        g.parent = parent
    aqua = mat("aqua", AQUA, 0.18, coat=1.0)
    panel = mat("panel", "#EAF8FF", 0.3, emit="#D8F4FF", emit_str=2.2)
    rbox(3.6, 3.6, 1.12, 0.16, m["white"], (0, 0, 0.56), parent=g, name="body")
    rbox(3.64, 3.64, 0.2, 0.08, aqua, (0, 0, 1.2), parent=g, name="rim")
    rbox(3.36, 3.36, 0.22, 0.12, m["white"], (0, 0, 1.36), parent=g, name="top")
    cyl(0.2, 0.9, m["chrome"], (0, 0, 1.9), parent=g, name="inlet")
    cyl(0.32, 0.08, m["chrome"], (0, 0, 1.5), bevel=0.02, parent=g, name="flange")
    rbox(3.3, 3.3, 0.04, 0.1, m["ice"], (0, 0, -0.01), parent=g, name="face")
    rbox(2.0, 2.0, 0.05, 0.12, panel, (0, 0, -0.03), parent=g, name="panel")
    # 104 chrome nozzles on a perimeter band
    bm = bmesh.new()
    for side in range(4):
        for i in range(26):
            u = -1.3 + 2.6 * (i + 0.5) / 26
            x, y = [(u, -1.34), (1.34, u), (-u, 1.34), (-1.34, -u)][side]
            bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=0.038,
                                      matrix=Matrix.Translation((x, y, -0.035)))
    mk(bm, "nozzles", m["chrome"], parent=g)
    # status LED strip (front) and filter-cartridge hatch (side)
    rbox(1.0, 0.06, 0.26, 0.08, m["navy"], (0, -1.8, 0.6), parent=g, name="ledbar")
    for i in range(4):
        sphere(0.045, m["glow"], (-0.33 + i * 0.22, -1.84, 0.6), seg=16, parent=g)
    rbox(0.06, 1.6, 0.62, 0.1, aqua, (1.8, 0, 0.55), parent=g, name="hatch")
    streams = []
    if water:
        wm = mat("stream", "#A9D8FF", 0.04, trans=0.85, ior=1.33)
        rnd = random.Random(seed)
        for side in range(4):
            for i in range(1, 26, 4):
                u = -1.3 + 2.6 * (i + 0.5) / 26
                x, y = [(u, -1.34), (1.34, u), (-u, 1.34), (-1.34, -u)][side]
                L = rnd.uniform(1.6, 2.8)
                cyl(0.022, L, wm, (x, y, -0.06 - L / 2), seg=16, parent=g, name="stream")
                if rnd.random() < 0.45:
                    d = drop(rnd.uniform(0.07, 0.1), m["blue"], (x, y, -0.4 - rnd.uniform(0.4, 2.8)), parent=g)
                    streams.append((d, x, y))
    return g, streams

@asset("unit_hero", (1024, 1024), 160)
def a_unit_hero():
    m = M()
    ceiling_unit(m, water=True)
    frame(az=30, el=-24, pad=1.06)

@asset("unit_iso", (1024, 1024), 160)
def a_unit_iso():
    m = M()
    ceiling_unit(m, water=False)
    frame(az=35, el=30, pad=1.1)

@asset("unit_face", (1024, 1024), 128)
def a_unit_face():
    m = M()
    ceiling_unit(m, water=False)
    frame(az=20, el=-38, pad=1.12)

@asset("shower_hero", (1024, 1024), 160)
def a_shower():
    m = M()
    shower_head(m)
    frame(az=28, el=16, pad=1.08)

@asset("drop")
def a_drop():
    m = M()
    drop(1.0, m["blue"])
    sphere(0.16, m["sky"], (0.95, -0.4, 1.3))
    sphere(0.1, m["white"], (-0.9, -0.2, 0.95))
    frame(az=20, el=12)

@asset("ph")  # SEN0165 pH sensor: flask with water + pH probe
def a_ph():
    m = M()
    prof = [(0, 0), (0.95, 0), (1.02, 0.06), (1.0, 0.18), (0.42, 1.25), (0.36, 1.75), (0.44, 1.82), (0.44, 1.9)]
    lathe(prof, m["glass"], solid=0.035, sub=1, name="flask")
    lathe([(0, 0.05), (0.9, 0.05), (0.93, 0.15), (0.6, 0.72), (0, 0.72)], m["water"], sub=1, name="liquid")
    cyl(0.07, 2.1, m["white"], (0.12, 0.05, 1.3), (6, 8, 0), bevel=0.03, name="probe")
    cyl(0.1, 0.35, m["blue_flat"], (0.28, 0.1, 2.45), (6, 8, 0), bevel=0.04, name="probecap")
    sphere(0.09, m["deep"], (0.02, 0.02, 0.28))
    for i, (x, z, s) in enumerate(((-0.3, 0.45, 0.05), (0.25, 0.55, 0.035), (-0.1, 0.62, 0.03))):
        sphere(s, m["glass"], (x, -0.3, z))
    frame(az=28, el=18)

@asset("turbidity")  # SEN0189 turbidity: beaker, cloudy water, particles, probe
def a_turb():
    m = M()
    lathe([(0, 0), (0.85, 0), (0.9, 0.05), (0.9, 1.7), (0.98, 1.78)], m["glass"], solid=0.035, sub=1, name="beaker")
    cloudy = mat("cloudy", "#9CC8FF", 0.25, trans=0.55, ior=1.33)
    lathe([(0, 0.04), (0.86, 0.04), (0.86, 1.15), (0, 1.15)], cloudy, sub=1, name="liquid")
    rnd = random.Random(2)
    part = mat("particle", "#C9B48A", 0.5)
    for _ in range(26):
        a, r = rnd.uniform(0, 6.28), rnd.uniform(0, 0.75)
        sphere(rnd.uniform(0.025, 0.06), part, (r * math.cos(a), r * math.sin(a), rnd.uniform(0.15, 1.05)), seg=16)
    rbox(0.34, 0.3, 1.6, 0.12, m["white"], (0.2, 0.15, 1.55), (0, 10, 0), name="probe")
    rbox(0.36, 0.32, 0.18, 0.06, m["blue_flat"], (0.33, 0.15, 2.3), (0, 10, 0), name="band")
    frame(az=30, el=20)

@asset("chlorine")  # ORP sensor / chlorine residue: molecule
def a_cl():
    m = M()
    sphere(0.75, m["blue"], (0, 0, 0))
    for p, r, mm in (((1.55, -0.2, 0.55), 0.42, m["white"]), ((-1.35, 0.1, 0.75), 0.36, m["white"]),
                     ((0.3, 0.2, -1.4), 0.46, m["sky"]), ((-0.6, -0.8, -0.9), 0.26, m["white"])):
        sphere(r, mm, p)
        bond((0, 0, 0), p, 0.1, m["chrome"])
    frame(az=25, el=15)

@asset("temp")  # DS18B20 thermometer
def a_temp():
    m = M()
    g = empty("g", rot=(0, -18, 0))
    lathe([(0, -0.25), (0.34, -0.2), (0.42, 0.1), (0.22, 0.45), (0.22, 2.7), (0.18, 2.9), (0, 2.95)],
          m["glass"], solid=0.03, sub=2, parent=g, name="tube")
    sphere(0.3, m["blue"], (0, 0, 0.08), parent=g)
    cyl(0.1, 1.5, m["blue_flat"], (0, 0, 1.0), parent=g, name="mercury")
    for i in range(6):
        rbox(0.22, 0.05, 0.05, 0.02, m["deep"], (0.3, 0, 0.9 + i * 0.3), parent=g, name="tick")
    frame(az=18, el=12)

@asset("filter")  # icon: stacked filter layers
def a_filter():
    m = M()
    shades = [SKY, "#6FA8FF", BLUE, "#2766F0", DEEP, "#12308F"]
    for i, c in enumerate(reversed(shades)):
        cyl(1.0 - i * 0.02, 0.26, mat("l%d" % i, c, 0.2, coat=1.0), (0, 0, i * 0.34), bevel=0.08)
    cyl(1.06, 0.18, m["white"], (0, 0, 6 * 0.34 + 0.04), bevel=0.08)
    drop(0.22, m["blue"], (0, 0, 2.55))
    frame(az=30, el=24)

LAYERS = [  # top -> bottom (flow direction) — pre-filtration, adsorption, polishing
    ("Daun Bambu Kering", "#9FB06A", "#6E7F3E", 30),
    ("Loofah", "#E3CF98", "#B89A57", 22),
    ("Zeolit", "#E4E6E8", "#A9B0B8", 40),
    ("Biochar Kulit Pisang", "#3A3A3F", "#17171A", 45),
    ("Kitosan", "#F4EBD6", "#D8C8A5", 35),
    ("Ampas Tebu", "#D9B479", "#A67C44", 26),
]

@asset("filter_stack", (900, 1300), 160)
def a_filter_stack():
    m = M()
    gap = 0.62
    n = len(LAYERS)
    for i, (_, c1, c2, sc) in enumerate(LAYERS):
        z = (n - 1 - i) * gap
        cyl(1.0, 0.3, mat("L%d" % i, c1, 0.75, grain=(c2, sc)), (0, 0, z), bevel=0.06, name="layer")
        torus(1.02, 0.03, m["ice"], (0, 0, z + 0.155), name="rim")
    top = n * gap + 0.05
    lathe([(0, 0), (1.08, 0), (1.12, 0.1), (0.7, 0.35), (0.25, 0.42), (0, 0.42)], m["white"], (0, 0, top), name="cap")
    torus(1.1, 0.035, m["glow"], (0, 0, top + 0.06))
    lathe([(0, 0), (1.1, 0), (1.14, 0.2), (1.08, 0.3), (0, 0.3)], m["white"], (0, 0, -0.75), name="base")
    cyl(0.16, 0.5, m["chrome"], (0, -0.9, -0.62), (90, 0, 0), name="outlet")
    for i in range(7):
        drop(0.12, m["blue"], (math.cos(i) * 0.5, math.sin(i * 2) * 0.4, top + 0.8 + (i % 3) * 0.35))
    frame(az=30, el=22, pad=1.06)

@asset("calendar")
def a_cal():
    m = M()
    rbox(2.2, 0.35, 2.1, 0.22, m["white"], (0, 0, 0), name="body")
    rbox(2.2, 0.37, 0.55, 0.2, m["blue"], (0, -0.005, 0.83), name="top")
    for x in (-0.55, 0.55):
        torus(0.2, 0.06, m["chrome"], (x, 0, 1.15), (0, 90, 90))
    for r in range(3):
        for c in range(4):
            col = m["blue_flat"] if (r, c) in ((1, 2),) else m["ice"]
            rbox(0.3, 0.08, 0.26, 0.06, col, (-0.72 + c * 0.48, -0.19, 0.25 - r * 0.38))
    frame(az=26, el=14)

@asset("sun")  # tropical climate
def a_sun():
    m = M()
    sunm = mat("sun", "#FFC54A", 0.2, coat=1.0, grad=("#FF9F2E", "#FFE07A"))
    sphere(0.9, sunm, (0, 0, 0))
    for i in range(10):
        a = 2 * math.pi * i / 10
        p = Vector((math.cos(a) * 1.45, 0, math.sin(a) * 1.45))
        ob = rbox(0.14, 0.14, 0.42, 0.07, sunm, p)
        ob.rotation_euler = p.to_track_quat("Z", "Y").to_euler()
    sphere(0.12, m["sky"], (1.4, -0.4, -1.2))
    frame(az=0, el=0, shadow=False)

@asset("snow")  # subtropical climate
def a_snow():
    m = M()
    g = empty("g", rot=(0, 0, 0))
    for i in range(3):
        a = math.pi * i / 3
        arm = rbox(0.2, 0.2, 2.6, 0.1, m["blue"], (0, 0, 0), (0, 0, 0), parent=g)
        arm.rotation_euler = (0, a, 0)
        for s in (1, -1):
            for k in (0.55, 0.9):
                for side in (1, -1):
                    br = rbox(0.12, 0.12, 0.42, 0.06, m["sky"], parent=g)
                    c = Vector((math.sin(a) * k * s, 0, math.cos(a) * k * s))
                    ang = a + (math.pi if s < 0 else 0) + side * math.radians(40)
                    d = Vector((math.sin(ang), 0, math.cos(ang)))
                    br.location = c + d * 0.2
                    br.rotation_euler = (0, ang, 0)
    sphere(0.22, m["white"], (0, 0, 0), parent=g)
    frame(az=15, el=8, shadow=False)

@asset("robot")  # AI dermatology assistant
def a_robot():
    m = M()
    rbox(2.2, 1.7, 1.75, 0.55, m["white"], (0, 0, 0), name="head")
    rbox(1.8, 0.2, 1.05, 0.38, m["navy"], (0, -0.78, 0.02), name="visor")
    for x in (-0.38, 0.38):
        rbox(0.22, 0.1, 0.36, 0.1, m["glow"], (x, -0.9, 0.08), name="eye")
    torus(0.18, 0.035, m["glow"], (0, -0.9, -0.25), (90, 0, 0), arc=math.pi, name="smile").rotation_euler = (math.radians(90), math.radians(180), 0)
    for x in (-1.15, 1.15):
        cyl(0.36, 0.22, m["blue"], (x, 0, 0), (0, 90, 0), bevel=0.08, name="ear")
    cyl(0.05, 0.5, m["chrome"], (0, 0, 1.1), name="antenna")
    sphere(0.16, m["glow"], (0, 0, 1.42))
    star(4, 0.42, 0.12, 0.12, m["blue"], (1.35, -0.6, 1.05), (80, 0, 10))
    star(4, 0.24, 0.07, 0.08, m["sky"], (1.7, -0.5, 0.55), (80, 0, -10))
    frame(az=20, el=10)

@asset("sparkle")
def a_sparkle():
    m = M()
    star(4, 1.2, 0.3, 0.3, m["blue"], (0, 0, 0), (80, 0, 0))
    star(4, 0.5, 0.13, 0.16, m["sky"], (1.1, -0.2, 1.0), (80, 0, 15))
    star(4, 0.3, 0.08, 0.1, m["white"], (-1.0, -0.3, -0.9), (80, 0, -10))
    frame(az=10, el=8, shadow=False)

@asset("leaf")
def a_leaf():
    m = M()
    green = mat("green", "#2FC77A", 0.2, coat=1.0, grad=("#12A35C", "#7BE3A6"))
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=1)
    for v in bm.verts:
        x, y, z = v.co
        pinch = (1 - abs(x)) ** 0.6
        v.co = Vector((x * 1.6, y * 0.75 * pinch, z * 0.14 + (x * x) * 0.35))
    mk(bm, "leaf", green, rot=(35, -20, 35))
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=1)
    for v in bm.verts:
        x, y, z = v.co
        pinch = (1 - abs(x)) ** 0.6
        v.co = Vector((x * 1.0, y * 0.48 * pinch, z * 0.1 + (x * x) * 0.22))
    mk(bm, "leaf2", green, (1.0, 0.3, -0.7), rot=(40, 10, -30))
    drop(0.22, m["blue"], (-1.1, -0.5, 0.7))
    frame(az=10, el=24)

@asset("recycle")
def a_recycle():
    m = M()
    for i in range(3):
        a0 = 2 * math.pi * i / 3
        ob = torus(1.1, 0.2, m["blue"] if i != 1 else m["sky"], arc=math.radians(95))
        ob.rotation_euler = (0, 0, a0)
        a1 = a0 + math.radians(95)
        tip = Vector((1.1 * math.cos(a1), 1.1 * math.sin(a1), 0))
        tang = Vector((-math.sin(a1), math.cos(a1), 0))
        cone = cyl(0.42, 0.55, m["blue"] if i != 1 else m["sky"], tip + tang * 0.2, r2=0.0, seg=48)
        cone.rotation_euler = tang.to_track_quat("Z", "Y").to_euler()
    g = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    pe = empty("p", rot=(62, 0, 0))
    for o in g:
        o.parent = pe
    frame(az=0, el=10)

@asset("bell")
def a_bell():
    m = M()
    lathe([(0, 0.15), (1.0, 0.1), (1.12, 0.0), (1.05, 0.2), (0.82, 0.5), (0.72, 1.2), (0.55, 1.62), (0.25, 1.78), (0, 1.8)],
          m["blue"], solid=0.05, name="bell")
    sphere(0.24, m["white"], (0, 0, -0.08))
    torus(0.16, 0.06, m["chrome"], (0, 0, 1.92), (90, 0, 0))
    sphere(0.3, mat("red", "#FF5B6E", 0.2, coat=1), (0.9, -0.3, 1.5))
    frame(az=25, el=16)

@asset("home")
def a_home():
    m = M()
    rbox(1.8, 1.5, 1.2, 0.18, m["white"], (0, 0, 0))
    bm = bmesh.new()
    pts = [(-1.2, -1.0), (1.2, -1.0), (0, 1.0)]
    top = [bm.verts.new((x, -0.95, z)) for x, z in pts]
    bot = [bm.verts.new((x, 0.95, z)) for x, z in pts]
    bm.faces.new(top); bm.faces.new(list(reversed(bot)))
    for i in range(3):
        bm.faces.new((top[i], bot[i], bot[(i + 1) % 3], top[(i + 1) % 3]))
    bm.normal_update()
    roof = mk(bm, "roof", m["blue"], (0, 0, 1.45))
    md = roof.modifiers.new("bev", "BEVEL"); md.width, md.segments = 0.14, 8
    rbox(0.5, 0.1, 0.75, 0.1, m["blue_flat"], (0, -0.75, -0.2))
    frame(az=30, el=18)

@asset("chart")
def a_chart():
    m = M()
    rbox(2.8, 1.2, 0.2, 0.08, m["white"], (0, 0, 0))
    for i, (h, mm) in enumerate(((0.8, m["sky"]), (1.5, m["blue"]), (1.1, m["sky"]), (2.1, m["deep"]))):
        rbox(0.42, 0.42, h, 0.14, mm, (-0.99 + i * 0.66, 0, 0.1 + h / 2))
    frame(az=28, el=18)

@asset("user")
def a_user():
    m = M()
    sphere(0.62, m["blue"], (0, 0, 1.35))
    lathe([(0, 0), (1.05, 0), (1.12, 0.1), (1.0, 0.55), (0.6, 0.85), (0, 0.9)], m["white"], name="body")
    frame(az=20, el=12)

@asset("globe")  # SDGs
def a_globe():
    m = M()
    sphere(1.0, m["blue"], (0, 0, 0))
    land = mat("land", "#7BE3A6", 0.3, coat=1)
    rnd = random.Random(7)
    for _ in range(9):
        th, ph = rnd.uniform(0, 6.28), rnd.uniform(-0.9, 0.9)
        p = Vector((math.cos(th) * math.cos(ph), math.sin(th) * math.cos(ph), math.sin(ph)))
        sphere(rnd.uniform(0.22, 0.4), land, p * 0.84, scale=(1, 1, 0.8), seg=32)
    torus(1.55, 0.05, m["white"], (0, 0, 0), (72, 12, 0))
    sphere(0.15, m["sky"], (1.45, -0.5, 0.45))
    frame(az=20, el=15)

@asset("shield")  # water safe / quality ok
def a_shield():
    m = M()
    bm = bmesh.new()
    prof = []
    for i in range(41):
        t = i / 40
        x = -1 + 2 * t
        prof.append((x, 0.9 - 0.12 * (1 - x * x)))
    for i in range(1, 40):
        t = i / 40
        a = math.pi * t
        x = math.cos(a)
        prof.append((x, -0.2 - 1.1 * math.sin(a) ** 0.9 * (1 - 0.25 * abs(x))))
    top = [bm.verts.new((x, -0.2, z)) for x, z in prof]
    bot = [bm.verts.new((x, 0.2, z)) for x, z in prof]
    bm.faces.new(top); bm.faces.new(list(reversed(bot)))
    n = len(prof)
    for i in range(n):
        bm.faces.new((top[i], bot[i], bot[(i + 1) % n], top[(i + 1) % n]))
    bm.normal_update()
    sh = mk(bm, "shield", m["blue"])
    md = sh.modifiers.new("bev", "BEVEL"); md.width, md.segments = 0.15, 10
    # check mark
    g = empty("chk", (0, -0.25, 0.25))
    rbox(0.2, 0.15, 0.6, 0.07, m["white"], (-0.3, 0, 0.0), (0, -45, 0), parent=g)
    rbox(0.2, 0.15, 1.0, 0.07, m["white"], (0.18, 0, 0.18), (0, 38, 0), parent=g)
    frame(az=18, el=10)

@asset("tank")  # water saved / reuse tank
def a_tank():
    m = M()
    cyl(1.0, 1.9, m["glass"], (0, 0, 1.05), bevel=0.12, name="tankglass")
    cyl(0.93, 1.2, m["blue"], (0, 0, 0.72), bevel=0.1, name="tankwater")
    cyl(1.08, 0.24, m["white"], (0, 0, 0.0), bevel=0.08, name="base")
    cyl(1.08, 0.24, m["white"], (0, 0, 2.08), bevel=0.08, name="lid")
    cyl(0.3, 0.2, m["blue_flat"], (0, 0, 2.28), bevel=0.06, name="knob")
    for i, z in enumerate((0.55, 0.95, 1.35, 1.75)):
        rbox(0.32 if i % 2 else 0.2, 0.05, 0.05, 0.02, m["white"], (0.62, -0.78, z), (0, 0, 38))
    frame(az=25, el=18)

# ---- decorations -----------------------------------------------------------
@asset("deco_sphere", (400, 400))
def d_sphere():
    m = M(); sphere(1, m["blue"]); frame(az=0, el=0, shadow=False)

@asset("deco_sphere_white", (400, 400))
def d_sphere_w():
    m = M(); sphere(1, m["white"]); frame(az=0, el=0, shadow=False)

@asset("deco_torus", (500, 500))
def d_torus():
    m = M(); torus(1, 0.38, m["white"], rot=(60, 0, 20)); frame(az=0, el=0, shadow=False)

@asset("deco_ring", (500, 500))
def d_ring():
    m = M(); torus(1, 0.2, m["blue"], rot=(70, 10, 0)); frame(az=0, el=0, shadow=False)

@asset("deco_pill", (500, 500))
def d_pill():
    m = M()
    g = empty("g", rot=(20, 50, 30))
    q = [i / 20 * math.pi / 2 for i in range(21)]
    lathe([(0.5 * math.sin(a), -0.5 * math.cos(a)) for a in q] + [(0.5, 0.7), (0, 0.7)], m["blue"], parent=g, sub=1)
    lathe([(0, 0.7)] + [(0.5 * math.cos(a), 0.7 + 0.5 * math.sin(a)) for a in q], m["white"], parent=g, sub=1)
    frame(az=0, el=0, shadow=False)

@asset("deco_bubbles", (600, 600))
def d_bubbles():
    m = M()
    rnd = random.Random(11)
    for i in range(9):
        sphere(rnd.uniform(0.15, 0.6), m["glass"] if i % 3 else m["sky"], (rnd.uniform(-1.5, 1.5), rnd.uniform(-1, 1), rnd.uniform(-1.5, 1.5)))
    frame(az=0, el=0, shadow=False)

@asset("deco_drops", (600, 600))
def d_drops():
    m = M()
    for i, (x, z, s, r) in enumerate(((0, 0, 0.9, 0), (1.5, 0.9, 0.45, 15), (-1.3, 1.2, 0.35, -12), (1.1, -1.2, 0.3, 10))):
        drop(s, m["blue"] if i % 2 == 0 else m["sky"], (x, 0, z), (0, r, 0))
    frame(az=0, el=5, shadow=False)

# ---- showreel backdrops (transparent deco layers, 1920x1080) ---------------
def backdrop(layout, name):
    m = M()
    cd = bpy.data.cameras.new("cam")
    cam = link(bpy.data.objects.new("cam", cd))
    cam.location, cam.rotation_euler = (0, -22, 0), (math.radians(90), 0, 0)
    cd.lens = 50
    cd.dof.use_dof = True
    cd.dof.focus_distance = 22
    cd.dof.aperture_fstop = 0.9
    bpy.context.scene.camera = cam
    for kind, loc, s, rot in layout:
        loc = Vector(loc)
        if kind == "sphere":
            sphere(s, m["blue"], loc)
        elif kind == "wsphere":
            sphere(s, m["white"], loc)
        elif kind == "torus":
            torus(s, s * 0.36, m["white"], loc, rot)
        elif kind == "ring":
            torus(s, s * 0.18, m["blue"], loc, rot)
        elif kind == "drop":
            drop(s, m["blue"], loc, rot)
        elif kind == "glass":
            sphere(s, m["glass"], loc)
        elif kind == "star":
            star(4, s, s * 0.26, s * 0.25, m["sky"], loc, rot)
    render(name)

LAYOUT_A = [
    ("sphere", (-7.2, 2, 2.6), 0.9, 0), ("torus", (-6.4, -3, -2.3), 0.9, (60, 20, 10)),
    ("drop", (6.8, 1, 1.2), 0.55, (0, 12, 0)), ("wsphere", (7.6, 4, -2.8), 1.1, 0),
    ("ring", (5.6, -2, 3.2), 0.6, (70, -20, 0)), ("glass", (-4.8, -4, 3.3), 0.45, 0),
    ("sphere", (4.8, -5, -3.2), 0.3, 0), ("star", (-5.2, -2, 0.2), 0.45, (85, 0, 15)),
    ("wsphere", (-8.5, 6, -0.4), 0.7, 0), ("drop", (-3.2, 8, -3.9), 0.6, (0, -18, 0)),
]
LAYOUT_B = [
    ("ring", (-6.8, 0, 2.9), 1.1, (64, 18, 0)), ("sphere", (7.3, 3, 2.9), 1.2, 0),
    ("wsphere", (-7.0, -2, -2.6), 0.8, 0), ("drop", (6.2, -3, -2.2), 0.5, (0, -10, 0)),
    ("glass", (5.2, -6, 1.2), 0.35, 0), ("torus", (8.4, 6, -1.0), 1.0, (40, 60, 0)),
    ("star", (-4.7, -6, 3.0), 0.35, (85, 0, -12)), ("sphere", (-4.5, -4, -3.4), 0.25, 0),
]

@asset("bg_deco_a", (1920, 1080), 128)
def bg_a():
    backdrop(LAYOUT_A, "bg_deco_a")

@asset("bg_deco_b", (1920, 1080), 128)
def bg_b():
    backdrop(LAYOUT_B, "bg_deco_b")

# ---- turntable animation for the showreel intro ----------------------------
def anim(frames=120):
    reset()
    setup((1000, 1000), 48)
    m = M()
    g, drops = ceiling_unit(m, water=True, seed=9)
    cam = frame(az=30, el=-24, pad=1.2)
    bpy.context.view_layer.update()
    center = cam.location + (cam.matrix_world.to_3x3() @ Vector((0, 0, -30)))
    seq = os.path.join(OUT, "anim")
    os.makedirs(seq, exist_ok=True)
    rnd = random.Random(5)
    phase = [rnd.random() for _ in drops]
    for f in range(frames):
        t = f / frames
        az = math.radians(10 + 45 * (0.5 - 0.5 * math.cos(t * math.pi)))
        e = math.radians(-24)
        d = Vector((math.sin(az) * math.cos(e), -math.cos(az) * math.cos(e), math.sin(e)))
        cam.location = center + d * 30
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        for (ob, x, y), ph in zip(drops, phase):
            k = (ph + t * 2.5) % 1.0
            ob.location = (x, y, -0.25 - k * 3.4)
        bpy.context.scene.render.filepath = os.path.join(seq, "f_%04d.png" % f)
        bpy.ops.render.render(write_still=True)
        print("FRAME", f)

# ------------------------------------------------------------------- main ---
if ONLY == {"anim"}:
    anim()
else:
    for name, (fn, res, samples) in ASSETS.items():
        if ONLY and name not in ONLY:
            continue
        reset()
        setup(res, samples)
        fn()
        if not name.startswith("bg_"):
            render(name)
print("DONE")
