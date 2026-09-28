/**
 * TrailBlaze Adventure Tours — booking backend (Google Apps Script)
 * ------------------------------------------------------------------
 * Deploy this as a Web App:
 *   Deploy > New deployment > type: Web app
 *   Execute as:     Me
 *   Who has access: Anyone
 * Copy the resulting /exec URL into SCRIPT_URL in script.js.
 *
 * Whenever you edit this file, you must create a NEW deployment
 * (or "Manage deployments" > pencil icon > New version) for the
 * live URL to pick up your changes — this trips up almost everyone
 * the first time.
 */

// Optional: set this to receive a copy of every booking notification.
const ADMIN_EMAIL = "";

/**
 * Simple health check so you can confirm the deployment works by
 * visiting the Web App URL directly in a browser (a GET request).
 */
function doGet(e) {
  return jsonResponse({ status: "TrailBlaze booking API is running" });
}

/**
 * Handles the booking form submission from index.html / script.js.
 * Expects a JSON body (sent as Content-Type: text/plain to avoid a
 * CORS preflight) with: name, email, phone, trail, date, hikers,
 * requests, weather.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: "No data received." });
    }

    const data = JSON.parse(e.postData.contents);

    const missing = ["name", "email", "trail", "date", "hikers"].filter(f => !data[f]);
    if (missing.length) {
      return jsonResponse({ success: false, error: "Missing field(s): " + missing.join(", ") });
    }
    if (!isValidEmail(data.email)) {
      return jsonResponse({ success: false, error: "Invalid email address." });
    }

    const bookingId = "TB-" + Utilities.formatDate(new Date(), "GMT+8", "yyyyMMdd-HHmmss");
    const pdfBlob = buildReceiptPdf(data, bookingId);

    MailApp.sendEmail({
      to: data.email,
      cc: ADMIN_EMAIL || undefined,
      subject: "TrailBlaze Booking Confirmation — " + bookingId,
      body: buildEmailBody(data, bookingId),
      attachments: [pdfBlob]
    });

    return jsonResponse({ success: true, bookingId: bookingId });
  } catch (err) {
    // Surface the real error message to the frontend to make debugging easier.
    return jsonResponse({ success: false, error: err.message });
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

function buildEmailBody(data, bookingId) {
  return "Hi " + data.name + ",\n\n" +
    "Thanks for booking with TrailBlaze Adventure Tours! Your booking reference is " + bookingId + ".\n\n" +
    "Trail: " + data.trail + "\n" +
    "Date: " + data.date + "\n" +
    "Hikers: " + data.hikers + "\n\n" +
    "Your official receipt is attached as a PDF.\n\n" +
    "See you on the trail!\n" +
    "— TrailBlaze Team";
}

/**
 * Builds the receipt as a Google Doc, exports it to PDF, then trashes
 * the temporary Doc so only the PDF (attached to the email) remains
 * as clutter-free output.
 */
function buildReceiptPdf(data, bookingId) {
  const doc = DocumentApp.create("Receipt-" + bookingId);
  const body = doc.getBody();

  body.appendParagraph("TrailBlaze Adventure Tours").setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph("Booking Receipt").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("Booking Reference: " + bookingId);
  body.appendParagraph("Date Issued: " + new Date().toLocaleString());
  body.appendParagraph("");

  body.appendParagraph("Guest Details").setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph("Name: " + data.name);
  body.appendParagraph("Email: " + data.email);
  if (data.phone) body.appendParagraph("Phone: " + data.phone);

  body.appendParagraph("Trip Details").setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph("Trail / Package: " + data.trail);
  body.appendParagraph("Preferred Date: " + data.date);
  body.appendParagraph("Number of Hikers: " + data.hikers);
  if (data.requests) body.appendParagraph("Special Requests: " + data.requests);

  if (data.weather) {
    body.appendParagraph("Weather Snapshot (at time of booking)").setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(data.weather);
    body.appendParagraph("Source: Open-Meteo (open-meteo.com)").setItalic(true);
  }

  body.appendParagraph("");
  body.appendParagraph("Thank you for choosing TrailBlaze. This receipt was generated automatically — no reply needed.");

  doc.saveAndClose();

  const file = DriveApp.getFileById(doc.getId());
  const pdfBlob = file.getAs("application/pdf").setName(bookingId + ".pdf");
  file.setTrashed(true); // remove the intermediate Google Doc, keep only the PDF attachment

  return pdfBlob;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
