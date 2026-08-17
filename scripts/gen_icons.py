# 鉴豆 · 应用图标生成（咖啡豆造型：奶油底 + 深焙豆身 + 奶油中央裂纹）
from PIL import Image, ImageDraw

CREAM = (246, 241, 232)
BEAN = (74, 50, 32)
CARAMEL = (201, 154, 106)

SS = 4  # 超采样抗锯齿


def bean_layer(size, major_frac):
    W = size * SS
    major = W * major_frac          # 豆身长轴
    minor = major * 0.68            # 短轴
    cx = cy = W / 2

    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))

    # 豆身（椭圆，旋转 30°）
    body = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    d.ellipse([cx - minor / 2, cy - major / 2, cx + minor / 2, cy + major / 2], fill=BEAN + (255,))
    body = body.rotate(32, resample=Image.BICUBIC)
    img.alpha_composite(body)

    # 高光弧（左上，浅焦糖）
    hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.arc([cx - minor / 2 + W * 0.028, cy - major / 2 + W * 0.028,
            cx + minor / 2 - W * 0.028, cy + major / 2 - W * 0.028],
           start=205, end=285, fill=CARAMEL + (110,), width=int(W * 0.020))
    hl = hl.rotate(32, resample=Image.BICUBIC)
    img.alpha_composite(hl)

    # 中央裂纹（奶白色贝塞尔曲线，随豆身旋转）
    crease = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    cd = ImageDraw.Draw(crease)
    pts = []
    for t in range(0, 101):
        tt = t / 100
        x = (1 - tt) ** 2 * cx + 2 * (1 - tt) * tt * (cx + minor * 0.40) + tt ** 2 * cx
        y = (1 - tt) ** 2 * (cy - major * 0.33) + 2 * (1 - tt) * tt * cy + tt ** 2 * (cy + major * 0.33)
        pts.append((x, y))
    cd.line(pts, fill=CREAM + (255,), width=int(W * 0.048), joint='curve')
    crease = crease.rotate(32, resample=Image.BICUBIC)
    img.alpha_composite(crease)

    return img.resize((size, size), Image.LANCZOS)


def rounded_mask(size, radius_frac):
    W = size * SS
    m = Image.new('L', (W, W), 0)
    d = ImageDraw.Draw(m)
    r = W * radius_frac
    d.rounded_rectangle([0, 0, W, W], radius=r, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def make_regular(size, path):
    """圆角图标（透明角落）"""
    base = Image.new('RGBA', (size, size), CREAM + (255,))
    base.paste(bean_layer(size, 0.80), (0, 0), bean_layer(size, 0.80))
    base.putalpha(rounded_mask(size, 0.225))
    base.save(path)


def make_maskable(size, path):
    """全出血 + 内容收进 80% 安全区"""
    base = Image.new('RGBA', (size, size), CREAM + (255,))
    base.paste(bean_layer(size, 0.62), (0, 0), bean_layer(size, 0.62))
    base.save(path)


import os
os.makedirs('icons', exist_ok=True)
make_regular(192, 'icons/icon-192.png')
make_regular(512, 'icons/icon-512.png')
make_maskable(512, 'icons/icon-maskable-512.png')
print('icons done')
