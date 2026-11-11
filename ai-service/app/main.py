from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

app = FastAPI(
    title="Nagrik Setu AI Service",
    version="1.0.0",
    description="AI analysis integration boundary. No model is bundled or simulated.",
)


class Location(BaseModel):
    model_config = ConfigDict(extra="ignore")
    state: str
    district: str
    city: str


class ComplaintInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10000)
    category: dict[str, str]
    location: Location


@app.get("/healthz")
def health():
    return {"status": "ok", "model": "NOT_CONFIGURED"}


@app.post("/v1/analyze")
def analyze(_complaint: ComplaintInput):
    return {"status": "NOT_CONFIGURED", "result": None}
