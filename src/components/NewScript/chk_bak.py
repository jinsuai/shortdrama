import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
for p in [r"VideoGenBoard.jsx.bak-0903cur", r"VideoGenBoard.jsx.bak-framefix"]:
    t = open(p, encoding="utf-8", errors="ignore").read()
    i = t.find("细化要求")
    print("=====", p, "细化要求段 =====")
    print(t[i:i+500] if i>=0 else "NOT FOUND")
    print()
