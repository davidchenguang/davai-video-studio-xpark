# 发布说明素材（本地化相关）

本文件是 brief「发布说明注明 CJK 字体依赖」要求的落点：仓库内此前没有发布说明文件，
发布 Linux 打包时把下面这段随 Release 说明一并发出。

## Linux 桌面的 CJK 字体依赖

简体中文界面依赖系统提供的中日韩（CJK）字体；应用不随安装包内嵌中文字体，
各 Linux 发行版预装的字体集合差异较大，系统缺少 CJK 字体时界面文字会显示为豆腐块（□）。

安装示例：

- Debian / Ubuntu：`sudo apt install fonts-noto-cjk`
- Fedora：`sudo dnf install google-noto-sans-cjk-ttc-fonts`
- Arch：`sudo pacman -S noto-fonts-cjk`

Windows 与 macOS 系统默认带有中文字体（微软雅黑 / 苹方），无需额外安装。

> 按 brief 约定，Linux 桌面的中文字形人工确认不在本次本地化范围内；
> 若实际部署到 Linux 桌面，先按上表安装字体再补做该项确认。
