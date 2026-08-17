# 鉴豆 · 咖啡豆管家

拍袋建档 → 盯养豆 → 记冲煮 → 看统计。一款咖啡豆全生命周期本地管家 PWA。

## 功能

- **拍照建档**：拍包装袋 → 本地 OCR（Tesseract.js，自托管离线可用）自动识别并预填烘焙商 / 产地 / 庄园 / 豆种 / 处理法 / 烘焙日期 / 风味 / 克重；设置页预留云端视觉大模型接口（OpenAI 兼容，如智谱 GLM-4V）
- **养豆管理**：烘焙日期 + 养豆天数（15 / 30 / 45 快捷档 + 自定义整数校验）→ 自动状态：养豆中 / 适饮期 / 临期 / 已喝完；到期「今天开喝」醒目横幅
- **克重流水**：冲煮快捷扣减（15 / 18 / 20 / 自定义）、分豆出库、修正克重，全部留痕，剩余克重自动演算
- **风味评分**：每次冲煮可选打分，7 维 × 10 分制（花香 / 果香 / 甜感 / 酸质 / Body / 余韵 / 整体），档案页雷达图
- **统计看板**：总览、近 8 周消耗趋势、豆种 TOP、产地 / 处理法分布、烘焙商 TOP、评分排行（手绘 SVG 图表）
- **归档与备份**：喝完归档保留历史；一键导出 / 导入 JSON 备份
- **隐私**：无服务器、无账号、无追踪，数据全部存本机 IndexedDB

## 技术形态

纯静态 PWA（无构建）· IndexedDB · Tesseract.js 5（vendor 自托管）· Service Worker 离线 · 手绘 SVG 图表

## 开发调试

```bash
cd jiandou
python3 -m http.server 8765
# 打开 http://localhost:8765/
```

图标再生成：`python3 scripts/gen_icons.py`（依赖 Pillow）

## 目录

```
index.html            入口
manifest.webmanifest  PWA 清单
sw.js                 Service Worker（离线缓存）
css/app.css           设计系统（奶油咖啡调）
js/                   应用代码（main 路由 / db 数据层 / ocr 识别 / charts 图表 / views 五个页面）
vendor/tesseract/     本地 OCR 资源（引擎 + wasm 核心 + 中英语言包，约 39MB）
icons/                应用图标
```
