

<div align="right">
  <strong><a href="#english">English</a> | <a href="#简体中文">简体中文</a></strong>
</div>

<a id="english"></a>
# 🎵 K&B Music

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-TypeScript-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Platform](https://img.shields.io/badge/Platform-Windows_|_macOS_|_Linux_|_Android_|_iOS_-blue?logo=github)](#)

**K&B Music** is a modern, cross‑platform music player built from the ground up with Tauri v2, React, and TypeScript. Search, discover, and stream music videos directly from Bilibili, manage personalized playlists, and enjoy an immersive, word-by-word synced rolling lyric experience.

*Note: The ultimate goal is full cross-platform support (Windows, macOS, Linux, Android, iOS). The core desktop engine is currently stable across Windows, macOS, Linux, Android and iOS (We are still working on the Apple Developer certificate for iOS build).*

---

## ✨ Features

### 🚀 Current Capabilities
* **Seamless Streaming:** Search and play music videos directly from Bilibili.
* **Immersive Lyrics:** Word-by-word synced rolling lyrics with dual-language display.
* **Desktop Floating Lyrics:** A borderless, transparent desktop lyric window that floats above other applications.
* **Library Management:** Create custom playlists, manage favorites, and drag-and-drop to reorder tracks.
* **Mini Player:** A compact, non-intrusive player mode for background listening.
* **B&O Style Sound EQ:** Interactive, 2D puck-driven sound stage equalizer (Warm/Bright, Relaxed/Energetic).
* **i18n Localization:** Built-in language engine (currently supporting English and Simplified Chinese).
* **Automated CI/CD:** Fully automated GitHub Actions pipeline for compiling and publishing releases across multiple OS architectures.

### 🚧 Under Development (Coming Soon)
* 📱 **Mobile Support:** Expanding the Tauri v2 codebase to compile natively for Android and iOS.
* 🔴 **YouTube Music Integration:** Searching and streaming directly from YouTube/YouTube Music.

---

## 🛠️ Tech Stack

* **Core Framework:** [Tauri v2](https://v2.tauri.app/)
* **Frontend:** [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
* **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
* **State & Drag/Drop:** `@dnd-kit/core`
* **Localization:** `react-i18next` + `i18next-parser`
* **Local Database:** Tauri SQL Plugin (SQLite)
* **Background Engine:** 100% Native Rust (`tokio`, `headless_chrome`)

---

## 💻 Getting Started (Local Development)

### Prerequisites
1. **[Node.js](https://nodejs.org/en/)** (v20 or higher recommended)
2. **[Rust](https://www.rust-lang.org/tools/install)**
3. **[Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)** (C++ Build Tools for Windows, Xcode command line tools for macOS, WebKit headers for Linux)

### Installation
Clone the repository and install the frontend dependencies:

```bash
git clone https://github.com/AgainsTurb/K-and-B-Music.git
cd K-and-B-Music
npm install
```

### Environment Variables (Important)
For safety concerns, the open-source codebase does not include the official database or cloud storage credentials. If you are compiling the app from source for local development, you must provide your own Aiven MySQL DB and VMA Cloud API tokens. Create a `config.toml` file at `.cargo/config.toml` and add your keys:
```toml 
[env] AIVEN_DB_URL = "your_aiven_mysql_url_here" VMA_API_TOKEN = "your_vma_api_token_here" 
```
*Note: The official pre-compiled binaries provided in the GitHub Releases tab already contain the corresponding secure tokens for public usage. You only need to do this if you are building the app yourself!*

### Running the App
To start the Vite development server and the Tauri Rust backend simultaneously:

For Windows/Macos/Linux:
```bash
npm run tauri dev
```

For Android:
```bash
npx tauri android dev
```

For iOS:
```bash
npx tauri ios dev
```


### Building for Production
Because K&B Music relies entirely on a native Rust backend, building the standalone installer requires just a single command:

For Windows/Macos/Linux:
```bash
npm run tauri build
```

For Android:
```bash
npx tauri android build --apk
```

For iOS:
```bash
npx tauri ios build
```

*(Note: If you fork this repo, the included GitHub Actions workflow will handle this automatically upon pushing a version tag!)*

---

## 🏗️ Development Guides

### 🌍 Localization (i18n)
This project uses `react-i18next` to manage translations. Instead of manually creating translation keys, we use an automated parser.
1. When building the UI, wrap any English text in the `t()` function (e.g., `t('Play All')`).
2. Run `npm run scan-i18n` in your terminal. This will scan the entire React codebase, extract all new strings, and automatically inject them into the JSON translation files.
3. Open `src/locales/zh.json` (or other languages) and provide the localized translations for the newly generated keys.

### 📦 Automated Version Sync
Do **not** manually edit `version` strings across `package.json`, `Cargo.toml`, and `tauri.conf.json`. We utilize an automated Node.js lifecycle hook to keep the entire workspace synchronized.
1. To bump the application version (e.g., to `1.0.1`), simply run:
   ```bash
   npm version 1.0.1
   ```
2. Our custom `sync-version.cjs` script will intercept this command, automatically inject the new version into the Rust and Tauri configuration files, stage them for Git, and finalize the release commit and tag.

---

## 🤝 Contributing

We welcome contributions from anyone interested in making K&B Music better! Whether you want to fix a bug, optimize performance, or help port the application to other operating systems, your help is highly appreciated.

### Contribution Rules
* 🌐 **Language Consistency:** To maintain a clean, accessible codebase, **all code comments, variable names, and commit messages must be written in English**.
* 🐛 **Issue Tracking:** Before starting major work, please search existing issues or open a new one to discuss your proposed changes.

### How to contribute:
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 💖 Special Thanks

* **[chenmozhijin/LDDC](https://github.com/chenmozhijin/LDDC)** – Special thanks for providing the critical insights, reverse-engineering logic, and methodology required for acquiring precision synchronized lyrics. This player's immersive lyrics feature wouldn't be possible without their foundational work.
    
---

## 📄 License

This project is licensed under the **GPL-3.0 License**. See the `LICENSE` file for details.

<br>
<hr>
<br>

<a id="简体中文"></a>
# 🎵 K&B Music (中文版)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-TypeScript-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Platform](https://img.shields.io/badge/Platform-Windows_|_macOS_|_Linux_|_Android_|_iOS_-blue?logo=github)](#)

**K&B Music** 是一款基于 Tauri v2、React 和 TypeScript 从零构建的现代跨平台音乐播放器。直接从 Bilibili 搜索、发现和播放音乐视频，管理个人播放列表，并享受沉浸式的逐字同步滚动歌词体验。

*注意：我们的最终目标是实现全平台支持（Windows, macOS, Linux, Android, iOS）。目前，核心桌面引擎已在 Windows，macOS，Linux，Android 和 iOS（我们仍在处理 iOS版本苹果开发者账号认证问题）上稳定运行。*

---

## ✨ 特性

### 🚀 当前功能
* **无缝流媒体播放：** 直接从 Bilibili 搜索并播放音乐视频。
* **沉浸式歌词：** 支持双语显示的逐字同步滚动歌词。
* **桌面悬浮歌词：** 悬浮于其他应用程序之上的无边框、透明桌面歌词窗口。
* **媒体库管理：** 创建自定义播放列表，管理收藏夹，并支持拖拽重新排序曲目。
* **迷你播放器：** 紧凑、不打扰的播放器模式，适合后台收听。
* **B&O 风格音效均衡器：** 交互式的二维圆盘声场均衡器（温暖/明亮，放松/动感）。
* **国际化多语言支持：** 内置语言引擎（目前支持英语和简体中文）。
* **自动化 CI/CD：** 自动化 GitHub Actions 流水线，用于跨多系统架构编译并发布版本。

### 🚧 开发中（即将推出）
* 📱 **移动端支持：** 扩展 Tauri v2 代码库以原生编译 Android 和 iOS 版本。
* 🔴 **YouTube Music 集成：** 直接从 YouTube/YouTube Music 搜索和播放流媒体。

---

## 🛠️ 技术栈

* **核心框架：** [Tauri v2](https://v2.tauri.app/)
* **前端：** [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
* **样式：** [Tailwind CSS v4](https://tailwindcss.com/)
* **状态与拖拽：** `@dnd-kit/core`
* **本地化：** `react-i18next` + `i18next-parser`
* **本地数据库：** Tauri SQL 插件 (SQLite)
* **后台引擎：** 100% 原生 Rust (`tokio`, `headless_chrome`)

---

## 💻 快速开始（本地开发）

### 先决条件
1. **[Node.js](https://nodejs.org/en/)** (建议 v20 或更高版本)
2. **[Rust](https://www.rust-lang.org/tools/install)**
3. **[Tauri 先决条件](https://v2.tauri.app/start/prerequisites/)** (Windows 需要 C++ 构建工具，macOS 需要 Xcode 命令行工具，Linux 需要 WebKit 依赖)

### 安装
克隆仓库并安装前端依赖：

```bash
git clone https://github.com/AgainsTurb/K-and-B-Music.git
cd K-and-B-Music
npm install
```

###  环境变量配置 (重要)
出于安全考虑，开源代码库中不包含官方数据库或云存储的凭证。如果您从源码编译此应用进行本地开发，您必须提供自己的 Aiven MySQL DB 和 VMA Cloud API 令牌。请在 `.cargo/config.toml` 创建配置文件并添加您的密钥：
```toml 
[env] AIVEN_DB_URL = "your_aiven_mysql_url_here" VMA_API_TOKEN = "your_vma_api_token_here" 
```
*注意：在 GitHub Releases 页面提供的官方预编译程序已经内置了对应的安全令牌，供公众直接使用。只有当您自行编译应用时才需要执行此步骤！*

### 运行应用
同时启动 Vite 开发服务器和 Tauri Rust 后端：

对于 Windows/Macos/Linux:
```bash
npm run tauri dev
```

对于 Android:
```bash
npx tauri android dev
```

对于 iOS:
```bash
npx tauri ios dev
```

### 构建生产版本
由于 K&B Music 完全依赖原生 Rust 后端，构建独立的安装程序只需要一条命令：

对于 Windows/Macos/Linux:
```bash
npm run tauri build
```

对于 Android:
```bash
npx tauri android build --apk
```

对于 iOS:
```bash
npx tauri ios build
```

*(注意：如果您 fork 了此仓库，包含的 GitHub Actions 工作流会在您推送版本标签时自动处理此操作！)*

---

## 🏗️ 开发指南

### 🌍 本地化翻译 (i18n)
本项目使用 `react-i18next` 管理多语言。我们不提倡手动编写翻译键值对，而是使用自动化解析器。
1. 在编写 React 组件时，将需要翻译的英文文本用 `t()` 函数包裹（例如 `t('Play All')`）。
2. 在终端运行 `npm run scan-i18n`。这会扫描整个 React 代码库，提取所有新添加的字符串，并自动将它们注入到 JSON 翻译文件中。
3. 打开 `src/locales/zh.json`（或其他语言文件），为新生成的键值对提供相应的翻译即可。

### 📦 自动化版本同步
请**不要**在 `package.json`、`Cargo.toml` 和 `tauri.conf.json` 中手动修改版本号。我们使用了 Node.js 钩子脚本来保持整个工作区版本同步。
1. 升级应用版本（例如升级到 `1.0.1`）时，只需在终端运行：
   ```bash
   npm version 1.0.1
   ```
2. 我们自定义的 `sync-version.cjs` 脚本会自动拦截此命令，将新版本号注入到 Rust 和 Tauri 配置文件中，通过 Git 自动暂存，并完成最终的发布提交和打标签（Tag）操作。

---

## 🤝 参与贡献

我们欢迎任何有兴趣让 K&B Music 变得更好的人参与贡献！无论您是想修复 bug、优化性能，还是帮助将应用移植到其他操作系统，我们都非常感激您的帮助。

### 贡献规则
* 🌐 **语言一致性：** 为了维护一个整洁、对国际社区友好的代码库，**所有的代码注释、变量名和提交信息（commit messages）必须使用英语书写**。
* 🐛 **问题追踪（Issue）：** 在开始重大工作之前，请搜索现有的 issue 或开启一个新的 issue 来讨论您提议的更改。

### 如何贡献：
1. Fork 本项目
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到该分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request (PR)

---

## 💖 特别鸣谢

* **[chenmozhijin/LDDC](https://github.com/chenmozhijin/LDDC)** – 特别感谢提供获取精确同步歌词所需的关键见解、逆向工程逻辑和方法。如果没有他们基础性的工作，本播放器的沉浸式歌词功能将无法实现。
    
---

## 📄 开源协议

本项目采用 **GPL-3.0 协议**。详情请参阅 `LICENSE` 文件。
