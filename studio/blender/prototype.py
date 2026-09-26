# ---------------------------------------------------------------------------
# AQUENT prototype V1 — real-shape model (exec'd from assets.py)
# Dimensions are ESTIMATES from the lab photos (reference: handheld shower
# head face ≈ Ø110 mm). Change them here and re-render.
# ---------------------------------------------------------------------------
DIM = dict(
    W=380, D=250, H=270,        # housing width x depth x height (mm)
    LEAN=30,                    # front face set back at the top (mm)
    BASE_H=12, BEZEL=22, RECESS=8, EDGE_R=9,
    SOCK_OD=50, SOCK_H=45, SOCK_X=150, SOCK_Y=20,
    TUBE_OD=40, TUBE_L=480, CAP_H=18,
    LIGHT_D=45, LIGHT_Y=10,
    LABEL_W=150, LABEL_H=56,
    HEAD_D=110, HANDLE_L=190, HOSE_R=6,
)
U = 0.01  # 1 mm = 0.01 Blender units (scene is modelled in decimetres)


def u(mm):
    return mm * U


FONT_B = "C:/Windows/Fonts/segoeuib.ttf"
FONT_SB = "C:/Windows/Fonts/seguisb.ttf"


def thin_glass():
    """Thin-walled acrylic: transparent core, glossy Fresnel edges (no solid-rod refraction)."""
    m = bpy.data.materials.new("acrylic")
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    tr.inputs["Color"].default_value = lin("#F4F9FF")
    gl = nt.nodes.new("ShaderNodeBsdfGlossy")
    gl.inputs["Color"].default_value = lin("#FFFFFF")
    gl.inputs["Roughness"].default_value = 0.04
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lw.outputs["Facing"], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(gl.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def pm():
    """Real-world materials for the prototype."""
    return dict(
        shell=mat("shell", "#ECE9E3", 0.62, coat=0.04, spec=0.3),
        base=mat("base", "#CFD1D4", 0.6),
        chrome=mat("chrome", "#F2F4F7", 0.08, metal=1.0),
        hose=mat("hose", "#DADDE2", 0.22, metal=1.0),
        glass=thin_glass(),
        plate=mat("plate", "#BFC4CB", 0.4, coat=0.2),
        letter=mat("letter", "#FFFFFF", 0.3, emit="#FFFFFF", emit_str=9.0),
        dark=mat("dark", "#2B2E35", 0.5),
        violet=mat("violet", "#5C68FF", 0.3, emit="#4F5DFF", emit_str=6.0),
        led=mat("led", "#8F84FF", 0.3, emit="#7C70FF", emit_str=3.0),
        red=mat("red", "#C8262C", 0.3, coat=0.6),
        face=mat("face", "#F4F5F7", 0.35),
        nozzle=mat("nozzle", "#7E848C", 0.5),
        white_pvc=mat("pvc", "#F7F7F5", 0.45),
    )


def text_obj(body, size, m, loc, rot, font=FONT_B, extrude=0.0, parent=None, align="CENTER"):
    cu = bpy.data.curves.new("txt", "FONT")
    cu.body = body
    try:
        cu.font = bpy.data.fonts.load(font, check_existing=True)
    except Exception:
        pass
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.materials.append(m)
    ob = link(bpy.data.objects.new("txt", cu))
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    if parent:
        ob.parent = parent
    return ob


def proto_unit(pmat=None, hose=True, head=True):
    """Build the housing, columns, light, label, fittings, hose and handheld shower.
    Origin: floor, centre of the housing footprint. Front faces -Y."""
    P = pmat or pm()
    d = DIM
    W, D, H, B = u(d["W"]), u(d["D"]), u(d["H"]), u(d["BASE_H"])
    lean = u(d["LEAN"])
    root = empty("proto")
    parts = {}

    # base plinth
    rbox(W - u(8), D - u(8), B, u(3), P["base"], (0, 0, B / 2), parent=root, name="base")

    # housing: box whose front leans back, with an inset bevelled front panel
    bm = bmesh.new()
    v = [bm.verts.new(c) for c in (
        (-W / 2, -D / 2, B), (W / 2, -D / 2, B), (W / 2, D / 2, B), (-W / 2, D / 2, B),
        (-W / 2, -D / 2 + lean, H), (W / 2, -D / 2 + lean, H), (W / 2, D / 2, H), (-W / 2, D / 2, H))]
    faces = [bm.faces.new(f) for f in ((v[0], v[3], v[2], v[1]), (v[4], v[5], v[6], v[7]), (v[0], v[1], v[5], v[4]),
                                       (v[1], v[2], v[6], v[5]), (v[2], v[3], v[7], v[6]), (v[3], v[0], v[4], v[7]))]
    bm.normal_update()
    front = faces[2]
    bmesh.ops.inset_individual(bm, faces=[front], thickness=u(d["BEZEL"]), depth=-u(d["RECESS"]), use_even_offset=True)
    body = mk(bm, "housing", P["shell"], parent=root)
    md = body.modifiers.new("bev", "BEVEL")
    md.width, md.segments, md.limit_method = u(d["EDGE_R"]), 5, "ANGLE"
    md.angle_limit = math.radians(25)
    try:
        md.harden_normals = True
    except Exception:
        pass
    parts["housing"] = body

    # front-panel frame: local -Y is the panel normal, local Z runs up the panel
    a = math.atan2(lean, H - B)
    panel = empty("panel", (0, -D / 2 + lean / 2, (B + H) / 2), (-math.degrees(a), 0, 0))
    panel.parent = root
    pz = lambda mm: u(mm)          # local up offset from panel centre
    py = u(d["RECESS"]) - u(0.5)   # panel surface (inside the bezel)
    rbox(u(d["LABEL_W"]), u(4), u(d["LABEL_H"]), u(3), P["plate"], (0, py - u(2), pz(-10)), parent=panel, name="plate")
    text_obj("AQUENT", u(40), P["letter"], (0, py - u(4.3), pz(-10)), (90, 0, 0), extrude=u(0.4), parent=panel)
    # indicator holes: 2 columns x 4 rows (some glowing), then two lower pairs
    for col, x in enumerate((-118, -100)):
        for row in range(4):
            glowing = (row + col) % 2 == 0
            cyl(u(3.2), u(3), P["led"] if glowing else P["dark"], (u(x), py - u(0.2), pz(-40 - row * 17)), (90, 0, 0), seg=20, parent=panel, name="hole")
    for (x, z) in ((-118, -118), (-100, -118), (-118, -133), (-100, -133), (112, -122), (128, -122)):
        cyl(u(3.4), u(1.6), P["chrome"], (u(x), py - u(0.6), pz(z)), (90, 0, 0), seg=24, parent=panel, name="screw")
    # hose outlet with red valve
    ox, oz = 22, -116
    cyl(u(9), u(10), P["chrome"], (u(ox), py - u(5), pz(oz)), (90, 0, 0), seg=6, parent=panel, name="nut")
    cyl(u(6.5), u(30), P["chrome"], (u(ox), py - u(22), pz(oz)), (90, 0, 0), seg=32, parent=panel, name="spout")
    cyl(u(5), u(12), P["red"], (u(ox), py - u(20), pz(oz + 12)), seg=24, bevel=u(1.5), parent=panel, name="valve")
    cyl(u(8), u(8), P["chrome"], (u(ox), py - u(40), pz(oz)), (90, 0, 0), seg=6, parent=panel, name="hosenut")
    parts["panel"] = panel

    # top: white PVC sockets with weld beads, clear columns with caps, blue light
    top_y = lambda mm: u(mm)
    for sx in (-d["SOCK_X"], d["SOCK_X"]):
        x = u(sx)
        cyl(u(d["SOCK_OD"] / 2), u(d["SOCK_H"]), P["white_pvc"], (x, top_y(d["SOCK_Y"]), H + u(d["SOCK_H"]) / 2), seg=64, bevel=u(1.5), parent=root, name="socket")
        torus(u(d["SOCK_OD"] / 2 + 1), u(3), P["white_pvc"], (x, top_y(d["SOCK_Y"]), H + u(1.5)), rseg=12, parent=root, name="weld")
        t0, t1 = H + u(8), H + u(d["SOCK_H"] + d["TUBE_L"])
        r = u(d["TUBE_OD"] / 2)
        lathe([(r, 0), (r, t1 - t0)], P["glass"], (x, top_y(d["SOCK_Y"]), t0), steps=64, sub=0, parent=root, name="tube")
        cyl(r + u(2), u(d["CAP_H"]), P["white_pvc"], (x, top_y(d["SOCK_Y"]), t1 + u(d["CAP_H"]) / 2 - u(4)), seg=64, bevel=u(2), parent=root, name="cap")
    cyl(u(d["LIGHT_D"] / 2 + 3), u(2), P["dark"], (0, top_y(d["LIGHT_Y"]), H + u(0.6)), seg=64, parent=root, name="lightring")
    cyl(u(d["LIGHT_D"] / 2), u(2), P["violet"], (0, top_y(d["LIGHT_Y"]), H + u(1.2)), seg=64, parent=root, name="light")
    cyl(u(5), u(2), P["dark"], (u(-62), top_y(d["SOCK_Y"]), H + u(0.8)), seg=24, parent=root, name="button")

    bpy.context.view_layer.update()
    parts["outlet"] = panel.matrix_world @ Vector((u(ox), py - u(44), pz(oz)))

    if head:
        hs = handheld(P, root)
        parts["head"] = hs
    if hose and head:
        bpy.context.view_layer.update()
        o = parts["outlet"]
        tip = hs.matrix_world @ HANDLE_TIP()
        y0 = -D / 2
        pts = [o, o + Vector((0, -u(35), -u(18))), Vector((u(80), y0 - u(80), u(9))),
               Vector((u(250), y0 - u(110), u(8))), Vector((u(280), y0 - u(270), u(8))),
               Vector((u(150), y0 - u(330), u(8))), Vector((tip.x + u(110), tip.y - u(60), u(9))),
               Vector((tip.x + u(45), tip.y, tip.z)), tip]
        parts["hose"] = pipe(pts, u(d["HOSE_R"]), P["hose"], parent=None, name="hose")
    return root, parts


def HANDLE_TIP():
    return Vector((0, u(DIM["HEAD_D"] / 2 - 4 + DIM["HANDLE_L"]), u(-12)))


def handheld(P, parent=None, loc=None, rot=None):
    """Handheld shower: Ø110 mm nozzle face + chrome handle along local +Y."""
    d = DIM
    D = u(d["D"])
    hs = empty("handheld", loc or (u(-150), -D / 2 - u(120), u(32)), rot or (0, 30, -90))
    R = u(d["HEAD_D"] / 2)
    cyl(R, u(14), P["face"], (0, 0, 0), seg=96, bevel=u(3), parent=hs, name="headface")
    torus(R, u(5), P["chrome"], (0, 0, u(1)), rseg=16, parent=hs, name="rim")
    lathe([(R - u(2), -u(6)), (R * 0.75, -u(20)), (u(16), -u(28)), (0, -u(30))], P["chrome"], (0, 0, 0), steps=96, sub=1, parent=hs, name="back")
    bm = bmesh.new()
    for rr, n in ((0, 1), (12, 6), (22, 12), (32, 18), (42, 24)):
        for i in range(n):
            ang = 2 * math.pi * i / n + rr * 0.1
            bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=u(1.6), radius2=u(1.6), depth=u(2),
                                  matrix=Matrix.Translation((u(rr) * math.cos(ang), u(rr) * math.sin(ang), u(7.2))))
    mk(bm, "nozzles", P["nozzle"], parent=hs)
    # handle: tapered chrome shaft leaving the rim
    hl = u(d["HANDLE_L"])
    lathe([(0, 0), (u(15), 0), (u(13), hl * 0.7), (u(11), hl), (0, hl)], P["chrome"], (0, R - u(4), -u(12)), (-90, 0, 0), steps=48, sub=1, parent=hs, name="handle")
    return hs


