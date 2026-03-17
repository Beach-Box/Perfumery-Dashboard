#!/usr/bin/env python3

import argparse
import json
import re
import sys
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REGISTRY_PATH = ROOT / "src" / "data" / "source_document_registry.json"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def unique_list(values):
    seen = set()
    output = []
    for value in values:
      if value is None:
          continue
      text = str(value).strip()
      if not text or text in seen:
          continue
      seen.add(text)
      output.append(text)
    return output


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description=(
            "Read-only local PDF inspection for source documents in the "
            "source-document registry."
        )
    )
    parser.add_argument(
        "--registry",
        default=str(DEFAULT_REGISTRY_PATH),
        help="Path to source_document_registry.json",
    )
    parser.add_argument(
        "--canonical-material-key",
        default=None,
        help="Filter to one canonicalMaterialKey",
    )
    parser.add_argument(
        "--source-document-key",
        action="append",
        default=[],
        help="Inspect a specific sourceDocumentKey (can be passed multiple times)",
    )
    parser.add_argument(
        "--report-path",
        default=None,
        help="Optional path to write the JSON inspection report",
    )
    parser.add_argument(
        "--max-preview-chars",
        type=int,
        default=1800,
        help="Maximum extracted text preview characters per document",
    )
    return parser.parse_args(argv)


def decode_pdf_string(value: bytes) -> str:
    text = value.decode("latin1", "ignore")
    text = text.replace(r"\(", "(").replace(r"\)", ")").replace(r"\\", "\\")
    return text.strip()


def extract_pdf_title(data: bytes):
    match = re.search(rb"/Title\s*\((.*?)\)", data, re.S)
    if not match:
        return None
    return decode_pdf_string(match.group(1))


def iter_pdf_objects(data: bytes):
    pattern = re.compile(rb"(\d+)\s+0\s+obj\s*(.*?)\s*endobj", re.S)
    for match in pattern.finditer(data):
        yield int(match.group(1)), match.group(2)


def build_font_resource_to_unicode_map(data: bytes):
    object_bodies = dict(iter_pdf_objects(data))
    cmap_by_obj = {}

    for obj_num, body in object_bodies.items():
        to_unicode_match = re.search(rb"/ToUnicode\s+(\d+)\s+0\s+R", body)
        if not to_unicode_match:
            continue
        cmap_obj_num = int(to_unicode_match.group(1))
        cmap_body = object_bodies.get(cmap_obj_num)
        if not cmap_body:
            continue
        stream_match = re.search(
            rb"<<.*?>>\s*stream\r?\n(.*?)\r?\nendstream", cmap_body, re.S
        )
        if not stream_match:
            continue
        try:
            cmap_text = zlib.decompress(stream_match.group(1)).decode(
                "latin1", "ignore"
            )
        except Exception:
            continue
        cmap_by_obj[obj_num] = parse_cmap_text(cmap_text)

    font_resource_map = {}
    font_resource_pattern = re.compile(rb"/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R")

    for _, body in object_bodies.items():
        if b"/Font" not in body:
            continue
        for resource_name, font_obj in font_resource_pattern.findall(body):
            font_obj_num = int(font_obj)
            if font_obj_num in cmap_by_obj:
                font_resource_map[resource_name.decode("latin1")] = cmap_by_obj[
                    font_obj_num
                ]

    for font_obj_num, cmap in cmap_by_obj.items():
        fallback_name = f"F{font_obj_num}"
        font_resource_map.setdefault(fallback_name, cmap)

    return font_resource_map


def parse_cmap_text(text: str):
    cmap = {}

    for block in re.finditer(r"(\d+)\s+beginbfchar(.*?)endbfchar", text, re.S):
        for src, dst in re.findall(r"<([0-9A-F]+)>\s*<([0-9A-F]+)>", block.group(2)):
            src_int = int(src, 16)
            dst_int = int(dst, 16)
            cmap[src_int] = chr(dst_int) if dst_int != 0 else ""

    for block in re.finditer(r"(\d+)\s+beginbfrange(.*?)endbfrange", text, re.S):
        for src_start, src_end, dst_start in re.findall(
            r"<([0-9A-F]+)>\s*<([0-9A-F]+)>\s*<([0-9A-F]+)>", block.group(2)
        ):
            start = int(src_start, 16)
            end = int(src_end, 16)
            dst_base = int(dst_start, 16)
            for index, src_int in enumerate(range(start, end + 1)):
                cmap[src_int] = chr(dst_base + index)

    return cmap


def decode_literal_pdf_string(value: str) -> str:
    return (
        value.replace(r"\(", "(")
        .replace(r"\)", ")")
        .replace(r"\\", "\\")
        .replace(r"\n", "\n")
        .replace(r"\r", "\r")
        .replace(r"\t", "\t")
    )


def decode_hex_text(hex_value: str, cmap):
    chars = []
    for index in range(0, len(hex_value), 4):
        chunk = hex_value[index : index + 4]
        if len(chunk) != 4:
            continue
        chars.append(cmap.get(int(chunk, 16), ""))
    return "".join(chars)


