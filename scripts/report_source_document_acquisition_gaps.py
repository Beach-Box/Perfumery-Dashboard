#!/usr/bin/env python3

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import inspect_source_document_pdfs as inspector


DEFAULT_SOURCE_REGISTRY_PATH = ROOT / "src" / "data" / "source_document_registry.json"
DEFAULT_EVIDENCE_REGISTRY_PATH = ROOT / "src" / "data" / "evidence_candidate_registry.json"
DEFAULT_SUPPLIER_REGISTRY_PATH = ROOT / "src" / "data" / "supplier_product_registry.json"
DEFAULT_MANIFEST_PATH = ROOT / "scripts" / "next_source_document_acquisition_manifest.json"

READY_SUITABILITY = {"identity_evidence_strong", "identity_evidence_possible"}
READINESS_RANK = {
    "only_regulatory_docs_present": 0,
    "has_some_docs_but_needs_stronger_identity_source": 1,
    "no_useful_docs_present": 2,
    "promotion_ready": 3,
}
TARGET_PRIORITY_RANK = {
    "high": 0,
    "medium": 1,
    "low": 2,
}
SOURCE_TYPE_LABELS = {
    "sds": "SDS",
    "tds": "TDS / PDS",
    "coa": "COA",
    "spec_sheet": "spec sheet",
    "supplier_pdf": "product-specific PDF",
}
CURRENT_DOC_CLASS_LABELS = {
    "sds": "SDS",
    "pds_or_tds": "TDS / PDS",
    "coa": "COA",
    "spec_sheet": "spec sheet",
    "allergen_statement": "allergen statement",
    "ifra_certificate": "IFRA / certificate",
    "supplement_or_ccid": "supplement / CCID",
    "unknown_pdf": "unknown PDF",
}


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description=(
            "Read-only source-document acquisition gap report and next-fetch "
            "manifest generator."
        )
    )
    parser.add_argument(
        "--source-registry",
        default=str(DEFAULT_SOURCE_REGISTRY_PATH),
        help="Path to source_document_registry.json",
    )
    parser.add_argument(
        "--evidence-registry",
        default=str(DEFAULT_EVIDENCE_REGISTRY_PATH),
        help="Path to evidence_candidate_registry.json",
    )
    parser.add_argument(
        "--supplier-registry",
        default=str(DEFAULT_SUPPLIER_REGISTRY_PATH),
        help="Path to supplier_product_registry.json",
    )
    parser.add_argument(
        "--report-path",
        default=None,
        help="Optional path to write the JSON report",
    )
    parser.add_argument(
        "--manifest-path",
        default=str(DEFAULT_MANIFEST_PATH),
        help="Path to write the generated acquisition manifest",
    )
    parser.add_argument(
        "--max-manifest-items",
        type=int,
        default=6,
        help="Maximum number of target entries to include in the generated manifest",
    )
    return parser.parse_args(argv)


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def unique_strings(values):
    seen = set()
    output = []
    for value in values or []:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        output.append(text)
    return output


def parse_product_page_urls(notes):
    urls = []
    for note in notes or []:
        match = re.search(r"Discovered from product page:\s*(https?://\S+)", str(note))
        if match:
            urls.append(match.group(1).strip())
    return unique_strings(urls)


def get_target_documents(canonical_material_key, target_record, source_registry):
    documents = source_registry.get("documents") or {}
    linked_keys = set(target_record.get("linkedSourceDocumentKeys") or [])
    for key, record in documents.items():
        if record.get("canonicalMaterialKey") == canonical_material_key:
            linked_keys.add(key)
    return [(key, documents[key]) for key in linked_keys if key in documents]


def inspect_target_documents(documents):
    return [
        inspector.inspect_document(source_document_key, record, 1800)
        for source_document_key, record in documents
    ]


def select_strongest_document(inspected_documents):
    strongest = None
    strongest_rank = None
    for item in inspected_documents:
        rank = inspector.SUITABILITY_RANK.get(item.get("promotionSuitability"), 999)
        if strongest is None or rank < strongest_rank:
            strongest = item
            strongest_rank = rank
    return strongest


def classify_readiness(inspected_documents):
    if not inspected_documents:
        return "no_useful_docs_present"

    suitabilities = {
        item.get("promotionSuitability")
        for item in inspected_documents
        if item.get("promotionSuitability")
    }

    if suitabilities & READY_SUITABILITY:
        return "promotion_ready"

    if suitabilities and suitabilities.issubset({"regulatory_only", "unreadable_or_insufficient"}):
        return "only_regulatory_docs_present"

    if suitabilities and suitabilities.issubset({"unreadable_or_insufficient"}):
        return "no_useful_docs_present"

    return "has_some_docs_but_needs_stronger_identity_source"


