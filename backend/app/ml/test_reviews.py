"""Reviews ("Wall of Signals") API tests."""

import pytest

PAYLOAD = {
    "rating": 4,
    "title": "Clear cascade",
    "body": "The tier explanations made sense.",
    "would_recommend": True,
    "suggestion": "More lab scenarios",
    "tags": ["Cascade", "Design"],
}


@pytest.fixture()
def second_headers(client):
    """A second analyst, used for helpful-vote tests."""
    from app.auth import create_access_token

    username, password = "pytest_reviewer2", "SecurePassword!321"
    client.post("/api/auth/register", json={"username": username, "password": password})
    # Mint a token directly: /api/auth/login is limited to 5/minute across the suite.
    token = create_access_token({"sub": username, "role": "analyst"})
    return {"Authorization": f"Bearer {token}"}


def test_reviews_require_auth(client):
    assert client.get("/api/reviews").status_code == 401
    assert client.post("/api/reviews", json=PAYLOAD).status_code == 401


def test_review_lifecycle_and_helpful(client, auth_headers, second_headers, admin_headers):
    client.delete("/api/reviews/mine", headers=auth_headers)

    created = client.post("/api/reviews", json=PAYLOAD, headers=auth_headers)
    assert created.status_code == 201, created.text
    review = created.json()
    assert review["mine"] is True and review["rating"] == 4
    assert "@" not in review["author"]

    # One review per user.
    assert client.post("/api/reviews", json=PAYLOAD, headers=auth_headers).status_code == 409

    # Validation: bad tag, bad rating.
    bad_tag = client.post("/api/reviews", json={**PAYLOAD, "tags": ["Nope"]}, headers=second_headers)
    assert bad_tag.status_code == 422
    bad_rating = client.post("/api/reviews", json={**PAYLOAD, "rating": 9}, headers=second_headers)
    assert bad_rating.status_code == 422

    # Edit.
    edited = client.put("/api/reviews/mine", json={**PAYLOAD, "rating": 5}, headers=auth_headers)
    assert edited.status_code == 200 and edited.json()["edited"] is True

    # Helpful: not on own review; toggles for others.
    assert client.post(f"/api/reviews/{review['id']}/helpful", headers=auth_headers).status_code == 400
    on = client.post(f"/api/reviews/{review['id']}/helpful", headers=second_headers).json()
    assert on["i_marked_helpful"] is True and on["helpful_count"] == 1
    off = client.post(f"/api/reviews/{review['id']}/helpful", headers=second_headers).json()
    assert off["i_marked_helpful"] is False and off["helpful_count"] == 0

    summary = client.get("/api/reviews/summary", headers=second_headers).json()
    assert summary["count"] >= 1 and summary["distribution"]["5"] >= 1

    # Analyst cannot use admin endpoints.
    assert client.patch(
        f"/api/admin/reviews/{review['id']}", json={"status": "hidden"}, headers=auth_headers
    ).status_code == 403

    # Admin hides -> disappears from public list; audited.
    hid = client.patch(
        f"/api/admin/reviews/{review['id']}", json={"status": "hidden"}, headers=admin_headers
    )
    assert hid.status_code == 200
    listing = client.get("/api/reviews", headers=second_headers).json()
    assert all(item["id"] != review["id"] for item in listing["items"])

    export = client.get("/api/admin/reviews/export", headers=admin_headers)
    assert export.status_code == 200 and "text/csv" in export.headers["content-type"]
    assert "Clear cascade" in export.text

    assert client.delete(f"/api/admin/reviews/{review['id']}", headers=admin_headers).status_code == 204
    assert client.get("/api/reviews/mine", headers=auth_headers).json()["review"] is None
