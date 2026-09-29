# ---------------------------------------------------------------------------
# Realistic clothed human via MakeHuman / MPFB (CC0 assets), for AQUENT films.
# Needs the MPFB extension + makehuman_system_assets installed (see studio README).
# ---------------------------------------------------------------------------
import addon_utils, glob

addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.targetservice import TargetService  # noqa: E402

MH = os.path.join(os.environ.get("APPDATA", ""), "Blender Foundation", "Blender", "5.2", "extensions", ".user", "user_default", "mpfb", "data")


def mh(kind, name, ext):
    f = glob.glob(os.path.join(MH, kind, name, "*" + ext)) or glob.glob(os.path.join(MH, kind, name, "**", "*" + ext), recursive=True)
    return f[0] if f else None


def make_human(outfit="male_casualsuit03", hair="short02", skin="young_asian_male", shoes="shoes02", gender=1.0, age=0.5, height=0.55, muscle=0.55, weight=0.5):
    macro = TargetService.get_default_macro_info_dict()
    macro["gender"], macro["age"], macro["height"], macro["muscle"], macro["weight"] = gender, age, height, muscle, weight
    try:
        macro["race"] = {"african": 0.1, "asian": 0.8, "caucasian": 0.1}
    except Exception:
        pass
    base = HumanService.create_human(macro_detail_dict=macro, scale=0.1 * 10)  # 1 unit = 10 cm scene -> MPFB scale 1.0 = 1 dm
    f = mh("skins", skin, ".mhmat")
    if f:
        HumanService.set_character_skin(f, base, skin_type="MAKESKIN")
    rig = None
    try:
        rig = HumanService.add_builtin_rig(base, "default")
    except Exception as e:
        print("rig fail", e)
    for kind, name in (("eyes", "high-poly"), ("eyebrows", "eyebrow001"), ("eyelashes", "eyelashes02"), ("hair", hair),
                       ("clothes", outfit), ("clothes", shoes)):
        f = mh(kind, name, ".mhclo") if name else None
        if f:
            atype = {"eyes": "Eyes", "eyebrows": "Eyebrows", "eyelashes": "Eyelashes", "hair": "Hair"}.get(kind, "Clothes")
            try:
                HumanService.add_mhclo_asset(f, base, asset_type=atype, subdiv_levels=1)
            except Exception as e:
                print("asset fail", name, e)
    return base, rig


def aim_bone(rig, name, direction):
    """Rotate a pose bone (armature space) so its Y axis points along `direction`."""
    pb = rig.pose.bones.get(name)
    if not pb:
        return
    bpy.context.view_layer.update()
    M = pb.matrix.copy()
    y = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = y.rotation_difference(Vector(direction).normalized())
    head = M.translation.copy()
    pb.matrix = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ M
    bpy.context.view_layer.update()


def pose_shower(rig, t=0.0):
    """Both hands washing hair; small scrubbing loop driven by t (seconds)."""
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    for side, sx in (("L", 1), ("R", -1)):
        w = 2 * math.pi * 1.2 * t + (0 if sx > 0 else math.pi)
        up = Vector((sx * 0.7, -0.05 + 0.05 * math.sin(w), 0.72))
        fore = Vector((-sx * 0.78, 0.22 + 0.1 * math.sin(w), 0.42 + 0.08 * math.cos(w)))
        for b in ("upperarm01", "upperarm02"):
            aim_bone(rig, f"{b}.{side}", up)
        for b in ("lowerarm01", "lowerarm02"):
            aim_bone(rig, f"{b}.{side}", fore)
    aim_bone(rig, "head", Vector((0, -0.12, 1)))


def plain_shirt(color=None):
    """Paint over the MakeHuman logo on the t-shirt texture (keeps jeans & fabric detail)."""
    import numpy as np
    done = set()
    for ob in bpy.data.objects:
        if ob.type != "MESH" or "casualsuit" not in ob.name.lower():
            continue
        for slot in ob.material_slots:
            m = slot.material
            if not m or not m.node_tree:
                continue
            for n in m.node_tree.nodes:
                img = getattr(n, "image", None)
                if n.type != "TEX_IMAGE" or not img or img.name in done or img.size[0] < 256:
                    continue
                done.add(img.name)
                w, h = img.size
                px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
                r, g, b = px[..., 0], px[..., 1], px[..., 2]
                orange = (r > 0.45) & (r - b > 0.25) & (r - g > 0.08)
                if orange.sum() < 50:
                    continue
                ys, xs = np.where(orange)
                cy, cx = int(np.median(ys)), int(np.median(xs))
                # logo + "MAKEHUMAN" lettering sit in a band around the orange mark
                y0, y1 = max(0, cy - int(h * 0.05)), min(h, cy + int(h * 0.05))
                x0, x1 = max(0, cx - int(w * 0.14)), min(w, cx + int(w * 0.14))
                ref = np.concatenate([px[y0:y1, max(0, x0 - 40):x0].reshape(-1, 4), px[y0:y1, x1:x1 + 40].reshape(-1, 4)])
                fill = np.median(ref, axis=0)
                px[y0:y1, x0:x1] = fill
                img.pixels[:] = px.ravel()
                img.update()
                print("logo removed from", img.name, (x0, y0, x1, y1))


