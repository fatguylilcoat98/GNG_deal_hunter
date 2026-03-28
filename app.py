"""
GNG Deal Hunter — Marketplace Screenshot Checker
The Good Neighbor Guard
Built by Christopher Hughes · Sacramento, CA
Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
Truth · Safety · We Got Your Back
"""

import os
import json
import base64
import re
from flask import Flask, render_template, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024 * 1024  # 64MB — batch uploads

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# ─── VALUATION TABLE ─────────────────────────────────────────
PRICE_RANGES = {
    "laptop":    {"poor": (80, 180),   "fair": (150, 350),  "good": (300, 700),  "excellent": (650, 1200)},
    "phone":     {"poor": (50, 120),   "fair": (100, 250),  "good": (220, 600),  "excellent": (550, 1200)},
    "tv":        {"poor": (40, 100),   "fair": (80, 180),   "good": (150, 350),  "excellent": (300, 700)},
    "bike":      {"poor": (40, 120),   "fair": (100, 250),  "good": (220, 500),  "excellent": (450, 1200)},
    "couch":     {"poor": (20, 100),   "fair": (80, 250),   "good": (200, 500),  "excellent": (450, 1200)},
    "table":     {"poor": (20, 80),    "fair": (60, 180),   "good": (150, 350),  "excellent": (300, 800)},
    "chair":     {"poor": (10, 40),    "fair": (30, 90),    "good": (70, 180),   "excellent": (150, 400)},
    "dresser":   {"poor": (20, 70),    "fair": (60, 180),   "good": (150, 350),  "excellent": (300, 800)},
    "appliance": {"poor": (40, 120),   "fair": (100, 300),  "good": (250, 700),  "excellent": (650, 1500)},
    "other":     {"poor": (20, 60),    "fair": (50, 150),   "good": (120, 300),  "excellent": (250, 700)},
}

# Resell multipliers — how much of fair-high you can typically flip for
RESELL_MULTIPLIER = {
    "laptop": 0.85, "phone": 0.90, "tv": 0.70, "bike": 0.80,
    "couch": 0.60,  "table": 0.65, "chair": 0.65, "dresser": 0.65,
    "appliance": 0.72, "other": 0.65,
}

VALID_CATEGORIES = set(PRICE_RANGES.keys())
VALID_CONDITIONS  = {"poor", "fair", "good", "excellent", "unknown"}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def normalize_category(raw):
    if not raw:
        return "other"
    raw = raw.lower().strip()
    if raw in VALID_CATEGORIES:
        return raw
    synonyms = {
        "sofa": "couch", "sectional": "couch", "loveseat": "couch",
        "television": "tv", "monitor": "tv", "screen": "tv",
        "smartphone": "phone", "iphone": "phone", "android": "phone", "cell": "phone",
        "computer": "laptop", "notebook": "laptop", "macbook": "laptop",
        "bicycle": "bike", "ebike": "bike",
        "desk": "table", "dining table": "table",
        "armchair": "chair", "recliner": "chair", "office chair": "chair",
        "refrigerator": "appliance", "fridge": "appliance", "washer": "appliance",
        "dryer": "appliance", "dishwasher": "appliance", "microwave": "appliance",
        "chest of drawers": "dresser", "wardrobe": "dresser",
    }
    for key, val in synonyms.items():
        if key in raw:
            return val
    return "other"


def normalize_condition(raw):
    if not raw:
        return "unknown"
    raw = raw.lower().strip()
    if raw in VALID_CONDITIONS:
        return raw
    if any(w in raw for w in ["like new", "mint", "brand new", "new"]):
        return "excellent"
    if any(w in raw for w in ["great", "very good"]):
        return "good"
    if any(w in raw for w in ["okay", "decent", "average", "used"]):
        return "fair"
    if any(w in raw for w in ["broken", "damaged", "parts", "bad", "rough"]):
        return "poor"
    return "unknown"


def get_price_range(category, condition):
    cat  = normalize_category(category)
    cond = condition if condition in ("poor", "fair", "good", "excellent") else "fair"
    return PRICE_RANGES.get(cat, PRICE_RANGES["other"]).get(cond, (50, 200))


