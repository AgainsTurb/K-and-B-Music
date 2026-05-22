# 🎵 K&B Music

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-TypeScript-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Platform](https://img.shields.io/badge/Platform-Windows_Only_(For_Now)-blue?logo=windows)](#)

**K&B Music** is a modern, cross‑platform music player built from the ground up with Tauri v2, React, and TypeScript. Search, discover, and stream music videos directly from Bilibili, manage personalized playlists, and enjoy an immersive, word-by-word synced rolling lyric experience.

*Note: The ultimate goal is full cross-platform support (Windows, macOS, Linux, Android, iOS). Currently, the **Windows** version is the only fully finished and stable release.*

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
* **Automated CI/CD:** Fully automated GitHub Actions pipeline for compiling and publishing `.exe` releases.

### 🚧 Under Development (Coming Soon)
* 🐧 **macOS & Linux Support:** Porting the core engine to Unix-based systems.
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
* **Background Engine:** Node.js sidecar (packaged via `caxa`)

---

## 💻 Getting Started (Local Development)

### Prerequisites
1. **[Node.js](https://nodejs.org/en/)** (v20 or higher recommended)
2. **[Rust](https://www.rust-lang.org/tools/install)**
3. **[Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)** (C++ Build Tools for Windows)

### Installation
Clone the repository and install the frontend dependencies:

```bash
git clone https://github.com/AgainsTurb/K-and-B-Music.git
cd K-and-B-Music
npm install
```

### Running the App


To start the Vite development server and the Tauri Rust backend simultaneously:


```bash


npm run tauri dev

```

### Building for Production

To compile the app into a standalone `.exe` installer:

Bash

```
# 1. Package the Node.js sidecar first
cd sidecar
npm install
npx caxa --input . --output "server-win.exe" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/server.js"
mkdir -p ../src-tauri/bin
mv server-win.exe ../src-tauri/bin/server-x86_64-pc-windows-msvc.exe
cd ..

# 2. Build the Tauri app
npm run tauri build

```

_(Note: If you fork this repo, the included GitHub Actions workflow will handle this automatically upon pushing a version tag!)_


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
    

## 📄 License

This project is licensed under the **GPL-3.0 License**. See the `LICENSE` file for details.

```

```
