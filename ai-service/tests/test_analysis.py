import unittest
from unittest.mock import patch

from app.analysis import _recommend_priority, analyze, cosine_similarity, geographic_distance_km


class Vector(list):
    def tolist(self):
        return list(self)


class StubTextModel:
    def __init__(self):
        self.batch_calls = []

    def encode(self, texts, normalize_embeddings):
        if isinstance(texts, list):
            self.batch_calls.append(texts)
            return [Vector([1.0, 0.0]) for _ in texts]
        return Vector([1.0, 0.0])


class AnalysisHelpersTest(unittest.TestCase):
    def test_cosine_similarity_uses_vector_values(self):
        self.assertAlmostEqual(cosine_similarity([1.0, 0.0], [1.0, 0.0]), 1.0)
        self.assertAlmostEqual(cosine_similarity([1.0, 0.0], [0.0, 1.0]), 0.0)
        self.assertAlmostEqual(cosine_similarity([1.0], [-1.0]), -1.0)

    def test_geographic_distance_returns_none_without_both_locations(self):
        self.assertIsNone(geographic_distance_km(None, {"latitude": 0.0, "longitude": 0.0}))
        self.assertAlmostEqual(
            geographic_distance_km(
                {"latitude": 0.0, "longitude": 0.0},
                {"latitude": 0.0, "longitude": 1.0},
            ),
            111.195,
            places=2,
        )

    def test_analysis_uses_real_category_and_batches_existing_candidates(self):
        model = StubTextModel()
        payload = {
            "title": "Broken street light",
            "description": "The street light is not working.",
            "severity": "HIGH",
            "createdAt": "2025-01-02T00:00:00Z",
            "location": {"latitude": 10.0, "longitude": 20.0},
            "categories": [{"id": "category-1", "name": "Street lighting", "department": "Public Works"}],
            "candidates": [
                {
                    "id": f"complaint-{index}",
                    "trackingId": f"GRV-{index}",
                    "title": "Street light is out",
                    "description": "A nearby street light is not working.",
                    "categoryId": "category-1",
                    "createdAt": "2025-01-01T00:00:00Z",
                    "location": {"latitude": 10.0, "longitude": 20.0},
                }
                for index in range(2)
            ],
        }

        with patch("app.analysis._text_model", return_value=model):
            result = analyze(payload)

        self.assertEqual(result["predictedCategory"]["categoryId"], "category-1")
        self.assertEqual(
            [item["complaintId"] for item in result["duplicateCandidates"]],
            ["complaint-0", "complaint-1"],
        )
        self.assertEqual(len([call for call in model.batch_calls if len(call) == 2]), 1)
        candidate = result["duplicateCandidates"][0]
        self.assertAlmostEqual(sum(signal["contribution"] for signal in candidate["signals"]), candidate["similarity"])
        self.assertEqual(candidate["method"], "weighted_signals_v1")

    def test_priority_safety_rule_is_explainable_without_ml_confidence(self):
        recommendation = _recommend_priority(
            "Gas leak near a school",
            "Residents report a strong smell and immediate danger.",
            "LOW",
        )
        self.assertEqual(recommendation["value"], "CRITICAL")
        self.assertEqual(recommendation["method"], "safety_rules_v1")
        self.assertTrue(recommendation["reasons"])
        self.assertNotIn("confidence", recommendation)


if __name__ == "__main__":
    unittest.main()
