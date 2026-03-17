#!/usr/bin/env python3

import argparse
import json
import pathlib
import re
import subprocess
import tempfile
import textwrap
import unicodedata
from collections import Counter
from datetime import datetime, timezone

SOURCE_DOCUMENT = "IFRA - 51st Amendment.pdf"
STANDARD_PAGE_TOTAL = 709
CAS_RE = re.compile(r"^\d{2,7}-\d{2}-\d$")
FOOTER_RE = re.compile(
    r"(\d{4}) \(Amendment (\d+)\) 1/(\d+)\nPage (\d+) of 709"
)


def build_swift_extractor(pdf_path):
    return textwrap.dedent(
        f"""
        import Foundation
        import PDFKit

        struct PageRecord: Codable {{
          let pdfPage: Int
          let text: String
        }}

        let url = URL(fileURLWithPath: {json.dumps(str(pdf_path))})
        guard let doc = PDFDocument(url: url) else {{
          fputs("failed to open pdf\\n", stderr)
          exit(1)
        }}

        var pages: [PageRecord] = []
        for i in 0..<doc.pageCount {{
          let text = doc.page(at: i)?.string ?? ""
          pages.append(PageRecord(pdfPage: i + 1, text: text))
        }}

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        FileHandle.standardOutput.write(try! encoder.encode(pages))
        """
    )


