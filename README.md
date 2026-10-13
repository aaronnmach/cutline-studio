# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  # Cutline Studio

  Cutline Studio is a local video editor prototype for shaping an authorized clip into a vertical MP4. It includes the workspace-root `index.mp4` as its sample source.

  ## Run locally

  Requirements: Node.js 20.19+ or 22.13+, npm, and FFmpeg with `ffprobe` available on `PATH`.

  ```sh
  npm install
  npm run dev
  ```

  Open the Vite URL printed in the terminal. The app runs the React interface on port 5173 and the local video service on port 8787.

  ## Current workflow

  - Load `index.mp4` or upload an MP4, MOV, WebM, or MKV file (up to 1 GB).
  - Select a time range and a Reaction, Story, or Chaos color treatment.
  - Add optional opening and lower caption text.
  - Render a 1080 x 1920 MP4 with a blurred background, centered source frame, color grade, and text overlays.
  - Preview and download the result; optionally save local posting notes.

  Original uploads, renders, and share drafts are stored under `.clipper-data/`, which is ignored by Git. The app does not upload video or credentials to a third-party service.

  ## Publishing and model limits

  This version does not automatically publish or predict virality. TikTok's [Direct Post developer guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines) reject private one-account upload utilities and require an audited, creator-facing integration with explicit creator consent and account controls. For this local project, use the MP4 export and complete any posting manually only when your rights and assignment rules allow it.

  The Reaction, Story, and Chaos options are deterministic edit presets, not AI-generated edits. Captions are user-entered text, and the app does not yet rank candidate moments or learn from teacher ratings.
// eslint.config.js
