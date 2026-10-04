# ---------------------------------------------------------------------------
# AQUENT logo intro (Blender 5.2 CLI)
#   blender -b --factory-startup -P intro/logo_intro.py -- concept          # 6 approval stills
#   blender -b --factory-startup -P intro/logo_intro.py -- anim A|B [preview] # animation frames
# The logo is rebuilt in 3D from intro/logo_glyphs.json (traced from
# app/assets/brand/logo_white.png): A = drop-shaped mark, then q u e n t.
#   Concept A "Tetes"  : a drop falls, ripples spread, the logo rises from the water.
#   Concept B "Isi"    : the A mark is a glass vessel that fills with clean blue water,
#                        then the wordmark slides out.
# ---------------------------------------------------------------------------
import bpy, bmesh, json, math, os, sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace("\\", "/") + "/"
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = ARGS[0] if ARGS else "concept"
FPS, DUR = 30, 5.0
N = int(FPS * DUR)

GLY = json.load(open(ROOT + "intro/logo_glyphs.json"))
LOGO_W = 4.2                      # world width of the full wordmark
S = LOGO_W / GLY["w"]
H_LOGO = GLY["h"] * S
# brand gradient left->right (logo_grad.png)
C0, C1 = (0.12, 0.62, 0.86), (0.10, 0.36, 1.0)


def srgb(c):
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def clamp01(x):
    return max(0.0, min(1.0, x))


def ease(t):
    t = clamp01(t)
    return 1 - (1 - t) ** 3


def ease_back(t, k=1.6):
    t = clamp01(t)
    t -= 1
    return 1 + (k + 1) * t ** 3 + k * t ** 2


# ------------------------------------------------------------------ scene ---
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.refresh_devices()
        for d in prefs.devices:
            d.use = d.type == "OPTIX"
        sc.cycles.device = "GPU"
        sc.cycles.denoiser = "OPTIX"
    except Exception as e:
        print("GPU setup failed, CPU fallback:", e)
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 10
    sc.cycles.transmission_bounces = 10
    sc.cycles.glossy_bounces = 6
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.exposure = -0.45
    sc.render.fps = FPS
    w = sc.world = bpy.data.worlds.new("W")
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    bg.inputs["Color"].default_value = srgb((0.91, 0.94, 0.97)) + (1,)
    bg.inputs["Strength"].default_value = 0.7
    return sc


