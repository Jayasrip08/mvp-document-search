import os

file_path = "frontend/src/styles.css"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Fix unclosed keyframe
old_keyframe = "@keyframes modalPop {\n  from { opacity: 0; transform: scale(0.9) translateY(12px); }\n.skeleton-line {"
new_keyframe = "@keyframes modalPop {\n  from { opacity: 0; transform: scale(0.9) translateY(12px); }\n  to   { opacity: 1; transform: scale(1) translateY(0); }\n}\n\n.skeleton-line {"
content = content.replace(old_keyframe, new_keyframe)

# Second attempt in case of different line endings
old_keyframe_rn = "@keyframes modalPop {\r\n  from { opacity: 0; transform: scale(0.9) translateY(12px); }\r\n.skeleton-line {"
new_keyframe_rn = "@keyframes modalPop {\r\n  from { opacity: 0; transform: scale(0.9) translateY(12px); }\r\n  to   { opacity: 1; transform: scale(1) translateY(0); }\r\n}\r\n\r\n.skeleton-line {"
content = content.replace(old_keyframe_rn, new_keyframe_rn)

# Remove refresh button styles
# We search for the specific pattern at the end
# (This is safer than a fixed index)
refresh_styles_start = ".sidebar-refresh-btn {"
if refresh_styles_start in content:
    content = content[:content.find(refresh_styles_start)].strip() + "\n\n/* ─── End of Styles ─── */\n"

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Styles fixed and cleaned.")