def extract_text_from_content_stream(stream_text: str, font_maps):
    current_font = "F4"
    lines = []

    for block in re.finditer(r"BT(.*?)ET", stream_text, re.S):
        content = block.group(1)
        fonts = re.findall(r"/([A-Za-z0-9]+)\s+[0-9.]+\s+Tf", content)
        if fonts:
            current_font = fonts[-1]
        cmap = font_maps.get(current_font, {})

        line_parts = []

        for match in re.finditer(r"<([0-9A-F]+)>\s*Tj", content):
            line_parts.append(decode_hex_text(match.group(1), cmap))

        for match in re.finditer(r"\((.*?)\)\s*Tj", content, re.S):
            line_parts.append(decode_literal_pdf_string(match.group(1)))

        for array_match in re.finditer(r"\[(.*?)\]\s*TJ", content, re.S):
            chunk = array_match.group(1)
            for hex_match in re.finditer(r"<([0-9A-F]+)>", chunk):
                line_parts.append(decode_hex_text(hex_match.group(1), cmap))
            for literal_match in re.finditer(r"\((.*?)\)", chunk, re.S):
                line_parts.append(decode_literal_pdf_string(literal_match.group(1)))

        line_text = "".join(line_parts).strip()
        if line_text:
            lines.append(line_text)

    return lines


def extract_pdf_text(data: bytes):
    font_maps = build_font_resource_to_unicode_map(data)
    lines = []

    for _, body in iter_pdf_objects(data):
        stream_match = re.search(rb"<<.*?>>\s*stream\r?\n(.*?)\r?\nendstream", body, re.S)
        if not stream_match:
            continue
        try:
            stream_text = zlib.decompress(stream_match.group(1)).decode(
                "latin1", "ignore"
            )
        except Exception:
            continue
        if "BT" not in stream_text:
            continue
        lines.extend(extract_text_from_content_stream(stream_text, font_maps))

    return unique_list(lines)


def extract_raw_ascii_strings(data: bytes, min_len: int = 5):
    pattern = rb"[\x20-\x7E]{%d,}" % min_len
    return [match.decode("latin1", "ignore") for match in re.findall(pattern, data)]


CAS_PATTERN = re.compile(r"\b\d{2,7}-\d{2}-\d\b")


def collect_keyword_lines(lines, keywords):
    keywords_lower = [keyword.lower() for keyword in keywords]
    matches = []
    for line in lines:
        lower = line.lower()
        if any(keyword in lower for keyword in keywords_lower):
            matches.append(line)
    return unique_list(matches)


def tokenize(value):
    return [token for token in re.split(r"[^a-z0-9]+", value.lower()) if token]


def classify_match(document, text_lines, metadata_title):
    canonical_key = document.get("canonicalMaterialKey") or ""
    related_catalog_names = document.get("relatedCatalogNames") or []
    joined_text = " ".join(text_lines).lower()
    title_lower = (metadata_title or "").lower()
    combined_text = f"{title_lower} {joined_text}".strip()

    if len(combined_text) < 40:
        return (
            "unreadable_or_insufficient_evidence",
            ["Very little extractable text was found in the local PDF."],
        )

    target_tokens = set(tokenize(canonical_key))
    for name in related_catalog_names:
        target_tokens.update(tokenize(name))

    positive_resinoid_cues = any(
        phrase in combined_text
        for phrase in [
            "resinoid",
            "signature resinoid",
            "peru balsam resinoid",
        ]
    )
    strong_oil_cues = any(
        phrase in combined_text
        for phrase in [
            "balsams, peru",
            "balsam peru oil",
            "peruvian balsam",
            "myroxylon pereirae oleoresin",
        ]
    )

    reasons = []

    if positive_resinoid_cues and not strong_oil_cues:
        reasons.append("Document text contains resinoid-specific identity cues.")
        return ("canonical_target_likely_matches", reasons)

    if strong_oil_cues and not positive_resinoid_cues:
        reasons.append(
            "Document text looks like Peru balsam oil / oleoresin evidence rather than a resinoid-specific identity."
        )
        return ("likely_mismatched_or_different_material", reasons)

    matched_tokens = [token for token in target_tokens if token in combined_text]
    if canonical_key and len(matched_tokens) >= 2:
        reasons.append(
            f"Document text matches multiple target tokens: {', '.join(sorted(set(matched_tokens)))}."
        )
        return ("canonical_target_likely_matches", reasons)

    reasons.append("Text was extracted, but target identity cues remain too weak to trust.")
    return ("insufficient_evidence", reasons)


