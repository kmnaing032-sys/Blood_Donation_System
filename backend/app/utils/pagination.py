import math
from typing import Generic, TypeVar, List
from pydantic import BaseModel, Field
from fastapi import Query

T = TypeVar("T")


class PaginationParams:
    """Dependency for standardizing page-based pagination query params."""
    def __init__(
        self,
        page: int = Query(1, ge=1, description="Page number (starts at 1)"),
        page_size: int = Query(10, ge=1, le=100, description="Items per page (1 to 100)"),
    ):
        self.page = page
        self.page_size = page_size
        self.skip = (page - 1) * page_size
        self.limit = page_size


class PaginatedResponse(BaseModel, Generic[T]):
    """Standardized generic pagination schema."""
    items: List[T]
    total: int = Field(..., ge=0, description="Total matching records count")
    page: int = Field(..., ge=1, description="Current page number")
    page_size: int = Field(..., ge=1, description="Number of records per page")
    total_pages: int = Field(..., ge=0, description="Total calculated pages")

    @classmethod
    def create(cls, items: List[T], total: int, page: int, page_size: int):
        total_pages = math.ceil(total / page_size) if total > 0 else 0
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

