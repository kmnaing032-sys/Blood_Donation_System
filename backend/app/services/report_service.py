import csv
import io
from datetime import date
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.report import (
    get_donor_report,
    get_donation_report,
    get_blood_stock_report,
    get_blood_request_report,
    get_operational_overview,
)


async def generate_reports_csv(
    db: AsyncSession,
    report_type: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    blood_group: Optional[str] = None,
    status: Optional[str] = None,
) -> str:
    """Generate safe, comma-separated values (CSV) string for reports."""
    output = io.StringIO()
    writer = csv.writer(output)

    if report_type == "donors":
        data = await get_donor_report(db, start_date=start_date, end_date=end_date, blood_group=blood_group)
        writer.writerow(["Donor Report"])
        writer.writerow(["Filter Start Date", start_date or "All Time"])
        writer.writerow(["Filter End Date", end_date or "All Time"])
        writer.writerow(["Filter Blood Group", blood_group or "All Groups"])
        writer.writerow(["Total Donors", data.total_donors])
        writer.writerow(["New Donors In Period", data.new_donors_in_period])
        writer.writerow([])
        writer.writerow(["Blood Group", "Donor Count"])
        for bg in data.by_blood_group:
            writer.writerow([bg.blood_group, bg.count])
        writer.writerow([])
        writer.writerow(["Gender", "Donor Count"])
        for g in data.by_gender:
            writer.writerow([g.gender, g.count])

    elif report_type == "donations":
        data = await get_donation_report(db, start_date=start_date, end_date=end_date, blood_group=blood_group, status=status)
        writer.writerow(["Donation Report"])
        writer.writerow(["Filter Start Date", start_date or "All Time"])
        writer.writerow(["Filter End Date", end_date or "All Time"])
        writer.writerow(["Filter Blood Group", blood_group or "All Groups"])
        writer.writerow(["Filter Status", status or "All Statuses"])
        writer.writerow(["Total Donations", data.total_donations])
        writer.writerow(["Total Volume (ml)", data.total_volume_ml])
        writer.writerow([])
        writer.writerow(["Blood Group", "Donation Count", "Total Volume (ml)"])
        for bg in data.by_blood_group:
            writer.writerow([bg.blood_group, bg.count, bg.total_volume_ml])
        writer.writerow([])
        writer.writerow(["Period (Month)", "Donation Count", "Volume (ml)"])
        for tr in data.trends:
            writer.writerow([tr.period, tr.count, tr.volume_ml])

    elif report_type == "blood-stock":
        data = await get_blood_stock_report(db, blood_group=blood_group)
        writer.writerow(["Blood Stock Inventory Report"])
        writer.writerow(["Total Available Volume (ml)", data.total_available_volume_ml])
        writer.writerow(["Total Reserved Volume (ml)", data.total_reserved_volume_ml])
        writer.writerow(["Total Inventory Volume (ml)", data.total_inventory_volume_ml])
        writer.writerow([])
        writer.writerow(["Blood Group", "Available (ml)", "Reserved (ml)", "Total (ml)", "Percentage (%)"])
        for item in data.by_blood_group:
            writer.writerow([
                item.blood_group,
                item.available_quantity_ml,
                item.reserved_quantity_ml,
                item.total_quantity_ml,
                f"{item.percentage_of_total}%",
            ])

    elif report_type == "blood-requests":
        data = await get_blood_request_report(db, start_date=start_date, end_date=end_date, blood_group=blood_group, status=status)
        writer.writerow(["Blood Request Report"])
        writer.writerow(["Filter Start Date", start_date or "All Time"])
        writer.writerow(["Filter End Date", end_date or "All Time"])
        writer.writerow(["Filter Blood Group", blood_group or "All Groups"])
        writer.writerow(["Filter Status", status or "All Statuses"])
        writer.writerow(["Total Requests", data.total_requests])
        writer.writerow(["Pending", data.pending_count])
        writer.writerow(["Approved", data.approved_count])
        writer.writerow(["Fulfilled", data.fulfilled_count])
        writer.writerow(["Rejected", data.rejected_count])
        writer.writerow(["Cancelled", data.cancelled_count])
        writer.writerow([])
        writer.writerow(["Blood Group", "Request Count", "Total Volume (ml)"])
        for bg in data.by_blood_group:
            writer.writerow([bg.blood_group, bg.count, bg.total_quantity_ml])
        writer.writerow([])
        writer.writerow(["Urgency", "Request Count"])
        for u in data.by_urgency:
            writer.writerow([u.urgency, u.count])

    else:  # overview / combined
        data = await get_operational_overview(db, start_date=start_date, end_date=end_date)
        writer.writerow(["Blood Donation System - Operational Overview Report"])
        writer.writerow(["Report Date Range", f"{start_date or 'Beginning'} to {end_date or 'Present'}"])
        writer.writerow(["Generated At", data.generated_at.isoformat()])
        writer.writerow([])
        writer.writerow(["Metric", "Value"])
        writer.writerow(["Total Registered Donors", data.total_donors])
        writer.writerow(["New Donors In Period", data.new_donors_in_period])
        writer.writerow(["Total Donations", data.total_donations])
        writer.writerow(["Total Donated Volume (ml)", data.total_donated_volume_ml])
        writer.writerow(["Total Available Stock (ml)", data.total_available_stock_ml])
        writer.writerow(["Total Blood Requests", data.total_requests])
        writer.writerow(["Pending Requests", data.pending_requests])
        writer.writerow(["Fulfilled Requests", data.fulfilled_requests])

    return output.getvalue()


