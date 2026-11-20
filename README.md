# 华师南海校园开放世界

一个使用 HTML、JavaScript 和 WebGL 开发的校园开放世界游戏项目。初始地图版本为 `map-v0.1.0`，基于华南师范大学佛山校区南海校园的三维沙盘。

## 打开初始地图

双击 `index.html` 即可在浏览器中离线打开。左键拖动旋转，右键拖动平移，滚轮缩放。侧栏可以收起、展开，也可以切换到俯视视图。

## 修改地图

- `src/campus.js` 包含校园边界、道路、楼栋轮廓和地标数据。
- `src/terrain.js` 和 `src/scene.js` 负责地表绘制、三维网格和 WebGL 渲染。
- `src/viewer.js` 负责视角、地图操作和地标交互。
- `src/index.template.html` 和 `src/campus.css` 定义页面结构和样式。

修改源码后，在仓库根目录运行 `node build.mjs`，重新生成独立的 `index.html`。提交地图改动时一并提交生成后的 HTML。

楼高、比例尺和植被位置是近似值。资料出处可在地图的「资料与比例」面板查看。
