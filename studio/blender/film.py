# ---------------------------------------------------------------------------
# AQUENT full-process film (exec'd from assets.py after inuse_anim.py/human.py)
#   blender -b --factory-startup -P blender/assets.py -- <out_dir> film [preview]
# Realistic clothed person showers -> greywater drains -> pumped up to AQUENT ->
# teardown: sediment basket, filtration column 1 & 2 (6 media), transfer pump,
# UV-C chamber, sensor chamber, 3-way valve, ESP32 -> clean water to the mixer
# (with a separate hot line) -> back to the shower.  1 unit = 10 cm.
# ---------------------------------------------------------------------------
FPS_F, DUR_F = 24, 62.0
CHAR = "male_towel"   # "male_towel" | "female_towel"
HEAD_Z = 22.4          # rain shower height (was 20.3)

CAM_KEYS = [  # seconds, camera, target
    (0.0, (15, -15, 13), (1.0, 6.5, 12.0)),
    (4.5, (12, -11, 12), (0.0, 6.5, 11.0)),
    (7.5, (SX + 2.5, -3.2, 1.3), (SX + 3.5, 8.0, 0.55)),
    (10.5, (13, 1.5, 3.8), (7.3, 9.3, 2.5)),
    (13.0, (14, 1.0, 14.0), (7.6, 9.4, 16.0)),
    (16.0, (9.5, 0.5, 21.0), (5.0, 8.8, 20.0)),
    (18.5, (7.8, 3.0, 21.8), (5.0, 8.8, 20.6)),
    (21.5, (7.5, 6.3, 24.2), (6.5, 8.9, 23.6)),
    (24.5, (7.6, 6.1, 21.9), (6.5, 8.9, 21.5)),
    (27.0, (7.6, 6.1, 20.1), (6.5, 8.9, 19.9)),
    (30.0, (5.0, 5.9, 23.4), (3.5, 8.9, 22.8)),
    (33.0, (4.7, 5.9, 20.4), (3.5, 8.9, 20.1)),
    (36.0, (5.3, 5.0, 18.7), (4.9, 8.2, 17.9)),
    (39.0, (5.6, 5.3, 17.8), (5.2, 7.95, 17.05)),
    (42.0, (4.5, 5.6, 17.6), (4.6, 9.0, 17.2)),
    (45.5, (9.5, 0.5, 20.5), (5.0, 8.8, 19.5)),
    (48.5, (2.2, 8.9, 12.9), (-2.5, 9.6, 12.4)),
    (51.5, (1.5, -3.0, 21.6), (SX, 7.3, 19.8)),
    (55.5, (15, -15, 13), (1.0, 6.5, 12.0)),
    (62.0, (16, -16, 13.5), (1.0, 6.5, 12.0)),
]

GHOST = (16.5, 18.8, 45.0, 47.5)  # teardown fade in/out window (s)
LABELS = [  # text, world position, t_on, t_off
    ("Saringan sedimen", (6.5, 8.55, 24.45), 20.5, 23.2),
    ("Daun bambu kering", (6.5, 8.55, 23.0), 22.8, 26.0),
    ("Loofah", (6.5, 8.55, 21.6), 23.6, 27.2),
    ("Zeolit", (6.5, 8.55, 20.2), 25.2, 28.6),
    ("Biochar kulit pisang", (3.5, 8.55, 23.0), 29.4, 32.2),
    ("Kitosan", (3.5, 8.55, 21.6), 30.4, 33.6),
    ("Ampas tebu", (3.5, 8.55, 20.2), 31.6, 34.8),
    ("UV-C 254 nm", (4.9, 7.95, 18.35), 34.6, 38.2),
    ("pH · Turbidity · ORP · Suhu", (5.2, 7.7, 17.55), 37.8, 41.4),
    ("Katup 3-arah", (4.1, 7.7, 16.95), 40.6, 44.4),
    ("ESP32 + WiFi", (4.95, 9.55, 18.45), 40.8, 44.8),
    ("Water heater terintegrasi", (3.85, 8.9, 18.2), 41.0, 45.0),
]


