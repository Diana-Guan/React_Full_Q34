# React Full Q34

## Purpose
This repository contains a React-based preview of the full Q34 solution. The goal of the project is to render the LaTeX work in a web interface, preserve more of the step-by-step structure, and experiment with interactions such as highlighted references and arrow-based visual explanations that are difficult to reproduce cleanly in static LaTeX.

## Project Structure
- `src/App.jsx`: application entry point
- `src/LatexPreview.jsx`: main preview renderer for the Q34 LaTeX source
- `src/App.css`: styles for the rendered preview layout and cards
- `src/index.css`: global page styles
- `Q34_Version3.tex`: source LaTeX file used as the preview input
- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow

## How to Use
If GitHub Pages is enabled for this repository, the deployed preview can be accessed here:

`https://diana-guan.github.io/React_Full_Q34/`

To run the project locally:

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal, usually:

`http://localhost:5173`

## Conclusion
This repository explores how a full LaTeX solution can be previewed in React while keeping more of the structure, visual cues, and interactive explanation style than a plain PDF or raw LaTeX rendering.