def dim_line(a, b, label, m, txt_m, facing_rot, label_at, size=u(42)):
    """Dimension: thin line with end dots and a label at label_at."""
    a, b = Vector(a), Vector(b)
    bond(a, b, u(2.4), m)
    for q in (a, b):
        sphere(u(6), m, q, seg=16)
    text_obj(label, size, txt_m, Vector(label_at), facing_rot, font=FONT_SB)


def expo(v=-0.85):
    bpy.context.scene.view_settings.exposure = v


@asset("unit_hero", (1024, 1024), 160)
def a_proto_hero():
    expo()
    proto_unit()
    frame(az=28, el=14, pad=1.04)


@asset("unit_iso", (1024, 1024), 160)
def a_proto_iso():
    expo()
    proto_unit()
    frame(az=-34, el=30, pad=1.06)


@asset("unit_face", (1024, 1024), 128)
def a_proto_face():
    expo()
    proto_unit()
    frame(az=0, el=6, pad=1.04)


@asset("proto_front", (1200, 900), 160)
def a_proto_front():
    expo()
    root, parts = proto_unit()
    frame(az=18, el=8, pad=1.0, focus=["housing", "base"])


@asset("proto_top", (1200, 900), 160)
def a_proto_top():
    expo()
    root, parts = proto_unit(hose=False, head=False)
    frame(az=24, el=52, pad=1.0, focus=["housing", "socket", "light"])


