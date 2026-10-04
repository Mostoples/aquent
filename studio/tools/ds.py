"""DeepSeek worker for Claude Code (Claude = orchestrator & reviewer, DeepSeek = cheap worker).

  python tools/ds.py "Ringkas log ini, sebutkan error saja" -f showreel/build/render.log
  python tools/ds.py "Terjemahkan ke bahasa Inggris, gaya pitch singkat" -f team/SKENARIO.md -o team/build/skenario_en.md
  type big.json | python tools/ds.py "Ambil semua key yang nilainya null" -f -
  python tools/ds.py --pro "..."          # deepseek-v4-pro (lebih kuat, ±4x lebih mahal)
  python tools/ds.py --think high "..."   # aktifkan reasoning (default mati agar hemat & cepat)
  python tools/ds.py --usage              # total token & biaya

API key: env DEEPSEEK_API_KEY, atau baris DEEPSEEK_API_KEY=... di AQUENT/.env.local (jangan di-commit / dibagikan).
Setiap panggilan dicatat di tools/ds_usage.csv (token, cache hit, estimasi biaya USD sesuai jam peak/off-peak)."""
import argparse, csv, datetime as dt, json, os, pathlib, sys, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
LOG = ROOT / "tools/ds_usage.csv"
URL = "https://api.deepseek.com/chat/completions"
# USD per 1M tokens (peak): input cache-hit, input cache-miss, output — api-docs.deepseek.com/quick_start/pricing (Oct 2026)
PRICE = {"deepseek-flash": (0.006, 0.30, 1.20), "deepseek-v4-pro": (0.044, 1.32, 3.96)}
SYSTEM = ("You are a precise worker model. Another AI (the orchestrator) will review your output. "
          "Follow the instruction exactly, keep the requested format, do not invent facts, and say 'TIDAK YAKIN' "
          "when information is missing. Answer in the language of the instruction unless told otherwise.")


def api_key():
    k = os.environ.get("DEEPSEEK_API_KEY")
    env = ROOT / ".env.local"
    if not k and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("DEEPSEEK_API_KEY="):
                k = line.split("=", 1)[1].strip().strip('"')
    if not k:
        sys.exit("DEEPSEEK_API_KEY belum diatur (env var atau AQUENT/.env.local).")
    return k


def peak(now=None):
    n = now or dt.datetime.now(dt.timezone.utc)
    return n.weekday() < 5 and (1 <= n.hour < 4 or 6 <= n.hour < 10)


def cost(model, usage):
    hit_p, miss_p, out_p = PRICE.get(model, PRICE["deepseek-flash"])
    k = 1.0 if peak() else 0.5
    hit = usage.get("prompt_cache_hit_tokens", 0)
    miss = usage.get("prompt_cache_miss_tokens", usage.get("prompt_tokens", 0) - hit)
    return k * (hit * hit_p + miss * miss_p + usage.get("completion_tokens", 0) * out_p) / 1e6


def log(model, usage, usd, note):
    new = not LOG.exists()
    with LOG.open("a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["time", "model", "prompt", "cache_hit", "completion", "usd", "peak", "task"])
        w.writerow([dt.datetime.now().isoformat(timespec="seconds"), model, usage.get("prompt_tokens", 0),
                    usage.get("prompt_cache_hit_tokens", 0), usage.get("completion_tokens", 0), f"{usd:.5f}", peak(), note[:80]])


def usage_report():
    if not LOG.exists():
        print("Belum ada panggilan.")
        return
    rows = list(csv.DictReader(LOG.open(encoding="utf-8")))
    tot = sum(float(r["usd"]) for r in rows)
    tin = sum(int(r["prompt"]) for r in rows)
    tout = sum(int(r["completion"]) for r in rows)
    print(f"{len(rows)} panggilan · input {tin:,} tok · output {tout:,} tok · total ≈ USD {tot:.4f}")


def main():
    sys.stderr.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("prompt", nargs="?", default="")
    ap.add_argument("-f", "--file", action="append", default=[], help="lampirkan file teks (boleh berulang)")
    ap.add_argument("-o", "--out", help="tulis jawaban ke file")
    ap.add_argument("--pro", action="store_true", help="pakai deepseek-v4-pro")
    ap.add_argument("--system", default=SYSTEM)
    ap.add_argument("--json", action="store_true", help="paksa output JSON valid")
    ap.add_argument("--think", choices=["low", "high", "max"], help="aktifkan reasoning (default mati: lebih hemat)")
    ap.add_argument("--max", type=int, default=8000, help="max output tokens")
    ap.add_argument("--usage", action="store_true")
    a = ap.parse_args()
    if a.usage:
        return usage_report()
    parts = [a.prompt]
    for p in a.file:
        if p == "-":  # explicit stdin only: inside agents stdin is never a tty, so auto-reading it hangs
            parts.append("\n\n<stdin>\n" + sys.stdin.read() + "\n</stdin>")
            continue
        txt = pathlib.Path(p).read_text(encoding="utf-8", errors="replace")
        parts.append(f"\n\n<file path=\"{p}\">\n{txt}\n</file>")
    model = "deepseek-v4-pro" if a.pro else "deepseek-flash"
    body = {"model": model, "max_tokens": a.max, "temperature": 0.3,
            "messages": [{"role": "system", "content": a.system}, {"role": "user", "content": "".join(parts)}]}
    if a.json:
        body["response_format"] = {"type": "json_object"}
    if a.think:
        body["thinking"] = {"type": "enabled"}
        body["reasoning_effort"] = a.think
        body["max_tokens"] = max(a.max, 32000)
    else:
        body["thinking"] = {"type": "disabled"}
    req = urllib.request.Request(URL, json.dumps(body).encode(), {"Content-Type": "application/json",
                                                                   "Authorization": f"Bearer {api_key()}"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            res = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"DeepSeek HTTP {e.code}: {e.read().decode(errors='replace')[:500]}")
    ch = res["choices"][0]
    text = ch["message"].get("content") or ""
    if not text.strip() or ch.get("finish_reason") == "length":
        print(f"[ds] PERINGATAN: jawaban kosong/terpotong (finish_reason={ch.get('finish_reason')}); naikkan --max", file=sys.stderr)
    usd = cost(model, res.get("usage", {}))
    log(model, res.get("usage", {}), usd, a.prompt)
    if a.out:
        pathlib.Path(a.out).write_text(text, encoding="utf-8")
        print(f"[ds] {model} → {a.out}  ({res['usage'].get('prompt_tokens', 0)}+{res['usage'].get('completion_tokens', 0)} tok, ≈ USD {usd:.4f})")
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(text)
        print(f"\n[ds] {model} · {res['usage'].get('prompt_tokens', 0)}+{res['usage'].get('completion_tokens', 0)} tok · ≈ USD {usd:.4f}", file=sys.stderr)


if __name__ == "__main__":
    main()
