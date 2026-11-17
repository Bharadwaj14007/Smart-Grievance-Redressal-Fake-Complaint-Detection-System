from typing import Literal, Optional

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

from .analysis import analyze as run_analysis
from .analysis import model_status

app = FastAPI(
    title="Nagrik Setu AI Service",
    version="1.0.0",
    description="Pretrained text and image analysis. Findings are advisory and require human review.",
)


class Location(BaseModel):
    model_config = ConfigDict(extra="ignore")
    state: str
    district: str
    city: str
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


class Category(BaseModel):
    id: str
    name: str
    departmentId: Optional[str] = None
    department: Optional[str] = None


class AnalysisImage(BaseModel):
    id: str
    contentType: Literal["image/jpeg", "image/png", "image/webp"]
    data: str = Field(min_length=1, max_length=1_000_000)


class DuplicateCandidate(BaseModel):
    id: str
    trackingId: str
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10000)
    categoryId: str
    createdAt: str
    incidentAt: Optional[str] = None
    location: Optional[Location] = None
    textEmbedding: Optional[list[float]] = None
    perceptualHashes: list[str] = Field(default_factory=list)
    imageEmbeddings: list[list[float]] = Field(default_factory=list)


class ComplaintInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    trackingId: str
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10000)
    severity: str
    createdAt: str
    incidentAt: Optional[str] = None
    location: Location
    categories: list[Category] = Field(default_factory=list)
    images: list[AnalysisImage] = Field(default_factory=list, max_length=4)
    candidates: list[DuplicateCandidate] = Field(default_factory=list, max_length=100)


@app.get("/healthz")
def health():
    models = model_status()
    return {
        "status": "ok",
        "models": models,
        "inference": "lazy-loaded",
    }


@app.post("/v1/analyze")
def analyze(complaint: ComplaintInput):
    return {"status": "COMPLETED", "result": run_analysis(complaint.model_dump())}
