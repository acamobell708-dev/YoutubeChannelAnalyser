"""Data models shared by extraction, summarisation, and validation."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Comment:
    """A public YouTube comment included in the analysis sample."""

    text: str
    author: str = "Unknown"
    like_count: int = 0


@dataclass(frozen=True)
class VideoData:
    """Public data extracted from a YouTube video."""

    source_url: str
    video_id: str
    title: str
    channel: str
    view_count: int
    comments: tuple[Comment, ...]
    reported_comment_count: int | None = None


@dataclass(frozen=True)
class VideoAnalysis:
    """Final result returned to the CLI."""

    video: VideoData
    comment_summary: str