def generate_simple_pdf(title: str, lines: list[str]) -> bytes:
    """Generate a clean, strictly compliant PDF byte stream without external dependencies."""
    pdf_lines = [
        "%PDF-1.4",
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >> endobj",
        "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
        "6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    ]

    # Build Content Stream
    stream_content = []
    stream_content.append("BT")
    # Title
    stream_content.append("/F1 18 Tf")
    stream_content.append("50 740 Td")
    clean_title = title.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream_content.append(f"({clean_title}) Tj")

    # Body lines
    stream_content.append("/F2 10 Tf")
    current_y = 700
    for line in lines[:55]:  # Clamp to one page for security & memory protection
        clean_line = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream_content.append(f"50 {current_y} Td")
        stream_content.append(f"({clean_line}) Tj")
        current_y -= 16
        stream_content.append("0 0 Td")

    stream_content.append("ET")
    stream_str = "\n".join(stream_content)
    stream_len = len(stream_str.encode("latin-1", errors="replace"))

    content_obj = f"4 0 obj << /Length {stream_len} >>\nstream\n{stream_str}\nendstream\nendobj"
    pdf_lines.append(content_obj)

    # Calculate xref
    body = "\n".join(pdf_lines) + "\n"
    # Simple cross reference table construction
    xref_pos = len(body.encode("latin-1", errors="replace"))
    
    # We construct the minimal byte structure
    # Alternatively build standard trailer
    pdf_bytes = io.BytesIO()
    pdf_bytes.write(b"%PDF-1.4\n")
    
    offsets = []
    def write_obj(content: bytes):
        offsets.append(pdf_bytes.tell())
        pdf_bytes.write(content)
        pdf_bytes.write(b"\n")

    write_obj(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj")
    write_obj(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj")
    write_obj(b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj")
    write_obj(f"4 0 obj\n<< /Length {stream_len} >>\nstream\n{stream_str}\nendstream\nendobj".encode("latin-1", errors="replace"))
    write_obj(b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj")
    write_obj(b"6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj")

    xref_start = pdf_bytes.tell()
    pdf_bytes.write(b"xref\n0 7\n0000000000 65535 f \n")
    for offset in offsets:
        pdf_bytes.write(f"{offset:010d} 00000 n \n".encode("ascii"))
    
    pdf_bytes.write(b"trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n")
    pdf_bytes.write(f"{xref_start}\n%%EOF\n".encode("ascii"))

    return pdf_bytes.getvalue()


async def generate_reports_pdf(
    db: AsyncSession,
    report_type: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    blood_group: Optional[str] = None,
    status: Optional[str] = None,
) -> bytes:
    """Generate PDF bytes for report data."""
    csv_text = await generate_reports_csv(
        db, report_type, start_date=start_date, end_date=end_date, blood_group=blood_group, status=status
    )
    lines = [l.strip() for l in csv_text.splitlines() if l.strip()]
    title = f"Blood Donation System - {report_type.replace('-', ' ').title()} Report"
    return generate_simple_pdf(title, lines)
