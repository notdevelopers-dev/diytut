from pydantic import BaseModel, ConfigDict


class PlatformStatsRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    volunteers_count: int
    organizations_count: int
    projects_count: int
