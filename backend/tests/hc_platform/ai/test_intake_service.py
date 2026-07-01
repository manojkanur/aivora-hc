"""Pydantic validation for the structured intake schema."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.hc_platform.intake import (
    CompanyProfile,
    DeliverableFlags,
    PainPointFlags,
    ReviewObjective,
    StructuredIntakeData,
)


VALID_PAYLOAD: dict = {
    "companyProfile": {
        "companyName": "Acme Corp",
        "industry": "Manufacturing",
        "countryRegion": "UK",
        "employeeCount": "1001-5000",
        "businessMaturity": "scaling",
        "ownershipType": "private",
    },
    "reviewObjective": {
        "whatIsBeingReviewed": "Talent operating model",
        "whyNow": "Post-merger integration",
        "targetAudience": "Exec team",
        "scopeType": "diagnosis_and_redesign",
        "desiredOutputs": ["roadmap", "target_state"],
    },
    "painPoints": {
        "leadershipCapability": True,
        "talentAcquisition": True,
        "additionalNotes": "Critical succession gaps",
    },
    "desiredDeliverables": {
        "diagnosticReport": True,
        "targetStateDesign": True,
        "additionalNotes": "Need PPTX for board",
    },
}


def test_validates_canonical_payload() -> None:
    parsed = StructuredIntakeData.model_validate(VALID_PAYLOAD)
    assert parsed.company_profile.company_name == "Acme Corp"
    assert parsed.review_objective.scope_type == "diagnosis_and_redesign"
    assert parsed.pain_points.leadership_capability is True
    assert parsed.desired_deliverables.target_state_design is True


def test_rejects_extra_top_level_keys() -> None:
    bad = {**VALID_PAYLOAD, "unexpectedField": 1}
    with pytest.raises(ValidationError):
        StructuredIntakeData.model_validate(bad)


def test_rejects_extra_company_profile_keys() -> None:
    bad = {
        **VALID_PAYLOAD,
        "companyProfile": {**VALID_PAYLOAD["companyProfile"], "ceoName": "x"},
    }
    with pytest.raises(ValidationError):
        StructuredIntakeData.model_validate(bad)


def test_required_company_name() -> None:
    with pytest.raises(ValidationError):
        CompanyProfile.model_validate({"industry": "Tech"})


def test_required_review_objective_field() -> None:
    with pytest.raises(ValidationError):
        ReviewObjective.model_validate({"whyNow": "now"})


def test_pain_point_flags_default_false() -> None:
    flags = PainPointFlags.model_validate({})
    assert flags.leadership_capability is False
    assert flags.hc_analytics is False


def test_deliverable_flags_default_false() -> None:
    flags = DeliverableFlags.model_validate({})
    assert flags.diagnostic_report is False
    assert flags.executive_briefing is False


def test_roundtrip_by_alias() -> None:
    parsed = StructuredIntakeData.model_validate(VALID_PAYLOAD)
    dumped = parsed.model_dump(by_alias=True, exclude_none=False)
    # The aliased keys must be present (1:1 with the Replit TS shape).
    assert "companyProfile" in dumped
    assert "reviewObjective" in dumped
    assert "painPoints" in dumped
    assert "desiredDeliverables" in dumped