def mat_principled(name, color, rough=0.25, metal=0.0, transm=0.0, ior=1.45, emis=None, emis_s=0.0, coat=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = srgb(color) + (1,)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Transmission Weight"].default_value = transm
    p.inputs["IOR"].default_value = ior
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Alpha"].default_value = alpha
    if emis:
        p.inputs["Emission Color"].default_value = srgb(emis) + (1,)
        p.inputs["Emission Strength"].default_value = emis_s
    return m


def glyph_curve(g, depth, bevel, offset=0.0, name=None):
    cu = bpy.data.curves.new(name or ("G_" + g["name"]), "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = depth / 2
    cu.bevel_depth = bevel
    cu.bevel_resolution = 5
    cu.offset = offset
    cx = (g["x0"] + g["x1"]) / 2
    for loop in [g["outer"]] + g["holes"]:
        sp = cu.splines.new("POLY")
        sp.points.add(len(loop) - 1)
        for i, (x, y) in enumerate(loop):
            sp.points[i].co = ((x - cx) * S, (GLY["h"] - y) * S, 0, 1)
        sp.use_cyclic_u = True
    ob = bpy.data.objects.new(cu.name, cu)
    bpy.context.collection.objects.link(ob)
    ob.rotation_euler = (math.radians(90), 0, 0)
    ob.location = ((cx - GLY["w"] / 2) * S, 0, 0)
    return ob


def to_mesh(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    new = bpy.data.objects.new(ob.name + "_m", me)
    bpy.context.collection.objects.link(new)
    new.matrix_world = ob.matrix_world.copy()
    for s in me.polygons:
        s.use_smooth = True
    bpy.data.objects.remove(ob)
    return new


def build_logo(kind):
    """kind A: solid glossy brand-blue letters. kind B: glass A vessel + liquid, white-blue letters."""
    objs = {}
    for k, g in enumerate(GLY["glyphs"]):
        t = (g["x0"] + g["x1"]) / 2 / GLY["w"]
        col = lerp(C0, C1, t)
        if kind == "B" and k == 0:
            ob = to_mesh(glyph_curve(g, 0.34, 0.03, name="A_glass"))
            ob.data.materials.append(mat_principled("glass", (0.92, 0.97, 1.0), rough=0.02, transm=1.0, ior=1.45))
            liq = to_mesh(glyph_curve(g, 0.26, 0.012, offset=-0.035, name="A_liquid"))
            m = mat_principled("liquid", (0.18, 0.55, 1.0), rough=0.05, transm=0.92, ior=1.33, emis=(0.25, 0.6, 1.0), emis_s=0.0)
            liq.data.materials.append(m)
            objs["liquid"] = liq
        else:
            ob = to_mesh(glyph_curve(g, 0.22, 0.028))
            ob.data.materials.append(mat_principled("ink_" + g["name"], col, rough=0.28, coat=0.35,
                                                    emis=col, emis_s=0.0))
        objs[g["name"] if k else "A"] = ob
    return objs


def floor_and_lights(sc):
    # seamless cyclorama: flat floor that curves up into a back wall
    me = bpy.data.meshes.new("cyc")
    bm = bmesh.new()
    prof = [(y, 0.0) for y in (-30, -10, 0, 3)] + [(3 + 4 * math.sin(a), 4 - 4 * math.cos(a)) for a in [i / 12 * math.pi / 2 for i in range(1, 13)]] + [(7, 14)]
    rows = []
    for x in (-30, 30):
        rows.append([bm.verts.new((x, y, z)) for y, z in prof])
    for i in range(len(prof) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    bm.to_mesh(me)
    bm.free()
    fl = bpy.data.objects.new("floor", me)
    sc.collection.objects.link(fl)
    for p_ in me.polygons:
        p_.use_smooth = True
    fl.data.materials.append(mat_principled("floor", (0.90, 0.93, 0.97), rough=0.18, coat=0.25))
    def area(name, loc, rot, size, energy, color=(1, 1, 1)):
        l = bpy.data.lights.new(name, "AREA")
        l.size, l.energy, l.color = size, energy, color
        o = bpy.data.objects.new(name, l)
        sc.collection.objects.link(o)
        o.location, o.rotation_euler = loc, [math.radians(a) for a in rot]
        return o
    area("key", (-3, -5, 6), (50, 0, -30), 6, 900)
    area("fill", (5, -4, 3), (70, 0, 50), 5, 300)
    area("rim", (0, 2.5, 4), (-60, 0, 0), 5, 600, (0.55, 0.75, 1.0))
    # blue aura disc behind the logo
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=2.1, fill_type="NGON", location=(0, 1.6, 0.9), rotation=(math.radians(90), 0, 0))
    au = bpy.context.object
    au.name = "aura"
    m = bpy.data.materials.new("aura")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    gr = nt.nodes.new("ShaderNodeTexGradient")
    gr.gradient_type = "SPHERICAL"
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / 2.1, 1 / 2.1, 1)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    em = nt.nodes.new("ShaderNodeEmission")
    em.name = "AURA_EM"
    em.inputs["Color"].default_value = srgb((0.45, 0.68, 1.0)) + (1,)
    em.inputs["Strength"].default_value = 0.0
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], gr.inputs["Vector"])
    nt.links.new(gr.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    au.data.materials.append(m)
    return fl, au


def camera(sc, loc=(0, -7.6, 1.55), target=(0, 0, 0.95), lens=55):
    cd = bpy.data.cameras.new("cam")
    cd.lens = lens
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = 4.0
    c = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(c)
    c.location = loc
    d = Vector(target) - Vector(loc)
    c.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cd.dof.focus_distance = d.length
    sc.camera = c
    return c


def cam_move(c, l0, t0, l1, t1, k):
    loc = Vector(l0).lerp(Vector(l1), k)
    tgt = Vector(t0).lerp(Vector(t1), k)
    c.location = loc
    d = tgt - loc
    c.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    c.data.dof.focus_distance = d.length


# ------------------------------------------------------------- concept A ---
def drop_obj():
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=0.16)
    d = bpy.context.object
    d.name = "drop"
    # teardrop: pull the top vertices up
    for v in d.data.vertices:
        if v.co.z > 0:
            v.co.z *= 1 + 1.3 * (v.co.z / 0.16) ** 2
            r = 1 - 0.75 * (v.co.z / 0.37) ** 1.5 if v.co.z > 0 else 1
            v.co.x *= max(r, 0.04)
            v.co.y *= max(r, 0.04)
    for p in d.data.polygons:
        p.use_smooth = True
    d.data.materials.append(mat_principled("drop", (0.55, 0.8, 1.0), rough=0.0, transm=1.0, ior=1.33))
    return d


