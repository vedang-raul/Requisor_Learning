import io
import zipfile

import pytest
from fastapi.testclient import TestClient

import imscc_api.main as main
from imscc_api.package import Package, PackageError, clean_path

from .conftest import FILES, make_zip


@pytest.mark.parametrize("name", ["../evil.txt", "/etc/passwd", "C:/Windows/x", "a/../../b", "a\\..\\..\\b"])
def test_unsafe_names_are_refused(name):
    assert clean_path(name) is None
    with pytest.raises(PackageError, match="unsafe"):
        Package(make_zip({**FILES, name: "x"}))


def test_not_a_zip_or_not_a_cartridge():
    with pytest.raises(PackageError, match="isn't a zip"):
        Package(b"hello")
    with pytest.raises(PackageError, match="imsmanifest"):
        Package(make_zip({"readme.txt": "hi"}))


def test_zip_bomb_is_refused():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("imsmanifest.xml", "<manifest/>")
        z.writestr("web_resources/big.bin", b"\0" * (5 * 1024 * 1024))   # compresses ~1000:1
    with pytest.raises(PackageError, match="unrealistic"):
        Package(buf.getvalue())


def test_xml_entity_attacks_are_refused():
    from imscc_api.mapper import map_cartridge
    laughs = """<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]>
<manifest><resources>&lol2;</resources></manifest>"""
    with pytest.raises(PackageError, match="Couldn't read"):
        map_cartridge(Package(make_zip({**FILES, "imsmanifest.xml": laughs})))
    xxe = """<?xml version="1.0"?><!DOCTYPE m [<!ENTITY x SYSTEM "file:///etc/passwd">]><manifest>&x;</manifest>"""
    with pytest.raises(PackageError, match="Couldn't read"):
        map_cartridge(Package(make_zip({**FILES, "imsmanifest.xml": xxe})))


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("IMSCC_API_KEY", "test-key")
    monkeypatch.delenv("IMSCC_ALLOW_NO_KEY", raising=False)
    return TestClient(main.app)


def post(client, data: bytes, key: str | None = "test-key", name="course.imscc", **params):
    headers = {"X-API-Key": key} if key else {}
    return client.post("/v1/imscc/parse", files={"file": (name, data, "application/zip")}, headers=headers, params=params)


def test_health(client):
    assert client.get("/health").json()["ok"] is True


def test_needs_the_key(client, cartridge, monkeypatch):
    assert post(client, cartridge, key=None).status_code == 401
    assert post(client, cartridge, key="wrong").status_code == 401
    monkeypatch.delenv("IMSCC_API_KEY")
    assert post(client, cartridge).status_code == 503      # never open by accident


def test_parses_an_upload(client, cartridge):
    res = post(client, cartridge)
    assert res.status_code == 200
    body = res.json()
    assert body["course"]["title"] == "AI at Work"
    assert body["summary"]["lessons"] == 3 and body["summary"]["quizzesKeptAside"] == 1
    assert body["lessons"][2]["assignment"]["assignmentDueDate"] == "2026-05-24"


def test_bad_uploads(client, cartridge, monkeypatch):
    assert post(client, b"not a zip").status_code == 400
    assert post(client, cartridge, name="course.exe").status_code == 415
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 100)
    assert post(client, cartridge).status_code == 413


def test_docs_are_off_by_default(client):
    assert client.get("/docs").status_code == 404
