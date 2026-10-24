import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
p = r"VideoGenBoard.jsx"
t = open(p, encoding="utf-8", errors="ignore").read()

old1 = "3. 画面要具体细腻，可合理扩充细节（环境元素、光影变化、动作细节等）；【铁律】禁止描述出场角色的外貌细节（五官、发型、发色、服装款式与颜色、体型、配饰），所有出场角色的外貌、服装、发型一律以各自参考图为准，提示词只写其动作、表情、姿态与在画面中的位置"
new1 = "3. 画面要具体细腻，可合理扩充细节（环境元素、光影变化、动作细节等）；出场角色的外貌细节（五官、发型、发色、服装款式与颜色、体型、配饰）可根据分镜需要补充描述，并与参考图保持一致"
assert old1 in t, "old1 missing"
t = t.replace(old1, new1, 1)

old2 = "- 出场角色：${characters}（以上角色均有参考图锁定外貌，严禁在提示词中描述或自行设计其外貌/服装/发型，只写动作表情站位）"
new2 = "- 出场角色：${characters}"
assert old2 in t, "old2 missing"
t = t.replace(old2, new2, 1)

open(p, "w", encoding="utf-8", newline="").write(t)
print("OK, 两处禁外貌已回改")
# 确认无残留
print("残留检查:", "禁外貌" in t or "严禁在提示词中描述" in t)
