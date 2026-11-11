import base64
import io
import math
import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Optional


TEXT_MODEL_NAME = os.getenv("TEXT_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
IMAGE_MODEL_NAME = os.getenv("IMAGE_MODEL_NAME", "google/vit-base-patch16-224")
DUPLICATE_THRESHOLD = float(os.getenv("DUPLICATE_SIMILARITY_THRESHOLD", "0.72"))
TEXT_MODEL_REVISION = os.getenv("TEXT_MODEL_REVISION", "main")
IMAGE_MODEL_REVISION = os.getenv("IMAGE_MODEL_REVISION", "main")
if not 0 <= DUPLICATE_THRESHOLD <= 1:
    raise ValueError("DUPLICATE_SIMILARITY_THRESHOLD must be between 0 and 1.")


@lru_cache(maxsize=1)
def _text_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(TEXT_MODEL_NAME, revision=TEXT_MODEL_REVISION)


@lru_cache(maxsize=1)
def _image_models():
    import torch
    from transformers import AutoImageProcessor, AutoModelForImageClassification

    processor = AutoImageProcessor.from_pretrained(IMAGE_MODEL_NAME, revision=IMAGE_MODEL_REVISION)
    model = AutoModelForImageClassification.from_pretrained(IMAGE_MODEL_NAME, revision=IMAGE_MODEL_REVISION)
    model.eval()
    return torch, processor, model


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return max(-1.0, min(1.0, dot / (left_norm * right_norm)))


def geographic_distance_km(
    left: Optional[dict[str, float]], right: Optional[dict[str, float]]
) -> Optional[float]:
    if not left or not right:
        return None
    latitude_delta = math.radians(right["latitude"] - left["latitude"])
    longitude_delta = math.radians(right["longitude"] - left["longitude"])
    left_latitude = math.radians(left["latitude"])
    right_latitude = math.radians(right["latitude"])
    haversine = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(left_latitude)
        * math.cos(right_latitude)
        * math.sin(longitude_delta / 2) ** 2
    )
    return 6371.0088 * 2 * math.asin(min(1.0, math.sqrt(haversine)))


def _as_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _decode_image(encoded: str):
    from PIL import Image

    data = base64.b64decode(encoded, validate=True)
    image = Image.open(io.BytesIO(data))
    if image.width * image.height > 20_000_000:
        image.close()
        raise ValueError("Image dimensions exceed the analysis limit.")
    image.load()
    if image.format not in {"JPEG", "PNG", "WEBP"}:
        raise ValueError("Only JPEG, PNG, and WEBP images can be analyzed.")
    return data, image.convert("RGB"), image


