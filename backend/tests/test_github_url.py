import pytest
from fastapi import HTTPException

from app.services.repository_service import parse_github_url


@pytest.mark.parametrize("url", [
    "https://github.com/owner/repo", "http://github.com/owner/repo.git",
    "github.com/owner/repo", "www.github.com/owner/repo", "//github.com/owner/repo",
])
def test_parse_github_url_accepts_common_forms(url):
    assert parse_github_url(url) == ("owner", "repo")


@pytest.mark.parametrize("url", ["https://example.com/owner/repo", "github.com", "", "github.com/owner"])
def test_parse_github_url_rejects_invalid_forms(url):
    with pytest.raises(HTTPException):
        parse_github_url(url)
