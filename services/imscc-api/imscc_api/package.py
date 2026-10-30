"""Reading a Common Cartridge (.imscc) package safely.

An .imscc file is a zip. Uploads are untrusted, so the reader refuses
anything that could hurt the server: too many entries, entries or totals that
unpack too large (zip bombs), and names that try to escape the package
(``../``, absolute paths, drive letters). Entries are read on demand, never
extracted to disk.
"""
from __future__ import annotations

import io
import posixpath
import zipfile
from dataclasses import dataclass
from urllib.parse import unquote

MAX_ENTRIES = 10_000
MAX_ENTRY_BYTES = 200 * 1024 * 1024          # one file, unpacked
MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024     # the whole package, unpacked
MAX_RATIO = 200                              # unpacked / packed, per entry
MAX_TEXT_BYTES = 20 * 1024 * 1024            # an XML or HTML file we parse


class PackageError(ValueError):
    """The upload isn't a usable Common Cartridge."""


def clean_path(name: str) -> str | None:
    """A package path in canonical form, or None when it points outside the package."""
    name = name.replace("\\", "/")
    if name.startswith("/") or (len(name) > 1 and name[1] == ":") or "\x00" in name:
        return None
    norm = posixpath.normpath(name)
    if norm in (".", "") or norm.startswith("../") or norm == "..":
        return None
    return norm


@dataclass(frozen=True)
class Entry:
    path: str
    size: int


class Package:
    """The files in one cartridge, by their path inside it."""

    def __init__(self, data: bytes):
        try:
            self._zip = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as exc:
            raise PackageError("This isn't a zip file. Export the course from Canvas as a Common Cartridge (.imscc).") from exc
        infos = [i for i in self._zip.infolist() if not i.is_dir()]
        if len(infos) > MAX_ENTRIES:
            raise PackageError(f"The package has more than {MAX_ENTRIES} files.")
        total = 0
        self._infos: dict[str, zipfile.ZipInfo] = {}
        self._lower: dict[str, str] = {}
        # An export unzipped and zipped again keeps everything under one folder: read from inside it.
        names = [clean_path(i.filename) for i in infos]
        prefix = ""
        if "imsmanifest.xml" not in names:
            nested = [n for n in names if n and n.count("/") == 1 and n.endswith("/imsmanifest.xml")]
            if len(nested) == 1:
                prefix = nested[0][: -len("imsmanifest.xml")]
        for info in infos:
            path = clean_path(info.filename)
            if path is None:
                raise PackageError(f"The package contains an unsafe file name: {info.filename[:120]!r}")
            if prefix:
                if not path.startswith(prefix):
                    continue
                path = path[len(prefix):]
            if info.flag_bits & 0x1:
                raise PackageError("The package is password-protected.")
            if info.file_size > MAX_ENTRY_BYTES:
                raise PackageError(f"{path} is too large to read.")
            if info.compress_size and info.file_size / info.compress_size > MAX_RATIO and info.file_size > 1024 * 1024:
                raise PackageError(f"{path} unpacks to an unrealistic size.")
            total += info.file_size
            if total > MAX_TOTAL_BYTES:
                raise PackageError("The package unpacks to more than 2 GB.")
            self._infos[path] = info
            self._lower.setdefault(path.lower(), path)
        if "imsmanifest.xml" not in self._infos:
            raise PackageError("No imsmanifest.xml: this isn't a Common Cartridge export.")

    def resolve(self, path: str) -> str | None:
        """The stored path for a reference (URL-decoded, case-insensitive fallback), if the file exists."""
        cleaned = clean_path(unquote(path.split("?", 1)[0].split("#", 1)[0]))
        if cleaned is None:
            return None
        if cleaned in self._infos:
            return cleaned
        return self._lower.get(cleaned.lower())

    def entries(self) -> list[Entry]:
        return [Entry(p, i.file_size) for p, i in self._infos.items()]

    def size(self, path: str) -> int:
        return self._infos[path].file_size

    def read_bytes(self, path: str, limit: int = MAX_ENTRY_BYTES) -> bytes | None:
        stored = self.resolve(path)
        if stored is None:
            return None
        info = self._infos[stored]
        if info.file_size > limit:
            raise PackageError(f"{stored} is too large to read.")
        with self._zip.open(info) as handle:
            data = handle.read(limit + 1)  # never trust the header's size alone
        if len(data) > limit:
            raise PackageError(f"{stored} is too large to read.")
        return data

    def read_text(self, path: str) -> str | None:
        data = self.read_bytes(path, MAX_TEXT_BYTES)
        return None if data is None else data.decode("utf-8", errors="replace")
