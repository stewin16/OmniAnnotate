# OmniAnnotate Master 🎯

An industrial-grade, **fully offline** image data annotation tool designed for building high-quality computer vision datasets with absolute speed and precision.

## 🚀 Key Features

- **Industrial UI**: Clean, high-performance interface with absolute white theme purity.
- **Hybrid Interaction Engine**: Seamlessly move and resize bounding boxes even while in "Box" mode.
- **Multi-Select System**: Mass-manipulate annotations using **Rubber-band selection** or **Shift+Click**.
- **Polygon Support**: High-fidelity polygon point-to-point drawing and mass movement.
- **Multi-Format Export**: 
  - **YOLO** (Darknet)
  - **Pascal VOC** (.xml)
  - **COCO** (.json)
- **Productivity Boosters**:
  - **N**: Copy annotations to the next image instantly.
  - **Ctrl+D**: Duplicate selected objects.
  - **Jump to Image**: Instant navigation by index.
  - **Annotation Status**: Real-time "Done" vs "TODO" filtering.

## 🛠️ Tech Stack

- **Framework**: React + Vite
- **UI & Icons**: Lucide React, Framer Motion
- **Storage**: Local-first architecture (IndexedDB / LocalStorage)
- **Utilities**: JSZip for project archiving and multi-format exports.

## ⌨️ Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `V` | Select Mode |
| `B` | Box Mode |
| `P` | Poly Mode |
| `N` | Copy to Next Image |
| `Ctrl + D` | Duplicate Selection |
| `Del / Backspace` | Delete Selection |
| `S` | Canvas Snapshot |
| `H` | Toggle HUD |

## 📦 Getting Started

1. Clone the repository: `git clone https://github.com/stewin16/OmniAnnotate.git`
2. Install dependencies: `npm install`
3. Run the dev server: `npm run dev`

Designed for supremacy. Completely offline. 100% Precision.