def ripple_rings(n=4):
    rings = []
    m = mat_principled("ripple", (0.6, 0.82, 1.0), rough=0.02, transm=0.85, ior=1.33, emis=(0.45, 0.7, 1.0), emis_s=0.6)
    for i in range(n):
        bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=0.018, major_segments=128, minor_segments=12, location=(0, 0, 0.0))
        r = bpy.context.object
        r.name = f"ring{i}"
        r.data.materials.append(m)
        for p in r.data.polygons:
            p.use_smooth = True
        rings.append(r)
    return rings


def scene_A():
    sc = reset()
    fl, au = floor_and_lights(sc)
    L = build_logo("A")
    drop = drop_obj()
    rings = ripple_rings()
    splash = []
    m = bpy.data.materials["drop"]
    for i in range(10):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.035 + 0.015 * (i % 3))
        s = bpy.context.object
        s.data.materials.append(m)
        splash.append(s)
    cam = camera(sc)
    return dict(sc=sc, L=L, drop=drop, rings=rings, splash=splash, aura=au, cam=cam)


def pose_A(F, t):
    """t in seconds. 0-1.1 drop falls; 1.1 impact, ripples; 1.4-2.6 letters rise; 2.6-5 hold + aura."""
    impact = 1.1
    # drop
    if t < impact:
        z = 1.3 - 1.3 * (t / impact) ** 2
        F["drop"].location = (-1.75, 0, z + 0.0)
        F["drop"].scale = (1, 1, 1.0 + 0.25 * (t / impact))
        F["drop"].hide_render = False
    else:
        F["drop"].hide_render = True
    # ripples (centered under the A)
    for i, r in enumerate(F["rings"]):
        tt = t - impact - i * 0.16
        if tt <= 0 or tt > 2.4:
            r.hide_render = True
            continue
        r.hide_render = False
        rad = 0.15 + 1.9 * ease(tt / 2.4) + i * 0.05
        r.location = (-1.75, 0, 0.004)
        r.scale = (rad, rad, max(0.25, 1 - tt / 2.4))
    for i, s in enumerate(F["splash"]):
        tt = t - impact
        if tt <= 0 or tt > 0.75:
            s.hide_render = True
            continue
        s.hide_render = False
        ang = i / len(F["splash"]) * math.tau
        v = 1.1 + 0.4 * (i % 3)
        s.location = (-1.75 + math.cos(ang) * v * tt * 0.9, math.sin(ang) * v * tt * 0.6, 0.02 + 2.6 * tt - 4.9 * tt * tt)
        if s.location.z < 0:
            s.hide_render = True
    # letters rise out of the water, A first, then q u e n t staggered
    order = ["A", "q", "u", "e", "n", "t"]
    for k, nm in enumerate(order):
        ob = F["L"][nm]
        st = impact + 0.25 + (0 if k == 0 else 0.35 + 0.12 * k)
        p = ease_back((t - st) / 0.7, 1.2)
        ob.location.z = -H_LOGO * 1.05 * (1 - p) + 0.02
        ob.hide_render = t < st
        ob.scale = (1, 1, 1)
    # aura grows after the wordmark lands
    em = F["aura"].active_material.node_tree.nodes["AURA_EM"]
    em.inputs["Strength"].default_value = 2.2 * ease((t - 2.4) / 1.0)
    F["aura"].hide_render = t < 2.4
    cam_move(F["cam"], (-1.75, -3.6, 0.75), (-1.75, 0, 0.45), (0, -7.4, 1.45), (0, 0, 0.9), ease((t - 1.0) / 2.2))
    for nm in order:
        mm = F["L"][nm].active_material.node_tree.nodes["Principled BSDF"]
        mm.inputs["Emission Strength"].default_value = 0.35 * ease((t - 2.6) / 0.8) * (0.85 + 0.15 * math.sin(t * 3))


# ------------------------------------------------------------- concept B ---
def scene_B():
    sc = reset()
    fl, au = floor_and_lights(sc)
    L = build_logo("B")
    liq = L["liquid"]
    # fill = boolean intersect with a box whose top rises
    bpy.ops.mesh.primitive_cube_add(size=1)
    box = bpy.context.object
    box.name = "fillbox"
    box.hide_render = True
    box.display_type = "WIRE"
    mod = liq.modifiers.new("fill", "BOOLEAN")
    mod.operation = "INTERSECT"
    mod.object = box
    mod.solver = "EXACT"
    # bubbles
    m = mat_principled("bubble", (1, 1, 1), rough=0.0, transm=1.0, ior=1.0)
    bubbles = []
    for i in range(14):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.018 + 0.01 * (i % 3))
        b = bpy.context.object
        b.data.materials.append(m)
        bubbles.append(b)
    cam = camera(sc)
    return dict(sc=sc, L=L, box=box, bubbles=bubbles, aura=au, cam=cam, liq=liq)


