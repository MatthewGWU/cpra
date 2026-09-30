# CPRA Explainability UI

A static page that shows how three AI models were trained to find CPRA
(California Privacy Rights Act) rights in real company privacy policies, and how
to read what they decided.

> Live site: [https://matthewgwu.github.io/cpra/](https://matthewgwu.github.io/cpra/)

## What this project does

The C3PA dataset (Bin Musa et al., EMNLP 2024) contains expert-annotated
passages from real privacy policies. Six of its labels map cleanly to CPRA
rights. Using the 40% document scale, the project:

1. **Groups** raw annotations into `(document, text)` passages and merges duplicate rows.
2. **Deduplicates** so each sentence appears once, which avoids the same text landing in two splits.
3. **Subsamples** to 40% of documents at random with seed 42 (159 companies, 9,640 passages).
4. **Splits** by company 70 / 15 / 15 (111 / 23 / 25 companies; 6,328 / 1,592 / 1,720 passages).
5. **Trains** LegalBERT, RoBERTa-large, and Flan-T5-base on the train split.
6. **Tunes** one decision threshold per label on validation, for the two encoder models.

A separate trimming experiment is in progress. It reduces `Notice_Requirement`
passages in the training data only and leaves validation and test untouched.
It has no results yet, so the site shows a placeholder instead of numbers.

## Results

Macro F1 on the held-out test split:

| Model | Macro F1 |
| --- | --- |
| Flan-T5-base | 0.7949 |
| RoBERTa-large | 0.7734 |
| LegalBERT | 0.7562 |
| Always Notice (no learning) | 0.147 |
| Always everything (no learning) | 0.224 |

Results come from a single run. Scores moved by up to 0.03 between runs, so the
small gaps between the models do not show that one is better.

## Repository ↔ website

This repository is the source for the static site. GitHub Pages serves
`index.html` + `app.js` + `data/*.json` + `explainability/lime_samples.json`
directly; there is no build step. The notebooks hold the full pipeline, and the
JSON splits on the site come from `export_dataset.py`, which mirrors the
notebook logic.

## Key files

| File | What it is |
| --- | --- |
| `index.html` | The single-page site (Bootstrap 5 + Chart.js, CDN). |
| `app.js` | Client-side logic: charts, per-label table, explainability cards, passage browser. |
| `data/train.json`, `data/val.json`, `data/test.json` | The untrimmed JSON splits (browser-facing). |
| `export_dataset.py` | Reproduces those JSON splits from the raw dataset. |
| `explainability/lime_samples.json` | Two current-run LIME examples with real per-word weights. |
| `CPRA_40pct_CLEAN_(3).ipynb` | The main notebook: subsample, split, training, explainability. |
| `CPRA_60pct_Sep_2026.ipynb` | The earlier 60% scale notebook, kept for provenance. |

## Run locally

```bash
python -m http.server 8000
# open http://localhost:8000/
```

A server is required, because the passage browser fetches the JSON splits.

Regenerate the splits:

```bash
python export_dataset.py   # expects the C3PA_Dataset clone in ./C3PA_Dataset
```

## Dataset & models

- Dataset: [MaazBinMusa/C3PA_Dataset](https://github.com/MaazBinMusa/C3PA_Dataset) (released 2024)
- Paper: [C3PA (EMNLP 2024)](https://aclanthology.org/2024.emnlp-main.217/)
- Models: [LegalBERT](https://huggingface.co/nlpaueb/legal-bert-base-uncased) (2020),
  [RoBERTa-large](https://huggingface.co/roberta-large) (2019),
  [Flan-T5-base](https://huggingface.co/google/flan-t5-base) (2022)