def list_promoted_candidate_fields(evidence_registry, canonical_material_key):
    fields = []
    for candidate in (evidence_registry.get("candidates") or {}).values():
        if candidate.get("canonicalMaterialKey") != canonical_material_key:
            continue
        if candidate.get("reviewStatus") == "promoted":
            fields.append(candidate.get("candidateFieldName"))
    return unique_strings(fields)


def list_missing_preferred_source_types(intake_target, inspected_documents, readiness_class):
    requested_source_types = unique_strings(intake_target.get("requestedSourceTypes") or [])
    present_doc_classes = [item.get("documentClass") for item in inspected_documents]
    present_suitabilities = [item.get("promotionSuitability") for item in inspected_documents]

    needed = []

    if "sds" in requested_source_types:
        has_ready_sds = any(
            item.get("documentClass") == "sds"
            and item.get("promotionSuitability") in READY_SUITABILITY
            for item in inspected_documents
        )
        if not has_ready_sds:
            if "sds" in present_doc_classes:
                needed.append("SDS (better readable/product-specific)")
            else:
                needed.append("SDS")

    if "tds" in requested_source_types:
        has_ready_pds = any(
            item.get("documentClass") == "pds_or_tds"
            and item.get("promotionSuitability") in READY_SUITABILITY
            for item in inspected_documents
        )
        if not has_ready_pds:
            if "pds_or_tds" in present_doc_classes:
                needed.append("TDS / PDS (cleaner product-specific version)")
            else:
                needed.append("TDS / PDS")

    if "spec_sheet" in requested_source_types and "spec_sheet" not in present_doc_classes:
        needed.append("spec sheet")

    if "supplier_pdf" in requested_source_types:
        has_useful_product_pdf = any(
            item.get("documentClass") in {"pds_or_tds", "spec_sheet", "coa"}
            and item.get("promotionSuitability") in READY_SUITABILITY
            for item in inspected_documents
        )
        if not has_useful_product_pdf:
            needed.append("product-specific PDF")

    if readiness_class != "promotion_ready" and "COA" not in needed:
        has_coa = any(item.get("documentClass") == "coa" for item in inspected_documents)
        if not has_coa:
            needed.append("COA")

    if not present_suitabilities:
        needed.append("first usable identity document")

    return unique_strings(needed)


def get_target_product_urls(canonical_material_key, related_catalog_names, inspected_documents, supplier_registry):
    urls = []

    for item in inspected_documents:
        source_identifier = item.get("sourceIdentifier") or ""
        if source_identifier.startswith("http"):
            pass
        urls.extend(parse_product_page_urls(
            (
                (source_identifier and [f"Discovered from product page: {source_identifier}"])
                if False
                else []
            )
        ))

    documents = inspected_documents
    for item in documents:
        registry_notes = item.get("registryNotes") or []
        urls.extend(parse_product_page_urls(registry_notes))

    products = (supplier_registry.get("products") or {}).values()
    related_names_set = set(related_catalog_names or [])
    for product in products:
        if product.get("mappedCanonicalMaterialKey") == canonical_material_key:
            urls.append(product.get("url"))
            continue
        if product.get("mappedCatalogName") in related_names_set:
            urls.append(product.get("url"))

    return unique_strings(urls)


def build_target_report(
    canonical_material_key,
    target_record,
    intake_target,
    source_registry,
    evidence_registry,
    supplier_registry,
):
    documents = get_target_documents(canonical_material_key, target_record, source_registry)
    inspected_documents = inspect_target_documents(documents)

    registry_notes_by_key = {
        key: (record.get("notes") or [])
        for key, record in documents
    }
    for item in inspected_documents:
        item["registryNotes"] = registry_notes_by_key.get(item["sourceDocumentKey"], [])

    strongest_document = select_strongest_document(inspected_documents)
    readiness_class = classify_readiness(inspected_documents)

    related_catalog_names = unique_strings(
        (target_record.get("relatedCatalogNames") or [])
        + (intake_target.get("relatedCatalogNames") or [])
    )
    product_urls = []
    for item in inspected_documents:
        product_urls.extend(parse_product_page_urls(item.get("registryNotes") or []))
    if not product_urls:
        product_urls = get_target_product_urls(
            canonical_material_key,
            related_catalog_names,
            inspected_documents,
            supplier_registry,
        )

    return {
        "canonicalMaterialKey": canonical_material_key,
        "priority": intake_target.get("priority") or "medium",
        "readinessClass": readiness_class,
        "relatedCatalogNames": related_catalog_names,
        "requestedFields": unique_strings(
            (target_record.get("targetFields") or [])
            + (intake_target.get("requestedFields") or [])
        ),
        "promotedCandidateFields": list_promoted_candidate_fields(
            evidence_registry, canonical_material_key
        ),
        "currentDocumentCount": len(inspected_documents),
        "strongestCurrentSource": (
            {
                "sourceDocumentKey": strongest_document.get("sourceDocumentKey"),
                "documentClass": strongest_document.get("documentClass"),
                "promotionSuitability": strongest_document.get("promotionSuitability"),
                "pathResolution": strongest_document.get("pathResolution"),
            }
            if strongest_document
            else None
        ),
        "currentDocumentClasses": unique_strings(
            CURRENT_DOC_CLASS_LABELS.get(item.get("documentClass"), item.get("documentClass"))
            for item in inspected_documents
            if item.get("documentClass")
        ),
        "missingPreferredSourceTypes": list_missing_preferred_source_types(
            intake_target, inspected_documents, readiness_class
        ),
        "productUrls": product_urls,
        "notes": unique_strings(
            (target_record.get("notes") or []) + (intake_target.get("notes") or [])
        ),
    }