def run_valuation(listed_price, category, condition):
    cat  = normalize_category(category)
    cond = normalize_condition(condition)

    deductions = 0
    if cat == "other":  deductions += 1
    if cond == "unknown":
        deductions += 1
        cond = "fair"

    lo, hi = get_price_range(cat, cond)

    # Resell estimate
    resell_mult = RESELL_MULTIPLIER.get(cat, 0.65)
    resell_low  = round(lo * resell_mult)
    resell_high = round(hi * resell_mult)

    if listed_price is None:
        return {
            "low": lo, "high": hi,
            "resell_low": resell_low, "resell_high": resell_high,
            "verdict": None, "confidence": "low",
            "deal_score": None, "resell_score": None,
            "risk_note": "Price not detected. Enter it manually for a verdict."
        }

    price = float(listed_price)

    # Verdict
    if price < lo * 0.65:
        verdict = "UNDERPRICED"
        risk_note = "Price is unusually low. Verify condition and seller legitimacy before acting."
    elif price <= hi:
        verdict = "FAIR"
        risk_note = "Looks within normal range based on category and condition."
    else:
        verdict = "OVERPRICED"
        risk_note = "Price is above expected range. Compare with similar listings first."

    # Deal score: 0–100. Higher = better deal.
    # 100 = at the floor, 0 = way over ceiling
    mid = (lo + hi) / 2
    if price <= lo:
        deal_score = 100
    elif price <= mid:
        deal_score = int(75 + 25 * (mid - price) / (mid - lo)) if mid != lo else 75
    elif price <= hi:
        deal_score = int(75 * (hi - price) / (hi - mid)) if hi != mid else 37
    else:
        over = price - hi
        deal_score = max(0, int(25 - 25 * (over / hi)))

    # Resell score: 0–100. Higher = more flip potential.
    # Based on how much margin between listed price and resell ceiling
    margin = resell_high - price
    margin_pct = margin / resell_high if resell_high else 0
    resell_score = max(0, min(100, int(50 + margin_pct * 50)))

    if deductions == 0:  confidence = "high"
    elif deductions == 1: confidence = "medium"
    else:                 confidence = "low"

    return {
        "low": lo, "high": hi,
        "resell_low": resell_low, "resell_high": resell_high,
        "verdict": verdict, "confidence": confidence,
        "deal_score": deal_score, "resell_score": resell_score,
        "risk_note": risk_note
    }


def extract_from_image(image_bytes, mime_type):
    b64 = base64.b64encode(image_bytes).decode("utf-8")

    system_prompt = (
        "You are a marketplace listing analyzer. "
        "Extract structured data from the provided screenshot. "
        "Respond ONLY with valid JSON. No markdown, no explanation, no code fences."
    )

    user_prompt = """Analyze this marketplace listing screenshot and extract the following fields.

Return ONLY this JSON structure with no additional text:

{
  "item_name": "full name of the item as listed",
  "listed_price": <number or null if price not visible>,
  "category": "<one of: laptop, phone, tv, bike, couch, table, chair, dresser, appliance, other>",
  "condition": "<one of: poor, fair, good, excellent, unknown>",
  "short_description": "1-2 sentence description of the item from the listing",
  "visible_signals": ["list", "of", "notable", "visible", "details"]
}

Rules:
- listed_price must be a number (no $ sign) or null
- category must be exactly one of the allowed values
- condition must be exactly one of the allowed values
- If unsure about category, use "other"
- If unsure about condition, use "unknown"
- Do not include any text outside the JSON object"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}", "detail": "high"}},
                {"type": "text", "text": user_prompt}
            ]}
        ],
        max_tokens=600,
        temperature=0.1
    )

    raw = response.choices[0].message.content.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'\s*```$', '', raw, flags=re.MULTILINE)
    return json.loads(raw.strip())


# ─── ROUTES ──────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze-listing", methods=["POST"])
def analyze_listing():
    if "image" not in request.files:
        return jsonify({"success": False, "error": "No image uploaded."}), 400

    file = request.files["image"]
    if file.filename == "":
        return jsonify({"success": False, "error": "No file selected."}), 400
    if not allowed_file(file.filename):
        return jsonify({"success": False, "error": "Unsupported file type."}), 400
    if not os.environ.get("OPENAI_API_KEY"):
        return jsonify({"success": False, "error": "Server not configured. OPENAI_API_KEY missing."}), 500

    try:
        image_bytes = file.read()
        ext = file.filename.rsplit('.', 1)[1].lower()
        mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                    "gif": "image/gif", "webp": "image/webp"}
        mime_type = mime_map.get(ext, "image/jpeg")

        extracted = extract_from_image(image_bytes, mime_type)
        extracted["category"] = normalize_category(extracted.get("category"))
        extracted["condition"] = normalize_condition(extracted.get("condition"))

        price = extracted.get("listed_price")
        if price is not None:
            try:
                price = float(str(price).replace("$", "").replace(",", "").strip())
                extracted["listed_price"] = price
            except (ValueError, TypeError):
                extracted["listed_price"] = None

        valuation = run_valuation(
            listed_price=extracted.get("listed_price"),
            category=extracted.get("category"),
            condition=extracted.get("condition")
        )

        return jsonify({"success": True, "extracted": extracted, "valuation": valuation})

    except json.JSONDecodeError as e:
        return jsonify({"success": False, "error": f"Model returned invalid JSON: {e}. Try a clearer screenshot."}), 422
    except Exception as e:
        return jsonify({"success": False, "error": f"Analysis failed: {e}"}), 500


@app.route("/api/revalue", methods=["POST"])
def revalue():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data provided."}), 400
    try:
        price = data.get("listed_price")
        if price is not None:
            price = float(price)
        valuation = run_valuation(
            listed_price=price,
            category=data.get("category", "other"),
            condition=data.get("condition", "unknown")
        )
        return jsonify({"success": True, "valuation": valuation})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