def pose_B(F, t):
    """0-0.6 glass A fades/rises in; 0.6-2.2 water fills bottom->top; 2.2-3.2 letters slide out; then hold + aura."""
    A = F["L"]["A"]
    a_x = A.location.x
    p = ease((t - 0.0) / 0.6)
    A.location.z = -0.4 * (1 - p)
    F["liq"].location.z = A.location.z
    fill = ease((t - 0.6) / 1.6)
    top = -0.02 + (H_LOGO + 0.1) * fill + A.location.z
    F["box"].location = (a_x, 0, (top - 0.5) / 2)
    F["box"].scale = (H_LOGO * 1.4, 1.0, max(0.001, top + 0.5))
    F["liq"].hide_render = fill <= 0.001
    for i, b in enumerate(F["bubbles"]):
        ph = (t * (0.55 + 0.07 * (i % 5)) + i * 0.137) % 1.0
        z = ph * max(top, 0.01)
        x = a_x + math.sin(i * 2.3 + t * 2) * 0.28 * (1 - z / (H_LOGO + 0.1)) + (i % 4 - 1.5) * 0.12
        b.location = (x, -0.02, z)
        b.hide_render = not (0.6 < t < 3.0) or z > top - 0.03
    em = F["liq"].active_material.node_tree.nodes["Principled BSDF"]
    em.inputs["Emission Strength"].default_value = 1.2 * ease((t - 2.0) / 0.8)
    # wordmark slides out from behind the A
    for k, nm in enumerate(["q", "u", "e", "n", "t"]):
        ob = F["L"][nm]
        if "x_home" not in ob:
            ob["x_home"] = ob.location.x
        st = 2.2 + 0.09 * k
        pp = ease_back((t - st) / 0.65, 1.0)
        ob.location.x = a_x + (ob["x_home"] - a_x) * pp
        ob.location.y = 0.05
        sc_ = 0.4 + 0.6 * pp
        ob.scale = (sc_, sc_, sc_)
        ob.hide_render = t < st
        mm = ob.active_material.node_tree.nodes["Principled BSDF"]
        mm.inputs["Emission Strength"].default_value = 0.3 * ease((t - 3.0) / 0.8)
    au = F["aura"].active_material.node_tree.nodes["AURA_EM"]
    au.inputs["Strength"].default_value = 2.2 * ease((t - 2.6) / 1.0)
    F["aura"].hide_render = t < 2.6
    cam_move(F["cam"], (-1.75, -3.8, 0.9), (-1.75, 0, 0.5), (0, -7.4, 1.45), (0, 0, 0.9), ease((t - 1.9) / 1.6))


# ------------------------------------------------------------------ main ---
def render_still(sc, path, w=1280, h=720, spp=96):
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.cycles.samples = spp
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


if MODE == "concept":
    out = ROOT + "intro/concept/"
    os.makedirs(out, exist_ok=True)
    F = scene_A()
    for lab, t in (("A1", 0.75), ("A2", 1.45), ("A3", 4.2)):
        pose_A(F, t)
        render_still(F["sc"], out + f"{lab}_tetes_t{t}.png")
    F = scene_B()
    for lab, t in (("B1", 0.9), ("B2", 1.7), ("B3", 4.2)):
        pose_B(F, t)
        render_still(F["sc"], out + f"{lab}_isi_t{t}.png")
elif MODE == "anim":
    kind = ARGS[1] if len(ARGS) > 1 else "A"
    preview = "preview" in ARGS
    out = ROOT + f"intro/build/frames_{kind}/"
    os.makedirs(out, exist_ok=True)
    F = scene_A() if kind == "A" else scene_B()
    pose = pose_A if kind == "A" else pose_B
    sc = F["sc"]
    sc.render.resolution_x, sc.render.resolution_y = (960, 540) if preview else (1920, 1080)
    sc.cycles.samples = 32 if preview else 160
    sc.render.use_persistent_data = False
    for f in range(N):
        p = out + f"f_{f:04d}.png"
        if os.path.exists(p):
            continue
        pose(F, f / FPS)
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