def sort_targets_for_manifest(target_reports):
    def key(item):
        return (
            TARGET_PRIORITY_RANK.get(item.get("priority"), 99),
            READINESS_RANK.get(item.get("readinessClass"), 99),
            item.get("canonicalMaterialKey"),
        )

    return sorted(target_reports, key=key)


def build_manifest(target_reports, max_items):
    selected = [
        item
        for item in sort_targets_for_manifest(target_reports)
        if item.get("readinessClass") != "promotion_ready" and item.get("productUrls")
    ][:max_items]

    products = []
    for item in selected:
        products.append(
            {
                "productUrl": item["productUrls"][0],
                "supplier": (
                    "Eden Botanicals"
                    if item["productUrls"][0].startswith("https://www.edenbotanicals.com/")
                    else "Fraterworks"
                    if item["productUrls"][0].startswith("https://fraterworks.com/")
                    else None
                ),
                "canonicalMaterialKey": item["canonicalMaterialKey"],
                "relatedCatalogNames": item["relatedCatalogNames"],
                "currentReadiness": item["readinessClass"],
                "missingPreferredSourceTypes": item["missingPreferredSourceTypes"],
                "notes": unique_strings(
                    [
                        f"Current readiness: {item['readinessClass']}.",
                        (
                            "Strongest current source: "
                            f"{item['strongestCurrentSource']['sourceDocumentKey']} "
                            f"({item['strongestCurrentSource']['documentClass']}, "
                            f"{item['strongestCurrentSource']['promotionSuitability']})."
                            if item.get("strongestCurrentSource")
                            else "No inspected source documents are currently linked."
                        ),
                        "Acquire a stronger identity-oriented document before preparing new evidence candidates.",
                    ]
                    + item.get("notes", [])
                ),
            }
        )

    return {
        "metadata": {
            "version": 1,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "source_document_acquisition_gap_report",
            "note": (
                "Review-only fetch/acquisition manifest for stronger source documents. "
                "No downloads, evidence candidates, helper chemistry, IFRA, or catalog rows are modified."
            ),
        },
        "products": products,
    }


def build_report(args):
    source_registry = read_json(args.source_registry)
    evidence_registry = read_json(args.evidence_registry)
    supplier_registry = read_json(args.supplier_registry)

    candidate_targets = evidence_registry.get("candidateTargets") or {}
    intake_targets = source_registry.get("intakeTargets") or {}

    canonical_keys = unique_strings(list(candidate_targets.keys()) + list(intake_targets.keys()))

    target_reports = [
        build_target_report(
            canonical_key,
            candidate_targets.get(canonical_key, {}),
            intake_targets.get(canonical_key, {}),
            source_registry,
            evidence_registry,
            supplier_registry,
        )
        for canonical_key in canonical_keys
    ]

    readiness_counts = {}
    for item in target_reports:
        readiness = item["readinessClass"]
        readiness_counts[readiness] = readiness_counts.get(readiness, 0) + 1

    manifest = build_manifest(target_reports, args.max_manifest_items)

    return {
        "metadata": {
            "version": 1,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "note": (
                "Read-only source-document acquisition gap report. No downloads, evidence candidates, "
                "helper chemistry, IFRA linkage, or live catalog data are modified."
            ),
        },
        "summary": {
            "targetCount": len(target_reports),
            "readinessCounts": readiness_counts,
            "highestPriorityTargetsNeedingStrongerDocs": [
                {
                    "canonicalMaterialKey": item["canonicalMaterialKey"],
                    "readinessClass": item["readinessClass"],
                    "priority": item["priority"],
                    "missingPreferredSourceTypes": item["missingPreferredSourceTypes"],
                }
                for item in sort_targets_for_manifest(target_reports)
                if item["readinessClass"] != "promotion_ready"
            ][: args.max_manifest_items],
        },
        "targets": sort_targets_for_manifest(target_reports),
        "generatedManifest": manifest,
    }


def main(argv):
    args = parse_args(argv)
    report = build_report(args)
    output = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    sys.stdout.write(output)

    if args.report_path:
        Path(args.report_path).write_text(output, encoding="utf-8")

    if args.manifest_path:
        manifest_output = json.dumps(report["generatedManifest"], indent=2, ensure_ascii=False) + "\n"
        Path(args.manifest_path).write_text(manifest_output, encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