def _dims_common(view):
    root, parts = proto_unit(hose=False, head=False)
    d = DIM
    W, D, H = u(d["W"]), u(d["D"]), u(d["H"])
    col = d["SOCK_H"] + d["TUBE_L"] + d["CAP_H"] - 4
    top = H + u(col)
    ink = mat("ink", "#23324F", 0.5)
    txt = mat("inktxt", "#1646D6", 0.4, emit="#1646D6", emit_str=0.6)
    if view == "front":
        r, y = (90, 0, 0), -D / 2 - u(60)
        dim_line((-W / 2, y, -u(45)), (W / 2, y, -u(45)), f"±{d['W']} mm", ink, txt, r, (0, y, -u(105)))
        dim_line((W / 2 + u(50), y, 0), (W / 2 + u(50), y, H), f"±{d['H']} mm", ink, txt, r, (W / 2 + u(170), y, H / 2))
        dim_line((-W / 2 - u(50), y, H), (-W / 2 - u(50), y, top), f"±{col} mm", ink, txt, r, (-W / 2 - u(170), y, (H + top) / 2))
        dim_line((u(d["SOCK_X"] - 25), y, top + u(35)), (u(d["SOCK_X"] + 25), y, top + u(35)), f"Ø{d['SOCK_OD']} mm", ink, txt, r, (u(d["SOCK_X"]), y, top + u(85)), size=u(34))
    else:
        r, x = (90, 0, 90), W / 2 + u(60)
        dim_line((x, -D / 2, -u(45)), (x, D / 2, -u(45)), f"±{d['D']} mm", ink, txt, r, (x, 0, -u(105)))
        dim_line((x, D / 2 + u(50), 0), (x, D / 2 + u(50), H), f"±{d['H']} mm", ink, txt, r, (x, D / 2 + u(170), H / 2))
        dim_line((x, -D / 2, H + u(30)), (x, -D / 2 + u(d["LEAN"]), H + u(30)), f"{d['LEAN']} mm", ink, txt, r, (x, -D / 2 - u(90), H + u(30)), size=u(30))
    return root