def extract_pages(pdf_path):
    swift_source = build_swift_extractor(pdf_path)
    with tempfile.TemporaryDirectory() as td:
        td_path = pathlib.Path(td)
        swift_path = td_path / "extract.swift"
        bin_path = td_path / "extract-bin"
        swift_path.write_text(swift_source)
        compile_result = subprocess.run(
            [
                "swiftc",
                "-module-cache-path",
                "/tmp/codex-clang-module-cache",
                str(swift_path),
                "-o",
                str(bin_path),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if compile_result.returncode:
            raise RuntimeError(compile_result.stderr)
        run_result = subprocess.run(
            [str(bin_path)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    return json.loads(run_result.stdout)


def clean_text(text):
    return text.replace("\r", "\n").replace("\u00a0", " ").replace("•", "*")


def strip_header_footer(text, canonical_name=None):
    text = clean_text(text)
    if canonical_name:
        text = re.sub(
            rf"^Amendment \d+\nIFRA STANDARD\n{re.escape(canonical_name)}\n",
            "",
            text,
            count=1,
        )
    text = re.sub(
        r"\n\d{4} \(Amendment \d+\) \d+/\d+\nPage \d+ of 709\s*$",
        "",
        text.strip(),
    )
    return text.strip()


def unwrap_lines(block):
    lines = [line.strip() for line in block.splitlines() if line.strip()]
    if not lines:
        return []
    merged = []
    for line in lines:
        if not merged:
            merged.append(line)
            continue
        previous = merged[-1]
        if previous.endswith("-"):
            merged[-1] = previous[:-1] + line
        elif line[:1].islower() or line[:1] in ",.)]":
            merged[-1] = previous + " " + line
        else:
            merged.append(line)
    return merged


def parse_block(text, label, next_labels):
    start = text.find(label)
    if start == -1:
        return None
    start += len(label)
    end = len(text)
    for next_label in next_labels:
        position = text.find(next_label, start)
        if position != -1 and position < end:
            end = position
    return text[start:end].strip()


def category_key(label):
    return "cat" + label.lower()


def parse_cas_block(block):
    cas_numbers = []
    cas_notes = []
    if not block:
        return cas_numbers, cas_notes
    for line in unwrap_lines(block):
        if "Not applicable" in line:
            continue
        if CAS_RE.fullmatch(line):
            cas_numbers.append(line)
        else:
            cas_notes.append(line)
    return cas_numbers, cas_notes


def parse_category_limits(combined_text):
    limit_block = parse_block(
        combined_text,
        "MAXIMUM ACCEPTABLE CONCENTRATIONS IN THE FINISHED PRODUCT (%):",
        [
            "FRAGRANCE INGREDIENT PROHIBITION:",
            "FRAGRANCE INGREDIENT SPECIFICATION:",
            "FLAVOR REQUIREMENTS:",
            "CONTRIBUTIONS FROM OTHER SOURCES:",
            "INTRINSIC PROPERTY DRIVING RISK\nMANAGEMENT:",
            "INTRINSIC PROPERTY DRIVING RISK MANAGEMENT:",
            "RIFM SUMMARIES:",
            "EXPERT PANEL FOR FRAGRANCE SAFETY RATIONALE / CONCLUSION:",
            "REFERENCES:",
        ],
    )
    category_limits = {}
    if not limit_block:
        return category_limits
    for category, raw_value in re.findall(
        r"Category\s+([0-9]+[A-Z]?)\s+(No Restriction|[0-9]+(?:\.[0-9]+)?)\s*%?",
        limit_block,
    ):
        key = category_key(category)
        if raw_value == "No Restriction":
            category_limits[key] = {"kind": "no_restriction"}
        else:
            category_limits[key] = {
                "kind": "limit",
                "value": float(raw_value),
                "unit": "%",
            }
    return category_limits


def parse_record(span_texts, pdf_page_start):
    first_page = clean_text(span_texts[0])
    footer = FOOTER_RE.search(first_page)
    if not footer:
        return None

    page_count = int(footer.group(3))
    standard_page_start = int(footer.group(4))

    name_match = re.search(r"IFRA STANDARD\n(.*?)\nCAS-No\.:", first_page, re.S)
    if not name_match:
        name_match = re.search(
            r"IFRA STANDARD\n(.*?)\nHistory: Publication date:",
            first_page,
            re.S,
        )
    if not name_match:
        return None

    canonical_name = " ".join(
        part.strip() for part in name_match.group(1).splitlines()
    ).strip()

    cleaned_pages = []
    for index, page_text in enumerate(span_texts):
        if index == 0:
            cleaned_pages.append(strip_header_footer(page_text))
        else:
            cleaned_pages.append(
                strip_header_footer(page_text, canonical_name=canonical_name)
            )
    combined_text = "\n".join(cleaned_pages)

    cas_match = re.search(
        r"CAS-No\.\:\s*(.*?)\nThe scope of this Standard includes",
        first_page,
        re.S,
    )
    cas_block = cas_match.group(1).strip() if cas_match else ""
    cas_numbers, cas_notes = parse_cas_block(cas_block)

    synonym_block = (
        parse_block(first_page, "Synonyms:", ["History: Publication date:"]) or ""
    )
    synonyms = unwrap_lines(synonym_block)

    history_match = re.search(
        r"History: Publication date:\s*(\d{4}) \(Amendment (\d+)\)",
        first_page,
    )
    publication_year = int(history_match.group(1)) if history_match else None
    amendment = int(history_match.group(2)) if history_match else None

    previous_publications_block = (
        parse_block(
            first_page,
            "Previous\nPublications:",
            ["Implementation\ndates:"],
        )
        or ""
    )
    previous_publications = [
        line.strip(". ")
        for line in unwrap_lines(previous_publications_block)
        if line.strip(". ")
    ]

    implementation_match = re.search(
        r"For new creation\*:\s*(.*?)\nFor existing creation\*:\s*(.*?)\n",
        first_page,
        re.S,
    )
    implementation_dates = {
        "new_creation": (
            " ".join(implementation_match.group(1).split())
            if implementation_match
            else None
        ),
        "existing_creation": (
            " ".join(implementation_match.group(2).split())
            if implementation_match
            else None
        ),
    }

    recommendation_match = re.search(r"RECOMMENDATION:\s*([^\n]+)", first_page)
    standard_type = recommendation_match.group(1).strip() if recommendation_match else ""
    standard_types = [
        part.strip().lower() for part in standard_type.split("/") if part.strip()
    ]

    prohibition_text = parse_block(
        combined_text,
        "FRAGRANCE INGREDIENT PROHIBITION:",
        [
            "FRAGRANCE INGREDIENT SPECIFICATION:",
            "FLAVOR REQUIREMENTS:",
            "CONTRIBUTIONS FROM OTHER SOURCES:",
            "INTRINSIC PROPERTY DRIVING RISK\nMANAGEMENT:",
            "INTRINSIC PROPERTY DRIVING RISK MANAGEMENT:",
            "EXPERT PANEL FOR FRAGRANCE SAFETY RATIONALE / CONCLUSION:",
            "REFERENCES:",
        ],
    )
    specification_text = parse_block(
        combined_text,
        "FRAGRANCE INGREDIENT SPECIFICATION:",
        [
            "FLAVOR REQUIREMENTS:",
            "CONTRIBUTIONS FROM OTHER SOURCES:",
            "INTRINSIC PROPERTY DRIVING RISK\nMANAGEMENT:",
            "INTRINSIC PROPERTY DRIVING RISK MANAGEMENT:",
            "EXPERT PANEL FOR FRAGRANCE SAFETY RATIONALE / CONCLUSION:",
            "REFERENCES:",
        ],
    )

    lookup_key = re.sub(r"\s+", " ", canonical_name).strip().lower()
    slug = unicodedata.normalize("NFKD", canonical_name).encode(
        "ascii", "ignore"
    ).decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", slug).strip("_").lower()

    return {
        "lookup_key": lookup_key,
        "slug": slug,
        "canonical_name": canonical_name,
        "cas_numbers": cas_numbers,
        "cas_notes": cas_notes,
        "synonyms": synonyms,
        "standard_type": standard_type,
        "standard_types": standard_types,
        "publication_year": publication_year,
        "amendment": amendment,
        "page_reference": {
            "standard_page_start": standard_page_start,
            "standard_page_end": standard_page_start + page_count - 1,
            "pdf_page_start": pdf_page_start,
            "pdf_page_end": pdf_page_start + page_count - 1,
            "page_count": page_count,
        },
        "implementation_dates": implementation_dates,
        "previous_publications": previous_publications,
        "category_limits": parse_category_limits(combined_text),
        "prohibition_text": (
            " ".join(unwrap_lines(prohibition_text)) if prohibition_text else None
        ),
        "specification_text": (
            " ".join(unwrap_lines(specification_text))
            if specification_text
            else None
        ),
        "status": "active",
        "source_document": SOURCE_DOCUMENT,
    }


def build_dataset(pdf_path):
    pages = extract_pages(pdf_path)
    page_texts = [clean_text(page["text"]) for page in pages]
    records = []

    for index, page_text in enumerate(page_texts):
        if "History: Publication date:" not in page_text:
            continue
        if "RECOMMENDATION:" not in page_text:
            continue
        footer = FOOTER_RE.search(page_text)
        if not footer:
            continue
        page_count = int(footer.group(3))
        span = page_texts[index : index + page_count]
        record = parse_record(span, index + 1)
        if record:
            records.append(record)

    records.sort(key=lambda record: record["page_reference"]["standard_page_start"])

    type_counts = Counter(record["standard_type"] for record in records)
    records_with_limits = sum(1 for record in records if record["category_limits"])
    records_with_prohibition = sum(
        1 for record in records if record["prohibition_text"]
    )
    records_with_specification = sum(
        1 for record in records if record["specification_text"]
    )

    return {
        "metadata": {
            "source_document": SOURCE_DOCUMENT,
            "source_path": str(pdf_path),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "pdf_page_count": len(pages),
            "standard_page_count": STANDARD_PAGE_TOTAL,
            "extracted_standard_count": len(records),
            "records_with_category_limits": records_with_limits,
            "records_with_prohibition_text": records_with_prohibition,
            "records_with_specification_text": records_with_specification,
            "recommendation_counts": dict(type_counts),
            "extraction_basis": (
                "Parsed full IFRA standard spans from first pages containing "
                "History, Recommendation, and footer page markers."
            ),
        },
        "standards": records,
    }


def parse_args():
    repo_root = pathlib.Path(__file__).resolve().parents[1]
    default_pdf = pathlib.Path.home() / "Downloads" / SOURCE_DOCUMENT
    default_output = repo_root / "src" / "data" / "ifra_master_standards.json"
    parser = argparse.ArgumentParser(
        description="Extract a structured IFRA master dataset from the IFRA 51st Amendment PDF."
    )
    parser.add_argument("--pdf", type=pathlib.Path, default=default_pdf)
    parser.add_argument("--output", type=pathlib.Path, default=default_output)
    return parser.parse_args()


def main():
    args = parse_args()
    dataset = build_dataset(args.pdf)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n")
    print(
        json.dumps(
            {
                "output": str(args.output),
                "extracted_standard_count": dataset["metadata"][
                    "extracted_standard_count"
                ],
                "records_with_category_limits": dataset["metadata"][
                    "records_with_category_limits"
                ],
                "records_with_prohibition_text": dataset["metadata"][
                    "records_with_prohibition_text"
                ],
                "records_with_specification_text": dataset["metadata"][
                    "records_with_specification_text"
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