LANG = os.environ.get("AQ_LANG", "id")
LABELS_EN = {"Saringan sedimen": "Sediment screen", "Daun bambu kering": "Dried bamboo leaf", "Loofah": "Loofah",
             "Zeolit": "Zeolite", "Biochar kulit pisang": "Banana-peel biochar", "Kitosan": "Chitosan",
             "Ampas tebu": "Sugarcane bagasse", "UV-C 254 nm": "UV-C 254 nm", "pH · Turbidity · ORP · Suhu": "pH · Turbidity · ORP · Temp",
             "Katup 3-arah": "3-way valve", "ESP32 + WiFi": "ESP32 + WiFi", "Water heater terintegrasi": "Built-in water heater"}
if LANG == "en":
    LABELS = [(LABELS_EN.get(t, t), p_, a_, b_) for t, p_, a_, b_ in LABELS]


def ghost_material(m):
    """Add a Transparent mix to a material; returns the factor socket to animate."""
    nt = m.node_tree
    out = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
    src = out.inputs["Surface"].links[0].from_socket
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    tr.inputs["Color"].default_value = lin("#EAF3FF")
    gl = nt.nodes.new("ShaderNodeBsdfGlossy")
    gl.inputs["Roughness"].default_value = 0.08
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.25
    gmix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lw.outputs["Facing"], gmix.inputs[0])
    nt.links.new(tr.outputs[0], gmix.inputs[1])
    nt.links.new(gl.outputs[0], gmix.inputs[2])
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.name = "GHOSTMIX"
    mix.inputs[0].default_value = 0.0
    nt.links.new(src, mix.inputs[1])
    nt.links.new(gmix.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m.name


def billboard(text, pos, size=0.11):
    plate_m = mat("lbl_plate", "#FFFFFF", 0.4, emit="#FFFFFF", emit_str=0.6)
    txt_m = mat("lbl_txt", "#1646D6", 0.4, emit="#1646D6", emit_str=0.4)
    root = empty("label", pos)
    w = size * 0.56 * len(text) + size * 0.9
    rbox(w, 0.01, size * 1.7, size * 0.5, plate_m, (0, 0.012, 0), parent=root, name="lblplate")
    t = text_obj(text, size, txt_m, (0, 0, -size * 0.05), (90, 0, 0), font=FONT_SB, parent=root)
    return root


def smoothstep(a, b, x):
    k = max(0.0, min(1.0, (x - a) / (b - a)))
    return k * k * (3 - 2 * k)


def build_film():
    sc = bpy.context.scene
    sc.render.film_transparent = False
    for o in [o for o in sc.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o, do_unlink=True)
    sc.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    expo(-0.9)
    P = pm()
    F = {}
    # ---- room & cut-away tray ---------------------------------------------
    rbox(40, 40, 0.2, 0.02, tile_mat("floor", ("X", "Y"), 1.4), (0, 0, -0.1), name="floor")
    rbox(40, 0.4, 27, 0.02, tile_mat("wall", ("X", "Z")), (0, 10.2, 13.5), name="wall")
    rbox(0.4, 40, 27, 0.02, tile_mat("wall2", ("Y", "Z")), (-10.2, 0, 13.5), name="wall2")
    rbox(17, 7, 0.26, 0.04, tile_mat("tray", ("X", "Y"), 3.0), (-0.5, 6.5, TRAY_H - 0.13), name="traytop")
    glass = tinted_glass("trayglass", "#FFFFFF")
    glass.node_tree.nodes["Layer Weight"].inputs["Blend"].default_value = 0.12
    rbox(17, 0.06, TRAY_H - 0.26, 0.01, glass, (-0.5, 3.03, (TRAY_H - 0.26) / 2), name="trayfront")
    rbox(0.06, 7, TRAY_H - 0.26, 0.01, glass, (7.97, 6.5, (TRAY_H - 0.26) / 2), name="trayside")
    rbox(17, 7, 0.05, 0.01, mat("traybase", "#3E4C60", 0.6), (-0.5, 6.5, 0.03), name="traybase")
    cyl(0.62, 0.04, P["chrome"], (SX + 0.4, 5.3, TRAY_H + 0.01), seg=48, name="drain")
    for i in range(-2, 3):
        rbox(0.8, 0.07, 0.05, 0.01, P["dark"], (SX + 0.4, 5.3 + i * 0.2, TRAY_H + 0.03), name="slot")
    cyl(1.6, 0.01, tinted_glass("film", "#DDEEFF"), (SX + 0.4, 5.6, TRAY_H + 0.008), seg=64, name="film")
    # greywater sump pump under the tray
    rbox(1.1, 1.1, 0.9, 0.12, mat("sump", "#2E3A4E", 0.4, coat=0.5), (7.0, 9.2, 0.5), name="sump")
    sphere(0.07, mat("sumpled", "#38E1FF", 0.3, emit="#38E1FF", emit_str=8), (7.0, 8.63, 0.75), seg=12, name="sumpled")

    # ---- AQUENT on its wall shelf -------------------------------------------
    root, parts = proto_unit(hose=False, head=False)
    root.location = (5.0, 8.7, 16.0)
    rbox(4.4, 2.9, 0.22, 0.05, mat("shelf", "#F4F6F9", 0.4), (5.0, 8.75, 15.89), name="shelf")
    for bx in (3.4, 6.6):
        rbox(0.2, 2.6, 1.4, 0.04, P["chrome"], (bx, 8.85, 15.1), name="bracket")
    bpy.context.view_layer.update()
    O = parts["panel"].matrix_world @ Vector((u(22), u(DIM["RECESS"]) - u(44), u(-116)))
    ghost_material(parts["housing"].material_slots[0].material)
    F["housing"] = parts["housing"].name
    F["panel_bits"] = [c for c in parts["panel"].children if c.name.startswith(("plate", "txt", "hole", "screw"))]

    # ---- internals (world coordinates) --------------------------------------
    C1, C2, CY = 6.5, 3.5, 8.9
    tube_top, tube_bot = 24.0, 18.9
    screen = mat("screen", "#C9D1DA", 0.25, metal=0.9)
    bsk = cyl(0.17, 0.62, screen, (C1, CY, 23.7), seg=24, name="basket")
    wf = bsk.modifiers.new("wf", "WIREFRAME"); wf.thickness = 0.012
    hairm = mat("hairbits", "#2A1E1A", 0.6)
    rnd = random.Random(3)
    for i in range(7):
        a = Vector((C1 + rnd.uniform(-0.1, 0.1), CY + rnd.uniform(-0.1, 0.1), 23.5 + rnd.uniform(0, 0.3)))
        poly_pipe([a, a + Vector((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), rnd.uniform(-0.1, 0.2)))], 0.006, hairm, "hair")
    media = [(C1, 22.0, 23.2, 0), (C1, 20.6, 21.9, 1), (C1, 19.2, 20.5, 2),
             (C2, 22.0, 23.2, 3), (C2, 20.6, 21.9, 4), (C2, 19.2, 20.5, 5)]
    for cx, z0, z1, li in media:
        _, c1, c2, gs = LAYERS[[0, 1, 2, 3, 4, 5][li]]
        cyl(0.165, z1 - z0, mat("media%d" % li, c1, 0.8, grain=(c2, gs * 6)), (cx, CY, (z0 + z1) / 2), seg=32, name="media")
        for zz in (z0, z1):
            cyl(0.18, 0.02, mat("mesh%d" % li, "#DDE3EA", 0.4, metal=0.6), (cx, CY, zz), seg=32, name="meshdisk")
    # transfer pump + tube
    pumpm = mat("pump", "#20262F", 0.35, coat=0.6)
    cyl(0.32, 0.55, pumpm, (6.1, 9.1, 16.75), seg=32, bevel=0.05, name="pump")
    cyl(0.22, 0.4, P["chrome"], (6.1, 9.1, 17.2), seg=32, name="pumpmotor")
    transfer = [(C1, CY, tube_bot), (C1, CY, 16.9), (6.1, 9.1, 16.9), (6.1, 9.5, 17.0), (5.0, 9.5, 17.0), (5.0, 9.5, 24.6), (C2, 9.5, 24.6), (C2, CY, 24.6), (C2, CY, tube_top)]
    tglass = tinted_glass("ptransfer", "#E6EEF6")
    poly_pipe(transfer[1:], 0.06, tglass, "transfer")
    # UV-C chamber
    uv_y, uv_z, uv_x0, uv_x1 = 8.2, 17.9, 3.6, 6.2
    quartz = tinted_glass("quartz", "#F2F6FF")
    cyl(0.28, uv_x1 - uv_x0, quartz, ((uv_x0 + uv_x1) / 2, uv_y, uv_z), (0, 90, 0), seg=48, name="uvtube")
    uvlamp = mat("uvlamp", "#6E3BFF", 0.2, emit="#6A38FF", emit_str=5.0)
    cyl(0.07, uv_x1 - uv_x0 - 0.3, uvlamp, ((uv_x0 + uv_x1) / 2, uv_y, uv_z), (0, 90, 0), seg=24, name="uvlamp")
    for xx in (uv_x0, uv_x1):
        cyl(0.31, 0.12, P["chrome"], (xx, uv_y, uv_z), (0, 90, 0), seg=48, bevel=0.03, name="uvcap")
    uvlight = bpy.data.lights.new("uvglow", "POINT"); uvlight.energy = 0.0; uvlight.color = (0.55, 0.42, 1.0); uvlight.shadow_soft_size = 0.4
    uvl = link(bpy.data.objects.new("uvglow", uvlight)); uvl.location = ((uv_x0 + uv_x1) / 2, uv_y - 0.3, uv_z)
    F["uvlight"] = uvlight.name
    # sensor chamber with 4 probes
    sc_y, sc_z = 7.95, 17.0
    rbox(1.8, 0.5, 0.45, 0.06, tinted_glass("schamber", "#EEF5FF"), (5.2, sc_y, sc_z), name="schamber")
    for i, (c, nm) in enumerate((("#2F7BFF", "ph"), ("#8C8272", "turb"), ("#19B97A", "orp"), ("#FF7A59", "temp"))):
        x = 4.55 + i * 0.43
        cyl(0.035, 0.55, P["chrome"], (x, sc_y, sc_z + 0.12), seg=16, name="probe")
        cyl(0.07, 0.16, mat("pcap" + nm, c, 0.3, coat=1), (x, sc_y, sc_z + 0.45), seg=24, bevel=0.02, name="probecap")
    # 3-way valve + drain branch
    cyl(0.14, 0.3, P["chrome"], (4.1, sc_y, 16.6), seg=6, name="valve")
    rbox(0.26, 0.22, 0.2, 0.04, mat("solenoid", "#1646D6", 0.3, coat=1), (4.1, sc_y, 16.85), name="solenoid")
    poly_pipe([(4.1, sc_y, 16.45), (4.1, sc_y, 16.1)], 0.05, tinted_glass("pdrain", "#FFE9E4"), "drainbranch")
    # ESP32 controller board on the inner back wall
    rbox(1.3, 0.04, 0.8, 0.02, mat("pcb", "#1C6B45", 0.5), (4.95, 9.8, 17.8), name="pcb")
    rbox(0.42, 0.06, 0.3, 0.01, mat("esp", "#C9CDD3", 0.3, metal=0.8), (4.8, 9.76, 17.85), name="esp32")
    leds = []
    for i, c in enumerate(("#19B97A", "#38E1FF", "#FFB020")):
        m = mat("led%d" % i, c, 0.3, emit=c, emit_str=6)
        leds.append(m.name)
        sphere(0.03, m, (5.3 + i * 0.1, 9.76, 17.6), seg=12, name="pcbled")
    F["leds"] = leds
    wifi_m = mat("wifi", "#2F7BFF", 0.3, emit="#3D95FF", emit_str=4)
    arcs = []
    for i in range(3):
        a = torus(0.12 + i * 0.1, 0.012, wifi_m, (4.95, 9.62, 18.25), (90, 0, 0), arc=math.radians(90), name="wifi")
        a.rotation_euler = (math.radians(90), math.radians(-45), 0)
        arcs.append(a)
    F["wifi"] = arcs

    # ---- plumbing outside -----------------------------------------------------
    grey_glass = tinted_glass("pgrey", "#E9EDF2")
    blue_glass = tinted_glass("pblue", "#DCEBFF")
    red_glass = tinted_glass("pred", "#FFE3DC")
    ret = [(SX + 0.4, 5.3, TRAY_H), (SX + 0.4, 5.3, 0.55), (SX + 0.4, 9.6, 0.55), (6.4, 9.6, 0.55), (7.0, 9.2, 0.55),
           (7.6, 9.6, 0.9), (7.6, 9.6, 25.0), (7.6, CY, 25.0), (C1, CY, 25.0), (C1, CY, tube_top)]
    poly_pipe(ret[:-1], 0.2, grey_glass, "return")
    mixer = Vector((SX, 9.55, 12.4))
    internal = [(C2, CY, tube_bot), (C2, CY, 18.3), (uv_x0 - 0.1, uv_y, 18.3), (uv_x0 - 0.1, uv_y, uv_z)]
    poly_pipe(internal[1:], 0.06, tinted_glass("pint", "#E0ECFF"), "internal")
    after_uv = [(uv_x1 + 0.1, uv_y, uv_z), (6.35, uv_y, uv_z), (6.35, sc_y, sc_z), (4.3, sc_y, sc_z), (4.1, sc_y, 16.75), (4.1, sc_y, 16.6), (O.x, sc_y, 16.6), (O.x, O.y + 0.3, O.z), (O.x, O.y, O.z)]
    poly_pipe([after_uv[1], after_uv[2]], 0.06, tinted_glass("pint2", "#E0ECFF"), "toSensor")
    poly_pipe(after_uv[4:], 0.06, tinted_glass("pint3", "#E0ECFF"), "toOutlet")
    treated = [(O.x, O.y, O.z), (O.x, O.y - 0.35, O.z), (O.x, O.y - 0.35, 14.6), (O.x, 9.6, 14.6), (O.x, 9.6, mixer.z), (SX + 0.55, 9.6, mixer.z)]
    poly_pipe(treated, 0.2, blue_glass, "treated")
    # integrated water heater inside the AQUENT box: tank + copper coil, mains inlet, hot line to mixer
    HX, HY = 3.85, 9.4
    cyl(0.3, 1.3, tinted_glass("heatertank", "#FFF1EC"), (HX, HY, 16.95), seg=48, name="heatertank")
    for zz in (16.3, 17.6):
        cyl(0.32, 0.08, P["chrome"], (HX, HY, zz), seg=48, name="heatercap")
    coil = [(HX + 0.2 * math.cos(k * 0.5), HY + 0.2 * math.sin(k * 0.5), 16.45 + k * 0.011) for k in range(96)]
    poly_pipe(coil, 0.025, mat("coil", "#D2743A", 0.3, metal=1.0, emit="#FF6A2A", emit_str=1.5), "coil")
    poly_pipe([(HX, HY, 17.64), (HX, HY, 17.95), (HX, 10.2, 17.95)], 0.07, tinted_glass("pmains", "#E6ECF2"), "mains")
    hot = [(HX, HY, 16.3), (HX, 9.15, 15.6), (HX, 9.15, 11.3), (HX, 9.6, 11.3), (SX - 0.4, 9.6, 11.3), (SX - 0.4, 9.6, 11.95)]
    poly_pipe(hot, 0.18, red_glass, "hot")
    disp = rbox(u(46), u(3), u(22), u(3), mat("tdispbg", "#141A24", 0.3), (u(108), u(DIM["RECESS"]) - u(2), u(-58)), name="tdisp")
    disp.parent = parts["panel"]
    text_obj("38°C", u(15), mat("tdisptxt", "#FF6A3A", 0.3, emit="#FF6A3A", emit_str=6), (u(108), u(DIM["RECESS"]) - u(3.8), u(-58)), (90, 0, 0), parent=parts["panel"])
    F["hotpath"] = hot
    head_c = Vector((SX, 7.3, HEAD_Z))
    supply = [(SX, 9.6, mixer.z + 0.2), (SX, 9.6, HEAD_Z + 0.6), (SX, 7.3, HEAD_Z + 0.6), (SX, 7.3, HEAD_Z + 0.2)]
    poly_pipe(supply, 0.17, P["chrome"], "supply")
    rbox(1.3, 0.6, 1.0, 0.18, P["chrome"], (SX, 9.55, mixer.z), name="mixer")
    for sx, c in ((-1, "#E0483C"), (1, "#2F7BFF")):
        cyl(0.2, 0.35, P["chrome"], (SX + sx * 0.38, 9.18, mixer.z), (90, 0, 0), seg=24, name="knob")
        cyl(0.21, 0.06, mat("knobc%d" % sx, c, 0.3, coat=1), (SX + sx * 0.38, 8.99, mixer.z), (90, 0, 0), seg=24, name="knobcap")
    cyl(1.05, 0.14, P["chrome"], head_c, seg=64, bevel=0.04, name="rainhead")
    cyl(0.98, 0.02, P["face"], head_c - Vector((0, 0, 0.08)), seg=64, name="rainface")

    # ---- realistic person -------------------------------------------------------
    if CHAR == "female_towel":
        base, rig = make_human(outfit=None, shoes=None, hair="ponytail01", skin="young_asian_female", gender=0.0, height=0.6, muscle=0.45)
    else:
        base, rig = make_human(outfit=None, shoes=None, hair="short02", skin="young_asian_male", gender=1.0, height=0.75)
    if rig:
        pose_shower(rig, 0.0)
    towel = towel_wrap(base, "chest" if CHAR == "female_towel" else "waist")
    for ob in towel:
        ob.parent = rig or base
        ob.matrix_parent_inverse = (rig or base).matrix_world.inverted()
    holder = rig or base
    holder.location = (SX, 6.35, TRAY_H)
    holder.rotation_euler = (0, 0, math.radians(18))
    F["rig"] = rig
    F["pr"] = Vector((SX, 6.35, TRAY_H))

    # ---- flows ------------------------------------------------------------------
    greym = mat("bgrey", "#7D7568", 0.3, emit="#9A8E7A", emit_str=2.0)
    cloudy = mat("bcloud", "#9A9A8F", 0.3, emit="#A8A695", emit_str=1.3)
    lightb = mat("blight", "#8EC8F5", 0.25, emit="#9ACFF8", emit_str=2.0)
    blue = mat("bblue", "#2F8CFF", 0.25, emit="#3D95FF", emit_str=2.4)
    red = mat("bred", "#FF5A3C", 0.25, emit="#FF5A3C", emit_str=2.2)
    mixm = mat("bmix", "#7FC2FF", 0.25, emit="#8CC8FF", emit_str=2.0)
    foam = mat("foam", "#FFFFFF", 0.2, emit="#FFFFFF", emit_str=1.2)
    FY = CY - 0.17  # beads ride the camera side of the media
    sets = [
        bead_set(Path(ret[:-1] + [(C1, CY, 24.2)]), 0.55, 0.14, greym, 3.4, name="grey"),
        bead_set(Path([(C1, FY, 24.2), (C1, FY, 23.2)]), 0.14, 0.05, greym, 0.9, name="greyC"),
        bead_set(Path([(C1, FY, 23.2), (C1, FY, tube_bot)]), 0.16, 0.05, cloudy, 0.9, name="cloudC1"),
        bead_set(Path(transfer), 0.2, 0.045, cloudy, 1.6, name="cloudT"),
        bead_set(Path([(C2, FY, tube_top), (C2, FY, tube_bot)]), 0.16, 0.05, lightb, 0.9, name="lightC2"),
        bead_set(Path(internal), 0.18, 0.045, lightb, 1.2, name="lightI"),
        bead_set(Path(after_uv[1:]), 0.16, 0.045, blue, 1.2, name="blueI"),
        bead_set(Path(treated), 0.4, 0.13, blue, 2.6, name="blueT"),
        bead_set(Path(F["hotpath"]), 0.45, 0.12, red, 2.6, name="red"),
        bead_set(Path(supply), 0.4, 0.12, mixm, 3.0, name="mix"),
    ]
    helix = [((uv_x0 + (uv_x1 - uv_x0) * k / 120), uv_y + 0.2 * math.cos(k * 0.55), uv_z + 0.2 * math.sin(k * 0.55)) for k in range(121)]
    sets.append(bead_set(Path(helix), 0.3, 0.045, blue, 1.4, name="uvhelix"))
    foams = []
    fme = bpy.data.meshes.new("foam")
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.05); bm.to_mesh(fme); bm.free()
    fme.materials.append(foam)
    for i in range(40):
        foams.append((link(bpy.data.objects.new("foam", fme)), rnd.uniform(0, 6.283), rnd.uniform(0.2, 1.2), rnd.random()))
    # shower spray
    wbright = mat("spraydot", "#BFDFFF", 0.1, emit="#CFE6FF", emit_str=2.2)
    dme = bpy.data.meshes.new("drop")
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.05); bm.to_mesh(dme); bm.free()
    dme.materials.append(wbright)
    drops = []
    for i in range(260):
        ang, rr = rnd.uniform(0, 6.283), 0.9 * math.sqrt(rnd.random())
        start = head_c + Vector((rr * math.cos(ang), rr * math.sin(ang), -0.12))
        v = Vector((rnd.uniform(-0.05, 0.05), -0.12 + rnd.uniform(-0.05, 0.05), -1.0)) * 28
        drops.append((link(bpy.data.objects.new("drop", dme)), start, v, rnd.random()))

    # ---- labels -----------------------------------------------------------------
    F["labels"] = [(billboard(t, p), on, off) for t, p, on, off in LABELS]

    # ---- camera & lights ----------------------------------------------------------
    cd = bpy.data.cameras.new("cam")
    cam = link(bpy.data.objects.new("cam", cd))
    cd.lens, cd.clip_start, cd.clip_end = 30, 0.05, 400
    tgt = empty("camtarget")
    tc = cam.constraints.new("TRACK_TO")
    tc.target, tc.track_axis, tc.up_axis = tgt, "TRACK_NEGATIVE_Z", "UP_Y"
    sc.camera = cam
    for sec, cl, tl in CAM_KEYS:
        f = int(round(sec * FPS_F))
        cam.location, tgt.location = cl, tl
        cam.keyframe_insert("location", frame=f)
        tgt.keyframe_insert("location", frame=f)
    light("ceiling", (1, 5, 30), 5200, 12, "#FFFFFF")
    light("fill", (18, -10, 16), 2600, 14, "#E6F0FF")
    light("rim", (-6, -8, 22), 900, 8, "#FFF4E8")
    light("unitkey", (8, 3, 23), 700, 3, "#FFFFFF")
    F.update(sets=sets, drops=drops, foams=foams, cam=cam, drain=Vector((SX + 0.4, 5.3, TRAY_H)))
    F["paths"] = dict(ret=ret[:-1] + [(C1, CY, 24.2)], treated=treated, hot=F["hotpath"], supply=supply, head=tuple(head_c))
    F["person"] = rig or base
    return F


