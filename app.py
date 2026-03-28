"""
Price Guard — Marketplace Screenshot Checker
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
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

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

VALID_CATEGORIES = set(PRICE_RANGES.keys())
VALID_CONDITIONS = {"poor", "fair", "good", "excellent", "unknown"}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def normalize_category(raw):
    if not raw:
        return "other"
    raw = raw.lower().strip()
    if raw in VALID_CATEGORIES:
        return raw
    # Fuzzy map common synonyms
    synonyms = {
        "sofa": "couch", "sectional": "couch", "loveseat": "couch",
        "television": "tv", "monitor": "tv", "screen": "tv",
        "smartphone": "phone", "iphone": "phone", "android": "phone", "cell": "phone",
        "computer": "laptop", "notebook": "laptop", "macbook": "laptop",
        "bicycle": "bike", "bicycle": "bike", "ebike": "bike",
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
    cat = normalize_category(category)
    cond = condition if condition in ("poor", "fair", "good", "excellent") else "fair"
    return PRICE_RANGES.get(cat, PRICE_RANGES["other"]).get(cond, (50, 200))


def run_valuation(listed_price, category, condition):
    """
    Compare listed price against fair range and return verdict + confidence.
    """
    cat = normalize_category(category)
    cond = normalize_condition(condition)

    confidence_deductions = 0
    if cat == "other":
        confidence_deductions += 1
    if cond == "unknown":
        confidence_deductions += 1
        cond = "fair"  # default to fair range for unknown condition

    lo, hi = get_price_range(cat, cond)

    if listed_price is None:
        confidence_deductions += 2
        return {
            "low": lo,
            "high": hi,
            "verdict": None,
            "confidence": "low",
            "risk_note": "Price could not be extracted from the image. Enter it manually to get a verdict."
        }

    price = float(listed_price)

    # Verdict logic
    if price < lo * 0.65:
        verdict = "UNDERPRICED"
        risk_note = "Price is unusually low. Possible scam, hidden damage, or stolen item — verify condition and seller legitimacy before acting."
        confidence_deductions += 1
    elif price <= hi:
        verdict = "FAIR"
        risk_note = "Looks within normal range based on this category and condition."
    else:
        verdict = "OVERPRICED"
        risk_note = "Price appears above expected range. Compare with similar listings before buying."

    # Confidence scoring
    if confidence_deductions == 0:
        confidence = "high"
    elif confidence_deductions == 1:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "low": lo,
        "high": hi,
        "verdict": verdict,
        "confidence": confidence,
        "risk_note": risk_note
    }


def extract_from_image(image_bytes, mime_type):
    """
    Send image to OpenAI vision model and extract structured listing data.
    Returns parsed dict or raises exception.
    """
    b64 = base64.b64encode(image_bytes).decode("utf-8")

    system_prompt = (
        "You are a marketplace listing analyzer. "
        "Extract structured data from the provided screenshot. "
        "Respond ONLY with valid JSON. No markdown, no explanation, no code fences. "
        "JSON only."
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
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{b64}",
                            "detail": "high"
                        }
                    },
                    {"type": "text", "text": user_prompt}
                ]
            }
        ],
        max_tokens=600,
        temperature=0.1
    )

    raw = response.choices[0].message.content.strip()

    # Strip any accidental markdown fences
    raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'\s*```$', '', raw, flags=re.MULTILINE)
    raw = raw.strip()

    return json.loads(raw)


# ─── ROUTES ──────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze-listing", methods=["POST"])
def analyze_listing():
    # Validate file present
    if "image" not in request.files:
        return jsonify({"success": False, "error": "No image file uploaded."}), 400

    file = request.files["image"]

    if file.filename == "":
        return jsonify({"success": False, "error": "No file selected."}), 400

    if not allowed_file(file.filename):
        return jsonify({"success": False, "error": "File type not supported. Use PNG, JPG, JPEG, WEBP, or GIF."}), 400

    # Check API key configured
    if not os.environ.get("OPENAI_API_KEY"):
        return jsonify({"success": False, "error": "Server not configured. OPENAI_API_KEY missing."}), 500

    try:
        image_bytes = file.read()
        ext = file.filename.rsplit('.', 1)[1].lower()
        mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                    "gif": "image/gif", "webp": "image/webp"}
        mime_type = mime_map.get(ext, "image/jpeg")

        # Extract via vision model
        extracted = extract_from_image(image_bytes, mime_type)

        # Normalize fields
        extracted["category"] = normalize_category(extracted.get("category"))
        extracted["condition"] = normalize_condition(extracted.get("condition"))

        # Sanitize price
        price = extracted.get("listed_price")
        if price is not None:
            try:
                price = float(str(price).replace("$", "").replace(",", "").strip())
                extracted["listed_price"] = price
            except (ValueError, TypeError):
                extracted["listed_price"] = None

        # Run valuation
        valuation = run_valuation(
            listed_price=extracted.get("listed_price"),
            category=extracted.get("category"),
            condition=extracted.get("condition")
        )

        return jsonify({
            "success": True,
            "extracted": extracted,
            "valuation": valuation
        })

    except json.JSONDecodeError as e:
        return jsonify({
            "success": False,
            "error": f"Model returned invalid JSON: {str(e)}. Try a clearer screenshot."
        }), 422

    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Analysis failed: {str(e)}"
        }), 500


@app.route("/api/revalue", methods=["POST"])
def revalue():
    """
    Lightweight endpoint for frontend re-valuation when user manually edits fields.
    No image required — just category, condition, and price.
    """
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
