# 💡 Light Cue

A web page that lets a dance team and the lighting director agree on lighting cues ahead of time.
Upload the song, split it into sections, and set the lights for each section. When you play the song, the lights change at those points.

## How to use
1. **🎵 Upload song** (mp3/m4a/wav; drag and drop also works)
2. Play the song, or click the timeline to move to a point, then press **+ Add section here** (shortcut `M`)
3. Pick a preset for each section, or tap the circles on the stage to choose lights and set their color and brightness
4. **▶ Show mode** shows the lights full screen to the lighting director
5. **Export** saves a `.lightcue.json` file. Send it on KakaoTalk or similar, and the other person opens it with **Import**

> Data is saved only in **this browser** on this device (IndexedDB). Use Export/Import to move it to another device or person.

## Hosting on GitHub Pages (free)
```bash
git init && git add . && git commit -m "Light Cue"
git branch -M main
git remote add origin https://github.com/<id>/<repo>.git
git push -u origin main
```
On GitHub, open the repo → **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `(root)` → Save.
After a minute or two it goes live at `https://<id>.github.io/<repo>/`.

## Local test
```bash
python3 -m http.server 8000   # http://localhost:8000
```
