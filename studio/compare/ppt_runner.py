"""Shared harness for task 3: run build_deck.py's helpers + an arm's slides.py + the FX pass -> pptx with the new slides.
   python compare/ppt_runner.py A|B"""
import pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
arm = sys.argv[1]
src = (ROOT / "deck/build_deck.py").read_text(encoding="utf-8")
helpers = src[:src.index("# ================================================================ SLIDES ===")]
fx = src[src.index("# =========================================================== FUTURISTIC FX ==="):]
g = {"__file__": str(ROOT / "deck/build_deck.py"), "__name__": "deck"}
exec(compile(helpers, "build_deck_helpers", "exec"), g)
g["TOTAL"] = 3
g["CMP"] = ROOT / "compare/assets"
g["TEAMIMG"] = ROOT / "app/assets/team"
exec(compile((ROOT / f"compare/{arm}/slides.py").read_text(encoding="utf-8"), f"{arm}/slides.py", "exec"), g)
g["OUT"] = ROOT / f"compare/{arm}/AQUENT_Deck_3slides.pptx"
exec(compile(fx, "build_deck_fx", "exec"), g)