def towel_wrap(base, kind="waist", color="#E8EEF4", stripe="#8FB8E0"):
    """Terry towel that hugs the torso/hips and hangs straight below the widest ring.
    kind="waist": navel -> just above the knee (male). kind="chest": underarm -> mid-thigh."""
    import numpy as np
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    be = base.evaluated_get(dg)
    me = be.to_mesh()
    V = np.array([be.matrix_world @ v.co for v in me.vertices])
    be.to_mesh_clear()
    H = V[:, 2].max() - V[:, 2].min()
    z_floor = V[:, 2].min()
    cx, cy = np.median(V[:, 0]), np.median(V[:, 1])
    top_f, bot_f = (0.585, 0.30) if kind == "waist" else (0.735, 0.37)
    z_top, z_bot = z_floor + top_f * H, z_floor + bot_f * H
    NA, NZ = 48, 34
    angs = np.linspace(0, 2 * np.pi, NA, endpoint=False)
    zs = np.linspace(z_top, z_bot, NZ)
    ring_r = []
    rel = V[:, :2] - [cx, cy]
    th = np.arctan2(rel[:, 1], rel[:, 0])
    rr = np.hypot(rel[:, 0], rel[:, 1])
    torso = rr < 0.26 * H                        # ignore raised arms / hands
    for z in zs:
        sl = (np.abs(V[:, 2] - z) < 0.012 * H) & torso
        r = np.zeros(NA)
        for i, a in enumerate(angs):
            d = np.abs((th[sl] - a + np.pi) % (2 * np.pi) - np.pi) < (np.pi / NA) * 1.6
            r[i] = rr[sl][d].max() if d.any() else 0
        ring_r.append(r)
    ring_r = np.array(ring_r)
    for i in range(NA):                          # fill empty bins
        col = ring_r[:, i]
        col[col == 0] = np.median(ring_r[ring_r > 0])
    widest = int(np.argmax(ring_r.mean(1)[: NZ * 2 // 3]))
    hip = ring_r[widest].copy()
    for k in range(widest + 1, NZ):              # hang straight, slight flare + soft vertical folds
        d = (k - widest) / (NZ - widest)
        ring_r[k] = hip * (1 + 0.03 * d) * (1 + 0.035 * d * np.sin(7 * angs + 0.6) + 0.02 * d * np.sin(13 * angs))
    # smooth around the ring
    for _ in range(3):
        ring_r = (ring_r + np.roll(ring_r, 1, 1) + np.roll(ring_r, -1, 1)) / 3
    off = 0.012 * H
    bm = bmesh.new()
    rows = []
    for k, z in enumerate(zs):
        row = [bm.verts.new((cx + (ring_r[k, i] + off) * math.cos(a), cy + (ring_r[k, i] + off) * math.sin(a), z)) for i, a in enumerate(angs)]
        rows.append(row)
    for k in range(NZ - 1):
        for i in range(NA):
            bm.faces.new((rows[k][i], rows[k][(i + 1) % NA], rows[k + 1][(i + 1) % NA], rows[k + 1][i]))
    bm.normal_update()
    terry = mat("towel", color, 0.95, grain=("#C9D6E4", 38))
    try:
        terry.node_tree.nodes["Principled BSDF"].inputs["Sheen Weight"].default_value = 0.8
    except Exception:
        pass
    ob = mk(bm, "towel", terry)
    so = ob.modifiers.new("thick", "SOLIDIFY"); so.thickness = 0.008 * H; so.offset = 0
    subsurf(ob, 1)
    # overlapping towel end: a slightly raised vertical edge running down the front
    front = int(np.argmin(np.abs(((angs - (-np.pi / 2 + 0.55)) + np.pi) % (2 * np.pi) - np.pi)))
    bm = bmesh.new()
    rows = []
    for da in (-0.13, 0.0):
        a2 = angs[front] + da
        rows.append([bm.verts.new((cx + (ring_r[k, front] + off * (1.9 if da == 0 else 1.2)) * math.cos(a2),
                                   cy + (ring_r[k, front] + off * (1.9 if da == 0 else 1.2)) * math.sin(a2), z)) for k, z in enumerate(zs)])
    for k in range(NZ - 1):
        bm.faces.new((rows[0][k], rows[1][k], rows[1][k + 1], rows[0][k + 1]))
    tuck = mk(bm, "towel", terry)
    so2 = tuck.modifiers.new("thick", "SOLIDIFY"); so2.thickness = 0.007 * H
    subsurf(tuck, 1)
    # narrow waist taper for the chest wrap so it follows the body instead of a straight slab
    if kind == "chest":
        me2 = ob.data
        for v in me2.vertices:
            zr = (v.co.z - z_bot) / (z_top - z_bot)
            k = 1 - 0.06 * math.exp(-((zr - 0.45) / 0.18) ** 2)
            v.co.x = cx + (v.co.x - cx) * k
            v.co.y = cy + (v.co.y - cy) * k
    return [ob, tuck]