def inspect_document(source_document_key, record, max_preview_chars):
    source_path = record.get("sourcePath")
    resolved_path = (ROOT / source_path).resolve() if source_path else None
    path_exists = bool(resolved_path and resolved_path.exists())

    result = {
        "sourceDocumentKey": source_document_key,
        "canonicalMaterialKey": record.get("canonicalMaterialKey"),
        "sourceType": record.get("sourceType"),
        "supplier": record.get("supplier"),
        "relatedCatalogNames": record.get("relatedCatalogNames") or [],
        "sourceIdentifier": record.get("sourceIdentifier"),
        "sourcePath": source_path,
        "pathExists": path_exists,
        "metadataTitle": None,
        "extractionMethod": None,
        "matchAssessment": None,
        "matchReasons": [],
        "casValues": [],
        "inciSnippets": [],
        "productNameSnippets": [],
        "compositionSnippets": [],
        "uvcbSnippets": [],
        "identityCueSnippets": [],
        "textPreview": "",
    }

    if not path_exists:
        result["matchAssessment"] = "unreadable_or_insufficient_evidence"
        result["matchReasons"] = ["Local sourcePath is missing on disk."]
        return result

    try:
        data = resolved_path.read_bytes()
    except Exception as exc:
        result["matchAssessment"] = "unreadable_or_insufficient_evidence"
        result["matchReasons"] = [f"Failed to read local file: {exc}"]
        return result

    metadata_title = extract_pdf_title(data)
    text_lines = extract_pdf_text(data)
    raw_strings = extract_raw_ascii_strings(data)

    if text_lines:
        extraction_method = "pdf_text_objects"
    elif raw_strings:
        extraction_method = "raw_ascii_strings"
        text_lines = raw_strings
    else:
        extraction_method = "unreadable_binary"

    result["metadataTitle"] = metadata_title
    result["extractionMethod"] = extraction_method

    combined_lines = unique_list(
        ([metadata_title] if metadata_title else [])
        + text_lines
    )
    joined_text = "\n".join(combined_lines)

    result["casValues"] = unique_list(CAS_PATTERN.findall(joined_text))
    result["inciSnippets"] = collect_keyword_lines(combined_lines, ["inci"])
    result["productNameSnippets"] = unique_list(
        collect_keyword_lines(
            combined_lines,
            ["product identifier", "name:", "substance overview", "balsams", "resinoid"],
        )[:6]
    )
    result["compositionSnippets"] = collect_keyword_lines(
        combined_lines,
        ["composition", "ingredient", "oleoresin", "constituent", "mixture"],
    )[:8]
    result["uvcbSnippets"] = collect_keyword_lines(
        combined_lines,
        ["uvcb", "complex mixture", "natural extract", "multi constituent", "oleoresin"],
    )[:8]
    result["identityCueSnippets"] = collect_keyword_lines(
        combined_lines,
        [
            "peru balsam",
            "balsams, peru",
            "resinoid",
            "balsam peru oil",
            "myroxylon pereirae",
            "signature",
        ],
    )[:12]

    match_assessment, match_reasons = classify_match(record, combined_lines, metadata_title)
    result["matchAssessment"] = match_assessment
    result["matchReasons"] = match_reasons
    result["textPreview"] = joined_text[:max_preview_chars]

    return result


def load_matching_documents(registry, canonical_material_key, source_document_keys):
    documents = registry.get("documents") or {}
    if source_document_keys:
        keys = source_document_keys
    elif canonical_material_key:
        keys = [
            key
            for key, record in documents.items()
            if record.get("canonicalMaterialKey") == canonical_material_key
        ]
    else:
        keys = list(documents.keys())

    return [(key, documents[key]) for key in keys if key in documents]


def build_report(args):
    registry_path = Path(args.registry).resolve()
    registry = read_json(registry_path)
    documents = load_matching_documents(
        registry, args.canonical_material_key, args.source_document_key
    )

    inspected = [
        inspect_document(source_document_key, record, args.max_preview_chars)
        for source_document_key, record in documents
    ]

    summary = {
        "registryPath": str(registry_path),
        "canonicalMaterialKey": args.canonical_material_key,
        "sourceDocumentCount": len(inspected),
        "matchCounts": {
            "canonical_target_likely_matches": sum(
                1
                for item in inspected
                if item["matchAssessment"] == "canonical_target_likely_matches"
            ),
            "likely_mismatched_or_different_material": sum(
                1
                for item in inspected
                if item["matchAssessment"] == "likely_mismatched_or_different_material"
            ),
            "unreadable_or_insufficient_evidence": sum(
                1
                for item in inspected
                if item["matchAssessment"] == "unreadable_or_insufficient_evidence"
            ),
            "insufficient_evidence": sum(
                1
                for item in inspected
                if item["matchAssessment"] == "insufficient_evidence"
            ),
        },
    }

    return {
        "metadata": {
            "version": 1,
            "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "note": (
                "Read-only local PDF inspection report. No evidence candidates, "
                "helper chemistry, IFRA linkage, or live catalog data are modified."
            ),
        },
        "summary": summary,
        "documents": inspected,
    }


def main(argv):
    args = parse_args(argv)
    report = build_report(args)
    output = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    sys.stdout.write(output)

    if args.report_path:
        report_path = Path(args.report_path).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(output, encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
