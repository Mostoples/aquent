# Concept stills for approval before the full film render.
#   blender -b --factory-startup -P blender/concept.py
import bpy, os, sys, math
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace("\\", "/") + "/"
sys.argv = [sys.argv[0], "--", ROOT + "output/concept", "none"]
__file__ = ROOT + "blender/assets.py"
exec(open(__file__, encoding="utf-8").read().split("# ------------------------------------------------------------------- main ---")[0])
exec(open(ROOT + "blender/inuse_anim.py", encoding="utf-8").read())
exec(open(ROOT + "blender/human.py", encoding="utf-8").read())
exec(open(ROOT + "blender/film.py", encoding="utf-8").read())
os.makedirs(OUT, exist_ok=True)

SHOTS = [  # name, character, time(s), camera, target, lens, teardown
    ("A1_scene_lebar", "male_towel", 2.0, (15, -15, 13.5), (1.0, 6.5, 12.5), 30, False),
    ("A2_karakter_pria_handuk", "male_towel", 2.0, (4.8, -9.5, 19.6), (SX, 6.4, 16.6), 45, False),
    ("B2_karakter_wanita_handuk", "female_towel", 2.0, (4.5, -8.5, 17.4), (SX, 6.4, 14.6), 45, False),
    ("C1_aquent_heater_terintegrasi", "male_towel", 43.0, (1.2, 3.8, 19.4), (4.3, 9.1, 17.1), 30, True),
]


def still(name, char, t, cl, tl, lens, tear):
    global CHAR
    CHAR = char
    reset()
    setup((1600, 900), 64, transparent=False)
    sc = bpy.context.scene
    sc.cycles.use_auto_tile, sc.cycles.tile_size = True, 512
    F = build_film()
    update_film(F, t)
    cam = sc.camera
    cam.animation_data_clear()
    tgt = bpy.data.objects["camtarget"]
    tgt.animation_data_clear()
    cam.location, tgt.location = cl, tl
    cam.data.lens = lens
    if not tear:
        for root, *_ in F["labels"]:
            for c in root.children:
                c.hide_render = True
    render(name)


only = [a for a in sys.orig_argv[sys.orig_argv.index("--") + 1:]] if "--" in sys.orig_argv else []
for s in SHOTS:
    if not only or s[0] in only:
        still(*s)


PERSON_XY = (-4.0, 5.7)


def inuse_hero(name, res, cl, tl, lens, samples=48):
    """Wide in-use still that shows the whole loop; also exports 2D anchors for callouts."""
    import json
    from bpy_extras.object_utils import world_to_camera_view
    global CHAR
    CHAR = "male_towel"
    reset()
    setup(res, samples, transparent=False)
    sc = bpy.context.scene
    sc.cycles.device = "CPU"
    F = build_film()
    F["pr"] = Vector(PERSON_XY + (TRAY_H,))
    update_film(F, 2.0)
    F["person"].location = Vector(PERSON_XY + (TRAY_H,))
    cam = sc.camera
    cam.animation_data_clear()
    tgt = bpy.data.objects["camtarget"]
    tgt.animation_data_clear()
    cam.location, tgt.location = cl, tl
    cam.data.lens = lens
    for root, *_ in F["labels"]:
        for c in root.children:
            c.hide_render = True
    bpy.context.view_layer.update()
    W, H = res
    proj = lambda p: (lambda v: (round(v.x * W, 1), round((1 - v.y) * H, 1)))(world_to_camera_view(sc, cam, Vector(p)))
    dense = lambda pl: [proj(Vector(a).lerp(Vector(b), k / 12)) for a, b in zip(pl, pl[1:]) for k in range(12)] + [proj(pl[-1])]
    json.dump({k: dense(v) for k, v in F["paths"].items() if k != "head"} | {"spray": [proj(F["paths"]["head"]), proj((PERSON_XY[0] + 0.6, PERSON_XY[1] + 0.3, TRAY_H + 0.2))]},
              open(os.path.join(OUT, name + "_paths.json"), "w"))
    pts = {"shower": (SX, 7.3, HEAD_Z), "drain": (SX + 0.4, 5.3, TRAY_H), "return": (7.6, 9.6, 8.0),
           "aquent": (5.0, 8.2, 17.6), "columns": (6.5, 8.9, 22.5), "mixer": (SX, 9.3, 12.4), "hot": (0.8, 9.6, 11.3)}
    W, H = res
    anchors = {}
    for k, p in pts.items():
        v = world_to_camera_view(sc, cam, Vector(p))
        anchors[k] = (round(v.x * W), round((1 - v.y) * H))
    json.dump(anchors, open(os.path.join(OUT, name + ".json"), "w"))
    render(name)


HERO = [("D1_inuse_landscape", (1920, 1080), (9.0, -18.0, 13.5), (1.6, 7.8, 12.4), 22),
        ("D2_inuse_portrait", (1100, 1300), (7.0, -18.0, 13.0), (2.0, 7.8, 12.8), 30)]
for h in HERO:
    if h[0] in only:
        inuse_hero(*h)


def teardown_hero(name, res, cl, tl, lens, samples=48):
    import json
    from bpy_extras.object_utils import world_to_camera_view
    global CHAR
    CHAR = "male_towel"
    reset()
    setup(res, samples, transparent=False)
    sc = bpy.context.scene
    sc.cycles.device = "CPU"
    F = build_film()
    update_film(F, 43.0)
    cam = sc.camera
    cam.animation_data_clear()
    tgt = bpy.data.objects["camtarget"]
    tgt.animation_data_clear()
    cam.location, tgt.location = cl, tl
    cam.data.lens = lens
    for root, *_ in F["labels"]:
        for c in root.children:
            c.hide_render = True
    for ob in F["person"].children_recursive if hasattr(F["person"], "children_recursive") else []:
        ob.hide_render = True
    bpy.context.view_layer.update()
    comps = {"inlet": (6.5, 8.9, 25.0), "basket": (6.5, 8.9, 23.8), "col1": (6.5, 8.9, 21.3), "pump": (6.1, 9.1, 16.9),
             "col2": (3.5, 8.9, 21.3), "uv": (4.2, 8.2, 17.9), "sensors": (5.2, 7.95, 17.25), "valve": (4.1, 7.95, 16.75),
             "heater": (3.85, 9.4, 17.1), "esp": (5.4, 9.8, 17.9), "outlet": (5.2, 7.4, 16.4)}
    W, H = res
    a = {}
    for k, p in comps.items():
        v = world_to_camera_view(sc, cam, Vector(p))
        a[k] = (round(v.x * W), round((1 - v.y) * H))
    json.dump(a, open(os.path.join(OUT, name + ".json"), "w"))
    render(name)


if "E1_teardown" in only:
    teardown_hero("E1_teardown", (1600, 1300), (9.0, -2.6, 21.2), (4.9, 8.8, 20.3), 34)
