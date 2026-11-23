# Finds the face in a filmed video, a few times per second, with OpenCV's bundled detector (local, free).
# Usage: python faces.py <video> <out.json> [--fps 5]
# Writes [{ "t": seconds, "box": [x, y, w, h] normalised 0..1 or null }].
import sys, json, cv2

video, out = sys.argv[1], sys.argv[2]
rate = float(sys.argv[sys.argv.index("--fps") + 1]) if "--fps" in sys.argv else 5.0
cap = cv2.VideoCapture(video)
src = cap.get(cv2.CAP_PROP_FPS) or 30
step = max(1, round(src / rate))
det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
faces, i, last = [], 0, None
while True:
    ok, frame = cap.read()
    if not ok:
        break
    if i % step == 0:
        h, w = frame.shape[:2]
        g = cv2.cvtColor(cv2.resize(frame, (w // 2, h // 2)), cv2.COLOR_BGR2GRAY)
        found = det.detectMultiScale(g, scaleFactor=1.1, minNeighbors=6, minSize=(w // 20, w // 20))
        box = None
        if len(found):
            x, y, fw, fh = max(found, key=lambda f: f[2] * f[3])  # the biggest face is the speaker
            # hair and chin sit outside the detector's box: grow it
            x, y, fw, fh = x - fw * 0.15, y - fh * 0.35, fw * 1.3, fh * 1.6
            box = [round(v, 4) for v in (2 * x / w, 2 * y / h, 2 * fw / w, 2 * fh / h)]
            last = box
        faces.append({"t": round(i / src, 3), "box": box or last})
    i += 1
json.dump(faces, open(out, "w"))
print(f"faces: {sum(1 for f in faces if f['box'])}/{len(faces)} samples with a face -> {out}")
