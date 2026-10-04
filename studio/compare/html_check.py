"""Compare structure of app/index.html with a translated page; print visible text of the translation.
   python compare/html_check.py compare/B/en.html"""
import sys, re
from html.parser import HTMLParser


class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.text, self.skip = [], [], 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.append((tag, a.get("class"), a.get("src"), a.get("href") if tag != "a" or "lang-switch" not in (a.get("class") or "") else "LANG"))
        if tag in ("script", "style"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip -= 1

    def handle_data(self, d):
        if not self.skip and d.strip():
            self.text.append(re.sub(r"\s+", " ", d.strip()))


def parse(p):
    x = P()
    x.feed(open(p, encoding="utf-8").read())
    return x


a, b = parse("app/index.html"), parse(sys.argv[1])
diff = [(i, x, y) for i, (x, y) in enumerate(zip(a.tags, b.tags)) if x != y]
print(f"tags: id={len(a.tags)} en={len(b.tags)} · structural differences: {len(diff)}")
for d in diff[:10]:
    print("  ", d)
sys.stdout.reconfigure(encoding="utf-8")
print("\n--- visible text ---")
print(" | ".join(b.text))