@asset("proto_dims_front", (1000, 1300), 128)
def a_dims_front():
    expo()
    _dims_common("front")
    frame(az=0, el=0, pad=1.08)


@asset("proto_dims_side", (1000, 1300), 128)
def a_dims_side():
    expo()
    _dims_common("side")
    frame(az=90, el=0, pad=1.08)


def tile_mat(name, axes, scale=3.3):
    m = mat(name, "#EEF2F6", 0.25, coat=0.3)
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.inputs["Color1"].default_value = lin("#F1F4F8")
    br.inputs["Color2"].default_value = lin("#E7ECF2")
    br.inputs["Mortar"].default_value = lin("#C5CFDB")
    br.inputs["Scale"].default_value = scale
    br.inputs["Mortar Size"].default_value = 0.012
    br.offset = 0.0
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    nt.links.new(sep.outputs[axes[0]], comb.inputs[0])
    nt.links.new(sep.outputs[axes[1]], comb.inputs[1])
    nt.links.new(comb.outputs[0], br.inputs["Vector"])
    nt.links.new(br.outputs["Color"], bsdf.inputs["Base Color"])
    return m


@asset("proto_inuse", (1600, 1000), 192)
def a_proto_inuse():
    """Bathroom context: unit on the floor, shower on a wall holder, water running."""
    sc = bpy.context.scene
    sc.render.film_transparent = False
    expo(-1.5)
    sc.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
    P = pm()
    rbox(40, 30, 0.2, 0.02, tile_mat("floor", ("X", "Y"), 1.6), (0, 6, -0.1), name="floor")
    rbox(40, 0.2, 26, 0.02, tile_mat("wall", ("X", "Z")), (0, 9.2, 13), name="wall")
    rbox(0.2, 30, 26, 0.02, tile_mat("wall2", ("Y", "Z")), (-9.5, 6, 13), name="wall2")
    root, parts = proto_unit(hose=False, head=False)
    root.location = (-4.6, 6.9, 0)
    root.rotation_euler = (0, 0, math.radians(10))
    hs = handheld(P, None, (2.2, 7.05, 16.4), (0, 0, 0))
    n = Vector((0.35, -0.5, -0.8)).normalized()   # nozzle face: forward, right and down
    h0 = Vector((0, 0.8, -0.6))
    h = (h0 - h0.dot(n) * n).normalized()         # handle: down and back into the holder
    hs.rotation_euler = Matrix((h.cross(n), h, n)).transposed().to_euler()
    bpy.context.view_layer.update()
    tip0 = hs.matrix_world @ HANDLE_TIP()
    rbox(0.7, 9.1 - tip0.y + 0.2, 0.6, 0.08, P["chrome"], (tip0.x, (tip0.y + 9.1) / 2, tip0.z + 0.35), name="holder")
    o = parts["panel"].matrix_world @ Vector((u(22), u(DIM["RECESS"]) - u(44), u(-116)))
    tip = hs.matrix_world @ HANDLE_TIP()
    pipe([o, o + Vector((0.1, -0.5, -0.1)), Vector((-2.0, 4.6, 0.08)), Vector((0.8, 5.2, 0.08)), Vector((2.5, 7.6, 1.5)),
          Vector((2.5, 8.5, 9.0)), tip + Vector((0.15, -0.25, -1.3)), tip], u(DIM["HOSE_R"]), P["hose"], name="hose")
    water = thin_glass()
    water.node_tree.nodes["Transparent BSDF"].inputs["Color"].default_value = lin("#EAF6FF")
    M3 = hs.matrix_world.to_3x3()
    head_c = hs.matrix_world @ Vector((0, 0, u(8)))
    nrm = (M3 @ Vector((0, 0, 1))).normalized()
    rnd = random.Random(4)
    for i in range(52):
        ang, rr = rnd.uniform(0, 6.283), rnd.uniform(0, 0.42)
        start = head_c + M3 @ Vector((rr * math.cos(ang), rr * math.sin(ang), 0))
        dirv = (nrm + Vector((rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06), 0))).normalized()
        L = (start.z - 0.05) / max(0.2, -dirv.z)
        end = start + dirv * L * rnd.uniform(0.35, 0.8)
        bond(start, end, rnd.uniform(0.006, 0.011), water)
        if rnd.random() < 0.5:
            sphere(rnd.uniform(0.02, 0.04), water, end, seg=12)
    cd = bpy.data.cameras.new("cam")
    cam = link(bpy.data.objects.new("cam", cd))
    cam.location = (8.5, -12.5, 9.0)
    target = Vector((-0.6, 7.2, 8.6))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.lens = 25
    sc.camera = cam
    light("ceiling", (0, 4, 25), 900, 10, "#FFFFFF")
    light("window", (14, -2, 14), 700, 8, "#DDEBFF")


def anim_proto(frames=120):
    reset()
    setup((1000, 1000), 48)
    expo()
    proto_unit()
    cam = frame(az=45, el=14, pad=1.12)
    bpy.context.view_layer.update()
    center = cam.location + (cam.matrix_world.to_3x3() @ Vector((0, 0, -30)))
    seq = os.path.join(OUT, "anim")
    os.makedirs(seq, exist_ok=True)
    for f in range(frames):
        az = math.radians(-20 + 360 * f / frames)
        e = math.radians(14)
        dv = Vector((math.sin(az) * math.cos(e), -math.cos(az) * math.cos(e), math.sin(e)))
        cam.location = center + dv * 30
        cam.rotation_euler = (-dv).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.render.filepath = os.path.join(seq, "f_%04d.png" % f)
        bpy.ops.render.render(write_still=True)
        print("FRAME", f)
