# React Full Q34

## Purpose
This repository contains a React version of the full Q34 solution. The goal is to present the full Q34 work in React rather than only in LaTeX.

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