def _analyze_image(encoded: str, expected_content_type: str, incident_at: Optional[str]) -> dict[str, Any]:
    import imagehash
    import torch
    from PIL import ExifTags, Image, ImageChops, ImageStat

    original_bytes, rgb_image, source_image = _decode_image(encoded)
    detected_content_type = f"image/{'jpeg' if source_image.format == 'JPEG' else source_image.format.lower()}"
    if expected_content_type != detected_content_type:
        raise ValueError("Image content does not match its stored content type.")
    torch_module, processor, model = _image_models()
    inputs = processor(images=rgb_image, return_tensors="pt")
    with torch_module.inference_mode():
        output = model(**inputs, output_hidden_states=True)
        probabilities = torch_module.softmax(output.logits[0], dim=-1)
        top_indices = torch_module.topk(probabilities, k=min(5, probabilities.numel())).indices.tolist()
        embedding_tensor = output.hidden_states[-1][0, 0]
        embedding_tensor = torch_module.nn.functional.normalize(embedding_tensor, dim=0)

    exif = source_image.getexif()
    exif_fields = {ExifTags.TAGS.get(key, str(key)): value for key, value in exif.items()} if exif else {}
    captured_at = exif_fields.get("DateTimeOriginal") or exif_fields.get("DateTime")
    indicators: list[str] = []
    if not exif_fields:
        indicators.append("No EXIF metadata was present; this is common and is not proof of manipulation.")
    if captured_at and incident_at:
        try:
            captured_time = datetime.strptime(str(captured_at), "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc)
            incident_time = _as_datetime(incident_at)
            if captured_time > incident_time:
                indicators.append("The embedded capture time is later than the reported incident time; metadata may be inaccurate.")
        except ValueError:
            indicators.append("The embedded capture time could not be parsed.")

    recompressed = io.BytesIO()
    rgb_image.save(recompressed, format="JPEG", quality=90)
    recompressed.seek(0)
    with Image.open(recompressed) as compressed:
        difference = ImageChops.difference(rgb_image, compressed.convert("RGB"))
        ela_mean_difference = sum(ImageStat.Stat(difference).mean) / 3

    return {
        "width": source_image.width,
        "height": source_image.height,
        "format": source_image.format,
        "contentType": detected_content_type,
        "capturedAt": str(captured_at) if captured_at else None,
        "perceptualHash": str(imagehash.phash(rgb_image)),
        "embedding": embedding_tensor.cpu().tolist(),
        "classification": [
            {
                "label": model.config.id2label[int(index)],
                "score": float(probabilities[index].item()),
            }
            for index in top_indices
        ],
        "forensicIndicators": indicators,
        "elaMeanDifference": float(ela_mean_difference),
        "sizeBytes": len(original_bytes),
    }
def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    text_model = _text_model()
    complaint_text = f"{payload['title']}. {payload['description']}"
    text_embedding = text_model.encode(complaint_text, normalize_embeddings=True).tolist()

    categories = payload.get("categories", [])
    predicted_category = None
    category_scores: list[dict[str, Any]] = []
    if categories:
        category_prompts = [f"Grievance category: {item['name']}" for item in categories]
        category_embeddings = text_model.encode(category_prompts, normalize_embeddings=True)
        category_scores = sorted(
            [
                {
                    "categoryId": category["id"],
                    "name": category["name"],
                    "departmentId": category.get("departmentId"),
                    "department": category.get("department"),
                    "similarity": cosine_similarity(text_embedding, embedding.tolist()),
                }
                for category, embedding in zip(categories, category_embeddings)
            ],
            key=lambda item: item["similarity"],
            reverse=True,
        )
        predicted_category = category_scores[0]

    images = [
        {
            "id": item["id"],
            **_analyze_image(item["data"], item["contentType"], payload.get("incidentAt")),
        }
        for item in payload.get("images", [])
    ]
    image_embeddings = [image["embedding"] for image in images]
    perceptual_hashes = [image["perceptualHash"] for image in images]

    candidates = payload.get("candidates", [])
    missing_embeddings = [
        candidate
        for candidate in candidates
        if not candidate.get("textEmbedding")
    ]
    generated_embeddings = text_model.encode(
        [f"{candidate['title']}. {candidate['description']}" for candidate in missing_embeddings],
        normalize_embeddings=True,
    ) if missing_embeddings else []
    generated_by_id = {
        candidate["id"]: embedding.tolist()
        for candidate, embedding in zip(missing_embeddings, generated_embeddings)
    }

    duplicates = []
    for candidate in candidates:
        candidate_embedding = candidate.get("textEmbedding")
        if not candidate_embedding:
            candidate_embedding = generated_by_id[candidate["id"]]
        semantic_similarity = cosine_similarity(text_embedding, candidate_embedding)
        same_category = bool(
            predicted_category
            and candidate.get("categoryId") == predicted_category["categoryId"]
        )
        distance = geographic_distance_km(payload.get("location"), candidate.get("location"))
        candidate_time = _as_datetime(candidate["createdAt"])
        complaint_time = _as_datetime(payload["createdAt"])
        time_gap_hours = abs((complaint_time - candidate_time).total_seconds()) / 3600
        phash_similarities = []
        for current_hash in perceptual_hashes:
            for candidate_hash in candidate.get("perceptualHashes", []):
                try:
                    differing_bits = (int(current_hash, 16) ^ int(candidate_hash, 16)).bit_count()
                    max_bits = max(len(current_hash), len(candidate_hash)) * 4
                    phash_similarities.append(1 - differing_bits / max_bits)
                except ValueError:
                    continue
        image_embedding_similarities = [
            cosine_similarity(current, previous)
            for current in image_embeddings
            for previous in candidate.get("imageEmbeddings", [])
        ]
        signals = [
            {"name": "text_semantic_similarity", "value": semantic_similarity},
            {"name": "category_match", "value": 1.0 if same_category else 0.0},
            {"name": "time_gap_hours", "value": time_gap_hours},
        ]
        score_parts = [(max(0.0, semantic_similarity), 0.65), (1.0 if same_category else 0.0, 0.15)]
        if distance is not None:
            signals.append({"name": "geographic_distance_km", "value": distance})
            score_parts.append((max(0.0, 1 - distance / 100), 0.1))
        score_parts.append((max(0.0, 1 - time_gap_hours / (24 * 30)), 0.1))
        if phash_similarities:
            signals.append({"name": "perceptual_hash_similarity", "value": max(phash_similarities)})
            score_parts.append((max(phash_similarities), 0.15))
        if image_embedding_similarities:
            signals.append({"name": "image_embedding_similarity", "value": max(image_embedding_similarities)})
            score_parts.append((max(0.0, max(image_embedding_similarities)), 0.15))
        total_weight = sum(weight for _, weight in score_parts)
        duplicate_score = sum(value * weight for value, weight in score_parts) / total_weight
        if duplicate_score >= DUPLICATE_THRESHOLD:
            duplicates.append({
                "complaintId": candidate["id"],
                "trackingId": candidate["trackingId"],
                "similarity": duplicate_score,
                "signals": signals,
            })

    severity = str(payload.get("severity", "MEDIUM")).upper()
    priority = severity if severity in {"LOW", "MEDIUM", "HIGH", "CRITICAL"} else "MEDIUM"
    return {
        "model": {
            "text": {"name": TEXT_MODEL_NAME, "revision": TEXT_MODEL_REVISION},
            "image": {"name": IMAGE_MODEL_NAME, "revision": IMAGE_MODEL_REVISION},
        },
        "predictedCategory": predicted_category,
        "categoryCandidates": category_scores,
        "recommendedDepartment": predicted_category.get("department") if predicted_category else None,
        "recommendedPriority": {
            "value": priority,
            "reason": f"Retained the citizen-submitted severity ({priority}); no separate priority model is claimed.",
        },
        "textEmbedding": text_embedding,
        "images": images,
        "duplicateCandidates": sorted(duplicates, key=lambda item: item["similarity"], reverse=True),
        "humanReviewRequired": bool(duplicates or any(image["forensicIndicators"] for image in images)),
        "disclaimer": "Image labels and forensic indicators are supporting signals only and do not establish complaint authenticity or fraud.",
    }
