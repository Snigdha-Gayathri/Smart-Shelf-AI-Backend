from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
from sentence_transformers import SentenceTransformer

MODEL_NAME = "joeddav/distilbert-base-uncased-go-emotions-student"


class EmotionPipeline:
    def __init__(self):
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
            self.model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
        except Exception:
            self.tokenizer = None
            self.model = None
        # sentence transformer for embeddings
        try:
            self.embedder = SentenceTransformer('all-MiniLM-L6-v2')
        except Exception:
            self.embedder = None

    def predict_emotions(self, text: str):
        """
        Multi-label emotion detection: returns dict of emotion: intensity (0-1)
        """
        if not self.model:
            return {"error": "model not loaded"}
        inputs = self.tokenizer(text, return_tensors='pt', truncation=True)
        with torch.no_grad():
            logits = self.model(**inputs).logits
        # sigmoid for multi-label
        probs = torch.sigmoid(logits).squeeze().tolist()
        # get emotion labels from model config
        labels = self.model.config.id2label.values() if hasattr(self.model.config, 'id2label') else [f"emotion_{i}" for i in range(len(probs))]
        # build dict of emotion: intensity
        emotion_scores = dict(zip(labels, probs))
        # filter only those with intensity > 0.1 (tunable)
        compound = {k: float(v) for k, v in emotion_scores.items() if v > 0.1}
        # weighted vector (all scores)
        weighted_vector = [float(v) for v in probs]
        return {
            "compound_emotions": compound,
            "all_emotions": emotion_scores,
            "weighted_vector": weighted_vector
        }

    def embed(self, text: str):
        if not self.embedder:
            return []
        return self.embedder.encode(text).tolist()


emotion_pipeline = EmotionPipeline()
