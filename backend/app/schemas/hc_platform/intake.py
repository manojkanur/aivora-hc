"""Structured intake schema for HC reviews.

Mirrors the Replit `StructuredIntakeData` (hc-reviews.ts L78-132). The intake is
STATIC — no LLM-driven question generation. Four sub-objects compose the intake:
  * company_profile
  * review_objective
  * pain_points (a single object with 10 flag booleans + notes)
  * desired_deliverables (a single object with 7 flag booleans + notes)

`extra='forbid'` matches the closed-shape behaviour of the TS interface — unknown
keys are rejected so we stay 1:1 with the source schema.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CompanyProfile(BaseModel):
    """Fixed company profile fields (hc-reviews.ts L85-92)."""

    model_config = ConfigDict(extra="forbid")

    company_name: str = Field(..., alias="companyName", description="Legal/operating company name.")
    industry: Optional[str] = Field(default=None)
    country_region: Optional[str] = Field(default=None, alias="countryRegion")
    employee_count: Optional[str] = Field(default=None, alias="employeeCount")
    business_maturity: Optional[str] = Field(default=None, alias="businessMaturity")
    ownership_type: Optional[str] = Field(default=None, alias="ownershipType")


class ReviewObjective(BaseModel):
    """Why-now / scope / outputs object (hc-reviews.ts L94-100)."""

    model_config = ConfigDict(extra="forbid")

    what_is_being_reviewed: str = Field(..., alias="whatIsBeingReviewed")
    why_now: Optional[str] = Field(default=None, alias="whyNow")
    target_audience: Optional[str] = Field(default=None, alias="targetAudience")
    scope_type: Optional[str] = Field(
        default=None,
        alias="scopeType",
        description="diagnosis_only | diagnosis_and_redesign",
    )
    desired_outputs: Optional[list[str]] = Field(default=None, alias="desiredOutputs")


class PainPointFlags(BaseModel):
    """10 fixed pain-point booleans + free-form notes (hc-reviews.ts L102-114)."""

    model_config = ConfigDict(extra="forbid")

    leadership_capability: bool = Field(default=False, alias="leadershipCapability")
    succession_pipeline: bool = Field(default=False, alias="successionPipeline")
    workforce_planning: bool = Field(default=False, alias="workforcePlanning")
    talent_acquisition: bool = Field(default=False, alias="talentAcquisition")
    performance_management: bool = Field(default=False, alias="performanceManagement")
    learning_development: bool = Field(default=False, alias="learningDevelopment")
    employee_engagement: bool = Field(default=False, alias="employeeEngagement")
    organisation_design: bool = Field(default=False, alias="organisationDesign")
    governance_compliance: bool = Field(default=False, alias="governanceCompliance")
    hc_analytics: bool = Field(default=False, alias="hcAnalytics")
    additional_notes: Optional[str] = Field(default=None, alias="additionalNotes")


class DeliverableFlags(BaseModel):
    """7 fixed deliverable booleans + free-form notes (hc-reviews.ts L116-125)."""

    model_config = ConfigDict(extra="forbid")

    diagnostic_report: bool = Field(default=False, alias="diagnosticReport")
    target_state_design: bool = Field(default=False, alias="targetStateDesign")
    implementation_roadmap: bool = Field(default=False, alias="implementationRoadmap")
    executive_briefing: bool = Field(default=False, alias="executiveBriefing")
    capability_matrix: bool = Field(default=False, alias="capabilityMatrix")
    process_redesign: bool = Field(default=False, alias="processRedesign")
    governance_recommendations: bool = Field(
        default=False, alias="governanceRecommendations"
    )
    additional_notes: Optional[str] = Field(default=None, alias="additionalNotes")


class StructuredIntakeData(BaseModel):
    """Composes the four sub-objects (hc-reviews.ts L127-132)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    company_profile: CompanyProfile = Field(..., alias="companyProfile")
    review_objective: ReviewObjective = Field(..., alias="reviewObjective")
    pain_points: PainPointFlags = Field(..., alias="painPoints")
    desired_deliverables: DeliverableFlags = Field(..., alias="desiredDeliverables")
