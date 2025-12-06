# Official Multilingual Rasa (English + Mandarin) – Rasa 3.6.2

This folder keeps a ready‑to‑use multilingual pipeline and language detector for future projects.

## Files
- `config.yml` – Single multilingual pipeline using LaBSE + DIET with CJK-friendly tokenization.
- `custom_components/language_detector.py` – FastText-based detector that sets `message.lang`.

## Setup steps
1) Install deps (no compile): `pip install fasttext-wheel`  _(or `fasttext` if build tools are available)_.
2) Download FastText LID model and place it under `models/`:
   - `wget https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin`
   - or use a browser and move `lid.176.bin` to `models/lid.176.bin`.
   - If you store it elsewhere, update `model_path` in `custom_components/language_detector.py`.
3) Drop `config.yml` into your Rasa project root (or merge its sections into your existing `config.yml`).
4) Ensure `custom_components` is on the Python path when running Rasa (Rasa auto-loads from project root).
5) Add bilingual NLU data in `data/nlu.yml`: keep the same intents; add English and Mandarin examples under each.
6) Train and test:
   - `rasa train`
   - `rasa shell nlu` → try “hello” (expect `lang: en`) and “你好” (expect `lang: zh`).

## Notes
- `use_word_boundaries: False` prevents Chinese characters from being dropped by whitespace tokenization.
- LaBSE (`rasa/LaBSE`) covers 100+ languages; fine for English/Mandarin in one model.
- If you later want per-language tokenizers or models, keep this folder as a baseline and branch from it.
