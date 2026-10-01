/**
 * Willow Run Dental: new patient forms receiver (Google Apps Script web app).
 *
 * Receives the finished PDF from the website's intake form and emails it to the office.
 * Setup: see README.md in this folder.
 *
 * Privacy design: the email subject and body contain NO patient information (only a reference
 * number). The patient's details live only inside the attached PDF.
 */

const OFFICE_EMAIL = 'Mctuthbrush@msn.com';   // where completed packets are delivered
const MAX_BYTES = 6 * 1024 * 1024;            // refuse anything bigger than ~6 MB

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const id = String(body.id || '').replace(/[^A-Z0-9]/gi, '').slice(0, 12);
    const filename = String(body.filename || 'New-Patient-Forms.pdf').replace(/[^\w.\-]/g, '_').slice(0, 120);
    if (!id || !body.pdfBase64) return reply_({ ok: false, error: 'bad request' });

    const bytes = Utilities.base64Decode(body.pdfBase64);
    if (bytes.length > MAX_BYTES) return reply_({ ok: false, error: 'too large' });
    // %PDF magic number check: only accept real PDFs
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return reply_({ ok: false, error: 'not a pdf' });

    const pdf = Utilities.newBlob(bytes, 'application/pdf', filename);
    MailApp.sendEmail({
      to: OFFICE_EMAIL,
      subject: 'New patient forms received (ref ' + id + ')',
      body: 'A new patient completed their forms online.\n\nReference: ' + id +
            '\nThe completed packet is attached as a PDF.\n\n(No patient details are included in this message body.)',
      attachments: [pdf],
      name: 'Willow Run Dental website'
    });
    return reply_({ ok: true, id: id });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'server error' });
  }
}

// Visiting the URL in a browser just confirms it is running.
function doGet() { return reply_({ ok: true, service: 'willow-run-intake' }); }

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
