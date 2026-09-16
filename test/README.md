# Headless checks

Needs Python 3 and Playwright with Chromium (`pip install playwright && playwright install chromium`).
Everything runs headless in a throwaway profile, so nothing opens on screen.

```
python3 test/smoke.py                 # extension loads, 5 devices render, scroll sync, no page errors
python3 test/restricted.py            # Chrome Web Store URLs are refused with an explanation
python3 test/smoke.py /path/to/unzipped-store-build   # same smoke check against a release zip
```