def update_film(F, t):
    for bs in F["sets"]:
        update_beads(bs, t)
    if F.get("rig"):
        pose_shower(F["rig"], t)
    # teardown: ghost shell, hide front-panel details
    a0, a1, b0, b1 = GHOST
    g = smoothstep(a0, a1, t) * (1 - smoothstep(b0, b1, t))
    bpy.data.objects[F["housing"]].material_slots[0].material.node_tree.nodes["GHOSTMIX"].inputs[0].default_value = 0.93 * g
    for ob in F["panel_bits"]:
        ob.hide_render = g > 0.5
    bpy.data.lights[F["uvlight"]].energy = 60.0 * g
    for i, mn in enumerate(F["leds"]):
        on = (int(t * 4) + i) % 3 != 0
        bpy.data.materials[mn].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 7.0 if on else 0.6
    for i, a in enumerate(F["wifi"]):
        ph = (t * 1.5 - i * 0.25) % 1.0
        a.hide_render = not (40.5 < t < 45.0) or ph > 0.7
    cam = F["cam"]
    for root, on, off in F["labels"]:
        vis = on <= t <= off
        k = min(1.0, (t - on) / 0.35, (off - t) / 0.35) if vis else 0
        root.scale = (k, k, k)
        for c in root.children:
            c.hide_render = k < 0.05
        root.rotation_euler = (cam.matrix_world.translation - root.location).to_track_quat("-Y", "Z").to_euler() if vis else root.rotation_euler
    d = F["drain"]
    for ob, ang, rr, ph in F["foams"]:
        k = (t * 0.7 + ph) % 1.0
        a = ang + t * 3.0
        r = rr * (1 - k)
        ob.location = d + Vector((r * math.cos(a), r * math.sin(a), 0.03 - 0.4 * max(0, k - 0.8)))
        ob.scale = (1 - k * 0.5,) * 3
    pr = F["pr"]
    for ob, start, v, ph in F["drops"]:
        life = 0.62
        tt = ((t / life) + ph) % 1.0 * life
        p = start + v * tt + Vector((0, 0, -4.9 * tt * tt))
        dx, dy = p.x - pr.x, p.y - pr.y
        ob.hide_render = (dx * dx + dy * dy < 2.6 and p.z < TRAY_H + (15.6 if CHAR == "female_towel" else 16.9)) or p.z < TRAY_H + 0.03
        ob.location = p
        vel = v + Vector((0, 0, -9.8 * tt))
        ob.rotation_euler = vel.to_track_quat("Z", "Y").to_euler()
        ob.scale = (1, 1, 3.2)


def render_film(preview=False, only=None):
    reset()
    setup((1600, 900), 12 if preview else 16, transparent=False)
    sc = bpy.context.scene
    sc.render.use_persistent_data = False
    sc.cycles.use_auto_tile, sc.cycles.tile_size = True, 512
    sc.cycles.max_bounces = 8
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
        sc.cycles.denoising_use_gpu = True
    except Exception:
        pass
    sc.render.fps = FPS_F
    F = build_film()
    seq = os.path.join(OUT, "film" if LANG == "id" else "film_" + LANG)
    os.makedirs(seq, exist_ok=True)
    total = int(DUR_F * FPS_F)
    if preview:
        frames = [int(s * FPS_F) for s in (8, 13, 49, 52)]
    else:
        frames = range(total) if LANG == "id" else range(int(20.3 * FPS_F), int(45.3 * FPS_F) + 1)   # other languages: only frames with 3D labels
        frames = [f for f in frames if not os.path.exists(os.path.join(seq, "f_%04d.png" % f))]
    for f in frames:
        sc.frame_set(f)
        update_film(F, f / FPS_F)
        sc.render.filepath = os.path.join(seq, "f_%04d.png" % f)
        bpy.ops.render.render(write_still=True)
        print("FRAME", f)
